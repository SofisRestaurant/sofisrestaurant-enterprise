// src/modules/cart/components/FloatingCartPill.tsx
// =============================================================================
// Floating Cart Pill — mobile-only cart CTA
// =============================================================================
// PERF FIX:
//   - Removed `useCart` import → replaced with `useCartUiStore` selectors.
//     Reads `itemCount` and `subtotalCents` from the lightweight UI store.
//     This removes cart.store.ts / Supabase / auth from the initial shell bundle.
//   - subtotalCents is DISPLAY-ONLY — never used for payment. Server-authoritative
//     pricing via Stripe Checkout is unchanged.
//   - All other behavior preserved exactly.
// =============================================================================

import { useCallback, useContext, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { ModalContext } from '@/components/ui/ModalContext';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';

const HIDDEN_ON = ['/checkout', '/admin', '/kitchen', '/expo', '/auth', '/update-password'];

const CART_PILL_GAP_PX = 10;
const DEFAULT_BOTTOM_NAV_OFFSET = '92px';

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function formatCurrencyFromCents(cents: number): string {
  const safeCents = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(safeCents / 100);
}

function isHiddenRoute(pathname: string): boolean {
  return HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function readCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function FloatingCartPill() {
  const { pathname } = useLocation();

  // PERF: Read from lightweight UI store instead of heavy useCart hook
  const itemCount = useCartUiStore((s) => s.itemCount);
  const subtotalCents = useCartUiStore((s) => s.subtotalCents);
  const openCart = useCartUiStore((state) => state.open);

  const modalContext = useContext(ModalContext);

  const hiddenRoute = isHiddenRoute(pathname);
  const count = readCount(itemCount);
  const modalIsOpen = Boolean(modalContext?.activeModal);

  const formattedSubtotal = useMemo(() => formatCurrencyFromCents(subtotalCents), [subtotalCents]);

  const itemLabel = useMemo(() => `${count} item${count === 1 ? '' : 's'}`, [count]);

  const handleOpenCart = useCallback(() => {
    openCart();
  }, [openCart]);

  if (hiddenRoute || count === 0 || modalIsOpen) {
    return null;
  }

  return (
    <div
      className={cx(
        'fixed inset-x-3 z-40 md:hidden min-[390px]:inset-x-4',
        'transform-gpu',
        'transition-[bottom,opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'motion-reduce:transition-none',
      )}
      style={{
        bottom: `calc(var(--bottom-nav-offset, ${DEFAULT_BOTTOM_NAV_OFFSET}) + env(safe-area-inset-bottom, 0px) + ${CART_PILL_GAP_PX}px)`,
        transform: 'translate3d(0, 0, 0)',
        WebkitTransform: 'translate3d(0, 0, 0)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        contain: 'layout paint style',
      }}
      role="region"
      aria-label="Cart summary"
    >
      <button
        type="button"
        onClick={handleOpenCart}
        aria-label={`View cart — ${itemLabel}, ${formattedSubtotal}`}
        className={cx(
          'group relative flex w-full touch-manipulation select-none items-center justify-between gap-3',
          'overflow-hidden rounded-2xl border px-4 py-3.5 text-left',
          'transition-[transform,border-color,background-color] duration-200',
          'active:scale-[0.985]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]',
        )}
        style={{
          background: 'linear-gradient(135deg, #1f1b16 0%, #2a251f 100%)',
          borderColor: 'rgba(212,175,55,0.24)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.26)',
        }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl px-2 text-xs font-black leading-none"
            style={{
              background: '#d4af37',
              color: '#1c1915',
            }}
            aria-hidden="true"
          >
            {count > 99 ? '99+' : count}
          </span>

          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight text-white">
              View Order
            </span>
            <span className="block truncate text-[11px] font-medium text-white/55">
              {itemLabel} in cart
            </span>
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-black tabular-nums text-white">{formattedSubtotal}</span>

          <span
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/7"
            aria-hidden="true"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.72)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </span>
        </div>
      </button>
    </div>
  );
}

export default FloatingCartPill;