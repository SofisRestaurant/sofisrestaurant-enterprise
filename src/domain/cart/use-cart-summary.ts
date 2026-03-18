// =============================================================================
// PATH: src/domain/cart/use-cart-summary.ts
// =============================================================================
// React hook that computes safe, display-ready cart totals from the cart store.
//
// PURPOSE
// - Replaces the inline useMemo logic that was living in CartSummary.tsx.
// - Owns the full pipeline: store → sanitize → compute → normalize → flag.
// - Returns a stable, typed object that the CartSummary component (and any
//   other consumer) can render directly with no further processing.
//
// WHAT THIS IS NOT
// - Not billing-authoritative. Server + Stripe confirm real totals.
// - Not a general cart state hook. For item counts, cart open/close state, or
//   add/remove actions use the useCart / useCartStore hooks directly.
// =============================================================================

import { useMemo } from 'react';
import { useCartStore } from '@/modules/cart/store/cart.store';
import { computeCartTotals } from '@/modules/cart/types/cart.types';
import {
  sanitizeCartItems,
  sanitizeCartPromotion,
  sanitizeCartCredit,
  sanitizeTaxRate,
  normalizeTotalsShape,
  computeCartSuspicionFlags,
  CART_SANITIZER_GUARDS,
} from './cart.sanitizer';
import type { CartTotalsShape, CartSuspicionFlags } from './cart.sanitizer';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TAX_RATE = 0.095;

// ─────────────────────────────────────────────────────────────────────────────
// Return type
// ─────────────────────────────────────────────────────────────────────────────

export interface CartSummaryTotals extends CartTotalsShape {
  /** True when discountCents > 0 — convenience flag for conditional rendering. */
  hasDiscount: boolean;
  /** True when creditCents > 0 — convenience flag for conditional rendering. */
  hasCredit: boolean;
}

export interface UseCartSummaryReturn {
  totals: CartSummaryTotals;
  flags: CartSuspicionFlags;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes safe, display-ready cart totals.
 *
 * The full pipeline runs inside a single useMemo that re-runs only when the
 * relevant store slices change. All sanitization and normalization is
 * delegated to cart.sanitizer.ts — this hook is coordination only.
 *
 * @example
 * ```tsx
 * const { totals, flags } = useCartSummary();
 *
 * return (
 *   <>
 *     <span>{PricingEngine.formatCents(totals.totalCents)}</span>
 *     {flags.inconsistent && <WarningBanner />}
 *   </>
 * );
 * ```
 */
export function useCartSummary(): UseCartSummaryReturn {
  // Read slices as unknown — the sanitizer is the trust boundary
  const rawItems     = useCartStore((s) => s.items     as unknown);
  const rawPromotion = useCartStore((s) => s.promotion as unknown);
  const rawCredit    = useCartStore((s) => s.credit    as unknown);

  return useMemo((): UseCartSummaryReturn => {
    // ── Step 1: sanitize store values ────────────────────────────────────────
    const items     = sanitizeCartItems(rawItems);
    const promotion = sanitizeCartPromotion(rawPromotion);
    const credit    = sanitizeCartCredit(rawCredit);
    const taxRate   = sanitizeTaxRate(DEFAULT_TAX_RATE, DEFAULT_TAX_RATE);

    // ── Step 2: compute domain totals ────────────────────────────────────────
    const computed = computeCartTotals(items, promotion, credit, taxRate);

    // ── Step 3: normalize totals shape + apply hard display cap ──────────────
    const normalized = normalizeTotalsShape(computed, CART_SANITIZER_GUARDS.MAX_TOTAL_CENTS);

    const totalCents = Math.min(
      normalized.totalCents,
      CART_SANITIZER_GUARDS.MAX_TOTAL_CENTS,
    );

    const totals: CartSummaryTotals = {
      ...normalized,
      totalCents,
      hasDiscount: normalized.discountCents > 0,
      hasCredit:   normalized.creditCents   > 0,
    };

    // ── Step 4: compute suspicion flags ──────────────────────────────────────
    const flags = computeCartSuspicionFlags(totals, CART_SANITIZER_GUARDS.MAX_TOTAL_CENTS);

    return { totals, flags };
  }, [rawItems, rawPromotion, rawCredit]);
}