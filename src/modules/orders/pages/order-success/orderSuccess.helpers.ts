// src/modules/orders/pages/order-success/orderSuccess.helpers.ts
// Pure helpers and guest-token utilities for the OrderSuccess feature.
// All functions are page-local — do not move to shared utilities.

import type { Order, OrderStatus } from '@/domain/orders/order.types';
import { LOYALTY_TIERS, asTier } from '@/domain/loyalty/tiers';
import type { OrderServiceType, UnknownRecord } from './orderSuccess.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GUEST_TOKEN_STORAGE_KEY = 'checkout_guest_token';

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && value.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Domain helpers
// ---------------------------------------------------------------------------

export function safeServiceTypeFromOrder(order: Order | null): OrderServiceType | null {
  const md = order?.metadata;
  if (!isRecord(md)) return null;
  const v = md.order_service_type;
  return v === 'pickup' || v === 'delivery' || v === 'dine_in' ? v : null;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function cents(n: number): string {
  return (n / 100).toFixed(2);
}

export function fmt(n: number): string {
  return n.toLocaleString();
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Math utilities
// ---------------------------------------------------------------------------

export function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function nextTierNudge(
  points: number,
  tier: string,
): { label: string; ptsLeft: number } | null {
  const resolvedTier = asTier(tier);
  const cfg = LOYALTY_TIERS[resolvedTier];
  const nextThreshold =
    'nextThreshold' in cfg && typeof cfg.nextThreshold === 'number' ? cfg.nextThreshold : null;
  if (!nextThreshold) return null;
  const left = Math.max(0, Math.ceil(nextThreshold - points));
  if (left <= 0) return null;
  return { label: `Only ${fmt(left)} points to the next tier`, ptsLeft: left };
}

export function safeOrderNumber(n: unknown): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return String(Math.trunc(n)).padStart(4, '0');
}

export function computeBackoffMs(baseMs: number, attempt: number, maxMs: number): number {
  const safeAttempt = clampInt(attempt, 1, 12);
  const jitter = Math.min(250, safeAttempt * 35);
  const exp = baseMs * Math.pow(2, safeAttempt - 1);
  return clampInt(exp + jitter, baseMs, maxMs);
}

// ---------------------------------------------------------------------------
// Guest token utilities
// ---------------------------------------------------------------------------

export function readGuestToken(): string | null {
  try {
    const v = sessionStorage.getItem(GUEST_TOKEN_STORAGE_KEY);
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
  } catch {
    return null;
  }
}

// clearGuestToken is retained for potential future use (e.g. explicit logout),
// but is intentionally NOT called on the success path. The token must survive
// so the guest can click "Track My Order" in the same session. sessionStorage
// clears automatically when the tab closes. OrderStatus.tsx clears it when
// the order reaches a terminal status during polling.
export function clearGuestToken(): void {
  try {
    sessionStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
// Suppress unused-variable lint — the function is kept intentionally.
void clearGuestToken;