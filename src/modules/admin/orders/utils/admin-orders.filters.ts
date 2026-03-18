// =============================================================================
// PATH: src/modules/admin/orders/admin-orders.filters.ts
// =============================================================================
// Pure filter and sort functions for the admin orders list.
// No React, no side effects — suitable for unit testing without a DOM.
// =============================================================================

import type { AdminOrder } from '../types/admin-orders.types';
import type { FilterTab } from './admin-orders.constants';
import { NEW_STATUSES } from './admin-orders.constants';

// ─── Sort ─────────────────────────────────────────────────────────────────────

/** Descending sort comparator by createdAt — newest first. */
export function compareByCreatedAtDesc(left: AdminOrder, right: AdminOrder): number {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

// ─── Individual filters ───────────────────────────────────────────────────────

/** Returns true when the order belongs to the active filter tab. */
export function matchesTab(order: AdminOrder, tab: FilterTab): boolean {
  if (tab === 'all') return true;
  if (tab === 'new') return NEW_STATUSES.has(order.status);
  return order.status === tab;
}

/**
 * Returns true when the order matches the search query.
 * Searches order number, customer name, email, phone, and raw ID.
 * Empty query matches everything.
 */
export function matchesSearch(order: AdminOrder, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return true;

  const haystack = [
    order.orderNumber ?? '',
    order.customerName ?? '',
    order.customerEmail ?? '',
    order.customerPhone ?? '',
    order.id,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalized);
}

// ─── Combined filter + sort ───────────────────────────────────────────────────

/**
 * Applies tab filter, search filter, and descending date sort in one pass.
 * Returns a new sorted array — does not mutate the input.
 */
export function filterAndSortOrders(
  orders: readonly AdminOrder[],
  tab: FilterTab,
  search: string,
): AdminOrder[] {
  return orders
    .filter((order) => matchesTab(order, tab))
    .filter((order) => matchesSearch(order, search))
    .sort(compareByCreatedAtDesc);
}

// ─── List mutation helpers ────────────────────────────────────────────────────

/**
 * Inserts or replaces an order in the list, keeping the list sorted.
 * Used by realtime INSERT and UPDATE handlers.
 */
export function upsertOrder(
  items: readonly AdminOrder[],
  incoming: AdminOrder,
): AdminOrder[] {
  const next = items.filter((item) => item.id !== incoming.id);
  next.push(incoming);
  next.sort(compareByCreatedAtDesc);
  return next;
}

/**
 * Removes an order from the list by id.
 * Used by the realtime DELETE handler.
 */
export function removeOrder(items: readonly AdminOrder[], id: string): AdminOrder[] {
  return items.filter((item) => item.id !== id);
}