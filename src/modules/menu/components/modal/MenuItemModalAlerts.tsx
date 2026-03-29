// =============================================================================
// PATH: src/modules/menu/components/modal/MenuItemModalAlerts.tsx
// =============================================================================
// All conditional alert banners between image and modifiers section.
// Renders only the alerts that are relevant — null for the rest.
// Pure renderer.
// =============================================================================

import type { ModalAlertsProps } from '@/domain/menu/menu-modal.types';

export function MenuItemModalAlerts({
  preflightError,
  isLowStock,
  stockCount,
  unavailable,
  selectionPrunedWarning,
  hasBlockedSelections,
}: ModalAlertsProps) {
  return (
    <>
      {preflightError ? (
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          {preflightError}
        </div>
      ) : null}

      {isLowStock && stockCount != null ? (
        <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">
          Only {stockCount} left — order soon.
        </div>
      ) : null}

      {unavailable ? (
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          This item is currently unavailable.
        </div>
      ) : null}

      {selectionPrunedWarning ? (
        <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">
          {selectionPrunedWarning}
        </div>
      ) : null}

      {hasBlockedSelections ? (
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          Some selected options are no longer available. Please update your choices.
        </div>
      ) : null}
    </>
  );
}