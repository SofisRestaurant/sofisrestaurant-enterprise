import type { Database } from '@/types/supabase';
import { supabase } from '@/lib/supabase/supabaseClient';

import type {
  AdminOrderCartItem,
  AdminOrderCounts,
  AdminOrderPriority,
  AdminOrderStatus,
  AdminOrdersListResult,
  AdminOrderSummary,
  AdminPaymentStatus,
  AdminTableSortState,
} from '../../../features/admin/types/admin-common.types';
import { isOrderRow } from '@/modules/orders/utils/orderValidators';

type OrderRow = Database['public']['Tables']['orders']['Row'];
type UnknownRecord = Record<string, unknown>;

export interface ListAdminOrdersOptions {
  query?: string;
  statuses?: readonly AdminOrderStatus[];
  paymentStatuses?: readonly AdminPaymentStatus[];
  assignedTo?: readonly string[];
  includeDeleted?: boolean;
  page?: number;
  pageSize?: number;
  maxRows?: number;
  sort?: AdminTableSortState<
    'createdAt' | 'amountTotal' | 'status' | 'customerName' | 'orderNumber' | 'waitMinutes'
  > | null;
}

const DEFAULT_MAX_ROWS = 500;
const MAX_PAGE_SIZE = 100;
const MAX_FETCH_ROWS = 2_000;
const URGENT_MINUTES = 20;
const HIGH_MINUTES = 12;

export const ADMIN_ORDER_STATUS_NEXT: Readonly<Record<AdminOrderStatus, AdminOrderStatus | null>> =
  {
    confirmed: 'preparing',
    preparing: 'ready',
    ready: 'delivered',
    delivered: null,
    cancelled: null,
  };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asCurrency(value: unknown): string {
  const normalized = asString(value)?.toUpperCase() ?? 'USD';
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'USD';
}

function nowIso(): string {
  return new Date().toISOString();
}

function createRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `admin_orders_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function minutesAgo(dateString: string): number {
  const timestamp = new Date(dateString).getTime();

  if (Number.isNaN(timestamp)) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
}

function isAdminOrderStatus(value: unknown): value is AdminOrderStatus {
  return (
    value === 'confirmed' ||
    value === 'preparing' ||
    value === 'ready' ||
    value === 'delivered' ||
    value === 'cancelled'
  );
}

function normalizeAdminOrderStatus(value: unknown): AdminOrderStatus {
  if (isAdminOrderStatus(value)) {
    return value;
  }

  const normalized = asString(value)?.toLowerCase();

  if (normalized === 'canceled') {
    return 'cancelled';
  }

  return 'confirmed';
}

function isAdminPaymentStatus(value: unknown): value is AdminPaymentStatus {
  return value === 'paid' || value === 'unpaid' || value === 'refunded' || value === 'failed';
}

function normalizeAdminPaymentStatus(value: unknown): AdminPaymentStatus {
  if (isAdminPaymentStatus(value)) {
    return value;
  }

  const normalized = asString(value)?.toLowerCase();

  if (normalized === 'paid') return 'paid';
  if (normalized === 'refunded' || normalized === 'partially_refunded') return 'refunded';
  if (normalized === 'failed') return 'failed';
  return 'unpaid';
}

function getPriority(status: AdminOrderStatus, createdAt: string): AdminOrderPriority {
  if (status === 'delivered' || status === 'cancelled') {
    return 'normal';
  }

  const elapsedMinutes = minutesAgo(createdAt);

  if (elapsedMinutes >= URGENT_MINUTES) {
    return 'urgent';
  }

  if (elapsedMinutes >= HIGH_MINUTES) {
    return 'high';
  }

  return 'normal';
}

function parseCartItems(value: unknown): AdminOrderCartItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const name = asString(entry.name) ?? 'Item';
      const note = asString('note' in entry ? entry.note : 'notes' in entry ? entry.notes : null);

      return {
        name,
        quantity: Math.max(1, Math.trunc(asNumber(entry.quantity, 1))),
        price: asNumber(entry.price, 0),
        note,
      };
    })
    .filter((entry): entry is AdminOrderCartItem => entry !== null);
}

function readDeletedFlag(row: OrderRow): boolean {
  if (!isRecord(row.metadata)) {
    return false;
  }

  const direct = row.metadata.is_deleted;
  const deleted = row.metadata.deleted;

  if (typeof direct === 'boolean') {
    return direct;
  }

  if (typeof deleted === 'boolean') {
    return deleted;
  }

  return false;
}

function sortOrders(
  rows: readonly AdminOrderSummary[],
  sort: ListAdminOrdersOptions['sort'],
): AdminOrderSummary[] {
  const activeSort = sort ?? {
    columnKey: 'createdAt' as const,
    direction: 'desc' as const,
  };

  return [...rows].sort((left, right) => {
    const comparison = (() => {
      switch (activeSort.columnKey) {
        case 'amountTotal':
          return left.amountTotal - right.amountTotal;

        case 'status':
          return left.status.localeCompare(right.status, undefined, {
            sensitivity: 'base',
          });

        case 'customerName':
          return (left.customerName ?? '').localeCompare(right.customerName ?? '', undefined, {
            sensitivity: 'base',
          });

        case 'orderNumber':
          return (left.orderNumber ?? 0) - (right.orderNumber ?? 0);

        case 'waitMinutes':
          return left.waitMinutes - right.waitMinutes;

        case 'createdAt':
        default:
          return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      }
    })();

    if (comparison !== 0) {
      return activeSort.direction === 'asc' ? comparison : -comparison;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function mapOrderRow(row: OrderRow): AdminOrderSummary {
  const createdAt = row.created_at;
  const status = normalizeAdminOrderStatus(row.status);
  const paymentStatus = normalizeAdminPaymentStatus(row.payment_status);

  return {
    id: row.id,
    orderNumber: row.order_number ?? null,
    customerName: row.customer_name ?? null,
    customerEmail: row.customer_email ?? null,
    customerPhone: row.customer_phone ?? null,
    customerUid: row.customer_uid ?? null,
    assignedTo: row.assigned_to ?? null,
    status,
    paymentStatus,
    orderType: row.order_type,
    currency: asCurrency(row.currency),
    amountSubtotal: row.amount_subtotal ?? 0,
    amountTax: row.amount_tax ?? 0,
    amountShipping: row.amount_shipping ?? 0,
    amountTotal: row.amount_total ?? 0,
    notes: row.notes ?? null,
    createdAt,
    updatedAt: row.updated_at,
    stripeSessionId: row.stripe_session_id,
    stripePaymentIntentId: row.stripe_payment_intent_id ?? null,
    shippingName: row.shipping_name ?? null,
    shippingPhone: row.shipping_phone ?? null,
    waitMinutes: minutesAgo(createdAt),
    priority: getPriority(status, createdAt),
    isDeleted: readDeletedFlag(row),
    cartItems: parseCartItems(row.cart_items),
    metadata: isRecord(row.metadata) ? row.metadata : {},
  };
}

function matchesSearch(order: AdminOrderSummary, query: string): boolean {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return (
    String(order.orderNumber ?? '').toLowerCase().includes(normalized) ||
    (order.customerName?.toLowerCase().includes(normalized) ?? false) ||
    (order.customerEmail?.toLowerCase().includes(normalized) ?? false) ||
    (order.customerPhone?.toLowerCase().includes(normalized) ?? false)
  );
}

function applyClientFilters(
  rows: readonly AdminOrderSummary[],
  options: ListAdminOrdersOptions,
): AdminOrderSummary[] {
  const query = options.query ?? '';
  const statuses = options.statuses ?? [];
  const paymentStatuses = options.paymentStatuses ?? [];
  const assignedTo = options.assignedTo ?? [];
  const includeDeleted = options.includeDeleted ?? false;

  return rows.filter((row) => {
    if (!includeDeleted && row.isDeleted) {
      return false;
    }

    if (statuses.length > 0 && !statuses.includes(row.status)) {
      return false;
    }

    if (paymentStatuses.length > 0 && !paymentStatuses.includes(row.paymentStatus)) {
      return false;
    }

    if (assignedTo.length > 0) {
      const assigned = row.assignedTo ?? '';
      if (!assignedTo.includes(assigned)) {
        return false;
      }
    }

    return matchesSearch(row, query);
  });
}

function countOrders(rows: readonly AdminOrderSummary[]): AdminOrderCounts {
  return {
    all: rows.length,
    pending: rows.filter((row) => row.status === 'confirmed').length,
    preparing: rows.filter((row) => row.status === 'preparing').length,
    ready: rows.filter((row) => row.status === 'ready').length,
    delivered: rows.filter((row) => row.status === 'delivered').length,
    cancelled: rows.filter((row) => row.status === 'cancelled').length,
    paid: rows.filter((row) => row.paymentStatus === 'paid').length,
    unpaid: rows.filter((row) => row.paymentStatus !== 'paid').length,
  };
}

function paginateRows<T>(rows: readonly T[], page: number, pageSize: number): T[] {
  const start = page * pageSize;
  return rows.slice(start, start + pageSize);
}

export async function listAdminOrders(
  options: ListAdminOrdersOptions = {},
): Promise<AdminOrdersListResult> {
  const safePage = Math.max(0, Math.floor(options.page ?? 0));
  const safePageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(options.pageSize ?? 25)));
  const safeMaxRows = Math.max(
    safePageSize,
    Math.min(MAX_FETCH_ROWS, Math.floor(options.maxRows ?? DEFAULT_MAX_ROWS)),
  );
  const requestId = createRequestId();

  const { data, count, error } = await supabase
    .from('orders')
    .select('*, guest_phone_e164, sms_opt_in', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(safeMaxRows);

  if (error) {
    throw new Error(error.message);
  }

  const allRows = (data ?? []).map(mapOrderRow);
  const filtered = applyClientFilters(allRows, options);
  const sorted = sortOrders(filtered, options.sort);
  const paged = paginateRows(sorted, safePage, safePageSize);

  return {
    rows: paged,
    total: count ?? allRows.length,
    filteredTotal: filtered.length,
    page: safePage,
    pageSize: safePageSize,
    requestId,
    asOf: nowIso(),
    counts: countOrders(filtered),
  };
}

export async function getAdminOrderById(orderId: string): Promise<AdminOrderSummary | null> {
  const normalizedOrderId = orderId.trim();

  if (!normalizedOrderId) {
    throw new Error('Order id is required.');
  }

  const { data, error } = await supabase
    .from('orders')
    .select('*, guest_phone_e164, sms_opt_in')
    .eq('id', normalizedOrderId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapOrderRow(data) : null;
}

export async function updateAdminOrderStatus(
  orderId: string,
  status: AdminOrderStatus,
): Promise<AdminOrderSummary> {
  const normalizedOrderId = orderId.trim();

  if (!normalizedOrderId) {
    throw new Error('Order id is required.');
  }

  const { data, error } = await supabase.rpc('update_order_status_secure', {
    order_id: normalizedOrderId,
    new_status: status,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (isOrderRow(data)) {
    return mapOrderRow(data);
  }

  const refreshed = await getAdminOrderById(normalizedOrderId);

  if (!refreshed) {
    throw new Error('Status update succeeded but the order could not be reloaded.');
  }

  return refreshed;
}

export async function cancelAdminOrder(orderId: string): Promise<AdminOrderSummary> {
  return updateAdminOrderStatus(orderId, 'cancelled');
}

export async function advanceAdminOrderStatus(
  orderId: string,
  currentStatus: AdminOrderStatus,
): Promise<AdminOrderSummary> {
  const nextStatus = ADMIN_ORDER_STATUS_NEXT[currentStatus];

  if (!nextStatus) {
    throw new Error(`Order status "${currentStatus}" cannot be advanced.`);
  }

  return updateAdminOrderStatus(orderId, nextStatus);
}

export async function getAdminOrderCountsSummary(): Promise<{
  total: number;
  pending: number;
  preparing: number;
  ready: number;
  delivered: number;
  cancelled: number;
}> {
  const result = await listAdminOrders({
    page: 0,
    pageSize: 1,
    maxRows: DEFAULT_MAX_ROWS,
  });

  return {
    total: result.counts.all,
    pending: result.counts.pending,
    preparing: result.counts.preparing,
    ready: result.counts.ready,
    delivered: result.counts.delivered,
    cancelled: result.counts.cancelled,
  };
}