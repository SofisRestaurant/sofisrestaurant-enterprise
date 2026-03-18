// =============================================================================
// PATH: src/modules/admin/orders/admin-orders.priority.ts
// =============================================================================
// Priority calculations for active orders.
// Pure functions — no React, no side effects.
//
// NOTE: minutesSince and priorityLevel were previously in admin-orders.status.ts
// and are re-exported from there for backwards compatibility. New code should
// import directly from this file.
// =============================================================================

import type { AdminOrder, PriorityLevel } from '../types/admin-orders.types';
import { HIGH_PRIORITY_MINUTES, URGENT_PRIORITY_MINUTES } from './admin-orders.constants';

// ─── Age ─────────────────────────────────────────────────────────────────────

/**
 * Returns the number of whole minutes elapsed since the given ISO timestamp.
 * Always returns a non-negative integer.
 */
export function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}

// ─── Priority level ───────────────────────────────────────────────────────────

/**
 * Returns the priority level for a single order based on its age and status.
 * Terminal orders (delivered / cancelled) are always 'normal'.
 */
export function priorityLevel(order: AdminOrder): PriorityLevel {
  if (order.status === 'cancelled' || order.status === 'delivered') return 'normal';
  const age = minutesSince(order.createdAt);
  if (age >= URGENT_PRIORITY_MINUTES) return 'urgent';
  if (age >= HIGH_PRIORITY_MINUTES) return 'high';
  return 'normal';
}

/**
 * Returns true when the order is overdue (age ≥ URGENT_PRIORITY_MINUTES
 * and not in a terminal status).
 */
export function isOverdue(order: AdminOrder): boolean {
  if (order.status === 'delivered' || order.status === 'cancelled') return false;
  return minutesSince(order.createdAt) >= URGENT_PRIORITY_MINUTES;
}

// ─── Urgency label ────────────────────────────────────────────────────────────

/** Returns the display label for a priority badge. */
export function priorityBadgeLabel(level: PriorityLevel): string {
  if (level === 'urgent') return 'Urgent';
  if (level === 'high')   return 'High';
  return '';
}