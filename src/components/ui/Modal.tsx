import React, {
  useEffect,
  useId,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;

  size?: 'sm' | 'md' | 'lg' | 'xl';
  title?: string;
  description?: string;

  showCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;

  initialFocusRef?: React.RefObject<HTMLElement>;
  returnFocusRef?: React.RefObject<HTMLElement>;
}

const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

function getFocusable(container: HTMLElement): HTMLElement[] {
  const selectors = [
    'a[href]:not([disabled])',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    'audio[controls]',
    'video[controls]',
  ].join(',');

  return Array.from(container.querySelectorAll<HTMLElement>(selectors)).filter(
    (el) => {
      if (el.hasAttribute('disabled')) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;

      return true;
    }
  );
}

export function Modal({
  isOpen,
  onClose,
  children,
  size = 'md',
  title,
  description,
  showCloseButton = true,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  initialFocusRef,
  returnFocusRef,
}: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const lastActiveElRef = useRef<HTMLElement | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const labelledBy = useMemo(() => (title ? titleId : undefined), [title, titleId]);
  const describedBy = useMemo(
    () => (description ? descId : undefined),
    [description, descId]
  );

  const handleBackdropClick = useCallback(() => {
    if (closeOnBackdropClick) onClose();
  }, [closeOnBackdropClick, onClose]);

  const handleCloseClick = useCallback(() => {
    onClose();
  }, [onClose]);

  // ================================
  // BODY SCROLL LOCK
  // ================================
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;

    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [isOpen]);

  // ================================
  // PROPER BACKGROUND ISOLATION
  // ================================
  useEffect(() => {
    if (!isOpen) return;

    const root = document.getElementById('root');
    if (!root) return;

    root.setAttribute('inert', '');
    root.setAttribute('aria-hidden', 'true');

    return () => {
      root.removeAttribute('inert');
      root.removeAttribute('aria-hidden');
    };
  }, [isOpen]);

  // ================================
  // FOCUS MANAGEMENT
  // ================================
  useEffect(() => {
    if (!isOpen) return;

    lastActiveElRef.current = document.activeElement as HTMLElement | null;
    const returnTo =
      returnFocusRef?.current ?? lastActiveElRef.current ?? null;

    const focusTimer = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;

      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }

      const focusables = getFocusable(panel);
      if (focusables.length > 0) {
        focusables[0].focus();
        return;
      }

      panel.focus();
    });

    return () => {
      cancelAnimationFrame(focusTimer);

      if (returnTo && typeof returnTo.focus === 'function') {
        closeTimeoutRef.current = setTimeout(() => {
          returnTo.focus();
        }, 10);
      }
    };
  }, [isOpen, initialFocusRef, returnFocusRef]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // ================================
  // KEYBOARD HANDLING
  // ================================
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusables = getFocusable(panel);
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (!active || active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (!active || active === last || !panel.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeOnEscape, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
        onClick={handleBackdropClick}
        onMouseDown={(e) => e.preventDefault()}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className={`
          relative z-10 w-full ${sizeClasses[size]}
          overflow-hidden rounded-2xl bg-white shadow-2xl
          outline-none transform transition-all animate-scale-in
        `}
      >
        {(title || description || showCloseButton) && (
          <div className="border-b border-gray-200 p-4 bg-gray-50/50">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {title && (
                  <h2
                    id={titleId}
                    className="text-lg font-semibold text-gray-900 leading-tight"
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p
                    id={descId}
                    className="mt-1 text-sm text-gray-600 leading-relaxed"
                  >
                    {description}
                  </p>
                )}
              </div>

              {showCloseButton && (
                <button
                  type="button"
                  onClick={handleCloseClick}
                  className="
                    shrink-0 rounded-full p-2
                    text-gray-400 hover:text-gray-600
                    hover:bg-gray-100 active:bg-gray-200
                    transition-all duration-150
                    focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2
                  "
                  aria-label="Close modal"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        <div className="p-6 overflow-y-auto max-h-[calc(100vh-12rem)]">
          {children}
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes scale-in {
            from {
              opacity: 0;
              transform: scale(0.95) translateY(-10px);
            }
            to {
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }
          .animate-fade-in {
            animation: fade-in 0.2s ease-out;
          }
          .animate-scale-in {
            animation: scale-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          }
        `,
        }}
      />
    </div>,
    document.body
  );
}

export default Modal;