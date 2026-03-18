// src/modules/cart/components/CartSummary.tsx
// =============================================================================
// CartSummary — Production UI (2026)
// =============================================================================
// Rendering shell only. All computation lives in:
//   src/domain/cart/use-cart-summary.ts   ← hook (store + pipeline)
//   src/domain/cart/cart.sanitizer.ts     ← pure sanitization functions
//
// This file owns nothing except layout and MoneyRow.
// =============================================================================

import { PricingEngine } from '@/domain/pricing/pricing.engine';
import { useCartSummary } from '@/domain/cart/use-cart-summary';

// ─────────────────────────────────────────────────────────────────────────────
// MoneyRow
// ─────────────────────────────────────────────────────────────────────────────

type MoneyRowProps = {
  label: string;
  valueCents: number;
  strong?: boolean;
  muted?: boolean;
  testId?: string;
};

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
      <span className={valueCls}>{PricingEngine.formatCents(valueCents)}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CartSummary
// ─────────────────────────────────────────────────────────────────────────────

export function CartSummary() {
  const { totals, flags } = useCartSummary();

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
      <MoneyRow label="Subtotal" valueCents={totals.subtotalCents} testId="cart-subtotal" />

      {totals.hasDiscount ? (
        <MoneyRow
          label="Discount"
          valueCents={-totals.discountCents}
          muted
          testId="cart-discount"
        />
      ) : null}

      {totals.hasCredit ? (
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