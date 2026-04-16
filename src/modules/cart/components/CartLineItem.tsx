// src/modules/cart/components/CartLineItem.tsx
// =============================================================================
// Fully self-contained cart line item.
//
// Contract:
//   • Receives one prop: `item: CartItem`
//   • Reads updateQuantity + removeItem from the cart store directly
//   • All price formatting is local — no helpers passed from a parent
//   • Every interactive element calls e.stopPropagation() so taps never
//     surface to the sheet's gesture/backdrop layer
// =============================================================================

import { memo, useMemo } from 'react';
import { Minus, Plus, X } from 'lucide-react';

import { useCartStore } from '@/modules/cart/store/cart.store';
import { cartItemKey, computeLineTotalCents } from '@/modules/cart/types/cart.types';
import type { CartItem } from '@/modules/cart/types/cart.types';

// ─── Formatting helpers (local — no shared import needed) ─────────────────────

/** Cents → "$0.00" string. Guards against NaN / Infinity / negatives. */
const fmt = (c: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Math.max(0, Number.isFinite(c) ? c : 0) / 100);

/** Safe-cast to a finite integer (defaults to 0). */
const sc = (n: unknown): number => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? Math.round(v) : 0;
};

/** Safe-cast to a quantity in [1, 20]. */
const cq = (n: unknown): number => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? Math.max(1, Math.min(20, Math.floor(v))) : 1;
};

// ─── Component ────────────────────────────────────────────────────────────────

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

  /** Total modifier price-adjustment (all options combined). */
  const modifierTotal = useMemo(
    () => (item.modifiers ?? []).reduce((sum, m) => sum + sc(m.priceAdjustmentCents), 0),
    [item.modifiers],
  );

  /** Extended line total = (unit + modifiers) × qty */
  const lineTotal = useMemo(
    () =>
      computeLineTotalCents({
        unitPriceCents: unit,
        modifiers: item.modifiers ?? [],
        quantity: qty,
      }),
    [unit, item.modifiers, qty],
  );

  return (
    <div className="flex gap-3 py-4">
      {/* Item image — warm gradient placeholder when no URL */}
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt={item.name}
          className="h-16 w-16 shrink-0 rounded-xl object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className="h-16 w-16 shrink-0 rounded-xl"
          style={{
            background:
              'linear-gradient(135deg,rgba(212,175,55,0.12) 0%,rgba(212,175,55,0.04) 100%)',
            border: '1px solid rgba(212,175,55,0.18)',
          }}
        />
      )}

      <div className="min-w-0 flex-1">
        {/* Name row + remove button */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" style={{ color: '#1c1915' }}>
              {item.name}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: '#8a7a6a' }}>
              {fmt(unit)}
              {modifierTotal > 0 ? ` · +${fmt(modifierTotal)} options` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeItem(item.menuItemId, key);
            }}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-red-50 active:scale-95"
            style={{ color: '#c0a080' }}
            aria-label={`Remove ${item.name}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modifier tags */}
        {(item.modifiers?.length ?? 0) > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.modifiers.map((m) => (
              <span
                key={`${m.groupId}:${m.id}`}
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ background: 'rgba(212,175,55,0.1)', color: '#8a5c2e' }}
              >
                {m.name}
                {sc(m.priceAdjustmentCents) > 0 ? ` +${fmt(sc(m.priceAdjustmentCents))}` : ''}
              </span>
            ))}
          </div>
        )}

        {/* Special instructions */}
        {item.notes?.trim() ? (
          <p className="mt-1 text-[11px] italic" style={{ color: '#a89080' }}>
            "{item.notes.trim()}"
          </p>
        ) : null}

        {/* Quantity stepper + line total */}
        <div className="mt-2.5 flex items-center justify-between">
          <div
            className="flex items-center gap-1 rounded-xl p-1"
            style={{
              background: 'rgba(0,0,0,0.04)',
              border: '1px solid rgba(0,0,0,0.07)',
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                updateQuantity(item.menuItemId, key, qty - 1);
              }}
              disabled={qty <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors active:scale-95 disabled:opacity-30"
              style={{ color: '#1c1915' }}
              aria-label="Decrease quantity"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>

            <span
              className="w-7 text-center text-sm font-bold tabular-nums"
              style={{ color: '#1c1915' }}
            >
              {qty}
            </span>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                updateQuantity(item.menuItemId, key, qty + 1);
              }}
              disabled={qty >= 20}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors active:scale-95 disabled:opacity-30"
              style={{ color: '#1c1915' }}
              aria-label="Increase quantity"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <p className="text-sm font-bold tabular-nums" style={{ color: '#1c1915' }}>
            {fmt(lineTotal)}
          </p>
        </div>
      </div>
    </div>
  );
});