// src/modules/cart/components/CartSummary.tsx
// =============================================================================
// CartSummary — Production + “Dangerously Secure” UI Hardening (2026)
// =============================================================================
// What this file DOES:
// - Display-only totals (never trusted for billing)
// - Defensive against poisoned cart state (NaN, negative, absurd, shape drift)
// - Single display truth: computeCartTotals(...) from cart types module
// - Works with store slices: items, promotion, credit
// - Strict runtime sanitization + invariant checks (prevents weird UI + crashes)
//
// What this file DOES NOT do:
// - It does NOT secure billing. Server + Stripe are authoritative.
//
// NOTE:
// - This is intentionally strict. If cart state is malformed, we fail closed to
//   conservative display and show a warning line.
//
// =============================================================================

import { useMemo } from 'react';
import { useCartStore } from '@/modules/cart/store/cart.store';
import { computeCartTotals } from '@/modules/cart/types/cart.types';
import { PricingEngine } from '@/domain/pricing/pricing.engine';

// ─────────────────────────────────────────────────────────────────────────────
// Config (keep in one place)
// ─────────────────────────────────────────────────────────────────────────────

const TAX_RATE_DEFAULT = 0.095;

// Hard guardrails for display stability (NOT billing security)
const GUARDS = {
  MAX_LINE_ITEM_QTY: 100,
  MAX_ITEMS: 200,
  MAX_UNIT_PRICE_CENTS: 250_000, // $2,500
  MAX_TOTAL_CENTS: 5_000_000, // $50,000
  MAX_MODIFIERS_PER_ITEM: 40,
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

// ─────────────────────────────────────────────────────────────────────────────
// Guards / helpers (no unsafe member access)
// ─────────────────────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = asNumber(v, NaN);
  if (!Number.isFinite(n)) return min;
  const i = Math.trunc(n);
  return Math.max(min, Math.min(max, i));
}

function clampCentsNonNeg(v: unknown, max: number, fallback = 0): number {
  const n = asNumber(v, NaN);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(Math.round(n));
  if (i < 0) return fallback;
  return Math.min(i, max);
}

function clampCentsSigned(v: unknown, min: number, max: number, fallback = 0): number {
  const n = asNumber(v, NaN);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.trunc(Math.round(n));
  return Math.max(min, Math.min(max, i));
}

function sanitizeTaxRate(rate: unknown): number {
  const r = asNumber(rate, TAX_RATE_DEFAULT);
  // clamp 0%..20% sanity
  return Math.max(0, Math.min(0.2, r));
}

/**
 * Sanitizes cart items to keep UI stable and prevent NaN/negative totals.
 * Keeps original shape but clamps fields computeCartTotals typically reads:
 * - quantity
 * - unitPriceCents
 * - modifiers[].priceAdjustment (or priceAdjustmentCents)
 */
function sanitizeItems(items: unknown): unknown[] {
  if (!Array.isArray(items)) return [];

  const sliced = items.slice(0, GUARDS.MAX_ITEMS);

  return sliced.map((raw) => {
    const r: JsonRecord = isRecord(raw) ? raw : {};

    const quantity = clampInt(r.quantity, 1, GUARDS.MAX_LINE_ITEM_QTY);

    // Support both unitPriceCents and unit_price_cents naming drifts
    const unitPriceCents = clampInt(
      (r.unitPriceCents ?? (r as any).unit_price_cents) as unknown,
      0,
      GUARDS.MAX_UNIT_PRICE_CENTS,
    );

    const modsRaw = Array.isArray(r.modifiers)
      ? r.modifiers.slice(0, GUARDS.MAX_MODIFIERS_PER_ITEM)
      : [];
    const modifiers = modsRaw.map((m) => {
      const mr: JsonRecord = isRecord(m) ? m : {};
      // Support both priceAdjustment and priceAdjustmentCents naming drifts
      const adj =
        mr.priceAdjustment ?? mr.priceAdjustmentCents ?? (mr as any).price_adjustment ?? 0;
      const priceAdjustment = clampCentsSigned(
        adj,
        -GUARDS.MAX_UNIT_PRICE_CENTS,
        GUARDS.MAX_UNIT_PRICE_CENTS,
        0,
      );
      return {
        ...mr,
        priceAdjustment,
        priceAdjustmentCents: priceAdjustment, // keep both for downstream compatibility
      };
    });

    return {
      ...r,
      quantity,
      unitPriceCents,
      unit_price_cents: unitPriceCents,
      modifiers,
    };
  });
}

function sanitizePromotion(promotion: unknown): unknown {
  // We keep it as-is, but prevent non-objects from flowing into computeCartTotals.
  return isRecord(promotion) ? promotion : null;
}

function sanitizeCredit(credit: unknown): unknown {
  // We keep it as-is, but prevent non-objects from flowing into computeCartTotals.
  return isRecord(credit) ? credit : null;
}

function safeTotalsShape(t: unknown) {
  const r: JsonRecord = isRecord(t) ? t : {};
  const subtotalCents = clampCentsNonNeg(r.subtotalCents, GUARDS.MAX_TOTAL_CENTS, 0);
  const discountCents = clampCentsNonNeg(r.discountCents, GUARDS.MAX_TOTAL_CENTS, 0);
  const creditCents = clampCentsNonNeg(r.creditCents, GUARDS.MAX_TOTAL_CENTS, 0);
  const taxCents = clampCentsNonNeg(r.taxCents, GUARDS.MAX_TOTAL_CENTS, 0);
  const totalCents = clampCentsNonNeg(r.totalCents, GUARDS.MAX_TOTAL_CENTS, 0);

  return { subtotalCents, discountCents, creditCents, taxCents, totalCents };
}

/**
 * Invariant checks to detect corrupted math (UI only).
 * We do NOT block user checkout here—only display warnings.
 */
function computeSuspicionFlags(t: {
  subtotalCents: number;
  discountCents: number;
  creditCents: number;
  taxCents: number;
  totalCents: number;
}) {
  const afterDiscount = Math.max(0, t.subtotalCents - t.discountCents);
  const afterCredit = Math.max(0, afterDiscount - t.creditCents);
  const minExpectedTotal = afterCredit; // tax can be 0; total should be >= afterCredit
  const maxExpectedTotal = afterCredit + GUARDS.MAX_TOTAL_CENTS; // loose upper bound

  const suspicious =
    t.totalCents < minExpectedTotal ||
    t.totalCents > maxExpectedTotal ||
    (t.subtotalCents === 0 && t.totalCents > 0) ||
    t.totalCents >= GUARDS.MAX_TOTAL_CENTS;

  // Stronger flag: clearly inconsistent tax (if total is less than pre-tax)
  const inconsistent = t.totalCents < afterCredit || t.taxCents > t.totalCents || t.taxCents < 0;

  return { suspicious, inconsistent };
}

// ─────────────────────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────────────────────

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

  // PricingEngine.formatCents expects cents and returns a USD string
  const display = PricingEngine.formatCents(valueCents);

  return (
    <div className="flex justify-between text-sm" data-testid={testId}>
      <span className={labelCls}>{label}</span>
      <span className={valueCls}>{display}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CartSummary() {
  const items = useCartStore((s) => s.items as unknown);
  const promotion = useCartStore((s) => s.promotion as unknown);
  const credit = useCartStore((s) => s.credit as unknown);

  const { totals, flags } = useMemo(() => {
    const safeItems = sanitizeItems(items);
    const safePromo = sanitizePromotion(promotion);
    const safeCredit = sanitizeCredit(credit);
    const safeRate = sanitizeTaxRate(TAX_RATE_DEFAULT);

    // Domain function is the single source for display totals
    const computed = computeCartTotals(
      safeItems as any,
      safePromo as any,
      safeCredit as any,
      safeRate,
    );

    const t = safeTotalsShape(computed);

    // Defensive cap (prevents insane display)
    const cappedTotal = Math.min(t.totalCents, GUARDS.MAX_TOTAL_CENTS);

    const finalTotals = {
      ...t,
      totalCents: cappedTotal,
    };

    const suspicion = computeSuspicionFlags(finalTotals);

    return { totals: finalTotals, flags: suspicion };
  }, [items, promotion, credit]);

  const hasDiscount = totals.discountCents > 0;
  const hasCredit = totals.creditCents > 0;

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
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

      <div className="space-y-2 border-t border-gray-200 pt-2">
        <MoneyRow label="Total" valueCents={totals.totalCents} strong testId="cart-total" />

        <p className="text-[11px] leading-snug text-gray-500">
          Final total is confirmed at secure payment (Stripe) and may include promotions, credits,
          and tax.
        </p>

        {flags.inconsistent ? (
          <p className="text-[11px] leading-snug text-red-600">
            Pricing estimate looks inconsistent. Please refresh the page. Final total will be
            confirmed at payment.
          </p>
        ) : flags.suspicious ? (
          <p className="text-[11px] leading-snug text-amber-600">
            Pricing estimate may be incomplete. Final total will be confirmed at payment.
          </p>
        ) : null}
      </div>
    </div>
  );
}
