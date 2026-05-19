// =============================================================================
// Conditional status alerts between hero and modifiers.
// =============================================================================

import { memo } from 'react';
import type { ModalAlertsProps } from '@/domain/menu/menu-modal.types';
import { MenuItemModalAlertBanner } from './MenuItemModalAlertBanner';
import { MODAL_ANIM } from './menuItemModalAnimations';

export const MenuItemModalAlerts = memo<ModalAlertsProps>(function MenuItemModalAlerts({
  preflightError,
  isLowStock,
  stockCount,
  unavailable,
  selectionPrunedWarning,
  hasBlockedSelections,
}) {
  return (
    <>
      {preflightError ? (
        <MenuItemModalAlertBanner variant="error" stagger>
          {preflightError}
        </MenuItemModalAlertBanner>
      ) : null}

      {isLowStock && stockCount != null ? (
        <div
          className="mt-4 flex items-center gap-3 rounded-2xl border border-(--menu-modal-warning-border) bg-(--menu-modal-warning-bg) px-4 py-3.5 text-sm text-(--menu-modal-warning-text)"
          role="status"
          style={{ animation: MODAL_ANIM.stagger(60) }}
        >
          <span className="text-base leading-none" aria-hidden="true">
            ⚡
          </span>
          <span>
            Only <strong className="font-bold text-ember-700">{stockCount}</strong> left — order
            soon.
          </span>
        </div>
      ) : null}

      {unavailable ? (
        <MenuItemModalAlertBanner variant="error">
          This item is currently unavailable.
        </MenuItemModalAlertBanner>
      ) : null}

      {selectionPrunedWarning ? (
        <MenuItemModalAlertBanner variant="warning">{selectionPrunedWarning}</MenuItemModalAlertBanner>
      ) : null}

      {hasBlockedSelections ? (
        <MenuItemModalAlertBanner variant="error">
          Some selected options are no longer available. Please update your choices.
        </MenuItemModalAlertBanner>
      ) : null}
    </>
  );
});
