// src/modules/checkout/components/page/OrderTotals.tsx

import { formatCents } from '@/modules/cart/utils/cart.utils';

export function OrderTotals({
  subtotalCents,
  estimatedTaxCents,
  estimatedTotalCents,
}: {
  subtotalCents: number;
  estimatedTaxCents: number;
  estimatedTotalCents: number;
}) {
  return (
    <div className="space-y-2 border-t border-(--color-cream-200) bg-(--color-cream-50) px-5 py-4 text-sm">
      <div className="flex justify-between text-(--color-ink-600)">
        <span>Subtotal</span>
        <span className="tabular-nums">{formatCents(subtotalCents)}</span>
      </div>
      <div className="flex justify-between text-(--color-ink-400)">
        <span>Est. tax</span>
        <span className="tabular-nums">{formatCents(estimatedTaxCents)}</span>
      </div>
      <div className="flex justify-between border-t border-(--color-cream-300) pt-3 font-bold text-(--color-ink-900)">
        <span>Total</span>
        <span className="tabular-nums text-(--color-ember-600)">
          {formatCents(estimatedTotalCents)}
        </span>
      </div>
      <p className="text-center text-[11px] text-(--color-ink-300)">
        Final total confirmed by Stripe — includes tax, promos, and credits.
      </p>
    </div>
  );
}