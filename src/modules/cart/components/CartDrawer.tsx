// src/modules/cart/components/CartDrawer.tsx
// =============================================================================
// CartDrawer — shell only.
//
// This file is responsible for exactly four things:
//   1. Open / close state (from cartUiStore)
//   2. Routing (navigate to /checkout)
//   3. Layout — mobile bottom sheet vs desktop right panel
//   4. Assembling the extracted pieces into those layouts
//
// What lives elsewhere:
//   • useCartDrawerDrag  → gestures/useCartDrawerDrag.ts
//   • CartLineItem       → components/CartLineItem.tsx
//   • CartFooter         → components/CartFooter.tsx
// =============================================================================

import { Fragment, useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

import { useCartStore } from '@/modules/cart/store/cart.store';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useCartSummary } from '@/domain/cart/use-cart-summary';
import { cartItemKey } from '@/modules/cart/types/cart.types';
import type { CartItem } from '@/modules/cart/types/cart.types';

import { useCartDrawerDrag } from '@/modules/cart/gestures/useCartDrawerDrag';
import { CartLineItem } from '@/modules/cart/components/CartLineItem';
import { CartFooter } from '@/modules/cart/components/CartFooter';

// ─── Formatting helpers (shell-level: used by CartContent + headers) ──────────

const fmt = (c: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Math.max(0, Number.isFinite(c) ? c : 0) / 100);

const sc = (n: unknown): number => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? Math.round(v) : 0;
};

// ─── Types ────────────────────────────────────────────────────────────────────

type SummaryTotals = ReturnType<typeof useCartSummary>['totals'];
type SummaryFlags = ReturnType<typeof useCartSummary>['flags'];

// ─── DragHandle ───────────────────────────────────────────────────────────────
// Pure UI — all pointer logic is delegated to useCartDrawerDrag.

function DragHandle({ onClose }: { onClose: () => void }) {
  const handleRef = useRef<HTMLDivElement>(null);
  const handlers = useCartDrawerDrag({ onClose, handleRef });

  return (
    <div
      ref={handleRef}
      {...handlers}
      // touch-none prevents the browser scroll from competing with pointer capture
      className="flex cursor-grab touch-none select-none flex-col items-center justify-center gap-1 pb-2 pt-3 active:cursor-grabbing"
      aria-hidden="true"
    >
      <div
        className="h-5px w-10 rounded-full transition-opacity"
        style={{ background: 'rgba(28,25,21,0.2)' }}
      />
      <span
        className="text-[9px] uppercase tracking-widest opacity-30"
        style={{ color: '#1c1915', letterSpacing: '0.12em' }}
      >
        swipe down to close
      </span>
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────
// Single line in the order-summary pricing block.

function Row({ l, v, green, muted }: { l: string; v: string; green?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span style={{ color: green ? '#4a7a5a' : muted ? '#a89080' : '#8a7a6a' }}>{l}</span>
      <span
        className="tabular-nums font-medium"
        style={{ color: green ? '#2a6a3a' : muted ? '#a89080' : '#1c1915' }}
      >
        {v}
      </span>
    </div>
  );
}

// ─── CartContent ──────────────────────────────────────────────────────────────
// Scrollable body: item list + pricing summary, OR the empty-state.

function CartContent({
  items,
  hasItems,
  totals,
  flags,
  closeCart,
}: {
  items: CartItem[];
  hasItems: boolean;
  totals: SummaryTotals;
  flags: SummaryFlags;
  closeCart: () => void;
}) {
  if (!hasItems) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center px-6 py-10 text-center">
        <div
          className="mb-5 flex h-20 w-20 items-center justify-center rounded-full"
          style={{
            background:
              'radial-gradient(circle at 40% 35%,rgba(212,175,55,0.12),rgba(212,175,55,0.04))',
            border: '2px dashed rgba(212,175,55,0.25)',
          }}
        >
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#d4af37"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 01-8 0" />
          </svg>
        </div>
        <h3
          className="mb-2 text-xl font-semibold"
          style={{ color: '#1c1915', fontFamily: 'var(--font-display,serif)' }}
        >
          Your cart is empty
        </h3>
        <p className="mb-7 text-sm leading-relaxed" style={{ color: '#8a7a6a' }}>
          Fresh plates, made to order.
          <br />
          Add something delicious.
        </p>
        <button
          type="button"
          onClick={closeCart}
          className="rounded-2xl px-8 py-3 text-sm font-bold text-white transition-all active:scale-95"
          style={{
            background: 'linear-gradient(135deg,#1c1915,#3e3830)',
            boxShadow: '0 4px 16px rgba(28,25,21,0.3)',
          }}
        >
          Browse Menu
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-4 pb-4 pt-1">
      {/* Line items */}
      <div className="divide-y rounded-2xl bg-white px-3" style={{ border: '1px solid #ede0ce' }}>
        {items.map((item) => (
          <CartLineItem key={cartItemKey(item.menuItemId, item.modifiers)} item={item} />
        ))}
      </div>

      {/* Pricing summary */}
      <div className="space-y-1.5 rounded-2xl bg-white p-4" style={{ border: '1px solid #ede0ce' }}>
        <Row l="Subtotal" v={fmt(totals.subtotalCents)} />
        {totals.hasDiscount && <Row l="Promo discount" v={`−${fmt(totals.discountCents)}`} green />}
        {totals.hasCredit && <Row l="Account credit" v={`−${fmt(totals.creditCents)}`} green />}
        <Row l="Est. tax (9.5%)" v={fmt(totals.taxCents)} muted />

        <div className="flex justify-between border-t pt-2" style={{ borderColor: '#ede0ce' }}>
          <span className="font-bold" style={{ color: '#1c1915' }}>
            Total
          </span>
          <span className="text-base font-black tabular-nums" style={{ color: '#1c1915' }}>
            {fmt(totals.totalCents)}
          </span>
        </div>

        {flags.inconsistent && (
          <p className="pt-0.5 text-[11px]" style={{ color: '#c05030' }}>
            ⚠ Pricing inconsistent — confirmed at checkout.
          </p>
        )}
        <p className="pt-0.5 text-[10px] leading-snug" style={{ color: '#c0b0a0' }}>
          Final total confirmed at secure checkout via Stripe.
        </p>
      </div>
    </div>
  );
}

// ─── LoyaltyBanner ───────────────────────────────────────────────────────────
// Shared between mobile and desktop layouts.

function LoyaltyBanner({ pts }: { pts: number }) {
  if (pts <= 0) return null;
  return (
    <div
      className="relative mx-4 mb-3 flex shrink-0 items-center justify-between overflow-hidden rounded-xl px-4 py-2"
      style={{ background: 'linear-gradient(90deg,#c9a42e 0%,#e8c46a 50%,#d4af37 100%)' }}
    >
      {/* Moving shimmer strip */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -left-full w-1/3"
        style={{
          background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)',
          animation: 'cart-shimmer 3.5s ease-in-out 1s infinite',
        }}
      />
      <p className="relative text-xs font-semibold" style={{ color: '#1c1915' }}>
        ✨ Earn <strong>+{pts} pts</strong> on this order
      </p>
      <p className="relative text-[10px] font-medium" style={{ color: 'rgba(28,25,21,0.55)' }}>
        $1 = 1 pt
      </p>
    </div>
  );
}

// ─── EscapeListener ──────────────────────────────────────────────────────────
// Dialog.onClose is a noop — we handle Escape manually.

function EscapeListener({ onEscape }: { onEscape: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onEscape]);
  return null;
}

// ─── CartDrawer ───────────────────────────────────────────────────────────────

export function CartDrawer() {
  const navigate = useNavigate();
  const location = useLocation();

  // ── Store bindings ──────────────────────────────────────────────────────────
  const isOpen = useCartUiStore((s) => s.isOpen);
  const closeCart = useCartUiStore((s) => s.close);
  const cart = useCart();
  const clearFn = useCartStore((s) => s.clearCart);
  const { totals, flags } = useCartSummary();

  // ── Local state ─────────────────────────────────────────────────────────────
  const [confirmClear, setConfirmClear] = useState(false);

  // ── Derived values ──────────────────────────────────────────────────────────
  const items: CartItem[] = useMemo(() => {
    if (!Array.isArray(cart.items)) return [];
    return cart.items.filter(
      (v): v is CartItem =>
        typeof v === 'object' && v !== null && typeof (v as CartItem).menuItemId === 'string',
    );
  }, [cart.items]);

  const count = typeof cart.itemCount === 'number' ? cart.itemCount : 0;
  const hasItems = items.length > 0;
  const pts = Math.max(0, Math.floor(sc(totals.subtotalCents) / 100));

  // ── Side-effects ────────────────────────────────────────────────────────────
  // Reset confirm-clear state whenever the drawer closes
  useEffect(() => {
    if (!isOpen) setConfirmClear(false);
  }, [isOpen]);

  // Close the drawer on route change (e.g. user navigates back)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isOpen) closeCart();
  }, [location.pathname]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleCheckout = useCallback(() => {
    closeCart();
    void navigate('/checkout');
  }, [closeCart, navigate]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Transition.Root show={isOpen} as={Fragment}>
      {/*
       * onClose is intentionally a noop.
       * Dismissal is handled by exactly three explicit paths:
       *   1. Backdrop <div onClick={closeCart}>
       *   2. <EscapeListener>
       *   3. DragHandle (via useCartDrawerDrag)
       * This prevents accidental closure from internal interactions.
       */}
      <Dialog as="div" className="relative z-50" onClose={() => {}}>
        {/* ── Backdrop ── */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-250"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={closeCart}
            aria-hidden="true"
          />
        </Transition.Child>

        <EscapeListener onEscape={closeCart} />

        <div className="fixed inset-x-0 bottom-0">
          <div className="absolute inset-0 overflow-hidden">
            {/* ── MOBILE: bottom sheet ──────────────────────────────────────── */}
            <div className="pointer-events-none fixed inset-x-0 bottom-0 md:hidden">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-out duration-350"
                enterFrom="translate-y-full"
                enterTo="translate-y-0"
                leave="transform transition ease-in duration-250"
                leaveFrom="translate-y-0"
                leaveTo="translate-y-full"
              >
                <Dialog.Panel
                  data-cart-sheet
                  className="pointer-events-auto w-full will-change-transform"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    background: '#faf8f4',
                    borderRadius: '1.5rem 1.5rem 0 0',
                    boxShadow:
                      '0 -2px 0 rgba(212,175,55,0.18),0 -8px 40px rgba(28,25,21,0.18),0 -32px 80px rgba(28,25,21,0.08)',
                    maxHeight: '92dvh',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <DragHandle onClose={closeCart} />

                  {/* Title row */}
                  <div className="flex shrink-0 items-center justify-between px-5 pb-3">
                    <Dialog.Title
                      className="flex items-center gap-2 text-lg font-bold"
                      style={{ color: '#1c1915', fontFamily: 'var(--font-display,serif)' }}
                    >
                      Your Order
                      {count > 0 && (
                        <span
                          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-black"
                          style={{ background: '#d4af37', color: '#1c1915' }}
                        >
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </Dialog.Title>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeCart();
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full transition-colors active:scale-95"
                      style={{ background: 'rgba(28,25,21,0.07)', color: '#8a7a6a' }}
                      aria-label="Close cart"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {hasItems && <LoyaltyBanner pts={pts} />}

                  {/* Scrollable body */}
                  <div
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                    style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
                  >
                    <CartContent
                      items={items}
                      hasItems={hasItems}
                      totals={totals}
                      flags={flags}
                      closeCart={closeCart}
                    />
                  </div>

                  {hasItems && (
                    <CartFooter
                      totals={totals}
                      pts={pts}
                      confirmClear={confirmClear}
                      setConfirmClear={setConfirmClear}
                      clearFn={clearFn}
                      onCheckout={handleCheckout}
                    />
                  )}
                </Dialog.Panel>
              </Transition.Child>
            </div>

            {/* ── DESKTOP: right panel (md+) ────────────────────────────────── */}
            <div className="pointer-events-none fixed inset-y-0 right-0 hidden max-w-full md:flex">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-250"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel
                  className="pointer-events-auto flex w-screen max-w-md flex-col"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{ background: '#faf8f4' }}
                >
                  {/* Frosted-glass dark header */}
                  <div
                    className="flex shrink-0 items-center justify-between px-5 py-4"
                    style={{
                      background:
                        'linear-gradient(135deg,rgba(28,25,21,0.97) 0%,rgba(46,42,36,0.97) 100%)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      borderBottom: '1px solid rgba(212,175,55,0.2)',
                      boxShadow: 'inset 0 -1px 0 rgba(212,175,55,0.1)',
                    }}
                  >
                    <div>
                      <Dialog.Title className="flex items-center gap-2 text-base font-bold text-white">
                        Your Order
                        {count > 0 && (
                          <span
                            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-black"
                            style={{ background: '#d4af37', color: '#1c1915' }}
                          >
                            {count > 99 ? '99+' : count}
                          </span>
                        )}
                      </Dialog.Title>
                      {hasItems && (
                        <p className="mt-0.5 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                          {count} item{count !== 1 ? 's' : ''} · {fmt(totals.subtotalCents)}{' '}
                          subtotal
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeCart();
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.65)',
                      }}
                      aria-label="Close cart"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Desktop loyalty banner */}
                  {hasItems && (
                    <div className="shrink-0">
                      <LoyaltyBanner pts={pts} />
                    </div>
                  )}

                  {/* Scrollable body */}
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <CartContent
                      items={items}
                      hasItems={hasItems}
                      totals={totals}
                      flags={flags}
                      closeCart={closeCart}
                    />
                  </div>

                  {hasItems && (
                    <CartFooter
                      totals={totals}
                      pts={pts}
                      confirmClear={confirmClear}
                      setConfirmClear={setConfirmClear}
                      clearFn={clearFn}
                      onCheckout={handleCheckout}
                    />
                  )}
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}