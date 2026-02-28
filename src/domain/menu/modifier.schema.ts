// src/domain/menu/modifier.schema.ts
// ============================================================================
// MODIFIER SCHEMA — Pure TypeScript validation rules
// ============================================================================
// No external validation library dependency.
// Uses MODIFIER_LIMITS constants as the source of truth for bounds.
// ============================================================================

import {
  MODIFIER_LIMITS,
} from './modifier.constants'
import type {
  ModifierGroupWritePayload,
  ModifierWritePayload,
  ModifierGroupValidationResult,
  ModifierValidationResult,
} from '@/types/admin-menu'

// ─────────────────────────────────────────────────────────────────────────────
// Group schema
// ─────────────────────────────────────────────────────────────────────────────

export function validateModifierGroupPayload(
  p: Partial<ModifierGroupWritePayload>,
): ModifierGroupValidationResult {
  const errors: ModifierGroupValidationResult['errors'] = {}

  // name
  if (!p.name?.trim()) {
    errors.name = 'Group name is required'
  } else if (p.name.trim().length > MODIFIER_LIMITS.GROUP_NAME_MAX) {
    errors.name = `Group name must be ${MODIFIER_LIMITS.GROUP_NAME_MAX} characters or fewer`
  }

  // description
  if (p.description && p.description.length > MODIFIER_LIMITS.GROUP_DESC_MAX) {
    errors.description = `Description must be ${MODIFIER_LIMITS.GROUP_DESC_MAX} characters or fewer`
  }

  // type
  if (!p.type || !['radio', 'checkbox', 'quantity'].includes(p.type)) {
    errors.type = 'Invalid group type'
  }

  // min_selections
  if (p.min_selections !== undefined && p.min_selections !== null) {
    if (!Number.isInteger(p.min_selections) || p.min_selections < 0) {
      errors.min_selections = 'Minimum selections must be a non-negative integer'
    }
  }

  // max_selections
  if (p.max_selections !== undefined && p.max_selections !== null) {
    if (!Number.isInteger(p.max_selections) || p.max_selections < 1) {
      errors.max_selections = 'Maximum selections must be a positive integer'
    }
    if (
      p.min_selections !== undefined &&
      p.min_selections !== null &&
      p.max_selections < p.min_selections
    ) {
      errors.max_selections = 'Maximum must be greater than or equal to minimum'
    }
  }

  // required + min_selections consistency
  if (p.required && p.type === 'radio' && p.min_selections === 0) {
    // radio required always means min 1 — not an error, just auto-corrected in service
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modifier schema
// ─────────────────────────────────────────────────────────────────────────────

export function validateModifierPayload(
  p: Partial<Omit<ModifierWritePayload, 'modifier_group_id'>>,
): ModifierValidationResult {
  const errors: ModifierValidationResult['errors'] = {}

  // name
  if (!p.name?.trim()) {
    errors.name = 'Modifier name is required'
  } else if (p.name.trim().length > MODIFIER_LIMITS.MODIFIER_NAME_MAX) {
    errors.name = `Modifier name must be ${MODIFIER_LIMITS.MODIFIER_NAME_MAX} characters or fewer`
  }

  // price_adjustment
  if (p.price_adjustment !== undefined) {
    if (isNaN(p.price_adjustment)) {
      errors.price_adjustment = 'Price must be a number'
    } else if (p.price_adjustment < MODIFIER_LIMITS.MIN_PRICE_ADJUSTMENT) {
      errors.price_adjustment = `Price cannot be less than ${MODIFIER_LIMITS.MIN_PRICE_ADJUSTMENT}`
    } else if (p.price_adjustment > MODIFIER_LIMITS.MAX_PRICE_ADJUSTMENT) {
      errors.price_adjustment = `Price cannot exceed ${MODIFIER_LIMITS.MAX_PRICE_ADJUSTMENT}`
    }
  }

  // sort_order
  if (p.sort_order !== undefined && (!Number.isInteger(p.sort_order) || p.sort_order < 0)) {
    errors.sort_order = 'Sort order must be a non-negative integer'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}