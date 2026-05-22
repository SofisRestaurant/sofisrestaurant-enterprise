// src/components/layout/bottomDockState.tsx
// Single source of truth for the mobile commerce dock: BottomNav + FloatingCartPill.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';

import { ModalContext } from '@/components/ui/ModalContext';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';
import { useMenuUi } from '@/modules/menu/store/menuUi.store';

export type BottomDockTabId = 'home' | 'menu' | 'cart' | 'deals' | 'account';
export type DockPhase = 'visible' | 'collapsed' | 'hidden';

export type BottomDockContextValue = {
  isMobile: boolean;
  dockPhase: DockPhase;
  isScrollingDown: boolean;
  isScrollingUp: boolean;
  isKeyboardLikelyOpen: boolean;
  shouldShowFloatingCart: boolean;
  shouldHideFloatingCart: boolean;
  isDockInteractive: boolean;
  activeTab: BottomDockTabId | null;
};

const DOCK_HIDDEN_PREFIXES = [
  '/admin',
  '/kitchen',
  '/expo',
  '/checkout',
  '/update-password',
  '/auth',
] as const;

const CART_HIDDEN_PREFIXES = [
  ...DOCK_HIDDEN_PREFIXES,
  '/order-success',
  '/order-canceled',
  '/find-order',
  '/privacy-policy',
  '/terms-of-service',
  '/mobile-order-payment-terms',
  '/rewards-terms',
  '/refund-policy',
] as const;

const CART_HIDDEN_EXACT = ['/auth/callback'] as const;

const MOBILE_MAX_WIDTH_PX = 767;
const TOP_LOCK_PX = 88;
const SCROLL_NOISE_PX = 4;
const MAX_SINGLE_DELTA_PX = 180;
const DOWN_SCROLL_INTENT_PX = 18;
const UP_SCROLL_INTENT_PX = 10;
const MIN_VISIBLE_MS = 180;
const SCROLL_SETTLE_MS = 180;
const POINTER_LOCK_MS = 220;
const ORIENTATION_SETTLE_MS = 180;
const KEYBOARD_THRESHOLD_PX = 140;

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isDockHiddenRoute(pathname: string): boolean {
  return matchesPrefix(pathname, DOCK_HIDDEN_PREFIXES);
}

function isCartHiddenRoute(pathname: string): boolean {
  if (CART_HIDDEN_EXACT.includes(pathname as (typeof CART_HIDDEN_EXACT)[number])) return true;
  if (pathname.startsWith('/order-status/')) return true;
  return matchesPrefix(pathname, CART_HIDDEN_PREFIXES);
}

function getActiveTab(pathname: string): BottomDockTabId | null {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/menu')) return 'menu';
  if (pathname.startsWith('/deals')) return 'deals';
  if (pathname.startsWith('/account') || pathname.startsWith('/order')) return 'account';
  return null;
}

function getScrollY(): number {
  if (typeof window === 'undefined') return 0;
  return Math.max(window.scrollY || window.pageYOffset || 0, 0);
}

function readIsMobile(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches;
}

function readReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readKeyboardLikelyOpen(): boolean {
  if (typeof window === 'undefined') return false;

  const viewport = window.visualViewport;
  if (!viewport) return false;

  return window.innerHeight - viewport.height > KEYBOARD_THRESHOLD_PX;
}

function clearTimer(timerRef: MutableRefObject<number | null>): void {
  if (typeof window === 'undefined') return;

  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function cancelFrame(frameRef: MutableRefObject<number | null>): void {
  if (typeof window === 'undefined') return;

  if (frameRef.current !== null) {
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }
}

const BottomDockContext = createContext<BottomDockContextValue | null>(null);

function useBottomDockController(): BottomDockContextValue {
  const { pathname } = useLocation();

  const cartDrawerOpen = useCartUiStore((s) => s.isOpen);
  const itemCount = useCartUiStore((s) => s.itemCount);
  const menuItemModalOpen = useMenuUi((s) => s.menuItemModalOpen);
  const modalContext = useContext(ModalContext);

  const [isMobile, setIsMobile] = useState(readIsMobile);
  const [scrollPhase, setScrollPhase] = useState<'visible' | 'collapsed'>('visible');
  const [isScrollingDown, setIsScrollingDown] = useState(false);
  const [isScrollingUp, setIsScrollingUp] = useState(false);
  const [isKeyboardLikelyOpen, setIsKeyboardLikelyOpen] = useState(false);

  const scrollPhaseRef = useRef<'visible' | 'collapsed'>('visible');
  const lastYRef = useRef(0);
  const downDistanceRef = useRef(0);
  const upDistanceRef = useRef(0);
  const lastShownAtRef = useRef(Date.now());

  const tickingRef = useRef(false);
  const focusWithinDockRef = useRef(false);
  const pointerWithinDockRef = useRef(false);

  const settleTimerRef = useRef<number | null>(null);
  const pointerTimerRef = useRef<number | null>(null);
  const orientationTimerRef = useRef<number | null>(null);
  const routeFrameOneRef = useRef<number | null>(null);
  const routeFrameTwoRef = useRef<number | null>(null);

  const routeHidesDock = useMemo(() => isDockHiddenRoute(pathname), [pathname]);
  const routeHidesCart = useMemo(() => isCartHiddenRoute(pathname), [pathname]);
  const activeTab = useMemo(() => getActiveTab(pathname), [pathname]);

  const cartCount = Math.max(0, Math.round(Number.isFinite(itemCount) ? itemCount : 0));
  const globalModalOpen = Boolean(modalContext?.activeModal);

  const dockPhase: DockPhase = !isMobile || routeHidesDock ? 'hidden' : scrollPhase;

  const overlaySuppressesCart =
    cartDrawerOpen || menuItemModalOpen || globalModalOpen || isKeyboardLikelyOpen;

  const shouldHideFloatingCart =
    !isMobile ||
    routeHidesCart ||
    cartCount === 0 ||
    overlaySuppressesCart ||
    scrollPhase === 'collapsed' ||
    dockPhase === 'hidden';

  const shouldShowFloatingCart = !shouldHideFloatingCart;
  const isDockInteractive = dockPhase !== 'hidden' && !cartDrawerOpen && !isKeyboardLikelyOpen;

  const resetIntent = useCallback(() => {
    downDistanceRef.current = 0;
    upDistanceRef.current = 0;
  }, []);

  const setPhase = useCallback((next: 'visible' | 'collapsed') => {
    if (scrollPhaseRef.current === next) return;

    scrollPhaseRef.current = next;
    setScrollPhase(next);
  }, []);

  const clearAsyncWork = useCallback(() => {
    clearTimer(settleTimerRef);
    clearTimer(pointerTimerRef);
    clearTimer(orientationTimerRef);
    cancelFrame(routeFrameOneRef);
    cancelFrame(routeFrameTwoRef);
  }, []);

  const syncScrollYAfterPaint = useCallback(() => {
    if (typeof window === 'undefined') return;

    cancelFrame(routeFrameOneRef);
    cancelFrame(routeFrameTwoRef);

    routeFrameOneRef.current = window.requestAnimationFrame(() => {
      routeFrameOneRef.current = null;

      routeFrameTwoRef.current = window.requestAnimationFrame(() => {
        routeFrameTwoRef.current = null;
        lastYRef.current = getScrollY();
        tickingRef.current = false;
        resetIntent();
      });
    });
  }, [resetIntent]);

  const revealDock = useCallback(
    (currentY = getScrollY()) => {
      setPhase('visible');
      resetIntent();

      lastShownAtRef.current = Date.now();
      lastYRef.current = currentY;

      setIsScrollingDown(false);
      setIsScrollingUp(false);
    },
    [resetIntent, setPhase],
  );

  const collapseDock = useCallback(
    (currentY = getScrollY()) => {
      if (focusWithinDockRef.current || pointerWithinDockRef.current) return;

      setPhase('collapsed');
      resetIntent();

      lastYRef.current = currentY;

      setIsScrollingDown(true);
      setIsScrollingUp(false);
    },
    [resetIntent, setPhase],
  );

  const resetDockForRoute = useCallback(() => {
    clearAsyncWork();

    tickingRef.current = false;
    focusWithinDockRef.current = false;
    pointerWithinDockRef.current = false;

    scrollPhaseRef.current = 'visible';
    setScrollPhase('visible');

    resetIntent();

    lastShownAtRef.current = Date.now();

    setIsScrollingDown(false);
    setIsScrollingUp(false);
    setIsKeyboardLikelyOpen(readKeyboardLikelyOpen());

    syncScrollYAfterPaint();
  }, [clearAsyncWork, resetIntent, syncScrollYAfterPaint]);

  useEffect(() => {
    resetDockForRoute();

    return () => {
      cancelFrame(routeFrameOneRef);
      cancelFrame(routeFrameTwoRef);
    };
  }, [pathname, isMobile, routeHidesDock, resetDockForRoute]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const media = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`);

    const sync = () => {
      setIsMobile(media.matches);
      syncScrollYAfterPaint();
    };

    sync();
    media.addEventListener('change', sync);

    return () => {
      media.removeEventListener('change', sync);
    };
  }, [syncScrollYAfterPaint]);

  useEffect(() => {
    if (!isMobile || typeof window === 'undefined') return undefined;

    const viewport = window.visualViewport;

    const syncKeyboard = () => {
      const keyboardOpen = readKeyboardLikelyOpen();

      setIsKeyboardLikelyOpen(keyboardOpen);

      if (keyboardOpen) {
        revealDock(getScrollY());
      }
    };

    syncKeyboard();

    viewport?.addEventListener('resize', syncKeyboard);
    viewport?.addEventListener('scroll', syncKeyboard);
    window.addEventListener('resize', syncKeyboard);

    return () => {
      viewport?.removeEventListener('resize', syncKeyboard);
      viewport?.removeEventListener('scroll', syncKeyboard);
      window.removeEventListener('resize', syncKeyboard);
    };
  }, [isMobile, pathname, revealDock]);

  useEffect(() => {
    if (!isMobile || routeHidesDock || typeof window === 'undefined') return undefined;

    const reducedMotion = readReducedMotion();

    const settle = () => {
      clearTimer(settleTimerRef);

      settleTimerRef.current = window.setTimeout(() => {
        setIsScrollingDown(false);
        setIsScrollingUp(false);
        settleTimerRef.current = null;
      }, SCROLL_SETTLE_MS);
    };

    const updateFromScroll = () => {
      tickingRef.current = false;

      const currentY = getScrollY();

      if (reducedMotion || isKeyboardLikelyOpen) {
        revealDock(currentY);
        settle();
        return;
      }

      const previousY = lastYRef.current;
      const delta = currentY - previousY;
      const absDelta = Math.abs(delta);

      if (currentY < TOP_LOCK_PX) {
        revealDock(currentY);
        settle();
        return;
      }

      if (absDelta < SCROLL_NOISE_PX) {
        settle();
        return;
      }

      if (absDelta > MAX_SINGLE_DELTA_PX) {
        lastYRef.current = currentY;
        resetIntent();
        settle();
        return;
      }

      if (delta > 0) {
        downDistanceRef.current += delta;
        upDistanceRef.current = 0;

        setIsScrollingDown(true);
        setIsScrollingUp(false);

        const canCollapse = Date.now() - lastShownAtRef.current >= MIN_VISIBLE_MS;
        const hasIntent = downDistanceRef.current >= DOWN_SCROLL_INTENT_PX;

        if (canCollapse && hasIntent) {
          collapseDock(currentY);
          settle();
          return;
        }
      }

      if (delta < 0) {
        upDistanceRef.current += absDelta;
        downDistanceRef.current = 0;

        setIsScrollingDown(false);
        setIsScrollingUp(true);

        if (upDistanceRef.current >= UP_SCROLL_INTENT_PX) {
          revealDock(currentY);
          settle();
          return;
        }
      }

      lastYRef.current = currentY;
      settle();
    };

    const onScroll = () => {
      if (tickingRef.current) return;

      tickingRef.current = true;
      window.requestAnimationFrame(updateFromScroll);
    };

    const onResize = () => {
      revealDock(getScrollY());
      syncScrollYAfterPaint();
    };

    const onOrientationChange = () => {
      clearTimer(orientationTimerRef);

      orientationTimerRef.current = window.setTimeout(() => {
        revealDock(getScrollY());
        syncScrollYAfterPaint();
        orientationTimerRef.current = null;
      }, ORIENTATION_SETTLE_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      revealDock(getScrollY());
      syncScrollYAfterPaint();
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target?.closest?.('[data-mobile-dock="true"]')) return;

      focusWithinDockRef.current = true;
      revealDock(getScrollY());
    };

    const onFocusOut = (event: FocusEvent) => {
      const related = event.relatedTarget as HTMLElement | null;

      if (related?.closest?.('[data-mobile-dock="true"]')) return;

      focusWithinDockRef.current = false;
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target?.closest?.('[data-mobile-dock="true"]')) return;

      pointerWithinDockRef.current = true;
      revealDock(getScrollY());
    };

    const releasePointer = () => {
      clearTimer(pointerTimerRef);

      pointerTimerRef.current = window.setTimeout(() => {
        pointerWithinDockRef.current = false;
        pointerTimerRef.current = null;
      }, POINTER_LOCK_MS);
    };

    syncScrollYAfterPaint();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientationChange);
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', releasePointer, { passive: true });
    window.addEventListener('pointercancel', releasePointer, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientationChange);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);

      clearTimer(settleTimerRef);
      clearTimer(pointerTimerRef);
      clearTimer(orientationTimerRef);

      tickingRef.current = false;
    };
  }, [
    collapseDock,
    isKeyboardLikelyOpen,
    isMobile,
    resetIntent,
    revealDock,
    routeHidesDock,
    syncScrollYAfterPaint,
  ]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const root = document.documentElement;

    if (dockPhase === 'hidden') {
      root.style.setProperty('--mobile-dock-translate-y', '0px');
      root.style.setProperty('--mobile-page-bottom-padding', '0px');
      root.dataset.mobileDock = 'hidden';

      return () => {
        root.style.removeProperty('--mobile-dock-translate-y');
        root.style.removeProperty('--mobile-page-bottom-padding');
        delete root.dataset.mobileDock;
      };
    }

    const translateY = dockPhase === 'collapsed' ? 'var(--mobile-bottom-dock-collapse-y)' : '0px';

    root.style.setProperty('--mobile-dock-translate-y', translateY);
    root.style.setProperty(
      '--mobile-page-bottom-padding',
      'var(--mobile-page-bottom-padding-expanded)',
    );
    root.dataset.mobileDock = dockPhase;

    return () => {
      root.style.removeProperty('--mobile-dock-translate-y');
      root.style.removeProperty('--mobile-page-bottom-padding');
      delete root.dataset.mobileDock;
    };
  }, [dockPhase]);

  const value = useMemo<BottomDockContextValue>(
    () => ({
      isMobile,
      dockPhase,
      isScrollingDown,
      isScrollingUp,
      isKeyboardLikelyOpen,
      shouldShowFloatingCart,
      shouldHideFloatingCart,
      isDockInteractive,
      activeTab,
    }),
    [
      activeTab,
      dockPhase,
      isDockInteractive,
      isKeyboardLikelyOpen,
      isMobile,
      isScrollingDown,
      isScrollingUp,
      shouldHideFloatingCart,
      shouldShowFloatingCart,
    ],
  );

  return value;
}

export function BottomDockProvider({ children }: { children: ReactNode }) {
  const value = useBottomDockController();

  return <BottomDockContext.Provider value={value}>{children}</BottomDockContext.Provider>;
}

export function useBottomDock(): BottomDockContextValue {
  const context = useContext(BottomDockContext);

  if (!context) {
    throw new Error('useBottomDock must be used within BottomDockProvider');
  }

  return context;
}

/**
 * @deprecated Use useBottomDock instead.
 * Kept for older imports while the dock system is migrated.
 */
export function useBottomDockState(options: { pathname: string; keepVisible?: boolean }) {
  const { pathname } = options;
  const dock = useBottomDock();

  return {
    isRouteHidden: isDockHiddenRoute(pathname),
    dockState: dock.dockPhase === 'hidden' ? 'visible' : dock.dockPhase,
    isCollapsed: dock.dockPhase === 'collapsed',
    activeTab: dock.activeTab,
    dockTranslateY: dock.dockPhase === 'collapsed' ? 'var(--mobile-dock-translate-y)' : '0px',
    dockOpacity: dock.dockPhase === 'collapsed' ? 0.92 : 1,
  };
}