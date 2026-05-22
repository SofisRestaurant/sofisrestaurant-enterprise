// src/modules/cart/components/FloatingCartPill.tsx
// Floating cart pill, dock slot child only.
// MobileDockShell owns all scroll movement.
// Cart slot show/hide is driven by [data-cart-visible] in utilities.css.
// This component must NOT apply translate-y or transforms based on dockPhase.

import { useCallback, useMemo } from 'react';
import { ChevronRight, ShoppingBag } from 'lucide-react';

import { useBottomDock } from '@/components/layout/useBottomDockState';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';
import { formatCents } from '@/modules/cart/utils/cart.utils';

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function readCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function readCents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function FloatingCartPill() {
  const { isMobile, shouldShowFloatingCart, shouldHideFloatingCart } = useBottomDock();

  const itemCount = useCartUiStore((s) => s.itemCount);
  const subtotalCents = useCartUiStore((s) => s.subtotalCents);
  const openCart = useCartUiStore((s) => s.open);

  const count = readCount(itemCount);
  const subtotal = readCents(subtotalCents);

  const visible = isMobile && count > 0 && shouldShowFloatingCart && !shouldHideFloatingCart;

  const formattedSubtotal = useMemo(() => formatCents(subtotal), [subtotal]);

  const itemLabel = useMemo(() => `${count} item${count === 1 ? '' : 's'}`, [count]);

  const handleOpenCart = useCallback(() => {
    if (!visible) return;
    openCart();
  }, [openCart, visible]);

  if (!isMobile || count === 0) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleOpenCart}
      disabled={!visible}
      tabIndex={visible ? 0 : -1}
      aria-hidden={visible ? undefined : true}
      aria-label={`View cart, ${itemLabel}, ${formattedSubtotal}`}
      data-floating-cart-pill="true"
      data-cart-visible={visible ? 'true' : 'false'}
      className={cx(
        'group relative flex min-h-11 w-full touch-manipulation select-none items-center justify-between gap-3',
        'overflow-hidden rounded-2xl border border-gold-300/35 px-4 py-3.5 text-left',
        'bg-ink-900 text-white shadow-[0_12px_36px_rgba(28,25,21,0.32)] ring-1 ring-white/10',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]',

        // No translate-y here. The cart slot in MobileDockShell handles
        // show/hide via [data-cart-visible] in utilities.css.
        'transform-gpu',

        visible && 'hover:shadow-[0_16px_40px_rgba(28,25,21,0.38)]',
        visible && 'active:scale-[0.985] motion-reduce:active:scale-100',

        !visible && 'pointer-events-none',
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-gold-400/50 to-transparent"
      />

      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-linear-to-b from-white/8 via-transparent to-black/10"
      />

      <span className="relative flex min-w-0 items-center gap-3">
        <span
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-400 text-ink-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
          aria-hidden="true"
        >
          <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={2.25} />

          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-black text-ink-900 shadow-sm">
            {count > 99 ? '99+' : count}
          </span>
        </span>

        <span className="min-w-0">
          <span className="block truncate text-sm font-bold leading-tight text-white">
            View your bag
          </span>

          <span className="block truncate text-[11px] font-medium text-white/60">
            {itemLabel} · tap to review
          </span>
        </span>
      </span>

      <span className="relative flex shrink-0 items-center gap-2">
        <span className="text-base font-black tabular-nums text-white">{formattedSubtotal}</span>

        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
          aria-hidden="true"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </span>
      </span>
    </button>
  );
}

export default FloatingCartPill;