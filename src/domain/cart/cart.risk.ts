// =============================================================================
// PATH: src/domain/cart/cart.risk.ts
// =============================================================================
// Cart anomaly detection — display-only, never blocks checkout.
//
// ONLY this file may define cart risk thresholds.
// =============================================================================

import type { CartTotalsShape } from './cart.sanitizer';

// Module-scoped constant — not exported, not named in any config object.
const MAX_TOTAL_CENTS = 5_000_000; // $50,000

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CartSuspicionFlags {
  /** Math is clearly wrong — total below post-credit amount, or tax exceeds total. */
  inconsistent: boolean;
  /** Math is plausible but unusual — total near or above the display cap. */
  suspicious: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function capDisplayTotal(cents: number): number {
  return Math.min(cents, MAX_TOTAL_CENTS);
}

export function computeCartSuspicionFlags(t: CartTotalsShape): CartSuspicionFlags {
  const afterDiscount = Math.max(0, t.subtotalCents - t.discountCents);
  const afterCredit   = Math.max(0, afterDiscount - t.creditCents);
  const maxExpected   = afterCredit + MAX_TOTAL_CENTS;

  const inconsistent =
    t.totalCents < afterCredit ||
    t.taxCents > t.totalCents  ||
    t.taxCents < 0;

  const suspicious =
    inconsistent                                ||
    t.totalCents > maxExpected                  ||
    (t.subtotalCents === 0 && t.totalCents > 0) ||
    t.totalCents >= MAX_TOTAL_CENTS;

  return { inconsistent, suspicious };
}