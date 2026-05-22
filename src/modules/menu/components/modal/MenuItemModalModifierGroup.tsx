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
        <ModalGroupWrapper valid={valid} className="transition-colors duration-200">
          <button
            type="button"
            onClick={onToggle}
            className={cx(
              'flex w-full items-start gap-3 px-4 py-4 text-left',
              'transition-[background-color,color] duration-200 ease-out',
              'hover:bg-[rgba(255,255,255,0.52)]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c79a3b]/35',
              'dark:hover:bg-white/[0.06]',
            )}
            aria-expanded={expanded}
            aria-controls={`group-${group.id}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-sans text-base font-semibold leading-snug tracking-[-0.02em] text-[#2f1f18] dark:text-white">
                  {safeName}
                </p>

                <MenuItemModalRequiredBadge
                  variant={group.required || min > 0 ? 'required' : 'optional'}
                />
              </div>

              <p className="mt-1.5 text-xs font-medium leading-relaxed text-[#7c6559] dark:text-white/56">
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
                  <span
                    className="text-[11px] font-semibold text-[#8a3a24] dark:text-[#f4dec0]"
                    role="alert"
                  >
                    {validationMsg}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              {selectedCount > 0 && valid ? (
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#3f2418]/10 px-2 text-[11px] font-semibold tabular-nums text-[#3f2418] dark:bg-[#f4dec0]/14 dark:text-[#f4dec0]">
                  {selectedCount}
                </span>
              ) : null}

              <ChevronDown
                className={cx(
                  'h-5 w-5 text-[#8a7468] transition-transform duration-200 dark:text-white/42',
                  expanded && 'rotate-180 text-[#3f2418] dark:text-[#f4dec0]',
                )}
                aria-hidden="true"
              />
            </div>
          </button>

          {expanded ? (
            <div
              id={`group-${group.id}`}
              className="border-t border-[rgba(61,42,32,0.08)] px-3 pb-3 pt-2 dark:border-white/10"
              style={{ animation: MODAL_ANIM.accordion }}
            >
              <div className="space-y-2">
                {modifiers.length === 0 ? (
                  <p className="px-1 py-2 text-xs font-medium text-[#8a7468] dark:text-white/50">
                    No options available
                  </p>
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
                <p className="mt-2 px-1 text-[11px] font-medium leading-relaxed text-[#8a7468] dark:text-white/50">
                  {maxSelectionHint}
                </p>
              ) : null}
            </div>
          ) : null}
        </ModalGroupWrapper>
      </div>
    );
  },
);