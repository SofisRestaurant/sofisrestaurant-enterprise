// CartItem — standalone line item (same UX as CartLineItem; for non-drawer surfaces).

import { memo, useCallback, useMemo } from 'react';
import { Trash2 } from 'lucide-react';

import { useCartStore } from '@/modules/cart/store/cart.store';
import { cartItemKey, computeLineTotalCents } from '@/modules/cart/types/cart.types';
import type { CartItem } from '@/modules/cart/types/cart.types';
import { formatCents } from '@/modules/cart/utils/cart.utils';

import { CartQuantityStepper } from './CartQuantityStepper';
import { cartGhostButton, cartLineCard } from './cartStyles';

type Props = { item: CartItem };

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function safeCents(n: unknown, fallback = 0): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.round(v);
}

function CartItemComponent({ item }: Props) {
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  const modifierKey = useMemo(
    () => cartItemKey(item.menuItemId, item.modifiers),
    [item.menuItemId, item.modifiers],
  );

  const qty = useMemo(() => clampInt(item.quantity, 1, 100), [item.quantity]);
  const unitCents = useMemo(() => safeCents(item.unitPriceCents, 0), [item.unitPriceCents]);
  const itemName = item.name || 'Menu item';

  const extrasCents = useMemo(() => {
    return (item.modifiers ?? []).reduce((sum, m) => sum + safeCents(m.priceAdjustmentCents, 0), 0);
  }, [item.modifiers]);

  const lineTotalCents = useMemo(() => {
    return computeLineTotalCents({
      unitPriceCents: unitCents,
      modifiers: item.modifiers ?? [],
      quantity: qty,
    });
  }, [unitCents, item.modifiers, qty]);

  const hasModifiers = (item.modifiers?.length ?? 0) > 0;
  const notes = (item.notes ?? '').trim();
  const priceInvalid = unitCents <= 0 || unitCents > 500_00;

  const onInc = useCallback(() => {
    if (qty >= 100) return;
    updateQuantity(item.menuItemId, modifierKey, qty + 1);
  }, [qty, updateQuantity, item.menuItemId, modifierKey]);

  const onDec = useCallback(() => {
    if (qty <= 1) return;
    updateQuantity(item.menuItemId, modifierKey, qty - 1);
  }, [qty, updateQuantity, item.menuItemId, modifierKey]);

  const onRemove = useCallback(() => {
    removeItem(item.menuItemId, modifierKey);
  }, [removeItem, item.menuItemId, modifierKey]);

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
            referrerPolicy="no-referrer"
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
              <h3 className="truncate text-[15px] font-bold text-ink-900">{itemName}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-xs font-medium text-ink-600">{formatCents(unitCents)}</p>
                {extrasCents !== 0 ? (
                  <p className="text-[11px] text-ink-500">+ {formatCents(extrasCents)} options</p>
                ) : null}
                {priceInvalid ? (
                  <span className="rounded-full bg-gold-50 px-2 py-0.5 text-[11px] font-semibold text-ember-700 ring-1 ring-gold-200">
                    Pricing pending
                  </span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={onRemove}
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
                  {safeCents(m.priceAdjustmentCents, 0) !== 0
                    ? ` +${formatCents(safeCents(m.priceAdjustmentCents, 0))}`
                    : ''}
                </li>
              ))}
            </ul>
          ) : null}

          {notes ? (
            <p className="mt-2 rounded-xl bg-cream-50/90 px-2.5 py-1.5 text-xs text-ink-600">
              <span className="font-semibold text-ink-700">Note:</span> {notes}
            </p>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-3">
            <CartQuantityStepper
              quantity={qty}
              itemName={itemName}
              min={1}
              max={100}
              onDecrease={(e) => {
                e.stopPropagation();
                onDec();
              }}
              onIncrease={(e) => {
                e.stopPropagation();
                onInc();
              }}
            />
            <p className="text-base font-black tabular-nums text-ink-900">
              {formatCents(lineTotalCents)}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

export default memo(CartItemComponent);
