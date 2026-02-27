import {
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
  label?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SWIPE_THRESHOLD = 80;

export function ModalShell({
  isOpen,
  onClose,
  children,
  maxWidth = 'max-w-2xl',
  label = 'modal',
}: ModalShellProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);

  // ─────────────────────────────────────────
  // Focus restore + initial focus
  // ─────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    previousFocus.current = document.activeElement as HTMLElement;

    requestAnimationFrame(() => {
      cardRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });

    return () => {
      previousFocus.current?.focus();
    };
  }, [isOpen]);

  // ─────────────────────────────────────────
  // Focus trap
  // ─────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !cardRef.current) return;

    const focusable = Array.from(
      cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
    );

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
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // ─────────────────────────────────────────
  // Swipe down to close (mobile)
  // ─────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = touchCurrentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchCurrentY.current = e.touches[0].clientY;
    const delta = touchCurrentY.current - touchStartY.current;

    if (delta > 0 && cardRef.current) {
      cardRef.current.style.transform = `translateY(${delta * 0.5}px) translateZ(0)`;
      cardRef.current.style.opacity = String(Math.max(0, 1 - delta / 300));
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    const delta = touchCurrentY.current - touchStartY.current;

    if (delta > SWIPE_THRESHOLD) {
      onClose();
    } else if (cardRef.current) {
      cardRef.current.style.transform = 'translateZ(0)';
      cardRef.current.style.opacity = '1';
    }
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* ─────────────────────────────────────
          Backdrop
         ───────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-9999 bg-black/60"
        style={{
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      />

      {/* ─────────────────────────────────────
          Centering container
         ───────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="fixed inset-0 z-10000 flex items-center justify-center px-4 pointer-events-none"
      >
        {/* ─────────────────────────────────────
            Card wrapper
           ───────────────────────────────────── */}
        <div
          ref={cardRef}
          className={`relative w-full ${maxWidth} pointer-events-auto`}
          style={{
            transform: 'translateZ(0)',
            isolation: 'isolate',
            willChange: 'transform',
            transition:
              'transform 0.28s cubic-bezier(0.16,1,0.3,1), opacity 0.22s ease',
            animation:
              'modalCardIn 0.28s cubic-bezier(0.16,1,0.3,1) both',
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            aria-hidden="true"
            className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20 sm:hidden"
          />
          <span className="sr-only">
            Press Escape or swipe down to close
          </span>

          {children}
        </div>
      </div>
    </>
  );
}