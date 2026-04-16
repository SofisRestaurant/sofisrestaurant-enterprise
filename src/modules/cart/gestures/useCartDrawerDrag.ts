// src/modules/cart/gestures/useCartDrawerDrag.ts
// =============================================================================
// 2026 PRO VERSION — SAFE DRAG SYSTEM
//
// Fixes:
//   ✔ Pointer capture ONLY after drag begins (fixes broken buttons)
//   ✔ Proper pointer release (prevents lockups)
//   ✔ Multi-touch + cancel safety
//   ✔ More stable velocity tracking
//   ✔ Zero interference with normal taps
// =============================================================================

import { useRef, useCallback } from 'react';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface UseCartDrawerDragOptions {
  onClose: () => void;
  handleRef: React.RefObject<HTMLElement | null>;
}

export interface DragPointerHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEAD_ZONE_PX = 8;
const DISMISS_DISTANCE_PX = 120;
const DISMISS_VELOCITY = 0.5;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCartDrawerDrag({
  onClose,
  handleRef,
}: UseCartDrawerDragOptions): DragPointerHandlers {
  const startY = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const velocity = useRef(0);

  const isDragging = useRef(false);
  const dragStarted = useRef(false);
  const pointerIdRef = useRef<number | null>(null);

  const getSheet = useCallback((): HTMLElement | null => {
    return (
      (handleRef.current?.closest('[data-cart-sheet]') as HTMLElement | null) ??
      null
    );
  }, [handleRef]);

  // ── Pointer Down ────────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Ignore multi-touch / non-primary pointers
    if (!e.isPrimary) return;

    e.stopPropagation();

    isDragging.current = true;
    dragStarted.current = false;
    pointerIdRef.current = e.pointerId;

    startY.current = e.clientY;
    lastY.current = e.clientY;
    lastT.current = e.timeStamp;
    velocity.current = 0;
  }, []);

  // ── Pointer Move ────────────────────────────────────────────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || pointerIdRef.current !== e.pointerId) return;

    e.stopPropagation();

    const dy = e.clientY - startY.current;

    // Dead-zone check
    if (!dragStarted.current) {
      if (dy < DEAD_ZONE_PX) return;

      dragStarted.current = true;

      // 🔥 FIX: capture ONLY after drag starts
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }

    // Velocity tracking
    const dt = e.timeStamp - lastT.current;
    if (dt > 0) {
      velocity.current = (e.clientY - lastY.current) / dt;
    }

    lastY.current = e.clientY;
    lastT.current = e.timeStamp;

    const el = getSheet();
    if (el) {
      el.style.transition = 'none';
      el.style.transform = `translateY(${Math.max(0, dy)}px)`;
    }
  }, [getSheet]);

  // ── Pointer Up ──────────────────────────────────────────────────────────────
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || pointerIdRef.current !== e.pointerId) return;

    e.stopPropagation();

    isDragging.current = false;
    pointerIdRef.current = null;

    // Release capture safely
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    // Tap → do nothing
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
      setTimeout(onClose, 240);
    } else {
      if (el) {
        el.style.transition =
          'transform 0.38s cubic-bezier(0.34,1.56,0.64,1)';
        el.style.transform = 'translateY(0)';
        setTimeout(() => {
          if (el) el.style.transition = '';
        }, 400);
      }
    }

    velocity.current = 0;
    dragStarted.current = false;
  }, [getSheet, onClose]);

  // ── Pointer Cancel ──────────────────────────────────────────────────────────
  const onPointerCancel = useCallback((e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;

    e.stopPropagation();

    isDragging.current = false;
    dragStarted.current = false;
    pointerIdRef.current = null;

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const el = getSheet();
    if (el) {
      el.style.transition =
        'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)';
      el.style.transform = 'translateY(0)';
      setTimeout(() => {
        if (el) el.style.transition = '';
      }, 320);
    }
  }, [getSheet]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}