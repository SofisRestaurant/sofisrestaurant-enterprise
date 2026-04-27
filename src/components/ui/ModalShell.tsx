// =============================================================================
// src/components/ui/ModalShell.tsx
// =============================================================================
// MODAL SHELL — 2026 Luxury Edition
// =============================================================================
// Visual upgrades:
//   - Warmer backdrop with deeper blur
//   - Spring-based entry animation (scale + rise)
//   - Bottom sheet on mobile (swipe-down-to-close)
//   - Ambient gold radial orb in modal card background
//   - Drag handle indicator (mobile)
//   - Smoother swipe physics (exponential drag dampening)
// All behavioural contracts unchanged.
//
// Z-INDEX: backdrop z-[100], dialog z-[101].
// Must sit above FloatingCartPill (z-40) and BottomNav (z-30).
// =============================================================================

import { useEffect, useRef, useCallback, type ReactNode } from 'react';

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  label?: string;
  /**
   * Controls whether the shell treats the card as a bottom-sheet on mobile.
   * Default: true (recommended for menus, pickers, forms).
   */
  mobileSheet?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SWIPE_THRESHOLD = 90;
const DRAG_RESISTANCE = 0.55;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function ModalShell({
  isOpen,
  onClose,
  children,
  maxWidth = 'max-w-2xl',
  label = 'modal',
  mobileSheet = true,
}: ModalShellProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);
  const isDragging = useRef(false);

  // ── Focus management ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    previousFocus.current = document.activeElement as HTMLElement;

    requestAnimationFrame(() => {
      const firstFocusable = cardRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      firstFocusable?.focus();
    });

    return () => {
      previousFocus.current?.focus();
    };
  }, [isOpen]);

  // ── Focus trap ───────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!cardRef.current) return;

      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // ── Swipe to close (mobile) ───────────────────────────────────────────────────

  const resetCardTransform = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transition = 'transform 0.32s cubic-bezier(0.22,1,0.36,1), opacity 0.24s ease';
    card.style.transform = 'translateZ(0)';
    card.style.opacity = '1';
    setTimeout(() => {
      if (card) card.style.transition = '';
    }, 320);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchCurrentY.current = e.touches[0].clientY;
    const rawDelta = touchCurrentY.current - touchStartY.current;

    // Only engage drag when clearly downward
    if (!isDragging.current && rawDelta > 8) {
      isDragging.current = true;
    }

    if (!isDragging.current) return;

    const delta = clamp(rawDelta, 0, 400);
    const dragged = delta * DRAG_RESISTANCE;

    const card = cardRef.current;
    if (card) {
      card.style.transition = 'none';
      card.style.transform = `translateY(${dragged}px) translateZ(0)`;
      card.style.opacity = String(Math.max(0.2, 1 - dragged / 280));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const rawDelta = touchCurrentY.current - touchStartY.current;
    const delta = rawDelta * DRAG_RESISTANCE;

    if (delta > SWIPE_THRESHOLD) {
      onClose();
    } else {
      resetCardTransform();
    }
  }, [onClose, resetCardTransform]);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[100] bg-black/65 animate-backdrop-in"
        style={{
          backdropFilter: 'blur(10px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(10px) saturate(1.4)',
        }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />

      {/* ── Dialog container ── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={
          mobileSheet
            ? 'fixed inset-0 z-[101] flex items-end justify-center sm:items-center sm:px-4'
            : 'fixed inset-0 z-[101] flex items-center justify-center px-4'
        }
      >
        <span className="sr-only">Press Escape or swipe down to close</span>

        {/* ── Card ── */}
        <div
          ref={cardRef}
          className={[
            'relative w-full pointer-events-auto',
            maxWidth,
            // Mobile: full-width sheet, Desktop: centered card
            mobileSheet ? 'rounded-t-[2rem] sm:rounded-3xl' : 'rounded-3xl',
          ].join(' ')}
          style={{
            transform: 'translateZ(0)',
            isolation: 'isolate',
            willChange: 'transform, opacity',
            animation: mobileSheet
              ? 'sheetIn 0.42s cubic-bezier(0.16,1,0.3,1) both'
              : 'modalIn 0.32s cubic-bezier(0.16,1,0.3,1) both',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Drag pill — mobile only */}
          {mobileSheet && (
            <div
              aria-hidden="true"
              className="sm:hidden flex justify-center pt-3 pb-0 absolute -top-4 inset-x-0 z-10"
            >
              <div className="h-1 w-10 rounded-full bg-white/25" />
            </div>
          )}

          {/* Ambient gold orb — decorative depth */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-40 w-60 rounded-full bg-amber-400/[0.06] blur-3xl"
          />

          {/* Content slot */}
          {children}
        </div>
      </div>
    </>
  );
}