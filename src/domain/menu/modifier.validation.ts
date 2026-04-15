// src/domain/menu/modifier.validation.ts
// ============================================================================
// MODIFIER VALIDATION — Order-time selection validation
// ============================================================================
// Validates customer selections against group rules before add-to-cart.
//
// Three layers (call in order — or use assertCheckoutReady as the single gate):
//
//   1. assertSelectionMapIntegrity — THROWS on structural/programming errors:
//        missing modifier_group_id, mismatched keys, non-array values.
//
//   2. validateItemConfiguration — RETURNS structured errors for user input:
//        required groups, min/max violations, unavailable selections,
//        duplicate selections within a group.
//        Internally calls assertSelectionMapIntegrity first — callers cannot
//        bypass the integrity check by calling validate directly.
//
//   3. assertCheckoutReady — unified pre-checkout gate.
//        Calls assertSelectionMapIntegrity then validateItemConfiguration.
//        THROWS if either step fails.
//        This is the only function checkout callers should invoke.
//
// Error handling contract:
//   THROW  → programming/structural errors (corrupt state, wrong group ids)
//   RETURN → user input errors (missing required selection, max exceeded)
// ============================================================================

import type {
  ModifierGroup,
  SelectedModifier,
  ConfigurationValidation,
} from '@/domain/menu/menu.types';

// ─────────────────────────────────────────────────────────────────────────────
// Result type
// ─────────────────────────────────────────────────────────────────────────────

export interface GroupValidationResult {
  readonly valid: boolean;
  readonly groupId: string;
  readonly groupName: string;
  readonly error?: string;
  readonly code?:
    | 'REQUIRED_MISSING'
    | 'MIN_NOT_MET'
    | 'MAX_EXCEEDED'
    | 'UNAVAILABLE'
    | 'DUPLICATE_SELECTION'
    | 'CROSS_GROUP_CONTAMINATION';
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: cross-group contamination guard (throws — programming error)
// ─────────────────────────────────────────────────────────────────────────────

function assertNoContamination(groupId: string, selections: readonly SelectedModifier[]): void {
  for (const s of selections) {
    if (s.modifier_group_id !== groupId) {
      throw new Error(
        `validateGroupSelection: selection(id=${s.id}) has ` +
        `modifier_group_id="${s.modifier_group_id}" but was validated against ` +
        `group(id=${groupId}). Cross-group contamination — corrupt selection state.`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: duplicate modifier ID detection within one group
// ─────────────────────────────────────────────────────────────────────────────

function findDuplicateSelectionId(
  selections: readonly SelectedModifier[],
): string | null {
  const seen = new Set<string>();
  for (const s of selections) {
    if (seen.has(s.id)) return s.id;
    seen.add(s.id);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Selection map integrity assertion (throws — structural/programming error)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assert structural integrity of the selection map.
 *
 * THROWS (not returns) because violations here indicate corrupt state upstream,
 * not user input errors.
 *
 * Checks:
 *   - Each value is an array.
 *   - Each SelectedModifier has a non-empty modifier_group_id.
 *   - Each modifier_group_id matches the map key it is stored under.
 */
export function assertSelectionMapIntegrity(
  selectedModifiers: Record<string, readonly SelectedModifier[]>,
): void {
  for (const [groupId, selections] of Object.entries(selectedModifiers)) {
    if (!Array.isArray(selections)) {
      throw new Error(
        `assertSelectionMapIntegrity: selections for group(id=${groupId}) is not an array`,
      );
    }
    for (const s of selections) {
      if (typeof s.modifier_group_id !== 'string' || s.modifier_group_id.length === 0) {
        throw new Error(
          `assertSelectionMapIntegrity: selection(id=${s.id}) is missing modifier_group_id`,
        );
      }
      if (s.modifier_group_id !== groupId) {
        throw new Error(
          `assertSelectionMapIntegrity: selection(id=${s.id}) has ` +
          `modifier_group_id="${s.modifier_group_id}" but is stored under key "${groupId}"`,
        );
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Single group validation (returns user-facing errors)
// ─────────────────────────────────────────────────────────────────────────────

export function validateGroupSelection(
  group: ModifierGroup,
  selections: readonly SelectedModifier[],
): GroupValidationResult {
  const base = { groupId: group.id, groupName: group.name } as const;

  // Structural error — throws, not a soft return
  assertNoContamination(group.id, selections);

  // Duplicate selections within the same group
  const duplicateId = findDuplicateSelectionId(selections);
  if (duplicateId !== null) {
    return {
      ...base,
      valid: false,
      error: `Duplicate selection(id=${duplicateId}) within group "${group.name}"`,
      code: 'DUPLICATE_SELECTION',
    };
  }

  // Required group with zero selections
  if (group.required && selections.length === 0) {
    return {
      ...base,
      valid: false,
      error: `${group.name} is required`,
      code: 'REQUIRED_MISSING',
    };
  }

  // Nothing selected — remaining checks need at least one selection
  if (selections.length === 0) {
    return { ...base, valid: true };
  }

  // Selections must reference modifiers that exist in this group
  const availableIds = new Set(group.modifiers.map((m) => m.id));
  const unavailable = selections.filter((s) => !availableIds.has(s.id));
  if (unavailable.length > 0) {
    return {
      ...base,
      valid: false,
      error: `Some selections are no longer available`,
      code: 'UNAVAILABLE',
    };
  }

  // min_selections
  if (group.min_selections > 0 && selections.length < group.min_selections) {
    return {
      ...base,
      valid: false,
      error: `Please select at least ${group.min_selections} option${group.min_selections > 1 ? 's' : ''}`,
      code: 'MIN_NOT_MET',
    };
  }

  // max_selections
  if (group.max_selections !== null && selections.length > group.max_selections) {
    return {
      ...base,
      valid: false,
      error: `Maximum ${group.max_selections} selection${group.max_selections > 1 ? 's' : ''} allowed`,
      code: 'MAX_EXCEEDED',
    };
  }

  return { ...base, valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Full item configuration validation (returns user-facing errors)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate all modifier groups for an item.
 *
 * Always calls assertSelectionMapIntegrity first — callers cannot bypass
 * the structural check by invoking this function directly.
 *
 * A group present in `groups` but absent from `selectedModifiers` is treated
 * as zero selections. This produces REQUIRED_MISSING for required groups.
 *
 * Returns a frozen ConfigurationValidation so callers cannot mutate the errors
 * record after the fact.
 */
export function validateItemConfiguration(
  groups: readonly ModifierGroup[],
  selectedModifiers: Record<string, readonly SelectedModifier[]>,
): Readonly<ConfigurationValidation> {
  // Structural integrity check always runs first — cannot be bypassed
  assertSelectionMapIntegrity(selectedModifiers);

  const errors: Record<string, string> = {};

  for (const group of groups) {
    const selections = selectedModifiers[group.id];
    // Absent key = zero selections for this group
    const result = validateGroupSelection(group, selections !== undefined ? selections : []);
    if (!result.valid && result.error) {
      errors[group.id] = result.error;
    }
  }

  return Object.freeze({ valid: Object.keys(errors).length === 0, errors: Object.freeze(errors) });
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-checkout gate — unified entry point for checkout callers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single pre-checkout assertion that guarantees selections are complete,
 * valid, and structurally consistent.
 *
 * THROWS on any failure — checkout must not proceed if this throws.
 *
 * Steps (in order — neither can be skipped):
 *   1. assertSelectionMapIntegrity — structural integrity (corrupt state → throw)
 *   2. validateItemConfiguration   — user input completeness (missing/invalid → throw)
 *
 * Checkout callers MUST use this function instead of calling the two steps
 * separately. This is the only function that provides the full guarantee.
 *
 * @throws Error with a message listing all invalid groups when validation fails.
 */
export function assertCheckoutReady(
  groups: readonly ModifierGroup[],
  selectedModifiers: Record<string, readonly SelectedModifier[]>,
): void {
  // Step 1: structural integrity — throws immediately on corrupt state
  assertSelectionMapIntegrity(selectedModifiers);

  // Step 2: user input validation — collect all errors then throw once
  const result = validateItemConfiguration(groups, selectedModifiers);

  if (!result.valid) {
    const errorLines = Object.entries(result.errors)
      .map(([groupId, error]) => `  group(id=${groupId}): ${error}`)
      .join('\n');
    throw new Error(
      `assertCheckoutReady: selection validation failed:\n${errorLines}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helper — first invalid group for scroll-to-error
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the first group ID (in display order) that has a validation error.
 * Used by the modal to scroll to the first problem.
 */
export function getFirstInvalidGroupId(
  groups: readonly ModifierGroup[],
  errors: Readonly<Record<string, string>>,
): string | null {
  for (const group of groups) {
    if (errors[group.id]) return group.id;
  }
  return null;
}