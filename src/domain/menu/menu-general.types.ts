// src/domain/menu/menu-general.types.ts
// ============================================================================
// MENU GENERAL TYPES — Shared domain types for menu item general fields
// ============================================================================
// Lives in domain/ so both the validation schema and the UI can import from
// here. This breaks the backwards dependency that would exist if the schema
// imported from pages/Admin/components.
//
// Dependency flow:
//   UI (MenuGeneralTab)  →  domain (menu-general.types)
//   domain (schema)      →  domain (menu-general.types)
//   domain               →  never imports from UI
// ============================================================================

import type { MenuCategory } from '@/domain/menu/menu.types'

// ─────────────────────────────────────────────────────────────────────────────
// Form state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All fields as strings because HTML inputs always yield strings.
 * The schema layer is responsible for parsing and validating these.
 * The UI layer owns no validation logic — it delegates entirely to the schema.
 */
export interface GeneralTabFormState {
  name:                string
  category:            MenuCategory
  price:               string
  description:         string
  image_url:           string
  featured:            boolean
  available:           boolean
  is_vegetarian:       boolean
  is_vegan:            boolean
  is_gluten_free:      boolean
  spicy_level:         string
  sort_order:          string
  inventory_count:     string
  low_stock_threshold: string
  popularity_score:    string
}

export const GENERAL_TAB_EMPTY: GeneralTabFormState = {
  name:                '',
  category:            'entrees',
  price:               '',
  description:         '',
  image_url:           '',
  featured:            false,
  available:           true,
  is_vegetarian:       false,
  is_vegan:            false,
  is_gluten_free:      false,
  spicy_level:         '',
  sort_order:          '',
  inventory_count:     '',
  low_stock_threshold: '',
  popularity_score:    '',
}

// ─────────────────────────────────────────────────────────────────────────────
// Field identifiers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Union of all validatable field names.
 * Used as keys in validation error maps and per-field validators.
 * Excludes boolean flags (featured, available, dietary) — they can't be invalid.
 */
export type MenuItemField =
  | 'name'
  | 'category'
  | 'price'
  | 'description'
  | 'image_url'
  | 'spicy_level'
  | 'sort_order'
  | 'inventory_count'
  | 'low_stock_threshold'
  | 'popularity_score'

// ─────────────────────────────────────────────────────────────────────────────
// Validation result
// ─────────────────────────────────────────────────────────────────────────────

export interface MenuItemValidationResult {
  valid:  boolean
  errors: Partial<Record<MenuItemField, string>>
}