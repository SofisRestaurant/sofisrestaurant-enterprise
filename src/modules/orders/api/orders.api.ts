import { supabase } from '@/lib/supabase/supabaseClient';
import type { Order, OrderStatus } from '@/domain/orders/order.types';
import type {
  OrderEvent,
  OrderPerformanceMetrics,
  OrderTimeline,
  RecordEventRequest,
} from '@/domain/orders/order-events.types';
import { invokeEdge } from '@/lib/supabase/invoke';
import {
  mapOrderRowToDomain,
  mapUnknownOrderEvent,
  mapUnknownOrderToDomain,
} from '../mappers';

import type {
  AdminOrdersMetrics,
  OrderInsert,
  OrdersPageResult,
  OrderRow,
  OrderUpdate,
} from '../types/orders.types';

// triggerReadySms import removed — SMS is now owned by admin-update-order-status.

const PAID_PAYMENT_STATUS = 'paid' as const;

type AdminMetricStatus =
  | 'new'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'canceled';

interface OrderAmountRow {
  amount_total: number | null;
}

interface OrderStatusRow {
  status: string | null;
}

function now(): string {
  return new Date().toISOString();
}

function getUserAgent(): string | null {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const value = navigator.userAgent.trim();
  return value.length > 0 ? value : null;
}

function getPaginationRange(page: number, pageSize: number): { from: number; to: number } {
  const safePage = Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0;
  const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 20;

  const from = safePage * safePageSize;
  const to = from + safePageSize - 1;

  return { from, to };
}

function normalizeMetricStatus(status: string | null | undefined): AdminMetricStatus | null {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';

  switch (normalized) {
    case 'new':
    case 'pending':
    case 'submitted':
      return 'new';
    case 'confirmed':
      return 'confirmed';
    case 'preparing':
      return 'preparing';
    case 'ready':
      return 'ready';
    case 'out_for_delivery':
    case 'shipped':
      return 'out_for_delivery';
    case 'completed':
    case 'delivered':
      return 'completed';
    case 'canceled':
    case 'cancelled':
      return 'canceled';
    default:
      return null;
  }
}

function createEmptyAdminMetrics(): AdminOrdersMetrics {
  return {
    total: 0,
    new: 0,
    confirmed: 0,
    preparing: 0,
    ready: 0,
    out_for_delivery: 0,
    completed: 0,
    canceled: 0,
    active: 0,
  };
}

function buildAdminMetricsFromStatuses(statuses: readonly (string | null)[]): AdminOrdersMetrics {
  const metrics = createEmptyAdminMetrics();

  for (const status of statuses) {
    metrics.total += 1;

    const normalized = normalizeMetricStatus(status);

    if (normalized !== null) {
      metrics[normalized] += 1;
    }
  }

  metrics.active =
    metrics.new +
    metrics.confirmed +
    metrics.preparing +
    metrics.ready +
    metrics.out_for_delivery;

  return metrics;
}

function minutesBetweenTimestamps(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!start || !end) {
    return null;
  }

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return null;
  }

  return Math.max(0, Math.floor((endMs - startMs) / 60_000));
}

function eventTypeMatches(eventType: string, candidates: readonly string[]): boolean {
  const normalizedEventType = eventType.trim().toLowerCase();

  return candidates.some((candidate) => normalizedEventType === candidate.trim().toLowerCase());
}

function findFirstEventTimestamp(
  events: readonly OrderEvent[],
  candidates: readonly string[],
): string | null {
  for (const event of events) {
    if (eventTypeMatches(event.event_type, candidates)) {
      return event.created_at;
    }
  }

  return null;
}

async function getCurrentUserId(): Promise<string | null> {
  const result = await supabase.auth.getUser();

  if (result.error) {
    throw result.error;
  }

  return result.data.user?.id ?? null;
}

async function requireAuth(): Promise<string> {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error('User not authenticated');
  }

  return userId;
}

async function logIllegalAttempt(orderId: string, newStatus: OrderStatus): Promise<void> {
  const userId = await getCurrentUserId();

  if (!userId) {
    return;
  }

  await supabase.from('staff_action_logs').insert({
    order_id: orderId,
    staff_id: userId,
    old_status: null,
    new_status: newStatus,
    action: 'ILLEGAL_STATUS_ATTEMPT',
    ip_address: null,
    user_agent: getUserAgent(),
    created_at: now(),
  });
}

function requireMappedOrder(value: unknown, errorMessage: string): Order {
  const mapped = mapUnknownOrderToDomain(value);

  if (mapped !== null) {
    return mapped;
  }

  if (Array.isArray(value) && value.length > 0) {
    const firstMapped = mapUnknownOrderToDomain(value[0]);

    if (firstMapped !== null) {
      return firstMapped;
    }
  }

  throw new Error(errorMessage);
}

async function getRawOrderById(orderId: string): Promise<OrderRow | null> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, guest_phone_e164, sms_opt_in')
    .eq('id', orderId)
    .maybeSingle<OrderRow>();

  if (error) {
    throw error;
  }

  return data ?? null;
}

async function getCustomerMetrics(userId: string): Promise<AdminOrdersMetrics> {
  const { data, error } = await supabase
    .from('orders')
    .select('status')
    .eq('customer_uid', userId);

  if (error) {
    throw error;
  }

  const statuses = (data ?? []).map((row: OrderStatusRow) => row.status);
  return buildAdminMetricsFromStatuses(statuses);
}

export async function createOrder(orderData: OrderInsert): Promise<Order> {
  const { data, error } = await supabase.from('orders').insert(orderData).select().single();

  if (error) {
    throw error;
  }

  return requireMappedOrder(data, 'Failed to map created order');
}

export async function updateOrder(orderId: string, updates: OrderUpdate): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .update({
      ...updates,
      updated_at: now(),
    })
    .eq('id', orderId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return requireMappedOrder(data, 'Failed to map updated order');
}

/**
 * Updates order status via the secure server-owned Edge Function.
 *
 * The Edge Function validates the caller's JWT, confirms admin/staff role,
 * calls update_order_status_secure with the user-context client (preserving
 * auth.uid() for staff_action_logs), and — if the new status is "ready" —
 * triggers the SMS notification internally. The browser never touches the
 * SMS path.
 */
export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
  type UpdateResult = { ok: boolean; order: unknown; error?: string; sms?: unknown };

  let result: UpdateResult;
  try {
    result = await invokeEdge<UpdateResult>(
      'admin-update-order-status',
      { order_id: orderId, new_status: status as string },
    );
  } catch (err) {
    await logIllegalAttempt(orderId, status);
    throw new Error(
      err instanceof Error ? err.message : 'Status update failed',
      { cause: err },
    );
  }

  if (!result.ok) {
    await logIllegalAttempt(orderId, status);
    throw new Error(result.error ?? 'Status update failed');
  }

  return requireMappedOrder(result.order, 'No order returned from status update');
}

export async function assignOrderToStaff(orderId: string, staff: string): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .update({
      assigned_to: staff,
      updated_at: now(),
    })
    .eq('id', orderId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return requireMappedOrder(data, 'Failed to map assigned order');
}

export async function addOrderNote(orderId: string, note: string): Promise<Order> {
  const sanitizedNote = note.trim();

  const { data, error } = await supabase
    .from('orders')
    .update({
      metadata: { note: sanitizedNote },
      updated_at: now(),
    })
    .eq('id', orderId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return requireMappedOrder(data, 'Failed to map noted order');
}

export async function getOrderById(id: string): Promise<Order | null> {
  const data = await getRawOrderById(id);

  if (!data) {
    return null;
  }

  return mapOrderRowToDomain(data);
}

/**
 * Secure: fetches orders for the current authenticated user only.
 * page is 0-based.
 */
export async function fetchOrdersByCustomer(
  page = 0,
  pageSize = 20,
): Promise<OrdersPageResult> {
  const currentUserId = await requireAuth();
  const pagination = getPaginationRange(page, pageSize);

  const [{ data, count, error }, metrics] = await Promise.all([
    supabase
      .from('orders')
      .select('*, guest_phone_e164, sms_opt_in', { count: 'exact' })
      .eq('customer_uid', currentUserId)
      .order('created_at', { ascending: false })
      .range(pagination.from, pagination.to),
    getCustomerMetrics(currentUserId),
  ]);

  if (error) {
    throw error;
  }

  const orders: OrderRow[] = data ?? [];
  const total = count ?? 0;

  return {
    orders,
    total,
    page: Math.max(0, Math.floor(page)),
    pageSize: Math.max(1, Math.floor(pageSize)),
    hasMore: pagination.to + 1 < total,
    metrics,
  };
}

/**
 * Secure: fetch a single order while relying on auth + RLS for ownership.
 */
export async function fetchOrderByIdSecure(orderId: string): Promise<Order | null> {
  await requireAuth();

  const data = await getRawOrderById(orderId);

  if (!data) {
    return null;
  }

  return mapOrderRowToDomain(data);
}

export type AdminMetrics = AdminOrdersMetrics;

export async function fetchAdminMetrics(): Promise<AdminOrdersMetrics> {
  const { data, error } = await supabase.from('orders').select('status');

  if (error) {
    throw error;
  }

  const statuses = (data ?? []).map((row: OrderStatusRow) => row.status);
  return buildAdminMetricsFromStatuses(statuses);
}

/**
 * Fetch all events for an order.
 */
export async function getOrderEvents(orderId: string): Promise<OrderEvent[]> {
  const { data, error } = await supabase
    .from('order_events')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const events: OrderEvent[] = [];

  for (const rawEvent of data ?? []) {
    const event = mapUnknownOrderEvent(rawEvent);

    if (event) {
      events.push(event);
    }
  }

  return events;
}

/**
 * Subscribe to new order events (INSERT only).
 */
export function subscribeToOrderEvents(
  orderId: string,
  callback: (event: OrderEvent) => void,
): () => void {
  const channel = supabase
    .channel(`order-events-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'order_events',
        filter: `order_id=eq.${orderId}`,
      },
      (payload) => {
        const event = mapUnknownOrderEvent(payload.new);

        if (event) {
          callback(event);
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Disabled intentionally.
 * Database triggers own order-event recording.
 * Signature is preserved for backward compatibility.
 */
export async function recordOrderEvent(request: RecordEventRequest): Promise<void> {
  void request;
}

export async function getOrderTimeline(orderId: string): Promise<OrderTimeline> {
  const [events, orderRow] = await Promise.all([getOrderEvents(orderId), getRawOrderById(orderId)]);

  if (!orderRow) {
    throw new Error('Order not found');
  }

  return {
    order_id: orderRow.id,
    order_number: orderRow.order_number !== null ? String(orderRow.order_number) : '',
    current_status: orderRow.status,
    total: Math.max(0, Math.round(orderRow.amount_total)),
    customer_uid: orderRow.customer_uid,
    events,
  };
}

export async function getOrderPerformance(orderId: string): Promise<OrderPerformanceMetrics> {
  const [timeline, orderRow] = await Promise.all([
    getOrderTimeline(orderId),
    getRawOrderById(orderId),
  ]);

  if (!orderRow) {
    throw new Error('Order not found');
  }

  const assignedAt = findFirstEventTimestamp(timeline.events, [
    'COOK_ASSIGNED',
    'assigned',
    'assigned_to_staff',
  ]);

  const preparingAt = findFirstEventTimestamp(timeline.events, [
    'PREPARING_STARTED',
    'preparing',
    'STATUS_CHANGED_TO_PREPARING',
  ]);

  const readyAt = findFirstEventTimestamp(timeline.events, [
    'READY_FOR_PICKUP',
    'PREPARING_COMPLETED',
    'ready',
    'STATUS_CHANGED_TO_READY',
  ]);

  const completedAt =
    findFirstEventTimestamp(timeline.events, [
      'COMPLETED',
      'DELIVERED',
      'PICKED_UP',
      'completed',
      'delivered',
      'picked_up',
    ]) ?? orderRow.updated_at;

  return {
    order_id: orderRow.id,
    order_number: orderRow.order_number !== null ? String(orderRow.order_number) : null,
    status: orderRow.status,
    minutes_to_assign: minutesBetweenTimestamps(orderRow.created_at, assignedAt),
    minutes_to_start: minutesBetweenTimestamps(orderRow.created_at, preparingAt),
    minutes_to_ready: minutesBetweenTimestamps(orderRow.created_at, readyAt),
    minutes_prep_time: minutesBetweenTimestamps(preparingAt, readyAt),
    total_time_minutes: minutesBetweenTimestamps(orderRow.created_at, completedAt),
    created_at: orderRow.created_at,
    updated_at: orderRow.updated_at,
    on_time: undefined,
    late_by_minutes: undefined,
  };
}

export async function getPaidOrderRevenueTotal(): Promise<number> {
  const { data, error } = await supabase
    .from('orders')
    .select('amount_total')
    .eq('payment_status', PAID_PAYMENT_STATUS);

  if (error) {
    throw error;
  }

  return (data ?? []).reduce((total: number, row: OrderAmountRow) => {
    return total + Math.max(0, Math.round(row.amount_total ?? 0));
  }, 0);
}

export { mapOrderRowToDomain, mapUnknownOrderEvent, mapUnknownOrderToDomain };