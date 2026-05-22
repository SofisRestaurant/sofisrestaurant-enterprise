// src/components/layout/bottomDockState.tsx
// =============================================================================
// Single source of truth for the mobile commerce dock: BottomNav + FloatingCartPill.
//
// MOVEMENT CONTRACT:
//   This module determines dockPhase (visible | collapsed | hidden) and writes
//   --mobile-dock-translate-y to :root.  utilities.css .mobile-dock-shell reads
//   that variable for its transform.  No other element applies scroll transforms.
//
//   Page bottom padding stays at --mobile-page-bottom-padding-expanded for both
//   visible and collapsed phases to prevent layout thrash during scroll.
//
// RESIZE GUARD:
//   Mobile browsers fire window.resize and visualViewport.resize when the URL
//   bar collapses/expands during scroll.  These events must NOT call revealDock()
//   while the user is actively scrolling down, or the dock bounces up mid-swipe.
//   A time-based lockout (lastScrollDownAtRef + RESIZE_REVEAL_LOCKOUT_MS) gates
//   every non-scroll revealDock() call site.
// =============================================================================

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

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Route config
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Tuning constants
// ─────────────────────────────────────────────────────────────────────────────

const MOBILE_MAX_WIDTH_PX = 767;
const TOP_LOCK_PX = 88;
const SCROLL_NOISE_PX = 4;
const MAX_SINGLE_DELTA_PX = 180;
const DOWN_SCROLL_INTENT_PX = 18;
const UP_SCROLL_INTENT_PX = 16;
const MIN_VISIBLE_MS = 180;
const MIN_COLLAPSED_MS = 300;
const SCROLL_SETTLE_MS = 180;
const POINTER_LOCK_MS = 220;
const ORIENTATION_SETTLE_MS = 400;
const KEYBOARD_THRESHOLD_PX = 140;

// How long after the last downward scroll frame to suppress resize-triggered
// revealDock() calls.  Mobile URL-bar collapse fires resize during scroll —
// this lockout prevents the dock from bouncing back up mid-swipe.
const RESIZE_REVEAL_LOCKOUT_MS = 400;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const BottomDockContext = createContext<BottomDockContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Controller hook
// ─────────────────────────────────────────────────────────────────────────────

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
  const lastCollapsedAtRef = useRef(0);

  // ── Scroll-activity guard ────────────────────────────────────────────────
  // Timestamp of the last downward scroll frame.  Non-scroll events check
  // this before calling revealDock() to prevent URL-bar-resize bounces.
  const lastScrollDownAtRef = useRef(0);

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

  // ── Primitives ───────────────────────────────────────────────────────────

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

  /** True if a downward scroll happened recently (within lockout window). */
  const isInScrollDownLockout = useCallback((): boolean => {
    return Date.now() - lastScrollDownAtRef.current < RESIZE_REVEAL_LOCKOUT_MS;
  }, []);

  // ── Phase transitions ────────────────────────────────────────────────────

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
      lastCollapsedAtRef.current = Date.now();
      lastYRef.current = currentY;
      setIsScrollingDown(true);
      setIsScrollingUp(false);
    },
    [resetIntent, setPhase],
  );

  // ── Route reset (always safe — not a scroll-triggered reveal) ────────────

  const resetDockForRoute = useCallback(() => {
    clearAsyncWork();
    tickingRef.current = false;
    focusWithinDockRef.current = false;
    pointerWithinDockRef.current = false;

    scrollPhaseRef.current = 'visible';
    setScrollPhase('visible');
    resetIntent();

    lastShownAtRef.current = Date.now();
    lastCollapsedAtRef.current = 0;
    lastScrollDownAtRef.current = 0;

    setIsScrollingDown(false);
    setIsScrollingUp(false);
    setIsKeyboardLikelyOpen(readKeyboardLikelyOpen());
    syncScrollYAfterPaint();
  }, [clearAsyncWork, resetIntent, syncScrollYAfterPaint]);

  // ── Effect: route change ─────────────────────────────────────────────────

  useEffect(() => {
    resetDockForRoute();
    return () => {
      cancelFrame(routeFrameOneRef);
      cancelFrame(routeFrameTwoRef);
    };
  }, [pathname, isMobile, routeHidesDock, resetDockForRoute]);

  // ── Effect: media query ──────────────────────────────────────────────────

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

  // ── Effect: keyboard detection ───────────────────────────────────────────
  //    GUARDED: only reveals if keyboard genuinely open AND not mid-scroll.

  useEffect(() => {
    if (!isMobile || typeof window === 'undefined') return undefined;
    const viewport = window.visualViewport;

    const syncKeyboard = () => {
      const keyboardOpen = readKeyboardLikelyOpen();
      setIsKeyboardLikelyOpen(keyboardOpen);

      // Only reveal for a real keyboard, and only if not mid-scroll-down.
      if (keyboardOpen && !isInScrollDownLockout()) {
        revealDock(getScrollY());
      }
    };;

    syncKeyboard();
    viewport?.addEventListener('resize', syncKeyboard);
    viewport?.addEventListener('scroll', syncKeyboard);
    window.addEventListener('resize', syncKeyboard);

    return () => {
      viewport?.removeEventListener('resize', syncKeyboard);
      viewport?.removeEventListener('scroll', syncKeyboard);
      window.removeEventListener('resize', syncKeyboard);
    };
  }, [isMobile, pathname, revealDock, isInScrollDownLockout]);

  // ── Effect: scroll + guarded resize/orientation/visibility/focus/pointer ─

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

    // ── Scroll handler ────────────────────────────────────────────────────

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

      // ── Scrolling DOWN ──
      if (delta > 0) {
        downDistanceRef.current += delta;
        upDistanceRef.current = 0;

        // STAMP: record that we are actively scrolling down.
        // This gates all non-scroll revealDock() calls.
        lastScrollDownAtRef.current = Date.now();

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

      // ── Scrolling UP ──
      if (delta < 0) {
        upDistanceRef.current += absDelta;
        downDistanceRef.current = 0;

        setIsScrollingDown(false);
        setIsScrollingUp(true);

        const cooldownElapsed = Date.now() - lastCollapsedAtRef.current >= MIN_COLLAPSED_MS;
        const hasIntent = upDistanceRef.current >= UP_SCROLL_INTENT_PX;

        if (hasIntent && cooldownElapsed) {
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

    // ── Resize: GUARDED ───────────────────────────────────────────────────

    const onResize = () => {
      if (isInScrollDownLockout()) {
        syncScrollYAfterPaint();
        return;
      }
      revealDock(getScrollY());
      syncScrollYAfterPaint();
    };

    // ── Orientation: GUARDED ──────────────────────────────────────────────

    const onOrientationChange = () => {
      clearTimer(orientationTimerRef);
      orientationTimerRef.current = window.setTimeout(() => {
        orientationTimerRef.current = null;
        if (isInScrollDownLockout()) {
          syncScrollYAfterPaint();
          return;
        }
        revealDock(getScrollY());
        syncScrollYAfterPaint();
      }, ORIENTATION_SETTLE_MS);
    };

    // ── Visibility: GUARDED ──────────────────────────────────────────────

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (isInScrollDownLockout()) {
        syncScrollYAfterPaint();
        return;
      }
      revealDock(getScrollY());
      syncScrollYAfterPaint();
    };

    // ── Focus/pointer within dock → always reveal (direct interaction) ──

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

    // ── Mount ─────────────────────────────────────────────────────────────

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
    isInScrollDownLockout,
    isKeyboardLikelyOpen,
    isMobile,
    resetIntent,
    revealDock,
    routeHidesDock,
    syncScrollYAfterPaint,
  ]);

  // ── Effect: sync CSS variables to :root ──────────────────────────────────

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

  // ── Context value ────────────────────────────────────────────────────────

  return useMemo<BottomDockContextValue>(
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider + hooks
// ─────────────────────────────────────────────────────────────────────────────

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

/** @deprecated Use useBottomDock instead. */
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