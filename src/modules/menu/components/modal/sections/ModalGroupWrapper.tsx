// =============================================================================
// PATH: src/modules/menu/components/modal/sections/ModalGroupWrapper.tsx
// =============================================================================
// Wraps a modifier group card with the correct border color (valid vs invalid).
// Pure renderer — receives validity as a prop, applies no logic.
// =============================================================================

import type { ModalGroupWrapperProps } from '@/domain/menu/menu-modal.types';
import { cx } from '../../../utils/uiHelpers';

export function ModalGroupWrapper({ children, valid, className }: ModalGroupWrapperProps) {
  return (
    <div
      className={cx(
        'overflow-hidden rounded-2xl border bg-white/3',
        valid ? 'border-white/10' : 'border-amber-500/25',
        className,
      )}
    >
      {children}
    </div>
  );
}