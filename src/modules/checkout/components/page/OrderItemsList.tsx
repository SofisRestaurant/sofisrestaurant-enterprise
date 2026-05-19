// src/modules/checkout/components/page/OrderItemsList.tsx

import type { CartItem } from '@/modules/cart/types/cart.types';
import { formatCents } from '@/modules/cart/utils/cart.utils';
import {
  clampInt,
  safeText,
  safeMoneyCents,
  stableCartKey,
  computeDisplayLineTotalCents,
} from '@/modules/checkout/utils/checkoutPageFormatters';

export function OrderItemsList({
  items,
  embedded = false,
}: {
  items: CartItem[];
  embedded?: boolean;
}) {
  return (
    <div className={embedded ? 'divide-y divide-cream-200' : 'divide-y divide-(--color-cream-200)'}>
      {items.map((item) => {
        const notes = safeText(item.notes, 500);
        const lineTotalCents = computeDisplayLineTotalCents(item);
        return (
          <div
            key={stableCartKey(item)}
            className="flex items-start justify-between gap-3 px-5 py-4"
          >
            <div className="min-w-0 flex-1">
              <p
                className={
                  embedded
                    ? 'truncate text-sm font-semibold text-ink-900'
                    : 'truncate text-sm font-medium text-(--color-ink-900)'
                }
              >
                {item.name}{' '}
                <span className={embedded ? 'text-ink-400' : 'text-(--color-ink-400)'}>
                  × {clampInt(item.quantity, 1, 100)}
                </span>
              </p>
              {item.modifiers?.length ? (
                <ul className="mt-1 space-y-0.5">
                  {item.modifiers.map((m) => (
                    <li
                      key={`${m.groupId}:${m.id}`}
                      className="text-xs text-(--color-ink-400) truncate"
                    >
                      • {m.name}
                    </li>
                  ))}
                </ul>
              ) : null}
              {notes && <p className="mt-1 text-xs text-(--color-ink-400)">{notes}</p>}
            </div>
            <div className="shrink-0 text-right">
              <span className="text-sm font-semibold text-(--color-ink-900) tabular-nums">
                {formatCents(lineTotalCents)}
              </span>
              <div className="mt-0.5 text-[11px] text-(--color-ink-400) tabular-nums">
                {formatCents(safeMoneyCents(item.unitPriceCents))} ea
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}