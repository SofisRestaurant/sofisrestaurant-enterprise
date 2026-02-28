// src/types/menu.ts
// ============================================================================
// MENU + CART DOMAIN TYPES
// ============================================================================
// Single source of truth. Every type here is derived from real DB schema
// confirmed in database.types.ts (Feb 2026).
// No type is duplicated in cart.types.ts or anywhere else.
// ============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

export type MenuCategory =
  | 'appetizers'
  | 'entrees'
  | 'desserts'
  | 'drinks'
  | 'lunch'
  | 'breakfast'
  | 'specials'
export type ModifierGroupType = 'radio' | 'checkbox' | 'quantity'

// ─────────────────────────────────────────────────────────────────────────────
// Modifier layer
// ─────────────────────────────────────────────────────────────────────────────

/** Matches modifiers table row */
export interface Modifier {
  id:                string
  modifier_group_id: string
  name:              string
  price_adjustment:  number   // 0.00 if no price change
  available:         boolean
  sort_order:        number
}

/** Matches modifier_groups table row + nested modifiers array */
export interface ModifierGroup {
  id: string
  name: string
  description?: string
  type: ModifierGroupType
  required: boolean
  min_selections: number
  max_selections: number | null
  sort_order: number
  active: boolean   // ← MUST EXIST
  modifiers: Modifier[]
}

// ─────────────────────────────────────────────────────────────────────────────
// MenuItem — domain model (not a DB row)
// ─────────────────────────────────────────────────────────────────────────────
// Read from menu_items_full VIEW which aggregates modifier_groups as Json.
// Written to menu_items TABLE (no modifier_groups column there).
// ─────────────────────────────────────────────────────────────────────────────

export interface MenuItem {
  id:          string
  name:        string
  description?: string
  price:       number
  image_url?:  string
  category:    MenuCategory
  featured:    boolean
  available:   boolean
  sort_order:  number

  // Dietary — confirmed on menu_items table + menu_items_full view
  spicy_level?:    number
  is_vegetarian:   boolean
  is_vegan:        boolean
  is_gluten_free:  boolean
  allergens?:      string[]  // NOTE: on menu_items TABLE only, not in view

  // Inventory — confirmed on both table and view
  inventory_count?:     number
  low_stock_threshold:  number  // defaults to 0

  // Engagement — confirmed on both table and view
  popularity_score?: number
  pairs_with?:       string[]

  // Modifiers — populated from menu_items_full view's Json column
  // Always an array; empty [] when item has no modifier groups
  modifier_groups: ModifierGroup[]

  created_at: string
  updated_at?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Cart types — immutable pricing snapshots
// ─────────────────────────────────────────────────────────────────────────────

/** User's selection within one modifier group */
export interface SelectedModifier {
  id:               string
  name:             string
  price_adjustment: number  // locked at add-to-cart time
}

/** One group's worth of selections stored per cart line item */
export interface CartItemModifier {
  group_id:   string
  group_name: string
  selections: SelectedModifier[]
}

/**
 * Immutable cart line item — a pricing snapshot.
 * Once added to cart, prices are LOCKED via pricing_hash.
 * Never hold a reference to MenuItem here; only copy what you need.
 */
export interface CartItem {
  id:                    string   // stable UUID for React keys
  item_id:               string   // references menu_items.id
  name:                  string
  image_url?:            string
  base_price:            number   // item.price at add-to-cart time
  modifiers:             CartItemModifier[]
  subtotal:              number   // (base_price + modifier_total) * quantity
  quantity:              number
  special_instructions?: string
  pricing_hash:          string   // tamper-detection; validated at checkout
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing types
// ─────────────────────────────────────────────────────────────────────────────

export interface PricingBreakdown {
  base_price:      number
  modifier_total:  number
  unit_price:      number   // base_price + modifier_total
  quantity:        number
  subtotal:        number   // unit_price × quantity
  tax:             number
  total:           number
  pricing_hash:    string
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation types
// ─────────────────────────────────────────────────────────────────────────────

export interface ModifierValidationResult {
  valid:  boolean
  error?: string
  code?:  'REQUIRED_MISSING' | 'MIN_NOT_MET' | 'MAX_EXCEEDED'
}

export interface ConfigurationValidation {
  valid:  boolean
  errors: Record<string, string>  // group_id → human-readable error
}