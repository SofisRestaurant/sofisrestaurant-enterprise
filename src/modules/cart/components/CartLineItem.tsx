// src/modules/cart/components/CartLineItem.tsx
// Fully self-contained cart line item — store reads + local formatting only.

import { memo, useMemo } from 'react';
import { Trash2 } from 'lucide-react';

import { useCartStore } from '@/modules/cart/store/cart.store';
import { cartItemKey, computeLineTotalCents } from '@/modules/cart/types/cart.types';
import type { CartItem } from '@/modules/cart/types/cart.types';
import { formatCents } from '@/modules/cart/utils/cart.utils';

import { CartQuantityStepper } from './CartQuantityStepper';
import { cartGhostButton, cartLineCard } from './cartStyles';

const sc = (n: unknown): number => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? Math.round(v) : 0;
};

const cq = (n: unknown): number => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? Math.max(1, Math.min(20, Math.floor(v))) : 1;
};

interface CartLineItemProps {
  item: CartItem;
}

export const CartLineItem = memo(function CartLineItem({ item }: CartLineItemProps) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const key = useMemo(
    () => cartItemKey(item.menuItemId, item.modifiers),
    [item.menuItemId, item.modifiers],
  );

  const qty = useMemo(() => cq(item.quantity), [item.quantity]);
  const unit = useMemo(() => sc(item.unitPriceCents), [item.unitPriceCents]);
  const itemName = item.name || 'Item';

  const modifierTotal = useMemo(
    () => (item.modifiers ?? []).reduce((sum, m) => sum + sc(m.priceAdjustmentCents), 0),
    [item.modifiers],
  );

  const lineTotal = useMemo(
    () =>
      computeLineTotalCents({
        unitPriceCents: unit,
        modifiers: item.modifiers ?? [],
        quantity: qty,
      }),
    [unit, item.modifiers, qty],
  );

  const notes = item.notes?.trim() ?? '';
  const hasModifiers = (item.modifiers?.length ?? 0) > 0;

  return (
    <article className={cartLineCard}>
      <div className="flex gap-3.5">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={itemName}
            className="h-[4.25rem] w-[4.25rem] shrink-0 rounded-2xl object-cover ring-1 ring-cream-200"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            className="h-[4.25rem] w-[4.25rem] shrink-0 rounded-2xl bg-linear-to-br from-gold-100/80 to-cream-100 ring-1 ring-gold-200/60"
            aria-hidden="true"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-bold leading-snug text-ink-900">{itemName}</h3>
              <p className="mt-0.5 text-xs text-ink-500">
                {formatCents(unit)}
                {modifierTotal > 0 ? (
                  <span className="text-ink-400"> · +{formatCents(modifierTotal)} options</span>
                ) : null}
              </p>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeItem(item.menuItemId, key);
              }}
              className={cartGhostButton + ' !px-2 !py-2 text-ink-400 hover:text-ember-700'}
              aria-label={`Remove ${itemName} from cart`}
            >
              <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>

          {hasModifiers ? (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Selected options">
              {(item.modifiers ?? []).map((m) => (
                <li
                  key={`${m.groupId}:${m.id}`}
                  className="rounded-full border border-gold-200/70 bg-gold-50/80 px-2 py-0.5 text-[10px] font-semibold text-ember-800"
                >
                  {m.name}
                  {sc(m.priceAdjustmentCents) > 0
                    ? ` +${formatCents(sc(m.priceAdjustmentCents))}`
                    : ''}
                </li>
              ))}
            </ul>
          ) : null}

          {notes ? (
            <p className="mt-2 rounded-xl bg-cream-50/90 px-2.5 py-1.5 text-[11px] leading-snug text-ink-600">
              <span className="font-semibold text-ink-700">Note:</span> {notes}
            </p>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-3">
            <CartQuantityStepper
              quantity={qty}
              itemName={itemName}
              onDecrease={(e) => {
                e.stopPropagation();
                updateQuantity(item.menuItemId, key, qty - 1);
              }}
              onIncrease={(e) => {
                e.stopPropagation();
                updateQuantity(item.menuItemId, key, qty + 1);
              }}
            />

            <p className="text-base font-black tabular-nums tracking-tight text-ink-900">
              {formatCents(lineTotal)}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
});
