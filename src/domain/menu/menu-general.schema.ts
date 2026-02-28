// src/domain/menu/menu-general.schema.ts
// ============================================================================
// MENU GENERAL SCHEMA — Validation for menu item general fields
// ============================================================================
// Pure TypeScript validation — no Zod dependency.
// Mirrors the constraints of the menu_items TABLE (confirmed Feb 2026).
//
// Dependency flow:
//   This file imports from domain/ only. Never from UI or pages/.
//
// Two entry points:
//   validateMenuItemPayload(payload)  — service-layer writes (typed values)
//   validateGeneralTabForm(form)      — admin UI form (all string fields)
//
// Both return MenuItemValidationResult so callers can show per-field messages.
// ============================================================================

import type { MenuItemWritePayload } from '@/services/menu.service'
import type {
  GeneralTabFormState,
  MenuItemField,
  MenuItemValidationResult,
} from './menu-general.types'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const MENU_ITEM_LIMITS = {
  name:                { min: 1,    max: 100    },
  description:         { max: 500               },
  image_url:           { max: 2048              },
  price:               { min: 0.01, max: 9999.99 },
  spicy_level:         { min: 0,    max: 5      },
  sort_order:          { min: 0,    max: 99999  },
  inventory_count:     { min: 0,    max: 999999 },
  low_stock_threshold: { min: 0,    max: 999999 },
  popularity_score:    { min: 0,    max: 999999 },
} as const

/**
 * `as const` + indexed type: adding a category here automatically widens
 * ValidCategory — no manual sync required anywhere.
 */
export const VALID_CATEGORIES = [
  'appetizers', 'entrees', 'desserts', 'drinks', 'lunch', 'breakfast', 'specials',
] as const

export type ValidCategory = typeof VALID_CATEGORIES[number]

// ─────────────────────────────────────────────────────────────────────────────
// Core field validators — pure functions, return error string or null
// ─────────────────────────────────────────────────────────────────────────────

function validateName(v: string | undefined): string | null {
  if (!v?.trim()) return 'Name is required'
  if (v.trim().length > MENU_ITEM_LIMITS.name.max)
    return `Name must be ${MENU_ITEM_LIMITS.name.max} characters or fewer`
  return null
}

function validateCategory(v: string | undefined): string | null {
  if (!v) return 'Category is required'
  if (!(VALID_CATEGORIES as readonly string[]).includes(v))
    return `Category must be one of: ${VALID_CATEGORIES.join(', ')}`
  return null
}

function validatePrice(v: number | undefined): string | null {
  if (v === undefined || v === null) return 'Price is required'
  if (isNaN(v))  return 'Price must be a number'
  if (v < MENU_ITEM_LIMITS.price.min)
    return `Price must be at least $${MENU_ITEM_LIMITS.price.min.toFixed(2)}`
  if (v > MENU_ITEM_LIMITS.price.max)
    return `Price cannot exceed $${MENU_ITEM_LIMITS.price.max.toFixed(2)}`
  return null
}

function validateDescription(v: string | undefined): string | null {
  if (!v) return null
  if (v.length > MENU_ITEM_LIMITS.description.max)
    return `Description must be ${MENU_ITEM_LIMITS.description.max} characters or fewer`
  return null
}

function validateImageUrl(v: string | undefined): string | null {
  if (!v) return null
  if (v.length > MENU_ITEM_LIMITS.image_url.max)
    return `Image URL is too long (max ${MENU_ITEM_LIMITS.image_url.max} characters)`
  if (!/^https?:\/\/.+/.test(v)) return 'Image URL must start with http:// or https://'
  return null
}

function validateSpicyLevel(v: number | undefined): string | null {
  if (v === undefined || v === null) return null
  if (!Number.isInteger(v)) return 'Spicy level must be a whole number'
  if (v < MENU_ITEM_LIMITS.spicy_level.min || v > MENU_ITEM_LIMITS.spicy_level.max)
    return `Spicy level must be between ${MENU_ITEM_LIMITS.spicy_level.min} and ${MENU_ITEM_LIMITS.spicy_level.max}`
  return null
}

function validateNonNegativeInt(
  v:         number | undefined,
  fieldName: string,
  max:       number,
): string | null {
  if (v === undefined || v === null) return null
  if (isNaN(v))             return `${fieldName} must be a number`
  if (!Number.isInteger(v)) return `${fieldName} must be a whole number`
  if (v < 0)                return `${fieldName} cannot be negative`
  if (v > max)              return `${fieldName} cannot exceed ${max.toLocaleString()}`
  return null
}

function validateStockConsistency(
  inventoryCount: number | undefined,
  threshold:      number | undefined,
): string | null {
  if (inventoryCount === undefined || threshold === undefined) return null
  if (threshold > inventoryCount)
    return 'Low stock threshold cannot exceed inventory count'
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper — attach error to map only if non-null
// ─────────────────────────────────────────────────────────────────────────────

function attach(
  errors: MenuItemValidationResult['errors'],
  field:  MenuItemField,
  msg:    string | null,
): void {
  if (msg) errors[field] = msg
}

// ─────────────────────────────────────────────────────────────────────────────
// Service-layer validator — typed MenuItemWritePayload
// ─────────────────────────────────────────────────────────────────────────────

export function validateMenuItemPayload(
  payload: Partial<MenuItemWritePayload>,
): MenuItemValidationResult {
  const errors: MenuItemValidationResult['errors'] = {}

  attach(errors, 'name',        validateName(payload.name))
  attach(errors, 'category',    validateCategory(payload.category))
  attach(errors, 'price',       validatePrice(payload.price))
  attach(errors, 'description', validateDescription(payload.description))
  attach(errors, 'image_url',   validateImageUrl(payload.image_url))
  attach(errors, 'spicy_level', validateSpicyLevel(payload.spicy_level))

  attach(errors, 'sort_order', validateNonNegativeInt(
    payload.sort_order, 'Sort order', MENU_ITEM_LIMITS.sort_order.max,
  ))
  attach(errors, 'inventory_count', validateNonNegativeInt(
    payload.inventory_count, 'Inventory count', MENU_ITEM_LIMITS.inventory_count.max,
  ))
  attach(errors, 'low_stock_threshold', validateNonNegativeInt(
    payload.low_stock_threshold, 'Low stock threshold', MENU_ITEM_LIMITS.low_stock_threshold.max,
  ))
  attach(errors, 'popularity_score', validateNonNegativeInt(
    payload.popularity_score, 'Popularity score', MENU_ITEM_LIMITS.popularity_score.max,
  ))

  if (!errors.inventory_count && !errors.low_stock_threshold) {
    attach(errors, 'low_stock_threshold', validateStockConsistency(
      payload.inventory_count, payload.low_stock_threshold,
    ))
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI-layer validator — GeneralTabFormState (strings, needs parsing)
// ─────────────────────────────────────────────────────────────────────────────

export function validateGeneralTabForm(
  form: GeneralTabFormState,
): MenuItemValidationResult {
  const errors: MenuItemValidationResult['errors'] = {}

  attach(errors, 'name',        validateName(form.name))
  attach(errors, 'category',    validateCategory(form.category))
  attach(errors, 'description', validateDescription(form.description || undefined))
  attach(errors, 'image_url',   validateImageUrl(form.image_url || undefined))

  // price — requires explicit parse
  if (!form.price.trim()) {
    errors.price = 'Price is required'
  } else {
    const n = parseFloat(form.price)
    attach(errors, 'price', validatePrice(isNaN(n) ? undefined : n))
  }

  // optional integer fields — only validate when non-empty, return parsed value
  const parseOptionalInt = (
    raw:   string,
    field: MenuItemField,
    label: string,
    max:   number,
    extra?: (n: number) => string | null,
  ): number | undefined => {
    if (!raw.trim()) return undefined
    const n = Number(raw)
    attach(errors, field, validateNonNegativeInt(isNaN(n) ? undefined : n, label, max))
    if (!errors[field] && !isNaN(n) && extra) attach(errors, field, extra(n))
    return isNaN(n) ? undefined : n
  }

  parseOptionalInt(
    form.spicy_level, 'spicy_level', 'Spicy level', MENU_ITEM_LIMITS.spicy_level.max,
    (n) => !Number.isInteger(n) ? 'Spicy level must be a whole number' : null,
  )
  parseOptionalInt(
    form.sort_order, 'sort_order', 'Sort order', MENU_ITEM_LIMITS.sort_order.max,
  )

  const invNum = parseOptionalInt(
    form.inventory_count, 'inventory_count', 'Inventory count', MENU_ITEM_LIMITS.inventory_count.max,
  )
  const lstNum = parseOptionalInt(
    form.low_stock_threshold, 'low_stock_threshold', 'Low stock threshold', MENU_ITEM_LIMITS.low_stock_threshold.max,
  )

  parseOptionalInt(
    form.popularity_score, 'popularity_score', 'Popularity score', MENU_ITEM_LIMITS.popularity_score.max,
  )

  // cross-field: stock consistency
  if (!errors.inventory_count && !errors.low_stock_threshold) {
    attach(errors, 'low_stock_threshold', validateStockConsistency(invNum, lstNum))
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-field validation — real-time field-level feedback
// ─────────────────────────────────────────────────────────────────────────────

export function validateMenuItemField(
  field: MenuItemField,
  form:  GeneralTabFormState,
): string | null {
  return validateGeneralTabForm(form).errors[field] ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Boolean gate — gates Save button without needing error messages
// ─────────────────────────────────────────────────────────────────────────────

export function isGeneralTabFormValid(form: GeneralTabFormState): boolean {
  return validateGeneralTabForm(form).valid
}