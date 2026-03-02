// src/components/cart/CartItem.tsx
// =============================================================================
// CartItem — V4 (2026) Production Grade
// - Pure cents rendering (no floats)
// - No unsafe member access (no `any`)
// - Never trusts precomputed totals
// - Stable key via cartItemKey(menuItemId, modifiers)
// - A11y: aria labels + focus rings
// - Defensive UI: handles missing/invalid unitPriceCents gracefully
// =============================================================================

import { memo, useCallback, useMemo } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';

import { useCartStore } from '@/features/cart/cart.store';
import { cartItemKey, computeLineTotalCents } from '@/features/cart/cart.types';
import type { CartItem } from '@/features/cart/cart.types';
import { formatCents } from '@/features/cart/cart.utils';

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

  const extrasCents = useMemo(() => {
    return (item.modifiers ?? []).reduce((sum, m) => sum + safeCents(m.priceAdjustment, 0), 0);
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
  const hasNotes = notes.length > 0;

  const canDec = qty > 1;
  const canInc = qty < 100;

  const onInc = useCallback(() => {
    if (!canInc) return;
    updateQuantity(item.menuItemId, modifierKey, qty + 1);
  }, [canInc, updateQuantity, item.menuItemId, modifierKey, qty]);

  const onDec = useCallback(() => {
    if (!canDec) return;
    updateQuantity(item.menuItemId, modifierKey, qty - 1);
  }, [canDec, updateQuantity, item.menuItemId, modifierKey, qty]);

  const onRemove = useCallback(() => {
    removeItem(item.menuItemId, modifierKey);
  }, [removeItem, item.menuItemId, modifierKey]);

  const priceInvalid = unitCents <= 0 || unitCents > 500_00;

  return (
    <article className="group flex gap-4 border-b border-zinc-200/70 py-4">
      {/* Image */}
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.name || 'Menu item'}
          className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-zinc-200/60"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="h-20 w-20 shrink-0 rounded-xl bg-zinc-100 ring-1 ring-zinc-200/60" />
      )}

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-zinc-900">{item.name}</h3>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-xs font-medium text-zinc-600">{formatCents(unitCents)}</p>

              {extrasCents !== 0 ? (
                <p className="text-[11px] text-zinc-500">
                  + {formatCents(extrasCents)} <span className="text-zinc-400">(options)</span>
                </p>
              ) : null}

              {priceInvalid ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                  Pricing pending
                </span>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={onRemove}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-red-600 transition hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500/30"
            aria-label={`Remove ${item.name || 'item'} from cart`}
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>

        {/* Modifiers */}
        {hasModifiers ? (
          <div className="mt-2 rounded-xl bg-zinc-50 px-3 py-2 ring-1 ring-zinc-200/70">
            <p className="text-[11px] font-semibold text-zinc-600">Options</p>
            <ul className="mt-1 space-y-0.5">
              {(item.modifiers ?? []).map((m) => (
                <li
                  key={`${m.groupId}:${m.id}`}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="truncate text-xs text-zinc-700">{m.name}</span>
                  {safeCents(m.priceAdjustment, 0) !== 0 ? (
                    <span className="shrink-0 text-[11px] text-zinc-500">
                      + {formatCents(safeCents(m.priceAdjustment, 0))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Notes */}
        {hasNotes ? (
          <div className="mt-2 text-xs text-zinc-600">
            <span className="font-semibold text-zinc-700">Note:</span>{' '}
            <span className="wrap-break-words">{notes}</span>
          </div>
        ) : null}

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2 rounded-xl bg-zinc-50 p-1 ring-1 ring-zinc-200/70">
            <button
              type="button"
              onClick={onDec}
              disabled={!canDec}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              aria-label={`Decrease quantity of ${item.name || 'item'}`}
            >
              <Minus className="h-4 w-4" />
            </button>

            <span className="w-8 text-center text-sm font-semibold tabular-nums text-zinc-900">
              {qty}
            </span>

            <button
              type="button"
              onClick={onInc}
              disabled={!canInc}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              aria-label={`Increase quantity of ${item.name || 'item'}`}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="text-right">
            <p className="text-sm font-bold tabular-nums text-zinc-900">
              {formatCents(lineTotalCents)}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

export default memo(CartItemComponent);