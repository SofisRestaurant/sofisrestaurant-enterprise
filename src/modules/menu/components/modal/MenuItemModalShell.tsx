// =============================================================================
// Modal shell: premium full-screen mobile item sheet, desktop dialog,
// performance-first open/close motion, swipe-to-dismiss, scroll containment,
// and footer slots.
// Tailwind v4.3 compatible.
// =============================================================================

import {
  type FC,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { cx } from '../../utils/uiHelpers';

interface MenuItemModalShellProps {
  titleId: string;
  dialogRef: RefObject<HTMLDivElement | null>;
  onBackdropClose: () => void;
  closeButton?: ReactNode;
  hero?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

type DragState = {
  pointerId: number | null;
  startY: number;
  lastY: number;
  startedAt: number;
  allowed: boolean;
  dragging: boolean;
  closing: boolean;
};

const CLOSE_DISTANCE_PX = 112;
const CLOSE_VELOCITY_PX_PER_MS = 0.58;
const DRAG_START_THRESHOLD_PX = 6;
const MAX_VISUAL_DRAG_PX = 220;

const OPEN_PANEL_MS = 310;
const OPEN_BACKDROP_MS = 180;
const CLOSE_PANEL_MS = 260;
const CLOSE_BACKDROP_MS = 170;
const SNAP_BACK_MS = 230;

const SPRING_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
const IOS_CLOSE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const SOFT_FADE = 'cubic-bezier(0.16, 1, 0.3, 1)';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function isDesktopViewport(): boolean {
  try {
    return window.matchMedia('(min-width: 640px)').matches;
  } catch {
    return false;
  }
}

function getResistedDrag(distance: number): number {
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  if (distance <= 86) return distance;

  return Math.min(MAX_VISUAL_DRAG_PX, 86 + (distance - 86) * 0.32);
}

function clearPanelMotion(panel: HTMLDivElement | null): void {
  if (!panel) return;

  panel.style.transition = '';
  panel.style.transform = '';
  panel.style.opacity = '';
}

function clearBackdropMotion(backdrop: HTMLButtonElement | null): void {
  if (!backdrop) return;

  backdrop.style.transition = '';
  backdrop.style.opacity = '';
}

export const MenuItemModalShell: FC<MenuItemModalShellProps> = ({
  titleId,
  dialogRef,
  onBackdropClose,
  closeButton,
  hero,
  children,
  footer,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const dragRafRef = useRef<number | null>(null);
  const openRafOneRef = useRef<number | null>(null);
  const openRafTwoRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const cleanupTimerRef = useRef<number | null>(null);
  const pendingDragYRef = useRef(0);

  const dragRef = useRef<DragState>({
    pointerId: null,
    startY: 0,
    lastY: 0,
    startedAt: 0,
    allowed: false,
    dragging: false,
    closing: false,
  });

  const assignDialogRef = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node;

      if (dialogRef && 'current' in dialogRef) {
        dialogRef.current = node;
      }
    },
    [dialogRef],
  );

  const clearScheduledWork = useCallback(() => {
    if (dragRafRef.current !== null) {
      window.cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }

    if (openRafOneRef.current !== null) {
      window.cancelAnimationFrame(openRafOneRef.current);
      openRafOneRef.current = null;
    }

    if (openRafTwoRef.current !== null) {
      window.cancelAnimationFrame(openRafTwoRef.current);
      openRafTwoRef.current = null;
    }

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (cleanupTimerRef.current !== null) {
      window.clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
  }, []);

  const resetDragState = useCallback(() => {
    dragRef.current = {
      pointerId: null,
      startY: 0,
      lastY: 0,
      startedAt: 0,
      allowed: false,
      dragging: false,
      closing: dragRef.current.closing,
    };
  }, []);

  const flushDragFrame = useCallback(() => {
    dragRafRef.current = null;

    const y = pendingDragYRef.current;
    const progress = Math.min(1, y / MAX_VISUAL_DRAG_PX);
    const panel = panelRef.current;
    const backdrop = backdropRef.current;

    if (panel) {
      panel.style.transform = y > 0 ? `translate3d(0, ${y}px, 0)` : '';
    }

    if (backdrop) {
      backdrop.style.opacity = String(1 - progress * 0.28);
    }
  }, []);

  const scheduleDragFrame = useCallback(
    (y: number) => {
      pendingDragYRef.current = y;

      if (dragRafRef.current !== null) return;

      dragRafRef.current = window.requestAnimationFrame(flushDragFrame);
    },
    [flushDragFrame],
  );

  const snapBack = useCallback(() => {
    resetDragState();

    if (dragRafRef.current !== null) {
      window.cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }

    pendingDragYRef.current = 0;

    const panel = panelRef.current;
    const backdrop = backdropRef.current;

    if (panel) {
      panel.style.transition = `transform ${SNAP_BACK_MS}ms ${SPRING_OUT}`;
      panel.style.transform = '';
    }

    if (backdrop) {
      backdrop.style.transition = `opacity 170ms ${SOFT_FADE}`;
      backdrop.style.opacity = '';
    }

    if (cleanupTimerRef.current !== null) {
      window.clearTimeout(cleanupTimerRef.current);
    }

    cleanupTimerRef.current = window.setTimeout(() => {
      if (!dragRef.current.closing) {
        if (panel) panel.style.transition = '';
        if (backdrop) backdrop.style.transition = '';
      }

      cleanupTimerRef.current = null;
    }, SNAP_BACK_MS + 32);
  }, [resetDragState]);

  const closeWithPolish = useCallback(() => {
    const state = dragRef.current;
    if (state.closing) return;

    state.closing = true;
    clearScheduledWork();

    const panel = panelRef.current;
    const backdrop = backdropRef.current;

    if (prefersReducedMotion()) {
      onBackdropClose();
      return;
    }

    const desktop = isDesktopViewport();

    if (panel) {
      panel.style.transition = `transform ${CLOSE_PANEL_MS}ms ${IOS_CLOSE}, opacity 185ms ease-out`;

      panel.style.transform = desktop
        ? 'translate3d(0, 12px, 0) scale(0.978)'
        : 'translate3d(0, calc(100dvh + 48px), 0)';

      panel.style.opacity = '0';
    }

    if (backdrop) {
      backdrop.style.transition = `opacity ${CLOSE_BACKDROP_MS}ms ${SOFT_FADE}`;
      backdrop.style.opacity = '0';
    }

    closeTimerRef.current = window.setTimeout(() => {
      onBackdropClose();
    }, CLOSE_PANEL_MS);
  }, [clearScheduledWork, onBackdropClose]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const panel = panelRef.current;
    const scrollTop = scrollRef.current?.scrollTop ?? 0;
    const target = event.target;

    const startedOnHandle =
      target instanceof HTMLElement && Boolean(target.closest('[data-modal-drag-handle]'));

    const startedNearTop = panel ? event.clientY - panel.getBoundingClientRect().top <= 104 : false;
    const allowed = scrollTop <= 2 && (startedOnHandle || startedNearTop);

    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      startedAt: performance.now(),
      allowed,
      dragging: false,
      closing: dragRef.current.closing,
    };

    if (!allowed) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (panel) {
      panel.style.transition = 'none';
    }

    if (backdropRef.current) {
      backdropRef.current.style.transition = 'none';
    }
  }, []);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragRef.current;

      if (state.closing || !state.allowed || state.pointerId !== event.pointerId) return;

      const rawDeltaY = event.clientY - state.startY;
      state.lastY = event.clientY;

      if (rawDeltaY <= 0) {
        if (state.dragging) scheduleDragFrame(0);
        return;
      }

      if (!state.dragging && rawDeltaY < DRAG_START_THRESHOLD_PX) return;

      state.dragging = true;
      scheduleDragFrame(getResistedDrag(rawDeltaY));
    },
    [scheduleDragFrame],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragRef.current;

      if (state.pointerId !== event.pointerId) return;

      const elapsedMs = Math.max(1, performance.now() - state.startedAt);
      const rawDistance = Math.max(0, state.lastY - state.startY);
      const velocity = rawDistance / elapsedMs;

      const shouldClose =
        state.allowed &&
        state.dragging &&
        (rawDistance >= CLOSE_DISTANCE_PX || velocity >= CLOSE_VELOCITY_PX_PER_MS);

      if (shouldClose) {
        closeWithPolish();
        return;
      }

      snapBack();
    },
    [closeWithPolish, snapBack],
  );

  useEffect(() => {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;

    if (prefersReducedMotion()) {
      clearPanelMotion(panel);
      clearBackdropMotion(backdrop);

      if (panel) panel.style.opacity = '1';
      if (backdrop) backdrop.style.opacity = '1';

      return undefined;
    }

    const desktop = isDesktopViewport();

    if (panel) {
      panel.style.transition = 'none';
      panel.style.opacity = '0';
      panel.style.transform = desktop
        ? 'translate3d(0, 10px, 0) scale(0.982)'
        : 'translate3d(0, 100dvh, 0)';
    }

    if (backdrop) {
      backdrop.style.transition = 'none';
      backdrop.style.opacity = '0';
    }

    openRafOneRef.current = window.requestAnimationFrame(() => {
      openRafTwoRef.current = window.requestAnimationFrame(() => {
        const activePanel = panelRef.current;
        const activeBackdrop = backdropRef.current;
        const activeDesktop = isDesktopViewport();

        if (activePanel) {
          activePanel.style.transition = activeDesktop
            ? `transform ${OPEN_PANEL_MS}ms ${SPRING_OUT}, opacity 210ms ${SOFT_FADE}`
            : `transform ${OPEN_PANEL_MS}ms ${SPRING_OUT}, opacity 190ms ${SOFT_FADE}`;

          activePanel.style.opacity = '1';
          activePanel.style.transform = '';
        }

        if (activeBackdrop) {
          activeBackdrop.style.transition = `opacity ${OPEN_BACKDROP_MS}ms ${SOFT_FADE}`;
          activeBackdrop.style.opacity = '1';
        }
      });
    });

    return () => {
      clearScheduledWork();
    };
  }, [clearScheduledWork]);

  useEffect(() => {
    const handleResize = () => {
      if (dragRef.current.closing) return;

      clearPanelMotion(panelRef.current);
      clearBackdropMotion(backdropRef.current);
      resetDragState();
      pendingDragYRef.current = 0;
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearScheduledWork();
    };
  }, [clearScheduledWork, resetDragState]);

  return (
    <div
      className={cx(
        'fixed inset-0 z-100',
        'flex items-end justify-center overflow-hidden',
        'px-0 pb-0 pt-0',
        'sm:items-center sm:p-6',
      )}
      role="presentation"
    >
      <button
        ref={backdropRef}
        type="button"
        className={cx(
          'absolute inset-0 h-full w-full cursor-default',
          'bg-(--menu-modal-backdrop)',
          'will-change-opacity',
          'focus:outline-none',
        )}
        aria-label="Close item details"
        onClick={closeWithPolish}
      />

      <div
        ref={assignDialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-menu-modal-panel
        data-ui-component
        className={cx(
          'pointer-events-auto relative z-10 flex w-full max-w-none flex-col',
          'h-[100dvh] max-h-[100dvh]',
          'overflow-hidden text-[#171312] dark:text-white',
          'rounded-none',
          'border-0 border-(--menu-modal-border) ring-0 ring-(--menu-modal-ring)',
          'will-change-transform transform-gpu',
          'sm:h-auto sm:max-h-[min(46rem,calc(100dvh-3rem))] sm:max-w-lg',
          'sm:rounded-[1.85rem] sm:border sm:ring-1',
        )}
        style={{
          background: 'var(--menu-modal-bg)',
          boxShadow: 'var(--menu-modal-shadow)',
          contain: 'layout paint style',
          fontFamily: 'var(--font-sans)',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={snapBack}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          data-modal-drag-handle
          className={cx(
            'absolute inset-x-0 top-0 z-30 flex justify-center pb-3 pt-[calc(0.6rem+env(safe-area-inset-top))]',
            'touch-none select-none sm:hidden',
          )}
          aria-hidden="true"
        >
          <div
            className={cx(
              'h-1.5 w-11 rounded-full',
              'bg-[rgba(61,42,32,0.24)]',
              'dark:bg-white/[0.28]',
            )}
          />
        </div>

        {hero ? (
          <div className="relative z-20 shrink-0 text-[#171312] dark:text-white">{hero}</div>
        ) : null}

        <div
          ref={scrollRef}
          data-menu-modal-scroll
          className={cx(
            'relative z-20 min-h-0 flex-1 overflow-y-auto overscroll-contain text-[#171312] dark:text-white',
            'px-5 pb-6 pt-[env(safe-area-inset-top)] sm:px-6 sm:pt-0',
            '[-webkit-overflow-scrolling:touch]',
          )}
          style={{
            paddingBottom: footer
              ? 'calc(92px + env(safe-area-inset-bottom, 0px))'
              : 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
          {closeButton}
          {children}
        </div>

        {footer ? <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">{footer}</div> : null}
      </div>
    </div>
  );
};