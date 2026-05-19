// CartSummary — production pricing shell (uses domain use-cart-summary).

import { ShieldCheck } from 'lucide-react';

import { useCartSummary } from '@/domain/cart/use-cart-summary';
import { formatCents } from '@/modules/cart/utils/cart.utils';

import { cartInsetCard, cartEyebrow } from './cartStyles';

type MoneyRowProps = {
  label: string;
  valueCents: number;
  strong?: boolean;
  muted?: boolean;
  savings?: boolean;
  testId?: string;
};

function MoneyRow({ label, valueCents, strong, muted, savings, testId }: MoneyRowProps) {
  const labelCls = strong
    ? 'font-black text-ink-900'
    : savings
      ? 'text-ember-700'
      : muted
        ? 'text-ink-400'
        : 'text-ink-600';
  const valueCls = strong
    ? 'font-black text-ink-900'
    : savings
      ? 'font-semibold text-ember-800'
      : muted
        ? 'text-ink-500'
        : 'font-semibold text-ink-900';

  const display =
    savings && valueCents < 0
      ? `−${formatCents(Math.abs(valueCents))}`
      : formatCents(valueCents);

  return (
    <div className="flex justify-between text-sm" data-testid={testId}>
      <span className={labelCls}>{label}</span>
      <span className={`tabular-nums ${valueCls}`}>{display}</span>
    </div>
  );
}

export function CartSummary() {
  const { totals, flags } = useCartSummary();

  return (
    <div className={`${cartInsetCard} space-y-2.5`}>
      <p className={cartEyebrow}>Order summary</p>

      <MoneyRow label="Subtotal" valueCents={totals.subtotalCents} testId="cart-subtotal" />

      {totals.hasDiscount ? (
        <MoneyRow
          label="Discount"
          valueCents={-totals.discountCents}
          savings
          testId="cart-discount"
        />
      ) : null}

      {totals.hasCredit ? (
        <MoneyRow label="Credit" valueCents={-totals.creditCents} savings testId="cart-credit" />
      ) : null}

      <MoneyRow label="Est. tax (9.5%)" valueCents={totals.taxCents} muted testId="cart-tax" />

      <div className="space-y-2 border-t border-cream-200 pt-2.5">
        <MoneyRow label="Total" valueCents={totals.totalCents} strong testId="cart-total" />

        <div className="flex items-start gap-2 rounded-xl bg-cream-50/90 px-3 py-2">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-ember-600"
            strokeWidth={2.25}
            aria-hidden="true"
          />
          <p className="text-[11px] leading-snug text-ink-500">
            Final total is confirmed at secure payment (Stripe) and may include promotions,
            credits, and tax.
          </p>
        </div>

        {flags.inconsistent ? (
          <p className="text-[11px] leading-snug text-ember-700" role="status">
            Pricing estimate looks inconsistent. Please refresh. Final total confirmed at payment.
          </p>
        ) : flags.suspicious ? (
          <p className="text-[11px] leading-snug text-gold-700" role="status">
            Pricing estimate may be incomplete. Final total confirmed at payment.
          </p>
        ) : null}
      </div>
    </div>
  );
}
