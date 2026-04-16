// src/modules/cart/gestures/useCartDrawerDrag.ts
// =============================================================================
// All drag-dismiss physics for the mobile bottom sheet.
//
// Responsibilities:
//   • Pointer-event capture (down / move / up / cancel)
//   • 8 px dead-zone so taps on the handle are never misread as drags
//   • Instantaneous velocity tracking (px/ms)
//   • Threshold decision: dismiss if dy > 120 OR velocity > 0.5 px/ms
//   • translate-Y applied directly to the sheet element (no React state)
//   • Spring-back animation when the user doesn't drag far enough
//
// Usage:
//   const handleRef = useRef<HTMLDivElement>(null);
//   const dragHandlers = useCartDrawerDrag({ onClose, handleRef });
//   <div ref={handleRef} {...dragHandlers} />
//
// The hook resolves the sheet element by walking up from the handle ref to
// the nearest ancestor with [data-cart-sheet].  The consumer must place that
// attribute on the Dialog.Panel element.
// =============================================================================

import { useRef, useCallback } from 'react';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface UseCartDrawerDragOptions {
  /** Called after the dismiss animation completes (~240 ms after release). */
  onClose: () => void;
  /**
   * Ref attached to the drag-handle element.
   * The hook climbs from here to find [data-cart-sheet].
   */
  handleRef: React.RefObject<HTMLElement | null>;
}

/** Spread these directly onto the drag-handle div. */
export interface DragPointerHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Minimum downward px before drag mode activates (prevents tap-to-dismiss). */
const DEAD_ZONE_PX = 8;

/** Drag distance (px) that always triggers dismiss regardless of velocity. */
const DISMISS_DISTANCE_PX = 120;

/** Downward velocity (px/ms) that triggers dismiss even under the distance threshold. */
const DISMISS_VELOCITY = 0.5;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCartDrawerDrag({
  onClose,
  handleRef,
}: UseCartDrawerDragOptions): DragPointerHandlers {
  // All state lives in refs — zero re-renders during gesture
  const startY = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const velocity = useRef(0); // px/ms, positive = downward
  const isDragging = useRef(false);
  const dragStarted = useRef(false); // true once past the dead-zone

  /** Walk up from the handle to find the sheet element. */
  const getSheet = useCallback((): HTMLElement | null => {
    return (
      (handleRef.current?.closest('[data-cart-sheet]') as HTMLElement | null) ?? null
    );
  }, [handleRef]);

  // ── onPointerDown ───────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Prevent the HeadlessUI backdrop listener from seeing this event
    e.stopPropagation();

    isDragging.current = true;
    dragStarted.current = false;
    startY.current = e.clientY;
    lastY.current = e.clientY;
    lastT.current = e.timeStamp;
    velocity.current = 0;

    // Capture so move/up fire even if the pointer leaves the element
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  // ── onPointerMove ───────────────────────────────────────────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (!isDragging.current) return;

    const dy = e.clientY - startY.current;

    // Enforce dead-zone: ignore tiny movements so taps never trigger drag mode
    if (!dragStarted.current) {
      if (dy < DEAD_ZONE_PX) return;
      dragStarted.current = true;
    }

    // Track instantaneous velocity for flick-dismiss
    const dt = e.timeStamp - lastT.current;
    if (dt > 0) velocity.current = (e.clientY - lastY.current) / dt;
    lastY.current = e.clientY;
    lastT.current = e.timeStamp;

    // Translate the sheet 1:1 with the finger (no upward pull)
    const clamped = Math.max(0, dy);
    const el = getSheet();
    if (el) {
      el.style.transition = 'none';
      el.style.transform = `translateY(${clamped}px)`;
    }
  }, [getSheet]);

  // ── onPointerUp ─────────────────────────────────────────────────────────────
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (!isDragging.current) return;
    isDragging.current = false;

    // Pure tap — never left the dead-zone, do nothing
    if (!dragStarted.current) return;

    const el = getSheet();
    const dy = e.clientY - startY.current;
    const shouldDismiss =
      dy > DISMISS_DISTANCE_PX || velocity.current > DISMISS_VELOCITY;

    if (shouldDismiss) {
      if (el) {
        el.style.transition = 'transform 0.26s cubic-bezier(0.4,0,1,1)';
        el.style.transform = 'translateY(110%)';
      }
      // Fire onClose after the exit animation completes
      setTimeout(onClose, 240);
    } else {
      // Spring back to resting position with a slight overshoot
      if (el) {
        el.style.transition = 'transform 0.38s cubic-bezier(0.34,1.56,0.64,1)';
        el.style.transform = 'translateY(0)';
        setTimeout(() => {
          if (el) el.style.transition = '';
        }, 400);
      }
    }

    velocity.current = 0;
  }, [getSheet, onClose]);

  // ── onPointerCancel ─────────────────────────────────────────────────────────
  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    isDragging.current = false;
    dragStarted.current = false;

    const el = getSheet();
    if (el) {
      el.style.transition = 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)';
      el.style.transform = 'translateY(0)';
      setTimeout(() => {
        if (el) el.style.transition = '';
      }, 320);
    }
  }, [getSheet]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}