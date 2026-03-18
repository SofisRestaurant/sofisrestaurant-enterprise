// =============================================================================
// PATH: src/modules/admin/orders/admin-orders.status.ts
// =============================================================================
// Pure helpers for order status display: labels, badge tones, priority levels,
// and age calculations. No React, no side effects.
// =============================================================================

import type { AdminOrder, PriorityLevel, StatusTone } from '../types/admin-orders.types';
import { NEW_STATUSES, HIGH_PRIORITY_MINUTES, URGENT_PRIORITY_MINUTES } from './admin-orders.constants';

// ─── Age ─────────────────────────────────────────────────────────────────────

/** Returns how many whole minutes have elapsed since the ISO timestamp. */
export function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}

// ─── Priority ─────────────────────────────────────────────────────────────────

export function priorityLevel(order: AdminOrder): PriorityLevel {
  if (order.status === 'cancelled' || order.status === 'delivered') return 'normal';
  const age = minutesSince(order.createdAt);
  if (age >= URGENT_PRIORITY_MINUTES) return 'urgent';
  if (age >= HIGH_PRIORITY_MINUTES) return 'high';
  return 'normal';
}

// ─── Status label ─────────────────────────────────────────────────────────────

export function statusLabel(status: string): string {
  if (NEW_STATUSES.has(status)) return 'New';
  if (status === 'preparing')   return 'Cooking';
  if (status === 'ready')       return 'Ready';
  if (status === 'delivered')   return 'Delivered';
  if (status === 'cancelled')   return 'Cancelled';
  return status;
}

// ─── Badge tones ──────────────────────────────────────────────────────────────

export function statusTone(status: string): StatusTone {
  if (NEW_STATUSES.has(status))                  return 'warning';
  if (status === 'preparing')                    return 'info';
  if (status === 'ready' || status === 'delivered') return 'success';
  if (status === 'cancelled')                    return 'danger';
  return 'neutral';
}

export function paymentTone(status: string): StatusTone {
  if (status === 'paid')                         return 'success';
  if (status === 'failed' || status === 'disputed') return 'danger';
  if (status === 'unpaid')                       return 'warning';
  if (status === 'refunded')                     return 'neutral';
  return 'info';
}

// ─── Order type ───────────────────────────────────────────────────────────────

export function humanOrderType(orderType: string | null): string {
  if (!orderType)              return '—';
  if (orderType === 'pickup')  return 'Pickup';
  if (orderType === 'delivery') return 'Delivery';
  return orderType;
}