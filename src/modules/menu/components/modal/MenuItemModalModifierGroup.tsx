// =============================================================================
// Modifier group accordion — header, validation, option list.
// =============================================================================

import { memo } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ModifierGroup, Modifier } from '@/domain/menu/menu.types';
import type { SelectedModifier } from '@/domain/menu/menu-modal.types';
import { cx } from '../../utils/uiHelpers';
import { groupSelectionRangeLabel } from '../../utils/modifierGuards';
import { buildGroupSubline } from '../../utils/modal/modalSelection';
import { deriveGroupValidationMessage } from '../../utils/modal/modalLabels';
import { ModalGroupWrapper } from './sections/ModalGroupWrapper';
import { MenuItemModalRequiredBadge } from './MenuItemModalRequiredBadge';
import { MenuItemModalChoiceProgress } from './MenuItemModalChoiceProgress';
import { MenuItemModifierOption } from './MenuItemModifierOption';
import { MODAL_ANIM } from './menuItemModalAnimations';

interface MenuItemModalModifierGroupProps {
  group: ModifierGroup;
  sels: SelectedModifier[];
  expanded: boolean;
  valid: boolean;
  maxSelectionHint: string | null;
  selectionBlockedIds: ReadonlySet<string>;
  staggerIndex: number;
  onToggle: () => void;
  onSetSelection: (group: ModifierGroup, modifier: Modifier) => void;
}

export const MenuItemModalModifierGroup = memo<MenuItemModalModifierGroupProps>(
  function MenuItemModalModifierGroup({
    group,
    sels,
    expanded,
    valid,
    maxSelectionHint,
    selectionBlockedIds,
    staggerIndex,
    onToggle,
    onSetSelection,
  }) {
    if (!group) return null;

    const safeName = group.name ?? 'Options';
    const safeDescription = group.description ?? '';
    const modifiers = Array.isArray(group.modifiers) ? group.modifiers : [];
    const rangeLabel = groupSelectionRangeLabel(group);
    const selectedCount = Array.isArray(sels) ? sels.length : 0;
    const max = group.max_selections ?? (group.type === 'radio' ? 1 : null);
    const min = group.min_selections ?? (group.required ? 1 : 0);
    const subline = buildGroupSubline(group, sels ?? [], rangeLabel);
    const validationMsg =
      !valid && Number.isFinite(selectedCount)
        ? deriveGroupValidationMessage(selectedCount, min, max)
        : null;
    const selectionType = group.type === 'radio' ? 'radio' : 'checkbox';

    return (
      <div style={{ animation: MODAL_ANIM.stagger(staggerIndex * 45) }}>
      <ModalGroupWrapper valid={valid} className="transition-colors duration-150">
        <button
          type="button"
          onClick={onToggle}
          className={cx(
            'flex w-full items-start gap-3 px-4 py-4 text-left',
            'transition-colors hover:bg-(--menu-modal-card-hover)',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--menu-modal-focus-ring)',
          )}
          aria-expanded={expanded}
          aria-controls={`group-${group.id}`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-sans text-base font-semibold tracking-[-0.02em] text-ink-900">
                {safeName}
              </p>
              <MenuItemModalRequiredBadge
                variant={group.required || min > 0 ? 'required' : 'optional'}
              />
            </div>

            <p className="mt-1.5 text-xs text-ink-500">
              {safeDescription || subline}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <MenuItemModalChoiceProgress
                valid={valid}
                selectedCount={selectedCount}
                max={max}
                rangeLabel={rangeLabel}
              />
              {validationMsg ? (
                <span className="text-[11px] font-semibold text-ember-700" role="alert">
                  {validationMsg}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            {selectedCount > 0 && valid ? (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-ember-600/12 px-2 text-[11px] font-bold tabular-nums text-ember-700">
                {selectedCount}
              </span>
            ) : null}
            <ChevronDown
              className={cx(
                'h-5 w-5 text-ink-400 transition-transform duration-200',
                expanded && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </div>
        </button>

        {expanded ? (
          <div
            id={`group-${group.id}`}
            className="border-t border-(--menu-modal-border) px-3 pb-3 pt-2"
            style={{ animation: MODAL_ANIM.accordion }}
          >
            <div className="space-y-2">
              {modifiers.length === 0 ? (
                <p className="px-1 py-2 text-xs text-ink-500">No options available</p>
              ) : null}

              {modifiers.map((m) => {
                if (!m?.id) return null;
                return (
                  <MenuItemModifierOption
                    key={m.id}
                    modifier={m}
                    isSelected={sels?.some((s) => s?.id === m.id) ?? false}
                    isBlocked={selectionBlockedIds.has(m.id)}
                    selectionType={selectionType}
                    onSelect={() => onSetSelection(group, m)}
                  />
                );
              })}
            </div>

            {maxSelectionHint ? (
              <p className="mt-2 px-1 text-[11px] font-medium text-ink-500">{maxSelectionHint}</p>
            ) : null}
          </div>
        ) : null}
      </ModalGroupWrapper>
      </div>
    );
  },
);
