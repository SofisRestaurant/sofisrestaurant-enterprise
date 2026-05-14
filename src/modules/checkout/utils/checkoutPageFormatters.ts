// src/modules/checkout/utils/checkoutPageFormatters.ts
//
// Pure helpers shared by CheckoutPage and its page-level sub-components.
// No side effects, no React, no DOM access.

import { computeLineTotalCents, cartItemKey } from '@/modules/cart/types/cart.types';
import type { CartItem } from '@/modules/cart/types/cart.types';
import { CHECKOUT_LIMITS } from './checkoutPageStorage';
import type { OrderType } from '../types/checkout-page.types';

// ─── Number utilities ────────────────────────────────────────────────────────

export function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

// ─── Text utilities ──────────────────────────────────────────────────────────

export function safeText(v: unknown, maxLen = 500): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

// ─── Money utilities ─────────────────────────────────────────────────────────

export function safeMoneyCents(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// ─── Promo utilities ─────────────────────────────────────────────────────────

export function normalizePromo(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, CHECKOUT_LIMITS.PROMO_MAX);
}

// ─── Cart line helpers ───────────────────────────────────────────────────────

/** Stable React key for a CartItem that incorporates modifier selection. */
export function stableCartKey(item: CartItem): string {
  return `${item.menuItemId}:${cartItemKey(item.menuItemId, item.modifiers)}`;
}

/**
 * Returns the display line total in cents.
 * Prefers the pre-computed `lineTotalCents` if present on the store item;
 * falls back to a client-side computation so the UI is never blank.
 */
export function computeDisplayLineTotalCents(item: CartItem): number {
  const fromStore = safeMoneyCents(
    (item as unknown as { lineTotalCents?: unknown }).lineTotalCents,
  );
  if (fromStore > 0) return fromStore;
  return computeLineTotalCents({
    unitPriceCents: safeMoneyCents(item.unitPriceCents),
    modifiers: item.modifiers ?? [],
    quantity: clampInt(item.quantity, 1, 100),
  });
}

// ─── Order type ──────────────────────────────────────────────────────────────

export function formatOrderTypeLabel(t: OrderType): string {
  return t === 'pickup' ? 'Pickup' : t === 'delivery' ? 'Delivery' : 'Dine-in';
}