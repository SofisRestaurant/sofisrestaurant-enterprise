// src/domain/menu/modifier.validation.ts
// ============================================================================
// MODIFIER VALIDATION — Order-time selection validation
// ============================================================================
// Validates customer selections against group rules.
// Called by PricingEngine and MenuItemModal before allowing add-to-cart.
// ============================================================================

import type { ModifierGroup, SelectedModifier, ConfigurationValidation } from '@/domain/menu/menu.types'

export interface GroupValidationResult {
  valid:      boolean
  groupId:    string
  groupName:  string
  error?:     string
  code?:      'REQUIRED_MISSING' | 'MIN_NOT_MET' | 'MAX_EXCEEDED' | 'UNAVAILABLE'
}

// ─────────────────────────────────────────────────────────────────────────────
// Single group validation
// ─────────────────────────────────────────────────────────────────────────────

export function validateGroupSelection(
  group:      ModifierGroup,
  selections: SelectedModifier[],
): GroupValidationResult {
  const base = { groupId: group.id, groupName: group.name }

  if (group.required && selections.length === 0) {
    return { ...base, valid: false, error: `${group.name} is required`, code: 'REQUIRED_MISSING' }
  }

  if (selections.length === 0) return { ...base, valid: true }

  const availableIds = new Set(group.modifiers.map((m) => m.id))
  const unavailable  = selections.filter((s) => !availableIds.has(s.id))
  if (unavailable.length > 0) {
    return { ...base, valid: false, error: `Some selections are no longer available`, code: 'UNAVAILABLE' }
  }

  if (group.min_selections > 0 && selections.length < group.min_selections) {
    return {
      ...base, valid: false,
      error: `Please select at least ${group.min_selections} option${group.min_selections > 1 ? 's' : ''}`,
      code: 'MIN_NOT_MET',
    }
  }

  if (group.max_selections !== null && selections.length > group.max_selections) {
    return {
      ...base, valid: false,
      error: `Maximum ${group.max_selections} selection${group.max_selections > 1 ? 's' : ''} allowed`,
      code: 'MAX_EXCEEDED',
    }
  }

  return { ...base, valid: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Full item configuration validation
// ─────────────────────────────────────────────────────────────────────────────

export function validateItemConfiguration(
  groups:            ModifierGroup[],
  selectedModifiers: Record<string, SelectedModifier[]>,
): ConfigurationValidation {
  const errors: Record<string, string> = {}
  const results: GroupValidationResult[] = []

  for (const group of groups) {
    const result = validateGroupSelection(group, selectedModifiers[group.id] ?? [])
    results.push(result)
    if (!result.valid && result.error) errors[group.id] = result.error
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * Returns ordered list of group IDs with validation errors.
 * Used by modal to scroll to the first error.
 */
export function getFirstInvalidGroupId(
  groups:  ModifierGroup[],
  errors:  Record<string, string>,
): string | null {
  for (const group of groups) {
    if (errors[group.id]) return group.id
  }
  return null
}