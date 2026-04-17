// src/modules/cart/gestures/useCartDrawerDrag.ts
// =============================================================================
// Cart drawer drag-to-dismiss gesture hook
// =============================================================================
// KEY FIX vs previous version:
//   The hook clears el.style.transform and el.style.transition BEFORE calling
//   onClose. This means by the time the Zustand store updates (isOpen→false)
//   and React re-renders with data-state="closed", there is no stale inline
//   style competing with the CSS class rule. When the cart reopens, the CSS
//   data-state="open" rule has full control from the first paint — no race
//   condition on Chrome or Safari.
//
//   Old order: animate → setTimeout → onClose → React render → useEffect clear
//   New order: animate → setTimeout → clear inline styles → onClose → React render
// =============================================================================

import { useRef, useCallback } from 'react';

export interface UseCartDrawerDragOptions {
  onClose: () => void;
  handleRef: React.RefObject<HTMLElement | null>;
}

export interface DragPointerHandlers {
  onPointerDown:  (e: React.PointerEvent) => void;
  onPointerMove:  (e: React.PointerEvent) => void;
  onPointerUp:    (e: React.PointerEvent) => void;
  onPointerCancel:(e: React.PointerEvent) => void;
}

const DEAD_ZONE_PX       = 8;
const DISMISS_DISTANCE_PX = 120;
const DISMISS_VELOCITY    = 0.5;   // px/ms

export function useCartDrawerDrag({
  onClose,
  handleRef,
}: UseCartDrawerDragOptions): DragPointerHandlers {
  const startY       = useRef(0);
  const lastY        = useRef(0);
  const lastT        = useRef(0);
  const velocity     = useRef(0);
  const isDragging   = useRef(false);
  const dragStarted  = useRef(false);
  const pointerId    = useRef<number | null>(null);

  const getSheet = useCallback((): HTMLElement | null => {
    return (handleRef.current?.closest('[data-cart-sheet]') as HTMLElement | null) ?? null;
  }, [handleRef]);

  // Clear ALL inline styles the hook ever sets.
  // Called before onClose so React re-renders into a clean DOM state.
  const clearInlineStyles = useCallback((el: HTMLElement) => {
    el.style.transform  = '';
    el.style.transition = '';
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    e.stopPropagation();

    isDragging.current  = true;
    dragStarted.current = false;
    pointerId.current   = e.pointerId;
    startY.current      = e.clientY;
    lastY.current       = e.clientY;
    lastT.current       = e.timeStamp;
    velocity.current    = 0;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || pointerId.current !== e.pointerId) return;
    e.stopPropagation();

    const dy = e.clientY - startY.current;

    if (!dragStarted.current) {
      if (dy < DEAD_ZONE_PX) return;
      dragStarted.current = true;
      // Capture ONLY after the dead-zone threshold — prevents interfering with taps
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }

    const dt = e.timeStamp - lastT.current;
    if (dt > 0) velocity.current = (e.clientY - lastY.current) / dt;
    lastY.current = e.clientY;
    lastT.current = e.timeStamp;

    const el = getSheet();
    if (el) {
      el.style.transition = 'none';
      el.style.transform  = `translateY(${Math.max(0, dy)}px)`;
    }
  }, [getSheet]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || pointerId.current !== e.pointerId) return;
    e.stopPropagation();

    isDragging.current = false;
    pointerId.current  = null;

    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}

    // Pure tap (no drag started) — do nothing, don't interfere with click
    if (!dragStarted.current) {
      dragStarted.current = false;
      return;
    }

    const el         = getSheet();
    const dy         = e.clientY - startY.current;
    const shouldDismiss = dy > DISMISS_DISTANCE_PX || velocity.current > DISMISS_VELOCITY;

    velocity.current    = 0;
    dragStarted.current = false;

    if (shouldDismiss) {
      if (el) {
        el.style.transition = 'transform 0.26s cubic-bezier(0.4,0,1,1)';
        el.style.transform  = 'translateY(110%)';
      }
      setTimeout(() => {
        // ✅ Clear inline styles BEFORE calling onClose.
        // This ensures React's next render (isOpen→false, data-state="closed")
        // starts from a clean DOM — the CSS class rule owns the transform again.
        // On the subsequent open, data-state="open" fires with no competition.
        if (el) clearInlineStyles(el);
        onClose();
      }, 240);
    } else {
      // Snap back — spring easing
      if (el) {
        el.style.transition = 'transform 0.38s cubic-bezier(0.34,1.56,0.64,1)';
        el.style.transform  = 'translateY(0)';
        setTimeout(() => { if (el) clearInlineStyles(el); }, 400);
      }
    }
  }, [getSheet, onClose, clearInlineStyles]);

  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    if (pointerId.current !== e.pointerId) return;
    e.stopPropagation();

    isDragging.current  = false;
    dragStarted.current = false;
    pointerId.current   = null;

    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}

    const el = getSheet();
    if (el) {
      el.style.transition = 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)';
      el.style.transform  = 'translateY(0)';
      setTimeout(() => { if (el) clearInlineStyles(el); }, 320);
    }
  }, [getSheet, clearInlineStyles]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}