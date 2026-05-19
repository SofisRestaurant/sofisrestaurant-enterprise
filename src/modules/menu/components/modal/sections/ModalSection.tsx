// =============================================================================
// Vertical rhythm wrapper for modal body sections.
// =============================================================================

import type { ModalSectionProps } from '@/domain/menu/menu-modal.types';
import { cx } from '../../../utils/uiHelpers';

export function ModalSection({ children, className, bordered = false }: ModalSectionProps) {
  return (
    <section
      className={cx(
        'mt-8',
        bordered && 'border-t border-(--menu-modal-border) pt-8',
        className,
      )}
    >
      {children}
    </section>
  );
}
