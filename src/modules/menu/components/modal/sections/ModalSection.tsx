// =============================================================================
// PATH: src/modules/menu/components/modal/sections/ModalSection.tsx
// =============================================================================
// Thin layout primitive that adds consistent vertical rhythm + optional
// top-border between modal body sections. Pure renderer — no logic.
// =============================================================================

import type { ModalSectionProps } from '@/domain/menu/menu-modal.types';
import { cx } from '../../../utils/uiHelpers';

export function ModalSection({ children, className, bordered = false }: ModalSectionProps) {
  return (
    <div
      className={cx(
        'mt-6',
        bordered && 'border-t border-white/10 pt-6',
        className,
      )}
    >
      {children}
    </div>
  );
}