// src/modules/checkout/components/page/OrderTotals.tsx

import { formatCents } from '@/modules/cart/utils/cart.utils';

export function OrderTotals({
  subtotalCents,
  estimatedTaxCents,
  estimatedTotalCents,
  embedded = false,
}: {
  subtotalCents: number;
  estimatedTaxCents: number;
  estimatedTotalCents: number;
  embedded?: boolean;
}) {
  return (
    <div
      className={
        embedded
          ? 'space-y-2 border-t border-cream-200 bg-cream-50/80 px-5 py-4 text-sm'
          : 'space-y-2 border-t border-(--color-cream-200) bg-(--color-cream-50) px-5 py-4 text-sm'
      }
    >
      <div className="flex justify-between text-(--color-ink-600)">
        <span>Subtotal</span>
        <span className="tabular-nums">{formatCents(subtotalCents)}</span>
      </div>

      <div className="flex justify-between text-(--color-ink-400)">
        <span>Estimated tax</span>
        <span className="tabular-nums">{formatCents(estimatedTaxCents)}</span>
      </div>

      <div className="flex justify-between border-t border-(--color-cream-300) pt-3 font-bold text-(--color-ink-900)">
        <span>Estimated total</span>
        <span className="tabular-nums text-(--color-ember-600)">
          {formatCents(estimatedTotalCents)}
        </span>
      </div>

      <p className="text-center text-[11px] leading-4 text-(--color-ink-300)">
        Taxes and totals are shown before you place your order.
      </p>
    </div>
  );
}