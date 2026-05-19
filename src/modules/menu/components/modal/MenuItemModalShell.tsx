// =============================================================================
// Modal shell: backdrop, dialog frame, mobile sheet handle, scroll + footer slots.
// =============================================================================

import type { FC, ReactNode, RefObject } from 'react';
import { cx } from '../../utils/uiHelpers';
import { MODAL_ANIM } from './menuItemModalAnimations';

interface MenuItemModalShellProps {
  titleId: string;
  dialogRef: RefObject<HTMLDivElement | null>;
  onBackdropClose: () => void;
  closeButton?: ReactNode;
  hero?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
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
  return (
    <div className="fixed inset-0 z-100" role="presentation">
      <div
        className="absolute inset-0 backdrop-blur-md"
        aria-hidden="true"
        style={{
          animation: MODAL_ANIM.backdrop,
          background: 'var(--menu-modal-backdrop)',
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          onBackdropClose();
        }}
      />

      <div className="absolute inset-0 flex items-end justify-center sm:items-center sm:p-6">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cx(
            'relative flex w-full max-w-lg flex-col font-sans',
            'max-h-[96dvh] sm:max-h-[90vh]',
            'rounded-t-3xl sm:rounded-3xl',
            'overflow-hidden',
            'border border-(--menu-modal-border)',
            'ring-1 ring-(--menu-modal-ring)',
            'text-(--menu-modal-text)',
          )}
          style={{
            animation: MODAL_ANIM.dialog,
            background: 'var(--menu-modal-bg)',
            boxShadow: 'var(--menu-modal-shadow)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            className="flex shrink-0 justify-center pt-2.5 pb-1 sm:hidden"
            aria-hidden="true"
          >
            <div className="h-1 w-10 rounded-full bg-cream-300" />
          </div>

          {hero}

          <div
            className={cx(
              'relative min-h-0 flex-1 overflow-y-auto overscroll-contain',
              'px-5 pb-6 sm:px-6',
              '[-webkit-overflow-scrolling:touch]',
            )}
            style={{
              paddingBottom: footer
                ? 'calc(88px + env(safe-area-inset-bottom, 0px))'
                : undefined,
            }}
          >
            {closeButton}
            {children}
          </div>

          {footer}
        </div>
      </div>
    </div>
  );
};
