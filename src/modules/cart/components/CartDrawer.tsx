// src/modules/cart/components/CartDrawer.tsx
// =============================================================================
// CartDrawer — zero Headless UI, pure CSS data-state transitions
// =============================================================================
// Architecture:
//   - createPortal → document.body, z-9999 (above AuthModals, ModalRenderer)
//   - CSS .cart-sheet / .cart-panel + data-state transitions (no JS animation)
//   - pointer-events: none when closed — invisible panels never eat touches
//   - touch-action: pan-y on sheet + scroll container (iOS tap-cancel fix)
//   - useLayoutEffect clears stale drag inline styles before first paint
//   - Manual focus trap + scroll lock, no Headless UI dependencies
//
// Transform ownership contract:
//   OPEN:    CSS data-state="open" owns transform (inline styles cleared)
//   DRAG:    useCartDrawerDrag owns transform (inline style set directly)
//   DISMISS: drag hook clears inline style BEFORE calling onClose, so React's
//            next render starts clean — no race condition on Chrome or Safari
// =============================================================================

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';

import { useCartStore } from '@/modules/cart/store/cart.store';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useCartSummary } from '@/domain/cart/use-cart-summary';
import { cartItemKey } from '@/modules/cart/types/cart.types';
import type { CartItem } from '@/modules/cart/types/cart.types';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { getSupabaseSessionIdFromAccessToken } from '@/security/auth/sessionId';

import { useCartDrawerDrag } from '@/modules/cart/gestures/useCartDrawerDrag';
import { CartLineItem } from '@/modules/cart/components/CartLineItem';
import { CartFooter } from '@/modules/cart/components/CartFooter';

// ─── Inject CSS transition rules once ─────────────────────────────────────────

const CART_CSS = `
.cart-backdrop {
  transition: opacity 250ms ease;
}
.cart-backdrop[data-state="closed"] { opacity: 0; pointer-events: none; }
.cart-backdrop[data-state="open"]   { opacity: 1; pointer-events: auto; }

.cart-sheet {
  transition: transform 350ms cubic-bezier(0.32,0.72,0,1);
  will-change: transform;
}
.cart-sheet[data-state="closed"] { transform: translateY(100%); pointer-events: none; }
.cart-sheet[data-state="open"]   { transform: translateY(0);    pointer-events: auto; }

.cart-panel {
  transition: transform 300ms cubic-bezier(0.32,0.72,0,1);
  will-change: transform;
}
.cart-panel[data-state="closed"] { transform: translateX(100%); pointer-events: none; }
.cart-panel[data-state="open"]   { transform: translateX(0);    pointer-events: auto; }

@keyframes cart-shimmer {
  0%   { transform: translateX(0); }
  60%  { transform: translateX(600%); }
  100% { transform: translateX(600%); }
}
`;

let cssInjected = false;

function injectCSS() {
  if (cssInjected || typeof document === 'undefined') return;

  const existing = document.head.querySelector('style[data-cart-drawer]');
  if (existing) {
    cssInjected = true;
    return;
  }

  const el = document.createElement('style');
  el.setAttribute('data-cart-drawer', '');
  el.textContent = CART_CSS;
  document.head.appendChild(el);
  cssInjected = true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

type SummaryTotals = ReturnType<typeof useCartSummary>['totals'];
type SummaryFlags = ReturnType<typeof useCartSummary>['flags'];

type ScrollLockSnapshot = {
  bodyOverflow: string;
  bodyTouchAction: string;
};

// ─── Global scroll unlock safety ──────────────────────────────────────────────

function releaseCartScrollLock() {
  if (typeof document === 'undefined') return;

  const body = document.body;
  const html = document.documentElement;

  body.style.overflow = '';
  body.style.touchAction = '';
  body.removeAttribute('data-cart-scroll-lock');

  // Defensive cleanup for any previous bad builds that locked <html>.
  html.style.overflow = '';
  html.style.touchAction = '';
}

// ─── DragHandle ───────────────────────────────────────────────────────────────

function DragHandle({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const handlers = useCartDrawerDrag({ onClose, handleRef: ref });

  return (
    <div
      ref={ref}
      {...handlers}
      className="flex cursor-grab touch-none select-none flex-col items-center justify-center gap-1 pb-2 pt-3 active:cursor-grabbing"
      aria-hidden="true"
    >
      <div className="h-1.25 w-10 rounded-full bg-[rgba(28,25,21,0.2)]" />
      <span className="text-[9px] uppercase tracking-[0.12em] text-stone-900 opacity-30">
        swipe down to close
      </span>
    </div>
  );
}

// ─── PricingRow ───────────────────────────────────────────────────────────────

function PricingRow({
  label,
  value,
  green,
  muted,
}: {
  label: string;
  value: string;
  green?: boolean;
  muted?: boolean;
}) {
  const labelCls = green ? 'text-[#4a7a5a]' : muted ? 'text-[#a89080]' : 'text-[#8a7a6a]';
  const valueCls = green ? 'text-[#2a6a3a]' : muted ? 'text-[#a89080]' : 'text-[#1c1915]';

  return (
    <div className="flex justify-between text-sm">
      <span className={labelCls}>{label}</span>
      <span className={`tabular-nums font-medium ${valueCls}`}>{value}</span>
    </div>
  );
}

// ─── LoyaltyBanner ────────────────────────────────────────────────────────────

function LoyaltyBanner({ pts }: { pts: number }) {
  if (pts <= 0) return null;

  return (
    <div className="relative mx-4 mb-3 flex shrink-0 items-center justify-between overflow-hidden rounded-xl px-4 py-2 bg-[linear-gradient(90deg,#c9a42e_0%,#e8c46a_50%,#d4af37_100%)]">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 -left-full w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)]"
        style={{ animation: 'cart-shimmer 3.5s ease-in-out 1s infinite' }}
      />
      <p className="relative text-xs font-semibold text-[#1c1915]">
        ✨ Earn <strong>+{pts} pts</strong> on this order
      </p>
      <p className="relative text-[10px] font-medium text-[rgba(28,25,21,0.55)]">$1 = 1 pt</p>
    </div>
  );
}

// ─── CartContent ──────────────────────────────────────────────────────────────

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
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-[rgba(212,175,55,0.25)] bg-[radial-gradient(circle_at_40%_35%,rgba(212,175,55,0.12),rgba(212,175,55,0.04))]">
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

        <h3 className="mb-2 font-semibold text-xl text-[#1c1915] font-(family-name:--font-display,serif)">
          Your cart is empty
        </h3>

        <p className="mb-7 text-sm leading-relaxed text-[#8a7a6a]">
          Fresh plates, made to order.
          <br />
          Add something delicious.
        </p>

        <button
          type="button"
          onClick={closeCart}
          className="rounded-2xl px-8 py-3 text-sm font-bold text-white bg-[linear-gradient(135deg,#1c1915,#3e3830)] shadow-[0_4px_16px_rgba(28,25,21,0.3)] transition-all active:scale-95"
        >
          Browse Menu
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-4 pb-4 pt-1">
      <div className="divide-y rounded-2xl bg-white px-3 border border-[#ede0ce]">
        {items.map((item) => (
          <CartLineItem key={cartItemKey(item.menuItemId, item.modifiers)} item={item} />
        ))}
      </div>

      <div className="space-y-1.5 rounded-2xl bg-white p-4 border border-[#ede0ce]">
        <PricingRow label="Subtotal" value={fmt(totals.subtotalCents)} />

        {totals.hasDiscount && (
          <PricingRow label="Promo discount" value={`−${fmt(totals.discountCents)}`} green />
        )}

        {totals.hasCredit && (
          <PricingRow label="Account credit" value={`−${fmt(totals.creditCents)}`} green />
        )}

        <PricingRow label="Est. tax (9.5%)" value={fmt(totals.taxCents)} muted />

        <div className="flex justify-between border-t border-[#ede0ce] pt-2">
          <span className="font-bold text-[#1c1915]">Total</span>
          <span className="text-base font-black tabular-nums text-[#1c1915]">
            {fmt(totals.totalCents)}
          </span>
        </div>

        {flags.inconsistent && (
          <p className="pt-0.5 text-[11px] text-[#c05030]">
            ⚠ Pricing inconsistent — confirmed at checkout.
          </p>
        )}

        <p className="pt-0.5 text-[10px] leading-snug text-[#c0b0a0]">
          Final total confirmed at secure checkout via Stripe.
        </p>
      </div>
    </div>
  );
}

// ─── useFocusTrap ─────────────────────────────────────────────────────────────

function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;

    const el = ref.current;
    if (!el) return;

    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const getFocusable = () => Array.from(el.querySelectorAll<HTMLElement>(selector));

    getFocusable()[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [active, ref]);
}

// ─── useScrollLock ────────────────────────────────────────────────────────────

function useScrollLock(active: boolean) {
  const snapshotRef = useRef<ScrollLockSnapshot | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const body = document.body;

    if (!active) {
      releaseCartScrollLock();
      snapshotRef.current = null;
      return;
    }

    if (!snapshotRef.current) {
      snapshotRef.current = {
        bodyOverflow: body.style.overflow,
        bodyTouchAction: body.style.touchAction,
      };
    }

    body.setAttribute('data-cart-scroll-lock', 'true');
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';

    return () => {
      const snapshot = snapshotRef.current;

      if (snapshot) {
        body.style.overflow = snapshot.bodyOverflow;
        body.style.touchAction = snapshot.bodyTouchAction;
      } else {
        releaseCartScrollLock();
      }

      body.removeAttribute('data-cart-scroll-lock');
      snapshotRef.current = null;
    };
  }, [active]);
}

// ─── CartDrawer ───────────────────────────────────────────────────────────────

export function CartDrawer() {
  const navigate = useNavigate();
  const location = useLocation();

  const isOpen = useCartUiStore((state) => state.isOpen);
  const closeCart = useCartUiStore((state) => state.close);
  const clearFn = useCartStore((state) => state.clearCart);

  const { user, session } = useAuth();

  const cart = useCart({
    userId: user?.id ?? null,
    sessionId: session ? getSupabaseSessionIdFromAccessToken(session.access_token) : null,
  });

  const { totals, flags } = useCartSummary();

  const [confirmClear, setConfirmClear] = useState(false);
  const mobileRef = useRef<HTMLDivElement>(null);
  const desktopRef = useRef<HTMLDivElement>(null);
  const previousPathnameRef = useRef(location.pathname);

  useEffect(() => {
    injectCSS();
  }, []);

  // Route-level safety net:
  // any successful route change should never leave the app scroll-locked.
  useEffect(() => {
    releaseCartScrollLock();
  }, [location.pathname]);

  const closeCartSafely = useCallback(() => {
    releaseCartScrollLock();
    closeCart();
  }, [closeCart]);

  const items: CartItem[] = useMemo(() => {
    if (!Array.isArray(cart.items)) return [];

    return cart.items.filter(
      (value): value is CartItem =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as CartItem).menuItemId === 'string',
    );
  }, [cart.items]);

  const count = typeof cart.itemCount === 'number' ? Math.max(0, cart.itemCount) : 0;
  const hasItems = items.length > 0;
  const pts = Math.max(0, Math.floor(sc(totals.subtotalCents) / 100));

  useEffect(() => {
    if (!isOpen) {
      setConfirmClear(false);
    }
  }, [isOpen]);

  // Close only on real route changes.
  // Critical for lazy-loaded CartDrawer:
  // on first open, the drawer mounts while isOpen is already true.
  // A plain pathname effect would run on mount and immediately close it.
  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    const pathnameChanged = previousPathname !== location.pathname;

    previousPathnameRef.current = location.pathname;

    if (pathnameChanged && isOpen) {
      closeCartSafely();
    }
  }, [location.pathname, isOpen, closeCartSafely]);

  useEffect(() => {
    if (!isOpen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeCartSafely();
      }
    };

    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, closeCartSafely]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const mobileEl = mobileRef.current;
    const desktopEl = desktopRef.current;

    if (mobileEl) {
      mobileEl.style.transform = '';
      mobileEl.style.transition = '';
    }

    if (desktopEl) {
      desktopEl.style.transform = '';
      desktopEl.style.transition = '';
    }
  }, [isOpen]);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useFocusTrap(isMobile ? mobileRef : desktopRef, isOpen);
  useScrollLock(isOpen);

  const handleCheckout = useCallback(() => {
    releaseCartScrollLock();
    closeCart();
    void navigate('/checkout');
  }, [closeCart, navigate]);

  const state = isOpen ? 'open' : 'closed';

  const badge =
    count > 0 ? (
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d4af37] px-1.5 text-[11px] font-black text-[#1c1915]">
        {count > 99 ? '99+' : count}
      </span>
    ) : null;

  const contentProps = {
    items,
    hasItems,
    totals,
    flags,
    closeCart: closeCartSafely,
  };

  const footerProps = {
    totals,
    pts,
    confirmClear,
    setConfirmClear,
    clearFn,
    onCheckout: handleCheckout,
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className="cart-backdrop pointer-events-none fixed inset-0 z-9998 bg-black/50 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100"
        data-state={state}
        onClick={isOpen ? closeCartSafely : undefined}
        aria-hidden="true"
      />

      <div
        ref={mobileRef}
        data-cart-sheet
        data-state={state}
        className="cart-sheet pointer-events-none fixed inset-x-0 bottom-0 z-9999 flex max-h-[92dvh] translate-y-full flex-col rounded-t-3xl bg-[#faf8f4] shadow-[0_-2px_0_rgba(212,175,55,0.18),0_-8px_40px_rgba(28,25,21,0.18)] transition-transform duration-300 ease-out touch-pan-y data-[state=open]:pointer-events-auto data-[state=open]:translate-y-0 md:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Your cart"
      >
        <DragHandle onClose={closeCartSafely} />

        <div className="flex shrink-0 items-center justify-between px-5 pb-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-[#1c1915] font-(family-name:--font-display,serif)">
            Your Order {badge}
          </h2>

          <button
            type="button"
            onClick={closeCartSafely}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(28,25,21,0.07)] text-[#8a7a6a] transition-colors active:scale-95"
            aria-label="Close cart"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {hasItems && <LoyaltyBanner pts={pts} />}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y">
          <CartContent {...contentProps} />
        </div>

        {hasItems && <CartFooter {...footerProps} />}
      </div>

      <div
        ref={desktopRef}
        data-state={state}
        className="cart-panel pointer-events-none fixed inset-y-0 right-0 z-9999 hidden w-full max-w-md translate-x-full flex-col bg-[#faf8f4] transition-transform duration-300 ease-out data-[state=open]:pointer-events-auto data-[state=open]:translate-x-0 md:flex"
        role="dialog"
        aria-modal="true"
        aria-label="Your cart"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[rgba(212,175,55,0.2)] px-5 py-4 backdrop-blur-xl bg-[linear-gradient(135deg,rgba(28,25,21,0.97)_0%,rgba(46,42,36,0.97)_100%)]">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-white">
              Your Order {badge}
            </h2>

            {hasItems && (
              <p className="mt-0.5 text-xs text-white/45">
                {count} item{count !== 1 ? 's' : ''} · {fmt(totals.subtotalCents)} subtotal
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={closeCartSafely}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-white/65 transition-colors hover:bg-white/15"
            aria-label="Close cart"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {hasItems && (
          <div className="shrink-0">
            <LoyaltyBanner pts={pts} />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <CartContent {...contentProps} />
        </div>

        {hasItems && <CartFooter {...footerProps} />}
      </div>
    </>,
    document.body,
  );
}