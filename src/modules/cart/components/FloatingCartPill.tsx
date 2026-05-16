// src/modules/cart/components/FloatingCartPill.tsx
// =============================================================================
// Floating Cart Pill — mobile-only cart CTA
// =============================================================================
// Behavior:
// - Appears when cart has items.
// - Stays visible even when BottomNav collapses.
// - Uses --bottom-nav-offset from BottomNav so both elements move together.
// - Avoids overlap with BottomNav in visible/collapsed states.
// - Hidden on checkout/admin/kitchen/expo/auth utility flows.
// - Hidden while modal is open to avoid z-index conflicts.
// - Transform/compositor safe for iOS Safari.
// =============================================================================

import { useContext, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { ModalContext } from '@/components/ui/ModalContext';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';

const HIDDEN_ON = ['/checkout', '/admin', '/kitchen', '/expo', '/auth', '/update-password'];

/**
 * Extra clearance above BottomNav.
 * BottomNav provides --bottom-nav-offset:
 * - 92px when visible
 * - 34px when collapsed
 * - 0px when hidden
 */
const CART_PILL_GAP_PX = 10;

function formatCurrencyFromCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Math.max(0, Number.isFinite(cents) ? cents : 0) / 100);
}

function isHiddenRoute(pathname: string): boolean {
  return HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function FloatingCartPill() {
  const { pathname } = useLocation();
  const { itemCount, items } = useCart();
  const openCart = useCartUiStore((state) => state.open);
  const modalContext = useContext(ModalContext);

  const hiddenRoute = isHiddenRoute(pathname);
  const count = itemCount ?? 0;
  const modalIsOpen = Boolean(modalContext?.activeModal);

  const subtotalCents = useMemo(
    () =>
      (items ?? []).reduce((sum, item) => {
        const lineTotalCents =
          typeof item.lineTotalCents === 'number' && Number.isFinite(item.lineTotalCents)
            ? Math.max(0, Math.round(item.lineTotalCents))
            : 0;

        return sum + lineTotalCents;
      }, 0),
    [items],
  );

  if (hiddenRoute || count === 0 || modalIsOpen) {
    return null;
  }

  const formattedSubtotal = formatCurrencyFromCents(subtotalCents);

  return (
    <>
      {/*
        Spacer:
        Prevents page content from being hidden behind the fixed cart pill.
        It also responds to BottomNav's offset so spacing feels consistent
        whether the dock is visible or collapsed.
      */}

      <div
        className="fixed left-4 right-4 z-40 transform-gpu transition-[bottom,opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none md:hidden"
        style={{
          bottom: `calc(var(--bottom-nav-offset, 92px) + env(safe-area-inset-bottom, 0px) + ${CART_PILL_GAP_PX}px)`,
          WebkitTransform: 'translate3d(0, 0, 0)',
          transform: 'translate3d(0, 0, 0)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          contain: 'layout paint style',
        }}
        role="region"
        aria-label="Cart summary"
      >
        <button
          type="button"
          onClick={openCart}
          className="group relative flex w-full touch-manipulation select-none items-center justify-between overflow-hidden rounded-2xl px-5 py-3.5 text-left transition-[transform,box-shadow] duration-200 active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]"
          style={{
            background: 'linear-gradient(135deg, #1c1915 0%, #2e2a24 48%, #171410 100%)',
            boxShadow:
              '0 10px 34px rgba(28,25,21,0.46), 0 3px 10px rgba(28,25,21,0.30), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
          aria-label={`View cart — ${count} item${count === 1 ? '' : 's'}, ${formattedSubtotal}`}
        >
          {/* Top gold highlight */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.8), transparent)',
            }}
          />

          {/* Soft gold glow */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-12 -top-12 h-28 w-28 rounded-full blur-2xl transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background: 'rgba(212,175,55,0.12)',
              opacity: 0.72,
            }}
          />

          <div className="relative flex min-w-0 items-center gap-3">
            <span
              className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl px-2 text-xs font-black"
              style={{
                background: 'linear-gradient(135deg, #f2d36b 0%, #d4af37 100%)',
                color: '#1c1915',
                boxShadow: '0 3px 10px rgba(212,175,55,0.28)',
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
                Ready when you are
              </span>
            </span>
          </div>

          <div className="relative flex shrink-0 items-center gap-2">
            <span className="text-sm font-black tabular-nums text-white">{formattedSubtotal}</span>

            <span
              className="flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 group-hover:bg-white/10"
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
    </>
  );
}

export default FloatingCartPill;