// =============================================================================
// PATH: src/modules/admin/orders/admin-orders.realtime.ts
// =============================================================================
// Maps Supabase realtime postgres_changes payloads to AdminOrder state updates.
// Pure functions — no React, no subscriptions, no side effects.
//
// The actual channel subscription lives in useAdminOrdersRealtime.ts.
// This file answers "what happens to state when an order event arrives".
// =============================================================================

import type { AdminOrder } from '../types/admin-orders.types';
import { upsertOrder, removeOrder } from './admin-orders.filters';
import { parseRealtimeOrder } from './admin-orders.mapper';
import { isRecord, readText } from './admin-orders.parsers';
import { buildNewOrderAnnouncement } from './admin-orders.utils';

export interface RealtimeInsertResult {
  orders: AdminOrder[];
  announcement: string;
  shouldPlaySound: boolean;
}

export interface RealtimeUpdateResult {
  orders: AdminOrder[];
}

export interface RealtimeDeleteResult {
  orders: AdminOrder[];
}

// ─── INSERT ───────────────────────────────────────────────────────────────────

/**
 * Handles a realtime INSERT event.
 * Returns the updated orders list, an ARIA announcement, and a sound flag.
 * Returns null if the payload cannot be parsed into a valid AdminOrder.
 */
export function handleRealtimeInsert(
  currentOrders: readonly AdminOrder[],
  rawPayload: unknown,
): RealtimeInsertResult | null {
  const nextOrder = parseRealtimeOrder(rawPayload);
  if (!nextOrder) return null;

  return {
    orders: upsertOrder(currentOrders, nextOrder),
    announcement: buildNewOrderAnnouncement(
      nextOrder.orderNumber,
      nextOrder.customerName,
      nextOrder.customerEmail,
    ),
    shouldPlaySound: true,
  };
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

/**
 * Handles a realtime UPDATE event.
 * Returns the updated orders list, or null if the payload is unparseable.
 */
export function handleRealtimeUpdate(
  currentOrders: readonly AdminOrder[],
  rawPayload: unknown,
): RealtimeUpdateResult | null {
  const nextOrder = parseRealtimeOrder(rawPayload);
  if (!nextOrder) return null;
  return { orders: upsertOrder(currentOrders, nextOrder) };
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

/**
 * Handles a realtime DELETE event.
 * Returns the updated orders list, or null if the deleted id cannot be read.
 */
export function handleRealtimeDelete(
  currentOrders: readonly AdminOrder[],
  rawOldPayload: unknown,
): RealtimeDeleteResult | null {
  if (!isRecord(rawOldPayload)) return null;
  const id = readText(rawOldPayload, ['id']);
  if (!id) return null;
  return { orders: removeOrder(currentOrders, id) };
}