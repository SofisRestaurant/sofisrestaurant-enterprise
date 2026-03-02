// src/components/cart/CartSummary.tsx
// =============================================================================
// CartSummary — Production-Grade (2026)
// Goals:
// - Display-only (never trusted for billing)
// - Defensive against poisoned cart state (NaN, negative cents, absurd totals)
// - Single source of truth: computeCartTotals(...) from domain
// - Works with your existing store shape: items, promotion, credit
// - UI stays stable even if promo/credit objects change shape
// =============================================================================

import { useMemo } from 'react';
import { useCartStore } from '@/features/cart/cart.store';
import { computeCartTotals } from '@/features/cart/cart.types';
import { formatCents } from '@/features/cart/cart.utils';

// ─────────────────────────────────────────────────────────────────────────────
// Config (keep in one place; later you can pull from env/config endpoint)
// NOTE: Arizona tax varies by location. Use your real rate here.
// ─────────────────────────────────────────────────────────────────────────────

const TAX_RATE = 0.0825;

// Hard guardrails to prevent UI showing insane numbers if cart state is poisoned.
// These are NOT security controls for Stripe (server is authoritative).
const GUARDS = {
  MAX_LINE_ITEM_QTY: 100,
  MAX_ITEMS: 200,
  MAX_UNIT_PRICE_CENTS: 250_000, // $2,500
  MAX_TOTAL_CENTS: 5_000_000, // $50,000
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type MoneyRowProps = {
  label: string;
  valueCents: number;
  strong?: boolean;
  muted?: boolean;
  testId?: string;
};

function clampInt(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return min;
  const i = Math.trunc(n);
  return Math.max(min, Math.min(max, i));
}

function safeCents(v: unknown, fallback = 0): number {
  // cents must be integer >= 0 for display (we will negate in Discount/Credit row)
  return clampInt(v, 0, GUARDS.MAX_TOTAL_CENTS) || fallback;
}

function MoneyRow({ label, valueCents, strong, muted, testId }: MoneyRowProps) {
  const labelCls = strong
    ? 'text-gray-900 font-semibold'
    : muted
      ? 'text-gray-500'
      : 'text-gray-600';

  const valueCls = strong
    ? 'text-gray-900 font-semibold'
    : muted
      ? 'text-gray-600'
      : 'text-gray-900';

  return (
    <div className="flex justify-between text-sm" data-testid={testId}>
      <span className={labelCls}>{label}</span>
      <span className={valueCls}>{formatCents(valueCents)}</span>
    </div>
  );
}

/**
 * Sanitizes cart items to keep UI stable and prevent NaN/negative totals.
 * IMPORTANT: this is display hardening, not billing security.
 */
function sanitizeItems(items: unknown[]): unknown[] {
  if (!Array.isArray(items)) return [];

  // hard limit to avoid runaway renders
  const sliced = items.slice(0, GUARDS.MAX_ITEMS);

  return sliced.map((raw: any) => {
    // We keep the original shape but clamp key fields commonly used by computeCartTotals:
    // - quantity
    // - unitPriceCents
    // - modifiers[].priceAdjustment
    //
    // If your computeCartTotals uses additional fields, leaving them intact is fine.
    const quantity = clampInt(raw?.quantity, 1, GUARDS.MAX_LINE_ITEM_QTY);
    const unitPriceCents = clampInt(raw?.unitPriceCents, 0, GUARDS.MAX_UNIT_PRICE_CENTS);

    const modifiers = Array.isArray(raw?.modifiers)
      ? raw.modifiers.map((m: any) => ({
          ...m,
          priceAdjustment: clampInt(
            m?.priceAdjustment,
            -GUARDS.MAX_UNIT_PRICE_CENTS,
            GUARDS.MAX_UNIT_PRICE_CENTS,
          ),
        }))
      : [];

    // lineTotalCents might be present; keep but don’t trust. computeCartTotals should compute anyway.
    return {
      ...raw,
      quantity,
      unitPriceCents,
      modifiers,
    };
  });
}

function sanitizeTaxRate(rate: unknown): number {
  const r = typeof rate === 'number' ? rate : Number(rate);
  if (!Number.isFinite(r)) return TAX_RATE;
  // clamp 0%..20% for sanity
  return Math.max(0, Math.min(0.2, r));
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CartSummary (cents-based, production-safe)
 * - Reads canonical state from the cart store
 * - Computes totals locally using computeCartTotals()
 * - Defensive: clamps nonsense values to prevent NaN and weird UI
 * - Still communicates that final total is confirmed at Stripe (server authoritative)
 */
export function CartSummary() {
  const items = useCartStore((s) => s.items as unknown[]);
  const promotion = useCartStore((s) => s.promotion as unknown);
  const credit = useCartStore((s) => s.credit as unknown);

  const totals = useMemo(() => {
    const safeItems = sanitizeItems(items);
    const safeRate = sanitizeTaxRate(TAX_RATE);

    // computeCartTotals is your domain function; keep it as the single source for display totals
    const t = computeCartTotals(safeItems as any, promotion as any, credit as any, safeRate);

    // Hardening: guarantee all totals are finite, non-negative ints
    const subtotalCents = safeCents((t as any)?.subtotalCents, 0);
    const discountCents = safeCents((t as any)?.discountCents, 0);
    const creditCents = safeCents((t as any)?.creditCents, 0);
    const taxCents = safeCents((t as any)?.taxCents, 0);
    const totalCents = safeCents((t as any)?.totalCents, 0);

    // Prevent impossible totals from showing if upstream got corrupted
    const cappedTotal = Math.min(totalCents, GUARDS.MAX_TOTAL_CENTS);

    return {
      subtotalCents,
      discountCents,
      creditCents,
      taxCents,
      totalCents: cappedTotal,
    };
  }, [items, promotion, credit]);

  const hasDiscount = totals.discountCents > 0;
  const hasCredit = totals.creditCents > 0;

  // If something is obviously wrong (ex: subtotal is 0 but total isn't), show a subtle warning line.
  const suspicious =
    (totals.subtotalCents === 0 && totals.totalCents > 0) ||
    totals.totalCents > GUARDS.MAX_TOTAL_CENTS;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
      <MoneyRow label="Subtotal" valueCents={totals.subtotalCents} testId="cart-subtotal" />

      {hasDiscount ? (
        <MoneyRow
          label="Discount"
          valueCents={-totals.discountCents}
          muted
          testId="cart-discount"
        />
      ) : null}

      {hasCredit ? (
        <MoneyRow label="Credit" valueCents={-totals.creditCents} muted testId="cart-credit" />
      ) : null}

      <MoneyRow label="Tax" valueCents={totals.taxCents} testId="cart-tax" />

      <div className="pt-2 border-t border-gray-200 space-y-2">
        <MoneyRow label="Total" valueCents={totals.totalCents} strong testId="cart-total" />

        {/* Trust signal: final billed total is computed server-side */}
        <p className="text-[11px] leading-snug text-gray-500">
          Final total is confirmed at secure payment (Stripe) and may include promotions, credits,
          and tax.
        </p>

        {suspicious ? (
          <p className="text-[11px] leading-snug text-amber-600">
            Pricing estimate may be incomplete. Final total will be confirmed at payment.
          </p>
        ) : null}
      </div>
    </div>
  );
}
