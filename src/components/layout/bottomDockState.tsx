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
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';

import { ModalContext } from '@/components/ui/ModalContext';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';
import { useMenuUi } from '@/modules/menu/store/menuUi.store';

// Types

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

// Routes

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

// Scroll tuning

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
const ROUTE_SETTLE_FRAMES = 2;
const KEYBOARD_THRESHOLD_PX = 140;

// Helpers

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

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readIsMobile(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches;
}

function readKeyboardLikelyOpen(): boolean {
  if (typeof window === 'undefined') return false;

  const viewport = window.visualViewport;
  if (!viewport) return false;

  return window.innerHeight - viewport.height > KEYBOARD_THRESHOLD_PX;
}

function clearWindowTimer(timerRef: React.MutableRefObject<number | null>): void {
  if (typeof window === 'undefined') return;

  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function cancelWindowFrame(frameRef: React.MutableRefObject<number | null>): void {
  if (typeof window === 'undefined') return;

  if (frameRef.current !== null) {
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }
}

// Context

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
  const settleTimerRef = useRef<number | null>(null);
  const releasePointerTimerRef = useRef<number | null>(null);
  const orientationTimerRef = useRef<number | null>(null);
  const routeFrameOneRef = useRef<number | null>(null);
  const routeFrameTwoRef = useRef<number | null>(null);

  const focusWithinDockRef = useRef(false);
  const pointerWithinDockRef = useRef(false);

  const routeHidesDock = useMemo(() => isDockHiddenRoute(pathname), [pathname]);
  const routeHidesCart = useMemo(() => isCartHiddenRoute(pathname), [pathname]);
  const activeTab = useMemo(() => getActiveTab(pathname), [pathname]);

  const cartCount = Math.max(0, Math.round(Number.isFinite(itemCount) ? itemCount : 0));
  const globalModalOpen = Boolean(modalContext?.activeModal);

  const overlaySuppressesCart =
    cartDrawerOpen || menuItemModalOpen || globalModalOpen || isKeyboardLikelyOpen;

  const dockPhase: DockPhase = !isMobile || routeHidesDock ? 'hidden' : scrollPhase;

  const shouldHideFloatingCart =
    !isMobile ||
    routeHidesCart ||
    cartCount === 0 ||
    overlaySuppressesCart ||
    scrollPhase === 'collapsed' ||
    dockPhase === 'hidden';

  const shouldShowFloatingCart = !shouldHideFloatingCart;
  const isDockInteractive = dockPhase !== 'hidden' && !cartDrawerOpen && !isKeyboardLikelyOpen;

  const resetScrollIntent = useCallback(() => {
    downDistanceRef.current = 0;
    upDistanceRef.current = 0;
  }, []);

  const setScrollPhaseSafely = useCallback((next: 'visible' | 'collapsed') => {
    if (scrollPhaseRef.current === next) return;

    scrollPhaseRef.current = next;
    setScrollPhase(next);
  }, []);

  const clearMotionTimers = useCallback(() => {
    clearWindowTimer(settleTimerRef);
    clearWindowTimer(releasePointerTimerRef);
    clearWindowTimer(orientationTimerRef);
    cancelWindowFrame(routeFrameOneRef);
    cancelWindowFrame(routeFrameTwoRef);
  }, []);

  const syncLastScrollPositionAfterPaint = useCallback(() => {
    if (typeof window === 'undefined') return;

    cancelWindowFrame(routeFrameOneRef);
    cancelWindowFrame(routeFrameTwoRef);

    routeFrameOneRef.current = window.requestAnimationFrame(() => {
      routeFrameOneRef.current = null;

      routeFrameTwoRef.current = window.requestAnimationFrame(() => {
        routeFrameTwoRef.current = null;
        lastYRef.current = getScrollY();
        tickingRef.current = false;
        resetScrollIntent();
      });
    });
  }, [resetScrollIntent]);

  const revealDock = useCallback(
    (currentY = getScrollY()) => {
      setScrollPhaseSafely('visible');
      resetScrollIntent();

      lastShownAtRef.current = Date.now();
      lastYRef.current = currentY;

      setIsScrollingDown(false);
      setIsScrollingUp(false);
    },
    [resetScrollIntent, setScrollPhaseSafely],
  );

  const collapseDock = useCallback(
    (currentY = getScrollY()) => {
      if (focusWithinDockRef.current || pointerWithinDockRef.current) return;

      setScrollPhaseSafely('collapsed');
      resetScrollIntent();

      lastYRef.current = currentY;

      setIsScrollingDown(true);
      setIsScrollingUp(false);
    },
    [resetScrollIntent, setScrollPhaseSafely],
  );

  const resetDockForCurrentRoute = useCallback(() => {
    clearMotionTimers();

    tickingRef.current = false;
    focusWithinDockRef.current = false;
    pointerWithinDockRef.current = false;

    scrollPhaseRef.current = 'visible';
    setScrollPhase('visible');

    resetScrollIntent();

    lastShownAtRef.current = Date.now();

    setIsScrollingDown(false);
    setIsScrollingUp(false);
    setIsKeyboardLikelyOpen(readKeyboardLikelyOpen());

    syncLastScrollPositionAfterPaint();
  }, [clearMotionTimers, resetScrollIntent, syncLastScrollPositionAfterPaint]);

  useEffect(() => {
    resetDockForCurrentRoute();

    return () => {
      cancelWindowFrame(routeFrameOneRef);
      cancelWindowFrame(routeFrameTwoRef);
    };
  }, [pathname, routeHidesDock, isMobile, resetDockForCurrentRoute]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const media = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`);

    const onChange = () => {
      setIsMobile(media.matches);
      syncLastScrollPositionAfterPaint();
    };

    onChange();
    media.addEventListener('change', onChange);

    return () => media.removeEventListener('change', onChange);
  }, [syncLastScrollPositionAfterPaint]);

  useEffect(() => {
    if (!isMobile || typeof window === 'undefined') return undefined;

    const viewport = window.visualViewport;

    const sync = () => {
      const keyboardOpen = readKeyboardLikelyOpen();

      setIsKeyboardLikelyOpen(keyboardOpen);

      if (keyboardOpen) {
        revealDock(getScrollY());
      }
    };

    sync();

    viewport?.addEventListener('resize', sync);
    viewport?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);

    return () => {
      viewport?.removeEventListener('resize', sync);
      viewport?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [isMobile, pathname, revealDock]);

  useEffect(() => {
    if (!isMobile || routeHidesDock || typeof window === 'undefined') return undefined;

    const reducedMotion = prefersReducedMotion();

    function scheduleSettle() {
      clearWindowTimer(settleTimerRef);

      settleTimerRef.current = window.setTimeout(() => {
        setIsScrollingDown(false);
        setIsScrollingUp(false);
        settleTimerRef.current = null;
      }, SCROLL_SETTLE_MS);
    }

    function updateDockState() {
      tickingRef.current = false;

      const currentY = getScrollY();

      if (reducedMotion) {
        revealDock(currentY);
        scheduleSettle();
        return;
      }

      if (isKeyboardLikelyOpen) {
        revealDock(currentY);
        scheduleSettle();
        return;
      }

      const previousY = lastYRef.current;
      const delta = currentY - previousY;
      const absDelta = Math.abs(delta);

      if (currentY < TOP_LOCK_PX) {
        revealDock(currentY);
        scheduleSettle();
        return;
      }

      if (absDelta < SCROLL_NOISE_PX) {
        scheduleSettle();
        return;
      }

      if (absDelta > MAX_SINGLE_DELTA_PX) {
        lastYRef.current = currentY;
        resetScrollIntent();
        scheduleSettle();
        return;
      }

      if (delta > 0) {
        downDistanceRef.current += delta;
        upDistanceRef.current = 0;

        setIsScrollingDown(true);
        setIsScrollingUp(false);

        const visibleLongEnough = Date.now() - lastShownAtRef.current >= MIN_VISIBLE_MS;
        const hasDownIntent = downDistanceRef.current >= DOWN_SCROLL_INTENT_PX;

        if (visibleLongEnough && hasDownIntent) {
          collapseDock(currentY);
          scheduleSettle();
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
          scheduleSettle();
          return;
        }
      }

      lastYRef.current = currentY;
      scheduleSettle();
    }

    function onScroll() {
      if (tickingRef.current) return;

      tickingRef.current = true;
      window.requestAnimationFrame(updateDockState);
    }

    function onResize() {
      revealDock(getScrollY());
      syncLastScrollPositionAfterPaint();
    }

    function onOrientationChange() {
      clearWindowTimer(orientationTimerRef);

      orientationTimerRef.current = window.setTimeout(() => {
        revealDock(getScrollY());
        syncLastScrollPositionAfterPaint();
        orientationTimerRef.current = null;
      }, ORIENTATION_SETTLE_MS);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        revealDock(getScrollY());
        syncLastScrollPositionAfterPaint();
      }
    }

    function onFocusIn(event: FocusEvent) {
      const target = event.target as HTMLElement | null;

      if (target?.closest?.('[data-mobile-dock="true"]')) {
        focusWithinDockRef.current = true;
        revealDock(getScrollY());
      }
    }

    function onFocusOut(event: FocusEvent) {
      const related = event.relatedTarget as HTMLElement | null;

      if (!related?.closest?.('[data-mobile-dock="true"]')) {
        focusWithinDockRef.current = false;
      }
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;

      if (target?.closest?.('[data-mobile-dock="true"]')) {
        pointerWithinDockRef.current = true;
        revealDock(getScrollY());
      }
    }

    function releasePointerLock() {
      clearWindowTimer(releasePointerTimerRef);

      releasePointerTimerRef.current = window.setTimeout(() => {
        pointerWithinDockRef.current = false;
        releasePointerTimerRef.current = null;
      }, POINTER_LOCK_MS);
    }

    syncLastScrollPositionAfterPaint();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientationChange);
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', releasePointerLock, { passive: true });
    window.addEventListener('pointercancel', releasePointerLock, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientationChange);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', releasePointerLock);
      window.removeEventListener('pointercancel', releasePointerLock);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);

      clearWindowTimer(settleTimerRef);
      clearWindowTimer(releasePointerTimerRef);
      clearWindowTimer(orientationTimerRef);
      tickingRef.current = false;
    };
  }, [
    collapseDock,
    isKeyboardLikelyOpen,
    isMobile,
    resetScrollIntent,
    revealDock,
    routeHidesDock,
    syncLastScrollPositionAfterPaint,
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

    const translateY =
      dockPhase === 'collapsed' ? 'var(--mobile-bottom-dock-collapse-y)' : '0px';

    const pagePadding =
      dockPhase === 'collapsed'
        ? 'var(--mobile-page-bottom-padding-collapsed)'
        : 'var(--mobile-page-bottom-padding-expanded)';

    root.style.setProperty('--mobile-dock-translate-y', translateY);
    root.style.setProperty('--mobile-page-bottom-padding', pagePadding);
    root.dataset.mobileDock = dockPhase;

    return () => {
      root.style.removeProperty('--mobile-dock-translate-y');
      root.style.removeProperty('--mobile-page-bottom-padding');
      delete root.dataset.mobileDock;
    };
  }, [dockPhase]);

  return {
    isMobile,
    dockPhase,
    isScrollingDown,
    isScrollingUp,
    isKeyboardLikelyOpen,
    shouldShowFloatingCart,
    shouldHideFloatingCart,
    isDockInteractive,
    activeTab,
  };
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
 * Kept for older BottomNav/FloatingCartPill imports while the dock system is migrated.
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