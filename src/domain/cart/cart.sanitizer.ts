// =============================================================================
// PATH: src/domain/cart/cart.sanitizer.ts
// =============================================================================
// Pure sanitization functions for display-layer cart state.
//
// PURPOSE
// - Clamp, coerce, and normalize raw cart store values before they reach
//   computeCartTotals or any UI rendering path.
// - Fail-open: unknown / missing fields default to safe values rather than
//   blocking the user.
// - No React, no Supabase, no side effects — pure functions only.
//
// WHAT THIS IS NOT
// - This is NOT billing security. Server + Stripe are authoritative.
// - This does NOT validate business rules (min order, promo eligibility, etc.).
//   Those live on the server.
//
// GUARDS
// All numeric caps are display-stability guardrails only. They are deliberately
// loose enough to never trigger on legitimate orders.
// =============================================================================

import type { CartItem, CartPromotion, CartCredit } from '@/modules/cart/types/cart.types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const CART_SANITIZER_GUARDS = {
  MAX_LINE_ITEM_QTY: 100,
  MAX_ITEMS: 200,
  MAX_UNIT_PRICE_CENTS: 250_000, // $2,500
  MAX_TOTAL_CENTS: 5_000_000,    // $50,000
  MAX_MODIFIERS_PER_ITEM: 40,
  TAX_RATE_MIN: 0,
  TAX_RATE_MAX: 0.2,             // 20% upper sanity bound
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Internal primitive helpers
// ─────────────────────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asNumber(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = asNumber(v, NaN);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function clampCentsSigned(v: unknown, min: number, max: number, fallback = 0): number {
  const n = asNumber(v, NaN);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(Math.round(n))));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public sanitizers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitizes the raw items array from the cart store.
 *
 * Handles camelCase / snake_case naming drift for `unitPriceCents` and
 * `priceAdjustment` — the DB and store may use either form depending on
 * which layer populated the value.
 *
 * This function is the single runtime trust boundary between `unknown` cart
 * state and `CartItem[]`. The cast at the return site is intentional and
 * documented — every field `computeCartTotals` reads has been sanitized above it.
 */
export function sanitizeCartItems(items: unknown): CartItem[] {
  if (!Array.isArray(items)) return [];

return items
  .slice(0, CART_SANITIZER_GUARDS.MAX_ITEMS)
  .map((raw) => {
    const r: JsonRecord = isRecord(raw) ? raw : {};

    const quantity = clampInt(r.quantity, 1, CART_SANITIZER_GUARDS.MAX_LINE_ITEM_QTY);

    const rawUnitPrice: unknown =
      r.unitPriceCents !== undefined ? r.unitPriceCents : r.unit_price_cents;

    const unitPriceCents = clampInt(
      rawUnitPrice,
      0,
      CART_SANITIZER_GUARDS.MAX_UNIT_PRICE_CENTS
    );

    const modsRaw = Array.isArray(r.modifiers)
      ? r.modifiers.slice(0, CART_SANITIZER_GUARDS.MAX_MODIFIERS_PER_ITEM)
      : [];

    const modifiers = modsRaw.map((m) => {
      const mr: JsonRecord = isRecord(m) ? m : {};

      const adjRaw: unknown =
        mr.priceAdjustment !== undefined
          ? mr.priceAdjustment
          : mr.priceAdjustmentCents !== undefined
            ? mr.priceAdjustmentCents
            : mr.price_adjustment;

      const priceAdjustment = clampCentsSigned(
        adjRaw,
        -CART_SANITIZER_GUARDS.MAX_UNIT_PRICE_CENTS,
        CART_SANITIZER_GUARDS.MAX_UNIT_PRICE_CENTS,
        0,
      );

      return {
        ...mr,
        priceAdjustment,
        priceAdjustmentCents: priceAdjustment,
      };
    });

    return {
      ...r,
      quantity,
      unitPriceCents,
      unit_price_cents: unitPriceCents,
      modifiers,
    };
  }) as unknown as CartItem[];
  // ^ Trust boundary cast. Every field computeCartTotals reads has been
  //   clamped above. This is intentional — do not remove.
}

/**
 * Returns the promotion as CartPromotion if it is a plain object,
 * or null if it is missing, null, or a non-object primitive.
 */
export function sanitizeCartPromotion(promotion: unknown): CartPromotion | null {
  if (!isRecord(promotion)) return null;

  return promotion as unknown as CartPromotion;
}
/**
 * Returns the credit as CartCredit if it is a plain object,
 * or null if it is missing, null, or a non-object primitive.
 */
export function sanitizeCartCredit(credit: unknown): CartCredit | null {
  if (!isRecord(credit)) return null;

  return credit as unknown as CartCredit;
}

/**
 * Clamps the tax rate to [TAX_RATE_MIN, TAX_RATE_MAX].
 * Falls back to the provided default if the value is non-finite.
 */
export function sanitizeTaxRate(rate: unknown, fallbackRate: number): number {
  const r = asNumber(rate, fallbackRate);
  return Math.max(
    CART_SANITIZER_GUARDS.TAX_RATE_MIN,
    Math.min(CART_SANITIZER_GUARDS.TAX_RATE_MAX, r),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Totals shape normalizer
// ─────────────────────────────────────────────────────────────────────────────

export interface CartTotalsShape {
  subtotalCents: number;
  discountCents: number;
  creditCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Extracts and clamps the five total fields from whatever
 * computeCartTotals returns, defending against shape drift.
 */
export function normalizeTotalsShape(
  raw: unknown,
  maxTotalCents: number,
): CartTotalsShape {
  const r: JsonRecord = isRecord(raw) ? raw : {};

  const clampNonNeg = (v: unknown): number => {
    const n = asNumber(v, NaN);
    if (!Number.isFinite(n)) return 0;
    const i = Math.trunc(Math.round(n));
    return Math.min(Math.max(0, i), maxTotalCents);
  };

  return {
    subtotalCents: clampNonNeg(r.subtotalCents),
    discountCents: clampNonNeg(r.discountCents),
    creditCents:   clampNonNeg(r.creditCents),
    taxCents:      clampNonNeg(r.taxCents),
    totalCents:    clampNonNeg(r.totalCents),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suspicion flags
// ─────────────────────────────────────────────────────────────────────────────

export interface CartSuspicionFlags {
  /**
   * true when math is clearly wrong (total < post-credit amount, total exceeds
   * the hard cap, or subtotal is 0 with a non-zero total).
   * Should surface a red warning to the user.
   */
  inconsistent: boolean;

  /**
   * true when math looks plausible but something is off (total outside the
   * expected range, approaching the hard cap, etc.).
   * Should surface an amber warning to the user.
   */
  suspicious: boolean;
}

/**
 * Checks the sanitized totals for mathematical consistency.
 * These are display-only warnings — they do NOT block checkout.
 */
export function computeCartSuspicionFlags(
  t: CartTotalsShape,
  maxTotalCents: number,
): CartSuspicionFlags {
  const afterDiscount = Math.max(0, t.subtotalCents - t.discountCents);
  const afterCredit   = Math.max(0, afterDiscount - t.creditCents);
  const maxExpected   = afterCredit + maxTotalCents;

  const inconsistent =
    t.totalCents < afterCredit ||
    t.taxCents > t.totalCents  ||
    t.taxCents < 0;

  const suspicious =
    inconsistent                                       ||
    t.totalCents > maxExpected                         ||
    (t.subtotalCents === 0 && t.totalCents > 0)        ||
    t.totalCents >= maxTotalCents;

  return { inconsistent, suspicious };
}