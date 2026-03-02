// ============================================================================
// src/domain/menu/menu.types.ts
// MENU DOMAIN TYPES — canonical, strict, app-safe
// ============================================================================
// Goals:
// - Ensure MenuItemPublic.modifier_groups is ALWAYS ModifierGroup[] (never {} / null)
// - Ensure image_url is string | null (so cart payload can map safely)
// - Provide CartItemModifier / SelectedModifier types used by PricingEngine + services
// - Provide MenuItem alias used by legacy imports
// ============================================================================

/* ─────────────────────────────────────────────────────────────
   Primitives
──────────────────────────────────────────────────────────── */

export type MenuCategory =
  | 'appetizers'
  | 'entrees'
  | 'desserts'
  | 'drinks'
  | 'lunch'
  | 'breakfast'
  | 'specials'

export type ModifierGroupType = 'radio' | 'checkbox' | 'quantity'

/* ─────────────────────────────────────────────────────────────
   Modifier Layer
──────────────────────────────────────────────────────────── */

export interface Modifier {
  id: string
  modifier_group_id: string
  name: string
  /** cents */
  price_adjustment: number
  available: boolean
  sort_order: number
}

export interface ModifierGroup {
  id: string
  name: string
  description: string | null
  type: ModifierGroupType
  required: boolean
  min_selections: number
  max_selections: number | null
  sort_order: number
  active: boolean
  modifiers: Modifier[]
}

/* ─────────────────────────────────────────────────────────────
   Base Menu Model (DB-compatible shape)
──────────────────────────────────────────────────────────── */

export interface MenuItemBase {
  id: string
  name: string
  inventory_count?: number | null
  price: number
  category: MenuCategory
  featured: boolean
  available: boolean
  sort_order: number

  description: string | null
  /** IMPORTANT: always string | null (not undefined, not {}) */
  image_url: string | null

  spicy_level: number | null
  is_vegetarian: boolean
  is_vegan: boolean
  is_gluten_free: boolean
  allergens: string[]
  pairs_with: string[]

  /** IMPORTANT: ALWAYS an array */
  modifier_groups: ModifierGroup[]

  created_at: string
  updated_at: string | null
}

/* ─────────────────────────────────────────────────────────────
   Public + Admin Models
──────────────────────────────────────────────────────────── */

export type MenuItemPublic = MenuItemBase

export interface InventoryFields {
  low_stock_threshold: number
  inventory_count?: number | null;
}

export interface MenuItemAdmin extends MenuItemBase, InventoryFields {
  popularity_score: number | null
}

/** Back-compat alias used across repo */
export type MenuItem = MenuItemPublic

/* ─────────────────────────────────────────────────────────────
   Selection + Cart Modifier Shapes (PricingEngine / Checkout)
──────────────────────────────────────────────────────────── */

/** What a single selected modifier looks like in the cart. */
export interface SelectedModifier {
  id: string
  name: string
  price_adjustment: number
}

/** What a modifier group looks like inside a cart item. */
export interface CartItemModifier {
  modifier_group_id: string
  selections: SelectedModifier[]
}

/* ─────────────────────────────────────────────────────────────
   Pricing & Validation Types (used by UI / engines)
──────────────────────────────────────────────────────────── */

export interface PricingBreakdown {
  base_price: number
  modifier_total: number
  unit_price: number
  quantity: number
  subtotal: number
  tax: number
  total: number
  pricing_hash: string
}

export interface ConfigurationValidation {
  valid: boolean
  errors: Record<string, string>
}
export interface ModifierValidationResult { ok: boolean; code?: string; message?: string }