// =============================================================================
// PATH: src/modules/menu/utils/modal/modalLabels.ts
// =============================================================================
// Derives text labels for the Add-to-Order button and other dynamic text.
//
// ⚠️  DO NOT duplicate:
//   - parseTags → import from ../modifierGuards
//   - safeStr   → import from ../menuItemGuards
// =============================================================================

import type { CartPhase } from '@/domain/menu/menu-modal.types';

// ── Add-button label ──────────────────────────────────────────────────────────

export interface AddButtonLabelParams {
  invalidItem: boolean;
  preflightLoading: boolean;
  phase: CartPhase;
  unavailable: boolean;
  modifierRulesOk: boolean;
}

/**
 * Derives the correct label for the "Add to Order" button based on current state.
 * Priority order mirrors the original ternary chain exactly.
 */
export function deriveAddButtonLabel({
  invalidItem,
  preflightLoading,
  phase,
  unavailable,
  modifierRulesOk,
}: AddButtonLabelParams): string {
  if (invalidItem) return 'Unavailable';
  if (preflightLoading) return 'Checking…';
  if (phase === 'adding') return 'Adding…';
  if (phase === 'success') return 'Added!';
  if (unavailable) return 'Unavailable';
  if (!modifierRulesOk) return 'Choose options';
  return 'Add to Order';
}

// ── Modifier validation inline message ───────────────────────────────────────

/**
 * Returns the inline min/max guidance shown inside an invalid modifier group.
 */
export function deriveGroupValidationMessage(
  selectedCount: number,
  min: number,
  max: number | null,
): string {
  if (selectedCount < min) return `Select at least ${min}`;
  if (max != null) return `Select up to ${max}`;
  return 'Selection required';
}

// ── Modifier price adjustment label ──────────────────────────────────────────

import { fmtUsdFromCents } from '../menuItemGuards';

/**
 * Returns a modifier's price-adjustment string, e.g. "+$1.50" | "-$0.50" | "No extra cost".
 */
export function deriveModifierPriceLabel(priceAdjustmentCents: number): string {
  if (priceAdjustmentCents === 0) return 'No extra cost';
  const sign = priceAdjustmentCents > 0 ? '+' : '';
  return `${sign}${fmtUsdFromCents(priceAdjustmentCents)}`;
}

// ── Notes char count label ────────────────────────────────────────────────────

import { clampInt } from '../menuItemGuards';

/**
 * Returns the "{current} / {max}" character-count label for the notes field.
 */
export function deriveNotesCountLabel(notesLength: number, maxLength: number): string {
  return `${clampInt(notesLength, 0, 999)} / ${maxLength}`;
}