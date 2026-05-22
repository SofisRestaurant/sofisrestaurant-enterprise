// =============================================================================
// Floating close control — MenuFilters-style X button adapted for image overlays.
// =============================================================================

import { memo, type RefObject } from 'react';
import { m } from 'framer-motion';
import { X } from 'lucide-react';
import { cx } from '../../utils/uiHelpers';

interface MenuItemModalCloseButtonProps {
  closeBtnRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  className?: string;
}

const ES = [0.34, 1.56, 0.64, 1] as const;

export const MenuItemModalCloseButton = memo<MenuItemModalCloseButtonProps>(
  function MenuItemModalCloseButton({ closeBtnRef, onClose, className }) {
    return (
      <m.button
        ref={closeBtnRef}
        type="button"
        data-modal-interactive="true"
        onPointerDownCapture={(event) => {
          event.stopPropagation();
        }}
        onPointerUpCapture={(event) => {
          event.stopPropagation();
        }}
        onClickCapture={(event) => {
          event.stopPropagation();
          onClose();
        }}
        whileHover={{ scale: 1.08, rotate: 90 }}
        whileTap={{ scale: 0.92 }}
        transition={{ duration: 0.2, ease: ES }}
        className={cx(
          'absolute right-4 top-4 z-50',
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          'border border-white/15 bg-black/35 text-white shadow-lg shadow-black/25',
          'backdrop-blur-md hover:bg-black/45',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25',
          className,
        )}
        aria-label="Close item details"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </m.button>
    );
  },
);