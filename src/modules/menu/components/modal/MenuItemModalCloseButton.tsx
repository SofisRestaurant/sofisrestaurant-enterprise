// =============================================================================
// Floating close control — overlays hero image or scroll area.
// =============================================================================

import { memo, type RefObject } from 'react';
import { X } from 'lucide-react';
import { cx } from '../../utils/uiHelpers';

interface MenuItemModalCloseButtonProps {
  closeBtnRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  className?: string;
}

export const MenuItemModalCloseButton = memo<MenuItemModalCloseButtonProps>(
  function MenuItemModalCloseButton({ closeBtnRef, onClose, className }) {
    return (
      <button
        ref={closeBtnRef}
        type="button"
        onClick={onClose}
        className={cx(
          'absolute right-4 top-4 z-20',
          'flex h-11 w-11 items-center justify-center rounded-full',
          'border border-white/20 bg-black/35 text-white backdrop-blur-md',
          'transition-transform duration-150 hover:bg-black/50 active:scale-95',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
          className,
        )}
        aria-label="Close"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    );
  },
);
