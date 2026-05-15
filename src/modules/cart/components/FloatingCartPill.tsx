// src/modules/cart/components/FloatingCartPill.tsx
// =============================================================================
// Floating Cart Pill — mobile-only, highest-conversion cart entry point
// =============================================================================
// Appears above BottomNav when the cart has items.
// Moves lower when BottomNav collapses, but stays visible.
// Hidden on checkout, admin, kitchen, auth flows.
// Hidden when any modal is open to prevent z-index conflicts.
// =============================================================================

import { useContext } from 'react';
import { useLocation } from 'react-router-dom';

import { ModalContext } from '@/components/ui/ModalContext';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';

const HIDDEN_ON = ['/checkout', '/admin', '/kitchen', '/expo', '/auth', '/update-password'];

function formatCurrencyFromCents(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Math.max(0, Number.isFinite(cents) ? cents : 0) / 100);
}

export function FloatingCartPill() {
  const { pathname } = useLocation();
  const { itemCount, items } = useCart();
  const openCart = useCartUiStore((state) => state.open);
  const modalContext = useContext(ModalContext);

  const hidden = HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const count = itemCount ?? 0;
  const modalIsOpen = Boolean(modalContext?.activeModal);

  if (hidden || count === 0 || modalIsOpen) {
    return null;
  }

  const subtotalCents = (items ?? []).reduce((sum, item) => {
    const lineTotalCents =
      typeof item.lineTotalCents === 'number' && Number.isFinite(item.lineTotalCents)
        ? Math.max(0, Math.round(item.lineTotalCents))
        : 0;

    return sum + lineTotalCents;
  }, 0);

  return (
    <>
      <div
        className="h-[calc(88px+var(--bottom-nav-offset,56px)+env(safe-area-inset-bottom,0px))] shrink-0 transition-[height] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none md:hidden"
        aria-hidden="true"
      />

      <div
        className="fixed left-4 right-4 z-40 transform-gpu transition-[bottom] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none md:hidden"
        style={{
          bottom: 'calc(var(--bottom-nav-offset, 56px) + env(safe-area-inset-bottom, 0px) + 10px)',
        }}
        role="region"
        aria-label="Cart summary"
      >
        <button
          type="button"
          onClick={openCart}
          className="group relative flex w-full items-center justify-between overflow-hidden rounded-2xl px-5 py-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]"
          style={{
            background: 'linear-gradient(135deg,#1c1915 0%,#2e2a24 100%)',
            boxShadow: '0 8px 32px rgba(28,25,21,0.45),0 2px 8px rgba(28,25,21,0.3)',
          }}
          aria-label={`View cart — ${count} item${count !== 1 ? 's' : ''}, ${formatCurrencyFromCents(
            subtotalCents,
          )}`}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background: 'linear-gradient(90deg,transparent,rgba(212,175,55,0.7),transparent)',
            }}
          />

          <div className="flex items-center gap-3">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-xl text-xs font-black"
              style={{ background: '#d4af37', color: '#1c1915' }}
              aria-hidden="true"
            >
              {count > 99 ? '99+' : count}
            </span>

            <span className="text-sm font-semibold text-white">View Order</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tabular-nums text-white">
              {formatCurrencyFromCents(subtotalCents)}
            </span>

            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="transition-transform duration-200 group-hover:translate-x-0.5"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </button>
      </div>
    </>
  );
}