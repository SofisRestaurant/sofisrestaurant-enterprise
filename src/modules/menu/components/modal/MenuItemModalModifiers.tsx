// =============================================================================
// Customize section, loading, error, empty, and modifier group list.
// Hardened for modal visibility against global typography overrides.
// =============================================================================

import { Info } from 'lucide-react';

import type { ModalModifiersProps } from '@/domain/menu/menu-modal.types';

import { SKELETON_IDS } from '../../constants';
import { isSelectionValidForGroup } from '../../utils/modifierGuards';
import { cx } from '../../utils/uiHelpers';
import { MenuItemModalModifierGroup } from './MenuItemModalModifierGroup';
import { ModalSection } from './sections/ModalSection';

const fontSansStyle = {
  fontFamily: 'var(--font-sans)',
};

const titleStyle = {
  fontFamily: 'var(--font-sans)',
  color: 'var(--menu-modal-text, #171312)',
};

const mutedStyle = {
  fontFamily: 'var(--font-sans)',
  color: 'var(--menu-modal-muted, #5f534e)',
};

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
      <div
        className="relative z-30"
        data-ui-component
        style={{
          ...fontSansStyle,
          color: 'var(--menu-modal-text, #171312)',
        }}
      >
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h3
              className="text-[11px] font-black uppercase leading-none tracking-[0.18em]"
              style={titleStyle}
            >
              Customize
            </h3>

            <p className="mt-1.5 text-xs font-medium leading-5" style={mutedStyle}>
              Required choices must be completed before adding to cart.
            </p>
          </div>

          {modifierGroups.length > 0 ? (
            <button
              type="button"
              onClick={onClearSelections}
              className={cx(
                'shrink-0 rounded-lg px-3 py-2 text-xs font-bold',
                'transition-colors hover:bg-(--menu-modal-control-hover) active:scale-95',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--menu-modal-focus-ring)',
              )}
              style={mutedStyle}
              aria-label="Clear all selections"
            >
              Clear all
            </button>
          ) : null}
        </div>

        {groupsLoading ? (
          <div className="mt-4 space-y-3" aria-busy="true" aria-label="Loading options">
            {SKELETON_IDS.map((skeletonId) => (
              <div
                key={skeletonId}
                className="h-[4.5rem] animate-pulse rounded-2xl bg-(--menu-modal-control-bg)"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : groupsError ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-(--menu-modal-border) bg-(--menu-modal-bg-soft) px-4 py-4">
            <Info
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: 'var(--menu-modal-muted, #5f534e)' }}
              aria-hidden="true"
            />

            <div className="min-w-0">
              <p className="text-sm font-black leading-5" style={titleStyle}>
                Options unavailable
              </p>

              <p className="mt-0.5 text-xs font-medium leading-5" style={mutedStyle}>
                {groupsError}
              </p>

              <button
                type="button"
                onClick={onRetryLoad}
                className={cx(
                  'mt-3 rounded-xl border border-(--menu-modal-border) bg-(--menu-modal-control-bg)',
                  'px-4 py-2.5 text-xs font-bold',
                  'transition-colors hover:bg-(--menu-modal-control-hover) active:scale-95',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--menu-modal-focus-ring)',
                )}
                style={titleStyle}
                aria-label="Retry loading options"
              >
                Retry
              </button>
            </div>
          </div>
        ) : !modifierGroups.length ? (
          <p
            className="mt-4 rounded-2xl border border-(--menu-modal-border) bg-(--menu-modal-bg-soft) px-4 py-4 text-sm font-medium leading-6"
            style={mutedStyle}
          >
            No customization options for this item.
          </p>
        ) : (
          <div className="mt-4 space-y-3" role="list">
            {modifierGroups.map((g, gi) => (
              <MenuItemModalModifierGroup
                key={g.id}
                group={g}
                sels={selected[g.id] ?? []}
                expanded={Boolean(expandedGroups[g.id])}
                valid={isSelectionValidForGroup(g, selected[g.id] ?? [])}
                maxSelectionHint={maxSelectionHint}
                selectionBlockedIds={selectionBlockedIds}
                staggerIndex={gi}
                onToggle={() => onToggleGroup(g.id)}
                onSetSelection={onSetSelection}
              />
            ))}
          </div>
        )}
      </div>
    </ModalSection>
  );
}