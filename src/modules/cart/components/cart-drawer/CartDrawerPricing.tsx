import type { useCartSummary } from '@/domain/cart/use-cart-summary';
import { formatCents } from '@/modules/cart/utils/cart.utils';
import { ShieldCheck } from 'lucide-react';

import { cartInsetCard } from '../cartStyles';

type SummaryTotals = ReturnType<typeof useCartSummary>['totals'];
type SummaryFlags = ReturnType<typeof useCartSummary>['flags'];

type CartDrawerPricingProps = {
  totals: SummaryTotals;
  flags: SummaryFlags;
};

function PricingRow({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'savings' | 'muted';
}) {
  const labelCls =
    tone === 'savings' ? 'text-ember-700' : tone === 'muted' ? 'text-ink-400' : 'text-ink-600';
  const valueCls =
    tone === 'savings' ? 'text-ember-800' : tone === 'muted' ? 'text-ink-500' : 'text-ink-900';

  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className={labelCls}>{label}</span>
      <span className={`font-semibold tabular-nums ${valueCls}`}>{value}</span>
    </div>
  );
}

export function CartDrawerPricing({ totals, flags }: CartDrawerPricingProps) {
  return (
    <section className={`${cartInsetCard} space-y-2.5`} aria-label="Order summary">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-ink-400">
        Estimated total
      </p>

      <PricingRow label="Subtotal" value={formatCents(totals.subtotalCents)} />

      {totals.hasDiscount ? (
        <PricingRow
          label="Promo discount"
          value={`−${formatCents(totals.discountCents)}`}
          tone="savings"
        />
      ) : null}

      {totals.hasCredit ? (
        <PricingRow
          label="Account credit"
          value={`−${formatCents(totals.creditCents)}`}
          tone="savings"
        />
      ) : null}

      <PricingRow label="Est. tax (9.5%)" value={formatCents(totals.taxCents)} tone="muted" />

      <div className="flex items-end justify-between gap-4 border-t border-cream-200 pt-2.5">
        <span className="text-sm font-black text-ink-900">Total</span>
        <span className="text-lg font-black tabular-nums tracking-tight text-ink-900">
          {formatCents(totals.totalCents)}
        </span>
      </div>

      {flags.inconsistent ? (
        <p className="text-[11px] font-medium text-ember-700" role="status">
          Pricing may be inconsistent — your final total is confirmed at checkout.
        </p>
      ) : null}

      <div className="flex items-start gap-2 rounded-xl bg-cream-50/90 px-3 py-2.5">
        <ShieldCheck
          className="mt-0.5 h-4 w-4 shrink-0 text-ember-600"
          strokeWidth={2.25}
          aria-hidden="true"
        />
        <p className="text-[11px] leading-snug text-ink-500">
          Secure checkout via Stripe. Final total confirmed before you pay.
        </p>
      </div>
    </section>
  );
}
