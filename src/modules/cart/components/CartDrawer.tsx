// src/modules/cart/components/CartDrawer.tsx
// =============================================================================
// CartDrawer — 2026
// Mobile  → bottom sheet: slides up, drag handle, swipe down to dismiss
// Desktop → right-side panel (md+)
// No props — reads cartUi.store. Rendered once in RootLayout.
// =============================================================================

import { Fragment, useCallback, useEffect, useRef, useMemo, useState, memo } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Minus, Plus, X } from 'lucide-react';

import { useCartStore } from '@/modules/cart/store/cart.store';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useCartSummary } from '@/domain/cart/use-cart-summary';
import { cartItemKey, computeLineTotalCents } from '@/modules/cart/types/cart.types';
import type { CartItem } from '@/modules/cart/types/cart.types';

const fmt = (c: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Math.max(0, Number.isFinite(c) ? c : 0) / 100);

const sc = (n: unknown) => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? Math.round(v) : 0;
};
const cq = (n: unknown) => {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? Math.max(1, Math.min(20, Math.floor(v))) : 1;
};

// ─── CartLineItem ─────────────────────────────────────────────────────────────

const CartLineItem = memo(({ item }: { item: CartItem }) => {
  const upd = useCartStore((s) => s.updateQuantity);
  const rem = useCartStore((s) => s.removeItem);
  const key = useMemo(
    () => cartItemKey(item.menuItemId, item.modifiers),
    [item.menuItemId, item.modifiers],
  );
  const qty = useMemo(() => cq(item.quantity), [item.quantity]);
  const unit = useMemo(() => sc(item.unitPriceCents), [item.unitPriceCents]);
  const ext = useMemo(
    () => (item.modifiers ?? []).reduce((s, m) => s + sc(m.priceAdjustmentCents), 0),
    [item.modifiers],
  );
  const line = useMemo(
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
          style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.15)' }}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" style={{ color: '#1c1915' }}>
              {item.name}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: '#8a7a6a' }}>
              {fmt(unit)}
              {ext > 0 ? ` · +${fmt(ext)} options` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => rem(item.menuItemId, key)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-red-50 active:scale-95"
            style={{ color: '#c0a080' }}
            aria-label={`Remove ${item.name}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
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
        {item.notes?.trim() ? (
          <p className="mt-1 text-[11px] italic" style={{ color: '#a89080' }}>
            "{item.notes.trim()}"
          </p>
        ) : null}
        <div className="mt-2.5 flex items-center justify-between">
          <div
            className="flex items-center gap-1 rounded-xl p-1"
            style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.07)' }}
          >
            <button
              type="button"
              onClick={() => upd(item.menuItemId, key, qty - 1)}
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
              onClick={() => upd(item.menuItemId, key, qty + 1)}
              disabled={qty >= 20}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors active:scale-95 disabled:opacity-30"
              style={{ color: '#1c1915' }}
              aria-label="Increase quantity"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-sm font-bold tabular-nums" style={{ color: '#1c1915' }}>
            {fmt(line)}
          </p>
        </div>
      </div>
    </div>
  );
});
CartLineItem.displayName = 'CartLineItem';

// ─── DragHandle ───────────────────────────────────────────────────────────────

function DragHandle({ onClose }: { onClose: () => void }) {
  const startY = useRef(0);
  const currentY = useRef(0);
  const dragging = useRef(false);
  const handleEl = useRef<HTMLDivElement | null>(null);

  const getSheet = (): HTMLElement | null =>
    handleEl.current?.closest('[data-cart-sheet]') as HTMLElement | null;

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    currentY.current = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dy = Math.max(0, e.clientY - startY.current);
    currentY.current = dy;
    const el = getSheet();
    if (el) el.style.transform = `translateY(${dy}px)`;
  };

  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const el = getSheet();
    if (currentY.current > 120) {
      if (el) {
        el.style.transition = 'transform 0.25s cubic-bezier(0.4,0,1,1)';
        el.style.transform = 'translateY(100%)';
      }
      setTimeout(onClose, 230);
    } else {
      if (el) {
        el.style.transition = 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)';
        el.style.transform = 'translateY(0)';
        setTimeout(() => {
          if (el) {
            el.style.transition = '';
          }
        }, 310);
      }
    }
    currentY.current = 0;
  };

  return (
    <div
      ref={handleEl}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="flex cursor-grab touch-none select-none items-center justify-center py-3 active:cursor-grabbing"
      aria-hidden="true"
    >
      <div className="h-1 w-10 rounded-full" style={{ background: 'rgba(28,25,21,0.18)' }} />
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

type SummaryTotals = ReturnType<typeof useCartSummary>['totals'];
type SummaryFlags = ReturnType<typeof useCartSummary>['flags'];

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
            background: 'rgba(212,175,55,0.07)',
            border: '2px dashed rgba(212,175,55,0.22)',
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
    <div className="px-4 pt-1 pb-4 space-y-3">
      <div className="divide-y rounded-2xl bg-white px-3" style={{ border: '1px solid #ede0ce' }}>
        {items.map((item) => (
          <CartLineItem key={cartItemKey(item.menuItemId, item.modifiers)} item={item} />
        ))}
      </div>
      <div className="rounded-2xl bg-white p-4 space-y-1.5" style={{ border: '1px solid #ede0ce' }}>
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
          <p className="text-[11px] pt-0.5" style={{ color: '#c05030' }}>
            ⚠ Pricing inconsistent — confirmed at checkout.
          </p>
        )}
        <p className="text-[10px] leading-snug pt-0.5" style={{ color: '#c0b0a0' }}>
          Final total confirmed at secure checkout via Stripe.
        </p>
      </div>
    </div>
  );
}

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

function CartFooter({
  totals,
  pts,
  confirmClear,
  setConfirmClear,
  clearFn,
  onCheckout,
}: {
  totals: SummaryTotals;
  pts: number;
  confirmClear: boolean;
  setConfirmClear: (v: boolean) => void;
  clearFn: () => void;
  onCheckout: () => void;
}) {
  return (
    <div
      className="shrink-0 px-4 pt-3"
      style={{
        background: '#fff',
        borderTop: '1px solid #ede0ce',
        paddingBottom: 'max(1.25rem,env(safe-area-inset-bottom))',
      }}
    >
      <button
        type="button"
        onClick={onCheckout}
        className="relative w-full overflow-hidden rounded-2xl py-4 text-sm font-black tracking-wide transition-all active:scale-[0.98]"
        style={{
          background: 'linear-gradient(135deg,#d4af37 0%,#e8c46a 50%,#c9a42e 100%)',
          color: '#1c1915',
          boxShadow: '0 4px 20px rgba(212,175,55,0.4),0 2px 8px rgba(212,175,55,0.25)',
          letterSpacing: '0.025em',
        }}
        aria-label={`Checkout — ${fmt(totals.totalCents)}`}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)',
          }}
        />
        <span className="flex items-center justify-center gap-2.5">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <line x1="2" y1="10" x2="22" y2="10" />
          </svg>
          Checkout · {fmt(totals.totalCents)}
        </span>
      </button>
      {pts > 0 && (
        <p className="mt-2 text-center text-[11px]" style={{ color: '#a89060' }}>
          ✨ Earn <strong>+{pts} loyalty points</strong> on this order
        </p>
      )}
      <div className="mt-3 flex justify-center" style={{ minHeight: '1.5rem' }}>
        {!confirmClear ? (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="text-xs hover:underline"
            style={{ color: '#c0a888' }}
          >
            Clear cart
          </button>
        ) : (
          <div className="flex items-center gap-3 text-xs">
            <span style={{ color: '#8a7a6a' }}>Remove all items?</span>
            <button
              type="button"
              onClick={() => {
                clearFn();
                setConfirmClear(false);
              }}
              className="font-bold"
              style={{ color: '#c05030' }}
            >
              Yes, clear
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              style={{ color: '#8a7a6a' }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CartDrawer ───────────────────────────────────────────────────────────────

export function CartDrawer() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOpen = useCartUiStore((s) => s.isOpen);
  const closeCart = useCartUiStore((s) => s.close);
  const cart = useCart();
  const clearFn = useCartStore((s) => s.clearCart);
  const { totals, flags } = useCartSummary();
  const [confirmClear, setConfirmClear] = useState(false);

  const items: CartItem[] = useMemo(() => {
    if (!Array.isArray(cart.items)) return [];
    return cart.items.filter(
      (v): v is CartItem =>
        typeof v === 'object' && v !== null && typeof (v as CartItem).menuItemId === 'string',
    );
  }, [cart.items]);

  const count = typeof cart.itemCount === 'number' ? cart.itemCount : 0;
  const hasItems = items.length > 0;
  const pts = Math.max(0, Math.floor(totals.subtotalCents / 100));

  useEffect(() => {
    if (!isOpen) setConfirmClear(false);
  }, [isOpen]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isOpen) closeCart();
  }, [location.pathname]);

  const handleCheckout = useCallback(() => {
    closeCart();
    void navigate('/checkout');
  }, [closeCart, navigate]);

  const LoyaltyBanner =
    hasItems && pts > 0 ? (
      <div
        className="shrink-0 mx-4 mb-3 flex items-center justify-between rounded-xl px-4 py-2"
        style={{ background: 'linear-gradient(90deg,#d4af37,#e8c46a)' }}
      >
        <p className="text-xs font-semibold" style={{ color: '#1c1915' }}>
          ✨ Earn <strong>+{pts} pts</strong> on this order
        </p>
        <p className="text-[10px] font-medium" style={{ color: 'rgba(28,25,21,0.55)' }}>
          $1 = 1 pt
        </p>
      </div>
    ) : null;

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={closeCart}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-250"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px]" />
        </Transition.Child>

        <div className="fixed inset-x-0 bottom-0">
          <div className="absolute inset-0 overflow-hidden">
            {/* MOBILE: bottom sheet */}
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
                  style={{
                    background: '#faf8f4',
                    borderRadius: '1.5rem 1.5rem 0 0',
                    boxShadow: '0 -8px 40px rgba(28,25,21,0.18)',
                    maxHeight: '92dvh',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <DragHandle onClose={closeCart} />

                  {/* Title row */}
                  <div className="shrink-0 flex items-center justify-between px-5 pb-3">
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
                      onClick={closeCart}
                      className="flex h-8 w-8 items-center justify-center rounded-full transition-colors active:scale-95"
                      style={{ background: 'rgba(28,25,21,0.07)', color: '#8a7a6a' }}
                      aria-label="Close cart"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {LoyaltyBanner}

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

            {/* DESKTOP: right panel (md+) */}
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
                  style={{ background: '#faf8f4' }}
                >
                  {/* Desktop header */}
                  <div
                    className="shrink-0 flex items-center justify-between px-5 py-4"
                    style={{
                      background: 'linear-gradient(135deg,#1c1915 0%,#2e2a24 100%)',
                      borderBottom: '1px solid rgba(212,175,55,0.2)',
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
                      onClick={closeCart}
                      className="flex h-8 w-8 items-center justify-center rounded-full transition-colors"
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
                  {hasItems && pts > 0 && (
                    <div
                      className="shrink-0 flex items-center justify-between px-5 py-2"
                      style={{ background: 'linear-gradient(90deg,#d4af37,#e8c46a)' }}
                    >
                      <p className="text-xs font-semibold" style={{ color: '#1c1915' }}>
                        ✨ Earn <strong>+{pts} pts</strong> on this order
                      </p>
                      <p
                        className="text-[10px] font-medium"
                        style={{ color: 'rgba(28,25,21,0.55)' }}
                      >
                        $1 = 1 pt
                      </p>
                    </div>
                  )}
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
