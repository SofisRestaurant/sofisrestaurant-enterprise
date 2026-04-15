// =============================================================================
// PATH: src/modules/menu/components/modal/MenuItemModalModifierGroup.tsx
// =============================================================================
// Hardened, production-safe UI renderer for modifier groups.
// - Defensive runtime guards
// - Strict typing
// - Accessible
// - No business logic leakage
// =============================================================================

import { Check, ChevronDown } from 'lucide-react';
import type { ModifierGroup, Modifier } from '@/domain/menu/menu.types';
import type { SelectedModifier } from '@/domain/menu/menu-modal.types';

import { cx } from '../../utils/uiHelpers';
import { groupSelectionRangeLabel } from '../../utils/modifierGuards';
import { buildGroupSubline } from '../../utils/modal/modalSelection';
import {
  deriveGroupValidationMessage,
  deriveModifierPriceLabel,
} from '../../utils/modal/modalLabels';
import { ModalGroupWrapper } from './sections/ModalGroupWrapper';

// ─────────────────────────────────────────────────────────────────────────────
// Props (strict + safe)
// ─────────────────────────────────────────────────────────────────────────────

interface ModalModifierGroupProps {
  group: ModifierGroup;
  sels: SelectedModifier[];
  expanded: boolean;
  valid: boolean;
  maxSelectionHint: string | null;
  onToggle: () => void;
  onSetSelection: (group: ModifierGroup, modifier: Modifier) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function MenuItemModalModifierGroup({
  group,
  sels,
  expanded,
  valid,
  maxSelectionHint,
  onToggle,
  onSetSelection,
}: ModalModifierGroupProps) {
  // 🔒 Defensive guards
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

  // ───────────────────────────────────────────────────────────────────────────

  return (
    <ModalGroupWrapper valid={valid}>
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/3 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
        aria-expanded={expanded}
        aria-controls={`group-${group.id}`}
        aria-label={`${safeName} options`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-white">{safeName}</p>

            {group.required || min > 0 ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-200 ring-1 ring-amber-500/25">
                Required
              </span>
            ) : (
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-zinc-300 ring-1 ring-white/10">
                Optional
              </span>
            )}
          </div>

          {safeDescription ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{safeDescription}</p>
          ) : (
            <p className="mt-0.5 text-xs text-zinc-500">{subline}</p>
          )}

          {validationMsg && (
            <p className="mt-1 text-[11px] font-semibold text-amber-200" role="alert">
              {validationMsg}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <span className="rounded-full bg-white/5 px-2 py-1 text-[11px] font-semibold text-zinc-200">
              {selectedCount} selected
            </span>
          )}

          <ChevronDown
            className={cx('h-5 w-5 text-zinc-400 transition', expanded && 'rotate-180')}
            aria-hidden="true"
          />
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div id={`group-${group.id}`} className="border-t border-white/10 px-4 py-3">
          <div className="grid gap-2">
            {modifiers.length === 0 && (
              <p className="text-xs text-zinc-500">No options available</p>
            )}

            {modifiers.map((m) => {
              if (!m || !m.id) return null;

              const isSelected = sels?.some((s) => s?.id === m.id);

              const disabled = m.available === false;

              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (!disabled) onSetSelection(group, m);
                  }}
                  className={cx(
                    'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition',
                    isSelected
                      ? 'border-amber-500/30 bg-amber-500/10'
                      : 'border-white/10 bg-white/5 hover:bg-white/8',
                    disabled && 'cursor-not-allowed opacity-50 hover:bg-white/5',
                  )}
                  aria-pressed={isSelected}
                  aria-disabled={disabled}
                  aria-label={`${m.name ?? 'Option'}${disabled ? ', unavailable' : ''}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {m.name ?? 'Unnamed option'}
                    </p>

                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {deriveModifierPriceLabel(m.price_adjustment ?? 0)}
                      {disabled ? ' • Unavailable' : ''}
                    </p>
                  </div>

                  <div className="shrink-0">
                    {isSelected ? (
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/25">
                        <Check className="h-4 w-4 text-amber-200" aria-hidden="true" />
                      </span>
                    ) : (
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
                        <span className="h-2 w-2 rounded-full bg-white/20" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {maxSelectionHint && (
            <p className="mt-3 text-xs font-semibold text-amber-200">{maxSelectionHint}</p>
          )}
        </div>
      )}
    </ModalGroupWrapper>
  );
}