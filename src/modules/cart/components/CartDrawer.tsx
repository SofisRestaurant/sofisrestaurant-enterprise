// CartDrawer — premium slide-over panel (mobile sheet + desktop panel).
// Zero Headless UI; CSS data-state transitions + manual focus trap / scroll lock.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { useCartSummary } from '@/domain/cart/use-cart-summary';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { CartFooter } from '@/modules/cart/components/CartFooter';
import { CartDrawerContent } from '@/modules/cart/components/cart-drawer/CartDrawerContent';
import { CartDrawerDragHandle } from '@/modules/cart/components/cart-drawer/CartDrawerDragHandle';
import { CartDrawerHeader } from '@/modules/cart/components/cart-drawer/CartDrawerHeader';
import { CartFulfillmentStrip } from '@/modules/cart/components/cart-drawer/CartFulfillmentStrip';
import { CartLoyaltyBanner } from '@/modules/cart/components/cart-drawer/CartLoyaltyBanner';
import { injectCartDrawerCss } from '@/modules/cart/components/cart-drawer/cartDrawerCss';
import {
  cartDesktopPanelShadow,
  cartPanelShadow,
  cartSurface,
} from '@/modules/cart/components/cartStyles';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useCartStore } from '@/modules/cart/store/cart.store';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';
import type { CartItem } from '@/modules/cart/types/cart.types';
import { formatCents } from '@/modules/cart/utils/cart.utils';
import { getSupabaseSessionIdFromAccessToken } from '@/security/auth/sessionId';

type ScrollLockSnapshot = {
  bodyOverflow: string;
  bodyTouchAction: string;
};

function releaseCartScrollLock() {
  if (typeof document === 'undefined') return;

  const body = document.body;
  const html = document.documentElement;

  body.style.overflow = '';
  body.style.touchAction = '';
  body.removeAttribute('data-cart-scroll-lock');
  html.style.overflow = '';
  html.style.touchAction = '';
}

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
    return () => document.removeEventListener('keydown', onKey);
  }, [active, ref]);
}

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

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.menuItemId === 'string';
}

function sc(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? Math.round(v) : 0;
}

export function CartDrawer() {
  const navigate = useNavigate();
  const location = useLocation();

  const isOpen = useCartUiStore((state) => state.isOpen);
  const closeCart = useCartUiStore((state) => state.close);
  const syncDisplayData = useCartUiStore((state) => state.syncDisplayData);
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
    injectCartDrawerCss();
  }, []);

  useEffect(() => {
    releaseCartScrollLock();
  }, [location.pathname]);

  const closeCartSafely = useCallback(() => {
    releaseCartScrollLock();
    closeCart();
  }, [closeCart]);

  const items: CartItem[] = useMemo(() => {
    if (!Array.isArray(cart.items)) return [];
    return cart.items.filter(isCartItem);
  }, [cart.items]);

  const count = typeof cart.itemCount === 'number' ? Math.max(0, cart.itemCount) : 0;
  const hasItems = items.length > 0;
  const pts = Math.max(0, Math.floor(sc(totals.subtotalCents) / 100));
  const subtotalLabel = formatCents(totals.subtotalCents);

  useEffect(() => {
    syncDisplayData(count, sc(totals.subtotalCents));
  }, [count, totals.subtotalCents, syncDisplayData]);

  useEffect(() => {
    if (!isOpen) setConfirmClear(false);
  }, [isOpen]);

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
      if (event.key === 'Escape') closeCartSafely();
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, closeCartSafely]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    for (const el of [mobileRef.current, desktopRef.current]) {
      if (!el) continue;
      el.style.transform = '';
      el.style.transition = '';
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

  const backdrop = (
    <div
      className="cart-backdrop fixed inset-0 z-9998 bg-ink-900/45 backdrop-blur-[3px] motion-reduce:backdrop-blur-none"
      data-state={state}
      onClick={isOpen ? closeCartSafely : undefined}
      aria-hidden="true"
    />
  );

  const scrollExtras = hasItems ? (
    <>
      <CartFulfillmentStrip />
      <CartLoyaltyBanner pts={pts} />
    </>
  ) : null;

  return createPortal(
    <>
      {backdrop}

      {/* Mobile bottom sheet */}
      <div
        ref={mobileRef}
        data-cart-sheet
        data-state={state}
        className={`cart-sheet fixed inset-x-0 bottom-0 z-absolute flex max-h-[92dvh] flex-col rounded-t-[1.75rem] ${cartSurface} ${cartPanelShadow} touch-pan-y md:hidden`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
      >
        <CartDrawerDragHandle onClose={closeCartSafely} />
        <CartDrawerHeader itemCount={count} variant="mobile" onClose={closeCartSafely} />
        {scrollExtras}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y">
          <CartDrawerContent {...contentProps} />
        </div>
        {hasItems ? <CartFooter {...footerProps} /> : null}
      </div>

      {/* Desktop slide-over */}
      <div
        ref={desktopRef}
        data-state={state}
        className={`cart-panel fixed inset-y-0 right-0 z-absolute hidden w-full max-w-[26rem] flex-col border-l border-cream-200 ${cartSurface} ${cartDesktopPanelShadow} md:flex`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
      >
        <CartDrawerHeader
          itemCount={count}
          subtotalLabel={hasItems ? subtotalLabel : undefined}
          variant="desktop"
          onClose={closeCartSafely}
        />
        {scrollExtras}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <CartDrawerContent {...contentProps} />
        </div>
        {hasItems ? <CartFooter {...footerProps} /> : null}
      </div>
    </>,
    document.body,
  );
}
