// src/modules/orders/types/orders.types.ts
// ============================================================================
// ORDERS MODULE TYPES — Production Grade (2026)
// ============================================================================

import type { Database, TablesInsert, TablesUpdate } from '@/types/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Supabase table shapes
// ─────────────────────────────────────────────────────────────────────────────

export type OrderRow = Database['public']['Tables']['orders']['Row'];
export type OrderInsert = TablesInsert<'orders'>;
export type OrderUpdate = TablesUpdate<'orders'>;

// ─────────────────────────────────────────────────────────────────────────────
// UI filter tabs
// ─────────────────────────────────────────────────────────────────────────────

export const ORDERS_FILTER_TABS = [
  'all',
  'new',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
  'canceled',
] as const;

export type OrdersFilterTab = (typeof ORDERS_FILTER_TABS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Page-level contracts
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminOrdersMetrics {
  total: number;
  new: number;
  confirmed: number;
  preparing: number;
  ready: number;
  out_for_delivery: number;
  completed: number;
  canceled: number;
  active: number;
}

export interface OrdersPageResult {
  orders: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  metrics: AdminOrdersMetrics;
}

// ─────────────────────────────────────────────────────────────────────────────
// Guards / helpers
// ─────────────────────────────────────────────────────────────────────────────

const ORDERS_FILTER_TAB_SET: ReadonlySet<string> = new Set<string>(ORDERS_FILTER_TABS);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getSearchableStrings(order: OrderRow): string[] {
  const values: string[] = [];

  for (const value of Object.values(order as UnknownRecord)) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        values.push(trimmed.toLowerCase());
      }
    }
  }

  return values;
}

function getOrderStatus(order: OrderRow): string {
  if (!isRecord(order)) return '';

  const rawStatus =
    ('status' in order && typeof order.status === 'string' && order.status) ||
    ('order_status' in order && typeof order.order_status === 'string' && order.order_status) ||
    '';

  return rawStatus.trim().toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Public helpers
// ─────────────────────────────────────────────────────────────────────────────

export function isOrdersFilterTab(value: unknown): value is OrdersFilterTab {
  return typeof value === 'string' && ORDERS_FILTER_TAB_SET.has(value);
}

export function matchesOrderFilter(order: OrderRow, filter: OrdersFilterTab): boolean {
  if (filter === 'all') return true;

  const status = getOrderStatus(order);
  return status === filter;
}

export function matchesOrderSearch(order: OrderRow, query: string): boolean {
  const needle = query.trim().toLowerCase();

  if (!needle) return true;

  return getSearchableStrings(order).some((value) => value.includes(needle));
}