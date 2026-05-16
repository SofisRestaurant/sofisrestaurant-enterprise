// src/components/layout/useBottomDockState.ts
// =============================================================================
// Bottom dock state controller
// =============================================================================
// Centralized mobile dock behavior for BottomNav + FloatingCartPill.
//
// Responsibilities:
// - Detect hidden utility routes.
// - Track active route state.
// - Handle premium scroll-collapse behavior.
// - Ignore noisy mobile scroll/momentum.
// - Keep dock visible near top.
// - Keep dock visible while focus/pointer is inside dock.
// - Respect prefers-reduced-motion.
// - Expose --bottom-nav-offset and data-bottom-nav on <html>.
//
// Usage:
//   const {
//     isRouteHidden,
//     dockState,
//     isCollapsed,
//     activeTab,
//     dockTranslateY,
//     dockOpacity,
//   } = useBottomDockState({ pathname });
//
// Required DOM marker:
//   data-bottom-nav-dock="true"
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type BottomDockTabId = 'home' | 'menu' | 'cart' | 'deals' | 'account';
export type BottomDockState = 'visible' | 'collapsed';

export type UseBottomDockStateOptions = {
  pathname: string;
  /**
   * When true, the dock will stay visible.
   * Useful if you want cart users to keep the ordering CTA stable.
   */
  keepVisible?: boolean;
};

export type UseBottomDockStateResult = {
  isRouteHidden: boolean;
  dockState: BottomDockState;
  isCollapsed: boolean;
  activeTab: BottomDockTabId | null;
  dockTranslateY: string;
  dockOpacity: number;
};

const HIDDEN_ON: string[] = [
  '/admin',
  '/kitchen',
  '/expo',
  '/checkout',
  '/update-password',
  '/auth/callback',
];

const OFFSET_VISIBLE = '92px';
const OFFSET_COLLAPSED = '34px';
const OFFSET_HIDDEN = '0px';

/**
 * Scroll tuning:
 * - TOP_LOCK_PX: dock never collapses near the top.
 * - DOWN_SCROLL_INTENT_PX: higher = waits longer before tucking.
 * - UP_SCROLL_INTENT_PX: lower = comes back faster when scrolling up.
 * - SCROLL_NOISE_PX: ignores tiny touch bounce / momentum.
 * - MAX_SINGLE_DELTA_PX: ignores huge one-frame browser jumps.
 * - MIN_VISIBLE_MS: prevents instant hide after route change/reveal.
 * - COLLAPSED_TRANSLATE_Y: physical amount the dock moves down.
 */
const TOP_LOCK_PX = 220;
const DOWN_SCROLL_INTENT_PX = 150;
const UP_SCROLL_INTENT_PX = 10;
const SCROLL_NOISE_PX = 8;
const MAX_SINGLE_DELTA_PX = 80;
const MIN_VISIBLE_MS = 900;
const COLLAPSED_TRANSLATE_Y = '62px';

const POINTER_LOCK_RELEASE_MS = 180;
const ORIENTATION_RESET_DELAY_MS = 140;

function isHiddenRoute(pathname: string): boolean {
  return HIDDEN_ON.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
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
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useBottomDockState({
  pathname,
  keepVisible = false,
}: UseBottomDockStateOptions): UseBottomDockStateResult {
  const isRouteHidden = useMemo(() => isHiddenRoute(pathname), [pathname]);
  const activeTab = useMemo(() => getActiveTab(pathname), [pathname]);

  const [dockState, setDockState] = useState<BottomDockState>('visible');

  const dockStateRef = useRef<BottomDockState>('visible');
  const lastYRef = useRef(0);
  const downDistanceRef = useRef(0);
  const upDistanceRef = useRef(0);
  const lastShownAtRef = useRef(Date.now());
  const tickingRef = useRef(false);
  const focusWithinDockRef = useRef(false);
  const pointerWithinDockRef = useRef(false);
  const releasePointerTimerRef = useRef<number | null>(null);
  const orientationTimerRef = useRef<number | null>(null);

  const setStateSafely = useCallback((next: BottomDockState) => {
    if (dockStateRef.current === next) return;

    dockStateRef.current = next;
    setDockState(next);
  }, []);

  const resetIntent = useCallback(() => {
    downDistanceRef.current = 0;
    upDistanceRef.current = 0;
  }, []);

  const showDock = useCallback(
    (currentY = getScrollY()) => {
      setStateSafely('visible');
      resetIntent();
      lastShownAtRef.current = Date.now();
      lastYRef.current = currentY;
    },
    [resetIntent, setStateSafely],
  );

  const collapseDock = useCallback(
    (currentY = getScrollY()) => {
      if (keepVisible) return;
      if (focusWithinDockRef.current || pointerWithinDockRef.current) return;

      setStateSafely('collapsed');
      resetIntent();
      lastYRef.current = currentY;
    },
    [keepVisible, resetIntent, setStateSafely],
  );

  useEffect(() => {
    dockStateRef.current = 'visible';
    setDockState('visible');

    lastYRef.current = getScrollY();
    resetIntent();
    lastShownAtRef.current = Date.now();
    tickingRef.current = false;
    focusWithinDockRef.current = false;
    pointerWithinDockRef.current = false;

    if (releasePointerTimerRef.current !== null) {
      window.clearTimeout(releasePointerTimerRef.current);
      releasePointerTimerRef.current = null;
    }

    if (orientationTimerRef.current !== null) {
      window.clearTimeout(orientationTimerRef.current);
      orientationTimerRef.current = null;
    }
  }, [pathname, isRouteHidden, keepVisible, resetIntent]);

  useEffect(() => {
    if (isRouteHidden || typeof window === 'undefined') return undefined;

    function updateDockState() {
      tickingRef.current = false;

      const currentY = getScrollY();

      if (keepVisible || prefersReducedMotion()) {
        showDock(currentY);
        return;
      }

      const previousY = lastYRef.current;
      const delta = currentY - previousY;
      const absDelta = Math.abs(delta);

      if (currentY < TOP_LOCK_PX) {
        showDock(currentY);
        return;
      }

      if (absDelta < SCROLL_NOISE_PX) {
        return;
      }

      if (absDelta > MAX_SINGLE_DELTA_PX) {
        lastYRef.current = currentY;
        resetIntent();
        return;
      }

      if (delta > 0) {
        downDistanceRef.current += delta;
        upDistanceRef.current = 0;

        const visibleLongEnough = Date.now() - lastShownAtRef.current >= MIN_VISIBLE_MS;
        const intentionalDownScroll = downDistanceRef.current >= DOWN_SCROLL_INTENT_PX;

        if (visibleLongEnough && intentionalDownScroll) {
          collapseDock(currentY);
          return;
        }
      } else {
        upDistanceRef.current += absDelta;
        downDistanceRef.current = 0;

        if (upDistanceRef.current >= UP_SCROLL_INTENT_PX) {
          showDock(currentY);
          return;
        }
      }

      lastYRef.current = currentY;
    }

    function onScroll() {
      if (tickingRef.current) return;

      tickingRef.current = true;
      window.requestAnimationFrame(updateDockState);
    }

    function onResize() {
      showDock(getScrollY());
    }

    function onOrientationChange() {
      if (orientationTimerRef.current !== null) {
        window.clearTimeout(orientationTimerRef.current);
      }

      orientationTimerRef.current = window.setTimeout(() => {
        showDock(getScrollY());
        orientationTimerRef.current = null;
      }, ORIENTATION_RESET_DELAY_MS);
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        showDock(getScrollY());
      }
    }

    function onFocusIn(event: FocusEvent) {
      const target = event.target as HTMLElement | null;

      if (target?.closest?.('[data-bottom-nav-dock="true"]')) {
        focusWithinDockRef.current = true;
        showDock(getScrollY());
      }
    }

    function onFocusOut(event: FocusEvent) {
      const relatedTarget = event.relatedTarget as HTMLElement | null;

      if (!relatedTarget?.closest?.('[data-bottom-nav-dock="true"]')) {
        focusWithinDockRef.current = false;
      }
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;

      if (target?.closest?.('[data-bottom-nav-dock="true"]')) {
        pointerWithinDockRef.current = true;
        showDock(getScrollY());
      }
    }

    function releasePointerLock() {
      if (releasePointerTimerRef.current !== null) {
        window.clearTimeout(releasePointerTimerRef.current);
      }

      releasePointerTimerRef.current = window.setTimeout(() => {
        pointerWithinDockRef.current = false;
        releasePointerTimerRef.current = null;
      }, POINTER_LOCK_RELEASE_MS);
    }

    lastYRef.current = getScrollY();

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

      if (releasePointerTimerRef.current !== null) {
        window.clearTimeout(releasePointerTimerRef.current);
        releasePointerTimerRef.current = null;
      }

      if (orientationTimerRef.current !== null) {
        window.clearTimeout(orientationTimerRef.current);
        orientationTimerRef.current = null;
      }
    };
  }, [collapseDock, isRouteHidden, keepVisible, resetIntent, showDock]);

  const isCollapsed = dockState === 'collapsed';

  useEffect(() => {
    const root = document.documentElement;

    if (isRouteHidden) {
      root.style.setProperty('--bottom-nav-offset', OFFSET_HIDDEN);
      root.dataset.bottomNav = 'hidden';
      return;
    }

    if (isCollapsed) {
      root.style.setProperty('--bottom-nav-offset', OFFSET_COLLAPSED);
      root.dataset.bottomNav = 'collapsed';
      return;
    }

    root.style.setProperty('--bottom-nav-offset', OFFSET_VISIBLE);
    root.dataset.bottomNav = 'visible';

    return () => {
      root.style.removeProperty('--bottom-nav-offset');
      delete root.dataset.bottomNav;
    };
  }, [isRouteHidden, isCollapsed]);

  return {
    isRouteHidden,
    dockState,
    isCollapsed,
    activeTab,
    dockTranslateY: isCollapsed
      ? `calc(${COLLAPSED_TRANSLATE_Y} + env(safe-area-inset-bottom, 0px))`
      : '0px',
    dockOpacity: isCollapsed ? 0.98 : 1,
  };
}