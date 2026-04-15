// src/domain/menu/modifier.schema.ts
// ============================================================================
// MODIFIER SCHEMA — Admin write-payload validation
// ============================================================================
// Validates ModifierGroupWritePayload and ModifierWritePayload before persist.
// Uses MODIFIER_LIMITS constants as the source of truth for bounds.
//
// Rules:
//   - Every invalid field produces an error entry — no silent skipping.
//   - No ?? or || fallbacks inside validation logic.
//   - required + min_selections contradiction is an explicit error, not a
//     silent auto-correction.
//   - DB runtime fields (required, available) are validated internally using
//     local tracking variables — they are NOT exposed in the public error
//     contract because they are not part of the API payload type surface.
// ============================================================================

import { MODIFIER_LIMITS } from './modifier.constants';
import type {
  ModifierGroupWritePayload,
  ModifierWritePayload,
  ModifierGroupValidationResult,
  ModifierValidationResult,
} from '@/types/admin-menu';

// ─────────────────────────────────────────────────────────────────────────────
// Group schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal input type — extends the API payload with DB runtime fields that
 * exist at the service layer but are not part of the API payload type contract.
 * This type is NEVER exported; it is scoped to this validator only.
 */
type ModifierGroupValidationInput = Partial<ModifierGroupWritePayload> & {
  /**
   * DB runtime field — validated internally, not exposed in error contract.
   * Accepts null because Supabase Insert types generate boolean | null | undefined
   * for nullable columns. Null is coerced to "not set" inside the validator.
   */
  required?: boolean | null;
  /** DB runtime field. Accepts null for same reason as required above. */
  active?: boolean | null;
};

export function validateModifierGroupPayload(
  p: ModifierGroupValidationInput,
): ModifierGroupValidationResult {
  const errors: ModifierGroupValidationResult['errors'] = {};

  // name — required, non-empty, bounded
  if (typeof p.name !== 'string' || p.name.trim().length === 0) {
    errors.name = 'Group name is required';
  } else if (p.name.trim().length > MODIFIER_LIMITS.GROUP_NAME_MAX) {
    errors.name = `Group name must be ${MODIFIER_LIMITS.GROUP_NAME_MAX} characters or fewer`;
  }

  // description — optional but bounded when present
  if (p.description !== undefined && p.description !== null) {
    if (typeof p.description !== 'string') {
      errors.description = 'Description must be a string';
    } else if (p.description.length > MODIFIER_LIMITS.GROUP_DESC_MAX) {
      errors.description = `Description must be ${MODIFIER_LIMITS.GROUP_DESC_MAX} characters or fewer`;
    }
  }

  // type — required, must be a known value
  if (p.type === undefined || p.type === null) {
    errors.type = 'Group type is required';
  } else if (!(['radio', 'checkbox', 'quantity'] as string[]).includes(p.type)) {
    errors.type = `Invalid group type "${p.type}"`;
  }

  // required — DB runtime field. null is treated identically to undefined (not set).
  // Validated internally; result tracked in a local variable so the public error
  // contract (API layer) is not polluted. The overall `valid` flag still reflects this.
  let _requiredValid = true;
  if (p.required === undefined || p.required === null) {
    _requiredValid = false;
  } else if (typeof p.required !== 'boolean') {
    _requiredValid = false;
  }

  // min_selections — required, non-negative integer
  if (p.min_selections === undefined || p.min_selections === null) {
    errors.min_selections = 'min_selections is required';
  } else if (!Number.isInteger(p.min_selections) || p.min_selections < 0) {
    errors.min_selections = 'Minimum selections must be a non-negative integer';
  }

  // max_selections — optional (null = unlimited), but if present must be valid
  if (p.max_selections !== undefined && p.max_selections !== null) {
    if (!Number.isInteger(p.max_selections) || p.max_selections < 1) {
      errors.max_selections = 'Maximum selections must be a positive integer';
    } else if (
      p.min_selections !== undefined &&
      p.min_selections !== null &&
      Number.isInteger(p.min_selections) &&
      p.max_selections < p.min_selections
    ) {
      errors.max_selections = 'Maximum must be greater than or equal to minimum';
    }
  }

  // required + min_selections contradiction — explicit error, never auto-correct.
  // Uses _requiredValid local flag instead of a typed error key.
  if (
    _requiredValid &&
    !errors.min_selections &&
    p.required === true &&
    p.type === 'radio' &&
    typeof p.min_selections === 'number' &&
    p.min_selections === 0
  ) {
    errors.min_selections =
      'A required radio group must have min_selections >= 1; set it explicitly';
  }

  if (
    _requiredValid &&
    !errors.min_selections &&
    p.required === true &&
    typeof p.min_selections === 'number' &&
    p.min_selections === 0 &&
    p.type !== 'radio'
  ) {
    errors.min_selections =
      'A required group must have min_selections >= 1; set it explicitly';
  }

  const apiErrorsValid = Object.keys(errors).length === 0;
  return { valid: apiErrorsValid && _requiredValid, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Modifier schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal input type — extends the API payload with DB runtime fields.
 * NOT exported; scoped to this validator only.
 */
type ModifierValidationInput = Partial<Omit<ModifierWritePayload, 'modifier_group_id'>> & {
  /**
   * DB runtime field — validated internally, not exposed in error contract.
   * Accepts null because Supabase Insert types generate boolean | null | undefined
   * for nullable columns. Null is coerced to "not set" inside the validator.
   */
  available?: boolean | null;
};

export function validateModifierPayload(
  p: ModifierValidationInput,
): ModifierValidationResult {
  const errors: ModifierValidationResult['errors'] = {};

  // name — required, non-empty, bounded
  if (typeof p.name !== 'string' || p.name.trim().length === 0) {
    errors.name = 'Modifier name is required';
  } else if (p.name.trim().length > MODIFIER_LIMITS.MODIFIER_NAME_MAX) {
    errors.name = `Modifier name must be ${MODIFIER_LIMITS.MODIFIER_NAME_MAX} characters or fewer`;
  }

  // price_adjustment — required when present; must be a finite integer
  if (p.price_adjustment !== undefined) {
    if (typeof p.price_adjustment !== 'number' || !Number.isFinite(p.price_adjustment)) {
      errors.price_adjustment = 'Price must be a finite number';
    } else if (!Number.isInteger(p.price_adjustment)) {
      errors.price_adjustment = 'Price must be an integer (cents)';
    } else if (p.price_adjustment < MODIFIER_LIMITS.MIN_PRICE_ADJUSTMENT) {
      errors.price_adjustment = `Price cannot be less than ${MODIFIER_LIMITS.MIN_PRICE_ADJUSTMENT}`;
    } else if (p.price_adjustment > MODIFIER_LIMITS.MAX_PRICE_ADJUSTMENT) {
      errors.price_adjustment = `Price cannot exceed ${MODIFIER_LIMITS.MAX_PRICE_ADJUSTMENT}`;
    }
  }

  // sort_order — when present must be a non-negative integer
  if (p.sort_order !== undefined) {
    if (typeof p.sort_order !== 'number' || !Number.isInteger(p.sort_order) || p.sort_order < 0) {
      errors.sort_order = 'Sort order must be a non-negative integer';
    }
  }

  // available — DB runtime field. null is treated identically to undefined (not set).
  // Validated internally; result tracked in a local variable so the public error
  // contract (API layer) is not polluted.
  let _availableValid = true;
  if (p.available !== undefined && p.available !== null && typeof p.available !== 'boolean') {
    _availableValid = false;
  }

  const apiErrorsValid = Object.keys(errors).length === 0;
  return { valid: apiErrorsValid && _availableValid, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime relationship guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assert that every modifier in a group carries that group's id.
 * Throws if any modifier has a mismatched modifier_group_id.
 * Call this after loading groups from any external source.
 */
export function assertGroupModifierRelationships(
  groups: ReadonlyArray<{
    id: string;
    modifiers: ReadonlyArray<{ id: string; modifier_group_id: string }>;
  }>,
): void {
  for (const group of groups) {
    if (!group.id || typeof group.id !== 'string') {
      throw new Error(`assertGroupModifierRelationships: group has invalid id: ${JSON.stringify(group.id)}`);
    }
    for (const m of group.modifiers) {
      if (m.modifier_group_id !== group.id) {
        throw new Error(
          `assertGroupModifierRelationships: modifier(id=${m.id}) has ` +
          `modifier_group_id="${m.modifier_group_id}" but is listed under group(id=${group.id}). ` +
          `Relationship integrity violation.`,
        );
      }
    }
  }
}