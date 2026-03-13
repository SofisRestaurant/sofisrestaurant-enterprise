// =============================================================================
// src/modules/orders/api/order-events.api.ts
// ORDER EVENTS API — Production Grade (2026)
// =============================================================================
//
// Aligns exactly with:
//   Database['public']['Tables']['order_events']['Row']
//     id: string, order_id: string, user_id: string | null,
//     event_type: string, event_data: Json | null, created_at: string | null
//
//   Database['public']['Views']['order_timeline']['Row']
//     order_id: string | null, order_number: number | null,
//     current_status: string | null, amount_total: number | null,
//     customer_uid: string | null, event_id: string | null,
//     event_type: string | null, event_data: Json | null,
//     event_time: string | null, user_id: string | null
//
//   Database['public']['Views']['order_performance']['Row']
//     order_id: string | null, order_number: number | null,
//     status: string | null, created_at: string | null,
//     updated_at: string | null
//
// Notes:
//   - order_timeline is a flat view (one row per event). getOrderTimeline()
//     fetches all rows for an order and aggregates them into the domain type.
//   - order_performance only exposes status + timestamps. All timing metrics
//     (minutes_to_assign, etc.) in OrderPerformanceMetrics are set to null
//     because they do not exist in the DB view.
//   - recordOrderEvent() is intentionally a no-op. DB triggers own event
//     recording. The signature is preserved for backward compatibility.
//   - Json | null event_data is coerced to OrderEventData | null via a safe
//     narrowing helper that rejects primitives and arrays (only objects pass).
// =============================================================================

import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/supabaseClient';
import type { Database, Json } from '@/types/supabase';
import type {
  OrderEvent,
  OrderEventData,
  OrderPerformanceMetrics,
  OrderTimeline,
  RecordEventRequest,
} from '@/domain/orders/order-events.types';

// ── Exact DB row types ────────────────────────────────────────────────────────

type OrderEventRow     = Database['public']['Tables']['order_events']['Row'];
type OrderEventInsert  = Database['public']['Tables']['order_events']['Insert'];
type OrderTimelineRow  = Database['public']['Views']['order_timeline']['Row'];
type OrderPerformanceRow = Database['public']['Views']['order_performance']['Row'];

// ── Internal guards ───────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Narrow a DB Json value to OrderEventData.
 *
 * Json = string | number | boolean | null | { [key: string]: Json } | Json[]
 *
 * OrderEventData is always an object (or null). Scalars and arrays are
 * structurally incompatible, so we gate on isRecord. Casting the narrowed
 * object is safe because OrderEventData includes Record<string, unknown> as
 * a union member, which accepts any plain object.
 */
function coerceEventData(raw: Json | null | undefined): OrderEventData | null {
  if (raw === null || raw === undefined) return null;
  if (!isRecord(raw)) return null;
  // All OrderEventData variants are objects; cast is structurally sound.
  return raw as OrderEventData;
}

/**
 * Coerce a DB string | null to a non-null ISO string.
 * Falls back to the current time so the domain layer never receives an empty
 * timestamp (the DB column is nullable only to allow server-default writes).
 */
function coerceTimestamp(value: string | null | undefined): string {
  return typeof value === 'string' && value.length > 0 ? value : new Date().toISOString();
}

function coerceString(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function coerceNumber(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// ── Input sanitizer ───────────────────────────────────────────────────────────

function sanitizeOrderId(orderId: string): string {
  const trimmed = orderId.trim();
  if (trimmed.length === 0) {
    throw new Error('Order ID is required.');
  }
  return trimmed;
}

// ── Row-to-domain mappers ─────────────────────────────────────────────────────

/**
 * Map an order_events row to the domain OrderEvent.
 *
 * created_at is `string | null` in the DB (server default); we coerce to a
 * non-null ISO string so consumers never need to guard against null.
 *
 * event_data is `Json | null`; we narrow to OrderEventData | null via
 * coerceEventData which rejects non-object Json values (scalars, arrays).
 */
function mapOrderEventRow(row: OrderEventRow): OrderEvent {
  return {
    id:         row.id,
    order_id:   row.order_id,
    user_id:    row.user_id,
    event_type: row.event_type,
    event_data: coerceEventData(row.event_data),
    created_at: coerceTimestamp(row.created_at),
  };
}

/**
 * Build a domain OrderEvent from a single order_timeline row's event fields.
 *
 * The view exposes per-event columns (event_id, event_type, event_data,
 * event_time, user_id). We reconstruct an OrderEvent from those. Rows where
 * event_id is null (orders with no events yet) are excluded by the caller.
 */
function mapTimelineRowToEvent(
  row: OrderTimelineRow,
  fallbackOrderId: string,
): OrderEvent | null {
  // A row without an event_id represents an order with no events — skip it.
  if (row.event_id === null) return null;

  return {
    id:         row.event_id,
    order_id:   coerceString(row.order_id, fallbackOrderId),
    user_id:    row.user_id ?? null,
    event_type: coerceString(row.event_type, 'UNKNOWN'),
    event_data: coerceEventData(row.event_data),
    created_at: coerceTimestamp(row.event_time),
  };
}

/**
 * Aggregate a set of order_timeline rows (one per event) into the domain
 * OrderTimeline type.
 *
 * Row mapping:
 *   DB order_number: number | null  → domain order_number: string  (String())
 *   DB amount_total: number | null  → domain total: number         (fallback 0)
 *   DB current_status: string | null → domain current_status: string (fallback '')
 *   Events: built from per-row event fields, deduplicated by event_id,
 *           sorted ascending by event_time (already ordered by DB query).
 */
function aggregateTimelineRows(
  rows: readonly OrderTimelineRow[],
  orderId: string,
): OrderTimeline {
  // Use the first row for order-level metadata (all rows share these values).
  const first = rows[0];

  const order_id      = coerceString(first?.order_id,      orderId);
  const order_number  = first?.order_number !== null && first?.order_number !== undefined
    ? String(first.order_number)
    : '';
  const current_status = coerceString(first?.current_status, '');
  const total          = coerceNumber(first?.amount_total, 0);
  const customer_uid   = first?.customer_uid ?? null;

  // Build event list, skipping null-event sentinel rows.
  const seenIds = new Set<string>();
  const events: OrderEvent[] = [];

  for (const row of rows) {
    const event = mapTimelineRowToEvent(row, order_id);
    if (event === null) continue;
    if (seenIds.has(event.id)) continue;
    seenIds.add(event.id);
    events.push(event);
  }

  return { order_id, order_number, current_status, total, customer_uid, events };
}

/**
 * Map an order_performance row to the domain OrderPerformanceMetrics.
 *
 * The DB view exposes: order_id, order_number, status, created_at, updated_at.
 * Timing metrics (minutes_to_assign, minutes_to_start, etc.) are NOT present
 * in the current view — they are set to null. If the view is extended in the
 * future, add the columns here.
 *
 * order_number: number | null → string | null
 */
function mapOrderPerformanceRow(
  row: OrderPerformanceRow,
  fallbackOrderId: string,
): OrderPerformanceMetrics {
  return {
    order_id:    coerceString(row.order_id, fallbackOrderId),
    order_number: row.order_number !== null && row.order_number !== undefined
      ? String(row.order_number)
      : null,
    status:      coerceString(row.status, ''),
    created_at:  coerceTimestamp(row.created_at),
    updated_at:  coerceTimestamp(row.updated_at),
    // Timing metrics: not available in the current DB view.
    minutes_to_assign:  null,
    minutes_to_start:   null,
    minutes_to_ready:   null,
    minutes_prep_time:  null,
    total_time_minutes: null,
    on_time:            undefined,
    late_by_minutes:    null,
  };
}

// ── Realtime helpers ──────────────────────────────────────────────────────────

/**
 * Narrow realtime payload.new to OrderEventRow.
 *
 * Realtime payloads are untyped at runtime; we check the minimum structural
 * requirements before mapping. We do NOT cast directly — we narrow first.
 */
function isOrderEventRow(value: unknown): value is OrderEventRow {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['order_id'] === 'string' &&
    typeof value['event_type'] === 'string'
  );
}

function removeChannelSafely(channel: RealtimeChannel): void {
  void supabase.removeChannel(channel).catch(() => {
    // Suppressed intentionally — channel may already be removed.
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch all events for an order, ordered chronologically.
 */
export async function getOrderEvents(orderId: string): Promise<OrderEvent[]> {
  const sanitizedOrderId = sanitizeOrderId(orderId);

  const { data, error } = await supabase
    .from('order_events')
    .select('*')
    .eq('order_id', sanitizedOrderId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => mapOrderEventRow(row));
}

/**
 * Fetch the full timeline for an order.
 *
 * Queries the order_timeline view (one row per event, all rows share the same
 * order-level metadata). Returns null if no rows are found for the order.
 *
 * Note: the old implementation used .limit(1).maybeSingle() and returned only
 * order metadata. This version fetches ALL rows so the events array is fully
 * populated, which is the correct contract for OrderTimeline.
 */
export async function getOrderTimeline(orderId: string): Promise<OrderTimeline | null> {
  const sanitizedOrderId = sanitizeOrderId(orderId);

  const { data, error } = await supabase
    .from('order_timeline')
    .select('*')
    .eq('order_id', sanitizedOrderId)
    .order('event_time', { ascending: true });

  if (error) throw error;

  if (!data || data.length === 0) return null;

  return aggregateTimelineRows(data, sanitizedOrderId);
}

/**
 * Fetch performance metrics for an order from the order_performance view.
 *
 * The view currently exposes status + timestamps only. All timing metrics
 * (minutes_to_assign, etc.) are null. Returns null if no row is found.
 */
export async function getOrderPerformance(
  orderId: string,
): Promise<OrderPerformanceMetrics | null> {
  const sanitizedOrderId = sanitizeOrderId(orderId);

  const { data, error } = await supabase
    .from('order_performance')
    .select('*')
    .eq('order_id', sanitizedOrderId)
    .maybeSingle();

  if (error) throw error;
  if (data === null) return null;

  return mapOrderPerformanceRow(data, sanitizedOrderId);
}

/**
 * Subscribe to new order_events rows (INSERT only) for a specific order.
 *
 * Returns an unsubscribe function. Call it on component unmount or cleanup.
 *
 * The realtime payload.new is an untyped unknown at runtime; we narrow it
 * through isOrderEventRow before mapping to ensure no unsafe access.
 */
export function subscribeToOrderEvents(
  orderId: string,
  callback: (event: OrderEvent) => void,
): () => void {
  const sanitizedOrderId = sanitizeOrderId(orderId);

  const channel: RealtimeChannel = supabase
    .channel(`order-events-${sanitizedOrderId}`)
    .on<OrderEventRow>(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'order_events',
        filter: `order_id=eq.${sanitizedOrderId}`,
      },
      (payload: RealtimePostgresChangesPayload<OrderEventRow>) => {
        const incoming: unknown = payload.new;

        if (!isOrderEventRow(incoming)) return;

        callback(mapOrderEventRow(incoming));
      },
    )
    .subscribe();

  return () => {
    removeChannelSafely(channel);
  };
}

/**
 * No-op — database triggers own event recording.
 * Signature preserved for backward compatibility.
 *
 * If client-side recording is re-enabled in the future, replace this body
 * with an insert into order_events using OrderEventInsert:
 *
 *   const insert: OrderEventInsert = {
 *     order_id:   request.order_id,
 *     event_type: request.event_type,
 *     event_data: request.event_data as Json ?? null,
 *     user_id:    request.user_id ?? null,
 *   };
 *   await supabase.from('order_events').insert(insert);
 */
export async function recordOrderEvent(_request: RecordEventRequest): Promise<void> {
  return Promise.resolve();
}

/**
 * Alias for getOrderEvents — preserved for callers using the list* convention.
 */
export async function listOrderEvents(orderId: string): Promise<OrderEvent[]> {
  return getOrderEvents(orderId);
}

// ── Internal type reference (prevents unused-import warnings) ─────────────────
// OrderEventInsert is referenced in the recordOrderEvent doc comment above.
// Declare it here so the import path is validated at compile time even when
// the body is a no-op.
type _OrderEventInsertRef = OrderEventInsert;