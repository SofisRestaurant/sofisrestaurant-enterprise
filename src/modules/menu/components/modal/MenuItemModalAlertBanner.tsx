// =============================================================================
// Inline alert banner (error / warning / info).
// =============================================================================

import type { FC, ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cx } from '../../utils/uiHelpers';
import { MODAL_ANIM } from './menuItemModalAnimations';

type AlertVariant = 'error' | 'warning' | 'info';

interface MenuItemModalAlertBannerProps {
  variant: AlertVariant;
  children: ReactNode;
  stagger?: boolean;
}

const VARIANT_STYLES: Record<AlertVariant, string> = {
  error:
    'border-(--menu-modal-danger-border) bg-(--menu-modal-danger-bg) text-(--menu-modal-danger-text)',
  warning:
    'border-(--menu-modal-warning-border) bg-(--menu-modal-warning-bg) text-(--menu-modal-warning-text)',
  info: 'border-(--menu-modal-info-border) bg-(--menu-modal-info-bg) text-(--menu-modal-info-text)',
};

export const MenuItemModalAlertBanner: FC<MenuItemModalAlertBannerProps> = ({
  variant,
  children,
  stagger,
}) => (
  <div
    className={cx(
      'mt-4 flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm',
      VARIANT_STYLES[variant],
    )}
    role={variant === 'error' ? 'alert' : 'status'}
    style={stagger ? { animation: MODAL_ANIM.stagger(0) } : undefined}
  >
    <Info className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden="true" />
    <span>{children}</span>
  </div>
);
