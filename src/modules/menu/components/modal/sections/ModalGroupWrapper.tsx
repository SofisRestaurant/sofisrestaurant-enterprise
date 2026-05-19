// =============================================================================
// Modifier group card shell — valid vs needs-attention border.
// =============================================================================

import type { ModalGroupWrapperProps } from '@/domain/menu/menu-modal.types';
import { cx } from '../../../utils/uiHelpers';

export function ModalGroupWrapper({ children, valid, className }: ModalGroupWrapperProps) {
  return (
    <div
      className={cx(
        'overflow-hidden rounded-2xl border bg-(--menu-modal-card-bg)',
        valid ? 'border-(--menu-modal-border)' : 'border-(--menu-modal-warning-border)',
        !valid && 'bg-(--menu-modal-warning-bg)/40',
        className,
      )}
    >
      {children}
    </div>
  );
}
