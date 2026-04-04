// =============================================================================
// PATH: src/modules/menu/utils/modal/modalSelection.ts
// =============================================================================
// Modal-specific selection helpers.
//
// ⚠️  DO NOT duplicate:
//   - isSelectionValidForGroup  → import from ../modifierGuards
//   - groupSelectionRangeLabel  → import from ../modifierGuards
//
// Only modal-level composition lives here.
// =============================================================================
import type {
  SelectedModifier,
  SelectionMap,
} from "@/domain/menu/menu-modal.types";
import type { ModifierGroup } from '@/domain/menu/menu.types';
import { isSelectionValidForGroup } from '../modifierGuards';
import { safeCents } from '../menuItemGuards';

// ── Flatten selections for cart payload ──────────────────────────────────────

/**
 * Flattens the SelectionMap into the flat array expected by addItem().
 * Prunes price adjustments through safeCents for type safety.
 */
export function flattenSelectionsForCart(
  modifierGroups: ModifierGroup[],
  selected: SelectionMap,
): Array<{ id: string; groupId: string; name: string; priceAdjustmentCents: number }> {
  const result: Array<{ id: string; groupId: string; name: string; priceAdjustmentCents: number }> = [];

  for (const g of modifierGroups) {
    for (const s of selected[g.id] ?? []) {
      result.push({
        id: s.id,
        groupId: s.groupId,
        name: s.name,
        priceAdjustmentCents: safeCents(s.priceAdjustment, 0),
      });
    }
  }

  return result;
}

// ── Blocked modifier IDs ──────────────────────────────────────────────────────

/**
 * Returns a Set of modifier IDs that are selected but marked unavailable.
 * Used to block the add-to-cart action and surface a warning alert.
 */
export function computeBlockedSelectionIds(
  modifierGroups: ModifierGroup[],
  selected: SelectionMap,
): Set<string> {
  const blocked = new Set<string>();

  for (const g of modifierGroups) {
    const sels = selected[g.id] ?? [];
    for (const s of sels) {
      const mod = g.modifiers.find((m) => m.id === s.id);
      if (!mod || !mod.available) blocked.add(s.id);
    }
  }

  return blocked;
}

// ── Subline label for a modifier group row ────────────────────────────────────

/**
 * Builds the short subline string shown below a modifier group button:
 *   - Radio: "Pick one • selected" / "Pick one"
 *   - Checkbox: "Pick up to 3 • 2/3" / "Pick up to 3 • 1 selected"
 */
export function buildGroupSubline(
  group: ModifierGroup,
  sels: SelectedModifier[],
  rangeLabel: string,
): string {
  const selectedCount = sels.length;
  const max = group.max_selections ?? (group.type === 'radio' ? 1 : null);

  if (group.type === 'radio') {
    return selectedCount ? `${rangeLabel} • selected` : rangeLabel;
  }

  if (max != null) {
    return `${rangeLabel} • ${selectedCount}/${max}`;
  }

  return selectedCount ? `${rangeLabel} • ${selectedCount} selected` : rangeLabel;
}

// ── Required-hint sentence ────────────────────────────────────────────────────

/**
 * Returns a human-readable sentence listing missing required groups,
 * or null if all groups pass validation.
 *
 * e.g. "Choose required options: Size, Sauce…"
 */
export function buildRequiredHint(
  modifierGroups: ModifierGroup[],
  selected: SelectionMap,
  displayLimit = 2,
): string | null {
  const missing = modifierGroups
    .filter((g) => !isSelectionValidForGroup(g, selected[g.id] ?? []))
    .map((g) => g.name);

  if (!missing.length) return null;

  const shown = missing.slice(0, displayLimit).join(', ');
  const overflow = missing.length > displayLimit ? '…' : '';

  return `Choose required options: ${shown}${overflow}`;
}