// =============================================================================
// PATH: src/modules/menu/utils/modal/modalAvailability.ts
// =============================================================================
// Derives availability-related booleans from preflight + modifier state.
//
// ⚠️  DO NOT duplicate:
//   - isMenuItemPublic  → import from ../menuItemGuards
//   - isSelectionValidForGroup → import from ../modifierGuards
// =============================================================================

import type {
  PreflightResult,
  SelectionMap,
  ModalAvailability,
  ModalValidation,
  CartPhase,
} from '@/domain/menu/menu-modal.types';
import type { ModifierGroup } from '@/domain/menu/menu.types';
import { isSelectionValidForGroup } from '../modifierGuards';
import { computeBlockedSelectionIds } from './modalSelection';
import { buildRequiredHint } from './modalSelection';

// ── Low-stock check ───────────────────────────────────────────────────────────

/**
 * Returns true when preflight reports a stock_count that is at or below the
 * low_stock_threshold (defaults to 5 if not provided).
 */
export function deriveIsLowStock(preflight: PreflightResult | null): boolean {
  if (preflight?.ok !== true) return false;
  if (preflight.stock_count == null) return false;
  const threshold = preflight.low_stock_threshold ?? 5;
  return preflight.stock_count > 0 && preflight.stock_count <= threshold;
}

// ── Full availability shape ───────────────────────────────────────────────────

/**
 * Computes all availability-derived flags in one call.
 */
export function deriveModalAvailability(
  preflight: PreflightResult | null,
  modifierGroups: ModifierGroup[],
  selected: SelectionMap,
): ModalAvailability {
  const selectionBlockedIds = computeBlockedSelectionIds(modifierGroups, selected);

  return {
    isLowStock: deriveIsLowStock(preflight),
    unavailable: preflight?.ok === true && preflight.available === false,
    hasBlockedSelections: selectionBlockedIds.size > 0,
    selectionBlockedIds,
  };
}

// ── Full validation shape ─────────────────────────────────────────────────────

/**
 * Derives whether the add-to-cart button should be enabled, plus a hint string.
 */
export function deriveModalValidation(
  preflight: PreflightResult | null,
  modifierGroups: ModifierGroup[],
  selected: SelectionMap,
  availability: ModalAvailability,
  phase: CartPhase,
  unitPriceCents: number,
  preflightLoading: boolean,
): ModalValidation {
  const modifierRulesOk = modifierGroups.every((g) =>
    isSelectionValidForGroup(g, selected[g.id] ?? []),
  );

  const canAdd =
    phase === 'idle' &&
    preflight?.ok === true &&
    preflight.available === true &&
    unitPriceCents > 0 &&
    !preflightLoading &&
    modifierRulesOk &&
    !availability.hasBlockedSelections;

  const requiredHint = buildRequiredHint(modifierGroups, selected);

  return { modifierRulesOk, canAdd, requiredHint };
}