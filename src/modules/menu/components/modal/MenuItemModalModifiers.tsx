// =============================================================================
// PATH: src/modules/menu/components/modal/MenuItemModalModifiers.tsx
// =============================================================================
// Renders the "Customize your order" section:
//   - loading skeleton
//   - error + retry
//   - empty state
//   - list of ModifierGroup cards
// Pure renderer — orchestration lives in the modal shell.
// =============================================================================

import { Info } from 'lucide-react';
import type { ModalModifiersProps } from '@/domain/menu/menu-modal.types';
import { isSelectionValidForGroup } from '../../utils/modifierGuards';
import { MODAL_SKELETON_IDS } from '../../constants/menuItemModal.constants';
import { MenuItemModalModifierGroup } from './MenuItemModalModifierGroup';
import { ModalSection } from './sections/ModalSection';

export function MenuItemModalModifiers({
  modifierGroups,
  groupsLoading,
  groupsError,
  selected,
  expandedGroups,
  maxSelectionHint,
  selectionBlockedIds,
  onClearSelections,
  onToggleGroup,
  onSetSelection,
  onRetryLoad,
}: ModalModifiersProps) {
  return (
    <ModalSection>
      {/* Section header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="section-eyebrow">Customize your order</p>
          <p className="text-xs input-label mt-1">
            Options are validated for availability and required picks before adding to cart.
          </p>
        </div>
        {modifierGroups.length ? (
          <button
            type="button"
            onClick={onClearSelections}
            className="btn btn-ghost-dark btn-sm px-2 py-1 shrink-0"
            aria-label="Clear all selections"
          >
            Clear
          </button>
        ) : null}
      </div>

      {/* States */}
      {groupsLoading ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm text-zinc-300">Loading options…</p>
          <div className="mt-3 grid gap-2">
            {MODAL_SKELETON_IDS.map((skeletonId) => (
              <div
                key={skeletonId}
                className="h-10 animate-pulse rounded-xl bg-white/5"
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
      ) : groupsError ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
              <Info className="h-4 w-4 text-zinc-200" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-white">Options unavailable</p>
              <p className="mt-1 text-xs text-zinc-500">{groupsError}</p>
              <button
                type="button"
                onClick={onRetryLoad}
                className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
                aria-label="Retry loading options"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      ) : !modifierGroups.length ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/3 p-4 text-sm text-zinc-300">
          No customization options for this item.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {modifierGroups.map((g) => (
            <MenuItemModalModifierGroup
              key={g.id}
              group={g}
              sels={selected[g.id] ?? []}
              expanded={Boolean(expandedGroups[g.id])}
              valid={isSelectionValidForGroup(g, selected[g.id] ?? [])}
              maxSelectionHint={maxSelectionHint}
              onToggle={() => onToggleGroup(g.id)}
              onSetSelection={onSetSelection}
            />
          ))}
        </div>
      )}
    </ModalSection>
  );
}