// CartDrawer — premium slide-over panel (mobile sheet + desktop panel).
// Mobile-first, production-safe drawer with responsive focus target,
// scroll lock, safe-area spacing, stable z-index layering, and premium app feel.

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
import { cartDesktopPanelShadow, cartSurface } from '@/modules/cart/components/cartStyles';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useCartStore } from '@/modules/cart/store/cart.store';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';
import type { CartItem } from '@/modules/cart/types/cart.types';
import { formatCents } from '@/modules/cart/utils/cart.utils';
import { getSupabaseSessionIdFromAccessToken } from '@/security/auth/sessionId';

type ScrollLockSnapshot = {
  bodyOverflow: string;
  bodyTouchAction: string;
  htmlOverflow: string;
  htmlTouchAction: string;
};

const CART_BACKDROP_Z = 'z-[9998]';
const CART_DRAWER_Z = 'z-[9999]';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function releaseCartScrollLock() {
  if (typeof document === 'undefined') return;

  const body = document.body;
  const html = document.documentElement;

  body.style.overflow = '';
  body.style.touchAction = '';
  body.removeAttribute('data-cart-scroll-lock');

  html.style.overflow = '';
  html.style.touchAction = '';
  html.removeAttribute('data-cart-scroll-lock');
}

function useIsMobileQuery(query = '(max-width: 767px)') {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia(query);
    const update = () => setIsMobile(media.matches);

    update();

    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, [query]);

  return isMobile;
}

function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;

    const el = ref.current;
    if (!el) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const getFocusable = () =>
      Array.from(el.querySelectorAll<HTMLElement>(selector)).filter(
        (node) =>
          !node.hasAttribute('disabled') &&
          node.getAttribute('aria-hidden') !== 'true' &&
          node.offsetParent !== null,
      );

    requestAnimationFrame(() => {
      const firstFocusable = getFocusable()[0];
      firstFocusable?.focus({ preventScroll: true });
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      const focusable = getFocusable();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
        return;
      }

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [active, ref]);
}

function useScrollLock(active: boolean) {
  const snapshotRef = useRef<ScrollLockSnapshot | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const body = document.body;
    const html = document.documentElement;

    if (!active) {
      releaseCartScrollLock();
      snapshotRef.current = null;
      return;
    }

    if (!snapshotRef.current) {
      snapshotRef.current = {
        bodyOverflow: body.style.overflow,
        bodyTouchAction: body.style.touchAction,
        htmlOverflow: html.style.overflow,
        htmlTouchAction: html.style.touchAction,
      };
    }

    body.setAttribute('data-cart-scroll-lock', 'true');
    html.setAttribute('data-cart-scroll-lock', 'true');

    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    html.style.overflow = 'hidden';
    html.style.touchAction = 'none';

    return () => {
      const snapshot = snapshotRef.current;

      if (snapshot) {
        body.style.overflow = snapshot.bodyOverflow;
        body.style.touchAction = snapshot.bodyTouchAction;
        html.style.overflow = snapshot.htmlOverflow;
        html.style.touchAction = snapshot.htmlTouchAction;
      } else {
        releaseCartScrollLock();
      }

      body.removeAttribute('data-cart-scroll-lock');
      html.removeAttribute('data-cart-scroll-lock');
      snapshotRef.current = null;
    };
  }, [active]);
}

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== 'object' || value === null) return false;

  const record = value as Record<string, unknown>;
  return typeof record.menuItemId === 'string';
}

function safeCents(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

export function CartDrawer() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobileQuery();

  const isOpen = useCartUiStore((state) => state.isOpen);
  const closeCart = useCartUiStore((state) => state.close);
  const syncDisplayData = useCartUiStore((state) => state.syncDisplayData);
  const clearCart = useCartStore((state) => state.clearCart);

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

  const subtotalCents = safeCents(totals.subtotalCents);
  const pointsPreview = Math.max(0, Math.floor(subtotalCents / 100));
  const subtotalLabel = formatCents(subtotalCents);

  useEffect(() => {
    syncDisplayData(count, subtotalCents);
  }, [count, subtotalCents, syncDisplayData]);

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
    pts: pointsPreview,
    confirmClear,
    setConfirmClear,
    clearFn: clearCart,
    onCheckout: handleCheckout,
  };

  if (typeof document === 'undefined') return null;

  const scrollExtras = hasItems ? (
    <div className="shrink-0 border-b border-cream-200/70 bg-white/85 backdrop-blur-2xl dark:border-white/10 dark:bg-ink-950/80">
      <div className="max-h-[6.5rem] overflow-hidden">
        <CartFulfillmentStrip />
        <CartLoyaltyBanner pts={pointsPreview} />
      </div>
    </div>
  ) : null;

  return createPortal(
    <>
      <div
        className={cn(
          'cart-backdrop fixed inset-0 bg-ink-950/55 backdrop-blur-[4px]',
          'transition-opacity duration-300 ease-out motion-reduce:transition-none motion-reduce:backdrop-blur-none',
          CART_BACKDROP_Z,
        )}
        data-state={state}
        onClick={isOpen ? closeCartSafely : undefined}
        aria-hidden="true"
      />

      {/* Mobile premium bottom sheet */}
      <div
        ref={mobileRef}
        data-cart-sheet
        data-state={state}
        className={cn(
          'cart-sheet fixed inset-x-0 bottom-0 flex flex-col overflow-hidden md:hidden',
          'h-[calc(100dvh-0.5rem)] max-h-[calc(100dvh-0.5rem)]',
          'rounded-t-[2rem] border border-white/75 border-b-0',
          'bg-white shadow-[0_-28px_90px_rgba(15,23,42,0.28)]',
          'transition-[transform,opacity] duration-300 ease-out will-change-transform',
          'touch-pan-y motion-reduce:transition-none',
          'dark:border-white/10 dark:bg-ink-950 dark:shadow-[0_-28px_90px_rgba(0,0,0,0.55)]',
          CART_DRAWER_Z,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
      >
        <div className="shrink-0 border-b border-cream-200/70 bg-white/95 backdrop-blur-2xl dark:border-white/10 dark:bg-ink-950/95">
          <CartDrawerDragHandle onClose={closeCartSafely} />
          <CartDrawerHeader itemCount={count} variant="mobile" onClose={closeCartSafely} />
        </div>

        {scrollExtras}

        <div className="relative min-h-0 flex-1 bg-gradient-to-b from-cream-50/45 via-white to-white dark:from-ink-950 dark:via-ink-950 dark:to-ink-950">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-gradient-to-b from-white/95 to-transparent dark:from-ink-950/95" />

          <div className="h-full min-h-0 overflow-y-auto overscroll-contain px-0 py-2 touch-pan-y [-webkit-overflow-scrolling:touch]">
            <CartDrawerContent {...contentProps} />
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-white/95 to-transparent dark:from-ink-950/95" />
        </div>

        {hasItems ? (
          <div className="shrink-0 border-t border-cream-200/80 bg-white/96 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur-2xl dark:border-white/10 dark:bg-ink-950/96">
            <CartFooter {...footerProps} />
          </div>
        ) : null}
      </div>

      {/* Desktop premium slide-over */}
      <div
        ref={desktopRef}
        data-state={state}
        className={cn(
          'cart-panel fixed inset-y-0 right-0 hidden w-full max-w-[28rem] flex-col overflow-hidden md:flex',
          'border-l border-cream-200 bg-white/95 backdrop-blur-2xl',
          'transition-[transform,opacity] duration-300 ease-out will-change-transform motion-reduce:transition-none',
          'dark:border-white/10 dark:bg-ink-950/95',
          cartSurface,
          cartDesktopPanelShadow,
          CART_DRAWER_Z,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
      >
        <div className="shrink-0 border-b border-cream-200/70 bg-white/95 backdrop-blur-2xl dark:border-white/10 dark:bg-ink-950/95">
          <CartDrawerHeader
            itemCount={count}
            subtotalLabel={hasItems ? subtotalLabel : undefined}
            variant="desktop"
            onClose={closeCartSafely}
          />
        </div>

        {scrollExtras}

        <div className="relative min-h-0 flex-1 bg-gradient-to-b from-cream-50/35 via-white to-white dark:from-ink-950 dark:via-ink-950 dark:to-ink-950">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-gradient-to-b from-white/95 to-transparent dark:from-ink-950/95" />

          <div className="h-full min-h-0 overflow-y-auto overscroll-contain pb-2 [-webkit-overflow-scrolling:touch]">
            <CartDrawerContent {...contentProps} />
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-white/95 to-transparent dark:from-ink-950/95" />
        </div>

        {hasItems ? (
          <div className="shrink-0 border-t border-cream-200/80 bg-white/96 backdrop-blur-2xl dark:border-white/10 dark:bg-ink-950/96">
            <CartFooter {...footerProps} />
          </div>
        ) : null}
      </div>
    </>,
    document.body,
  );
}