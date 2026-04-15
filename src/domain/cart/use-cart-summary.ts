// =============================================================================
// PATH: src/domain/cart/use-cart-summary.ts
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
} from './cart.sanitizer';
import type { CartTotalsShape } from './cart.sanitizer';
import {
  capDisplayTotal,
  computeCartSuspicionFlags,
} from './cart.risk';
import type { CartSuspicionFlags } from './cart.risk';

const DEFAULT_TAX_RATE = 0.095;

export interface CartSummaryTotals extends CartTotalsShape {
  hasDiscount: boolean;
  hasCredit:   boolean;
}

export interface UseCartSummaryReturn {
  totals: CartSummaryTotals;
  flags:  CartSuspicionFlags;
}

export function useCartSummary(): UseCartSummaryReturn {
  const rawItems     = useCartStore((s) => s.items     as unknown);
  const rawPromotion = useCartStore((s) => s.promotion as unknown);
  const rawCredit    = useCartStore((s) => s.credit    as unknown);

  return useMemo((): UseCartSummaryReturn => {
    const items     = sanitizeCartItems(rawItems);
    const promotion = sanitizeCartPromotion(rawPromotion);
    const credit    = sanitizeCartCredit(rawCredit);
    const taxRate   = sanitizeTaxRate(DEFAULT_TAX_RATE, DEFAULT_TAX_RATE);

    const computed   = computeCartTotals(items, promotion, credit, taxRate);
    const normalized = normalizeTotalsShape(computed);

    const totals: CartSummaryTotals = {
      ...normalized,
      totalCents:  capDisplayTotal(normalized.totalCents),
      hasDiscount: normalized.discountCents > 0,
      hasCredit:   normalized.creditCents   > 0,
    };

    return { totals, flags: computeCartSuspicionFlags(totals) };
  }, [rawItems, rawPromotion, rawCredit]);
}