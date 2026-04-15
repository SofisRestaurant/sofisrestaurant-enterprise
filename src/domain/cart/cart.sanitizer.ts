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
//
// NULL SEMANTICS
// clampCentsSigned returns null (not 0) when the input is missing or non-numeric.
// The UI is responsible for interpreting null — it should render "—" or hide the
// line rather than showing "$0.00", which could mislead users about free items.
// =============================================================================

import type { CartItem, CartPromotion, CartCredit } from '@/modules/cart/types/cart.types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const CART_SANITIZER_GUARDS = {
  MAX_ITEMS: 200,
  MAX_MODIFIERS_PER_ITEM: 40,
  TAX_RATE_MIN: 0,
  TAX_RATE_MAX: 0.2,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Internal primitive helpers
// ─────────────────────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Validates a non-negative integer (e.g. quantity, unitPriceCents).
 * Returns null if the value is missing, non-numeric, non-finite, or negative.
 * Callers must handle null — do NOT substitute a default silently.
 */
function asNonNegativeInt(v: unknown): number | null {
  const n = asNumber(v);
  if (n === null || n < 0) return null;
  return Math.trunc(n);
}

/**
 * Validates a signed cents value (e.g. priceAdjustmentCents, may be negative).
 * Returns null if the value is missing or non-numeric.
 * Callers must handle null — null means "unknown", NOT "0" / "free".
 */
function asSignedInt(v: unknown): number | null {
  const n = asNumber(v);
  if (n === null) return null;
  return Math.trunc(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public sanitizers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitizes the raw items array from the cart store.
 *
 * LAYER: Display / UI boundary (Layer 3).
 * PURPOSE: Convert unknown Zustand state to a shape safe for rendering.
 * NOT a pricing authority — the server is authoritative.
 *
 * NULL CONTRACT:
 *   Every numeric field returns null when missing or non-numeric.
 *   null = "value unknown" — NOT zero, NOT a free item.
 *   The UI must render null as "—" or hide the line.
 *   computeCartTotals MUST NOT be called on sanitized output —
 *   it operates on validated CartItem from the domain layer.
 *
 * NAMING DRIFT:
 *   unitPriceCents / unit_price_cents are accepted; the store uses both.
 *   This is a display layer: tolerate naming drift, never fix pricing math.
 */
export function sanitizeCartItems(items: unknown): CartItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .slice(0, CART_SANITIZER_GUARDS.MAX_ITEMS)
    .map((raw) => {
      const r: JsonRecord = isRecord(raw) ? raw : {};

      // quantity: null if missing/invalid — UI shows "—" not "1"
      const quantity = asNonNegativeInt(
        r.quantity !== undefined ? r.quantity : null,
      );

      // unitPriceCents: accept camelCase or snake_case, return null if invalid
      const rawUnitPrice: unknown =
        r.unitPriceCents !== undefined ? r.unitPriceCents : r.unit_price_cents;
      const unitPriceCents = asNonNegativeInt(rawUnitPrice);

      const modsRaw = Array.isArray(r.modifiers)
        ? r.modifiers.slice(0, CART_SANITIZER_GUARDS.MAX_MODIFIERS_PER_ITEM)
        : [];

      const modifiers = modsRaw.map((m) => {
        const mr: JsonRecord = isRecord(m) ? m : {};

        // priceAdjustmentCents: single canonical field, no fallback chain.
        // null = price unknown — UI must NOT render $0.00 for null.
        const priceAdjustmentCents = asSignedInt(mr.priceAdjustmentCents);

        return {
          ...mr,
          priceAdjustmentCents,
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
  // ^ Display-layer trust boundary cast. computeCartTotals must not run on
  //   this output — use validated domain CartItem for financial computation.
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
  const r = asNumber(rate) ?? fallbackRate;
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
 * Extracts the five total fields from whatever computeCartTotals returns.
 * Returns null for any field that is missing or non-numeric.
 * The totals shape uses null to signal "unknown" — never defaults to 0.
 */
export function normalizeTotalsShape(raw: unknown): CartTotalsShape {
  const r: JsonRecord = isRecord(raw) ? raw : {};

  const toNonNeg = (v: unknown): number | null => asNonNegativeInt(v);

  return {
    subtotalCents: toNonNeg(r.subtotalCents) ?? 0,
    discountCents: toNonNeg(r.discountCents) ?? 0,
    creditCents:   toNonNeg(r.creditCents)   ?? 0,
    taxCents:      toNonNeg(r.taxCents)       ?? 0,
    totalCents:    toNonNeg(r.totalCents)     ?? 0,
  };
}

// CartSuspicionFlags and computeCartSuspicionFlags live in cart.risk.ts.