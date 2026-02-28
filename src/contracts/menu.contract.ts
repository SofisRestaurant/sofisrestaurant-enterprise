// src/contracts/menu.contract.ts
// =============================================================================
// MENU CONTRACTS — V2 Enterprise
// =============================================================================
// Data Transfer Objects — exactly what Supabase returns.
// Prevents backend changes from silently breaking frontend.
// =============================================================================

// ── Base DTOs ─────────────────────────────────────────────────────────────────

export interface ModifierDTO {
  id: string
  modifier_group_id: string
  name: string
  price_adjustment: number
  available: boolean
  sort_order: number
  // V2: per-modifier inventory
  inventory_count: number | null
  low_stock_threshold: number
  created_at: string
  updated_at: string
}




// ── V2: Location Pricing ──────────────────────────────────────────────────────

/**
 * A price override tied to a specific location.
 * Returned from the `location_prices` table.
 */
export interface LocationPriceDTO {
  id: string
  item_id: string
  location_id: string
  price: number
  active: boolean
  created_at: string
  updated_at: string
}

/**
 * A physical or virtual location.
 */
export interface LocationDTO {
  id: string
  name: string
  slug: string
  timezone: string
  active: boolean
}

// ── V2: Time-Based Pricing (Happy Hour) ───────────────────────────────────────

/**
 * A recurring time window with a price rule.
 * Stored in `pricing_rules` table.
 */
export interface PricingRuleDTO {
  id: string
  name: string
  description: string | null
  // Days: 0=Sun … 6=Sat, stored as int array
  days_of_week: number[]
  // 24h strings e.g. "16:00", "19:00"
  start_time: string
  end_time: string
  // Discount type and value
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  // Which items are eligible (null = all items)
  item_ids: string[] | null
  category_ids: string[] | null
  active: boolean
  // Optional location scope (null = global)
  location_id: string | null
  priority: number
  created_at: string
  updated_at: string
}

/**
 * Resolved price after applying active rules.
 * Computed client-side via PricingEngine.
 */
export interface ResolvedPriceDTO {
  item_id: string
  original_price: number
  final_price: number
  discount_amount: number
  applied_rule: PricingRuleDTO | null
  // ISO timestamp when this price expires (end of current window)
  expires_at: string | null
}

// ── V2: Bundle / Combo Engine ─────────────────────────────────────────────────

/**
 * A component slot within a bundle.
 */
export interface BundleSlotDTO {
  id: string
  bundle_id: string
  name: string
  // Items the customer may choose from for this slot
  eligible_item_ids: string[]
  // If true, customer must pick exactly 1 item
  required: boolean
  sort_order: number
}

/**
 * A bundle / combo product.
 * Stored in `bundles` table.
 */
export interface BundleDTO {
  id: string
  name: string
  description: string | null
  image_url: string | null
  bundle_price: number
  available: boolean
  featured: boolean
  // Effective saving vs. buying items individually (computed by view)
  savings_amount: number | null
  slots: BundleSlotDTO[]
  // Pricing rules also apply to bundles
  category: 'bundle'
  created_at: string
  updated_at: string
}

/**
 * The customer's selections within a bundle at checkout.
 */
export interface BundleSelectionDTO {
  bundle_id: string
  slot_selections: {
    slot_id: string
    selected_item_id: string
  }[]
}

// ── Order DTOs (unchanged interface, extended payload) ────────────────────────

export interface OrderItemDTO {
  item_id: string
  name: string
  quantity: number
  base_price: number
  modifiers: {
    id: string
    name: string
    price: number
  }[]
  subtotal: number
  special_instructions?: string
  // V2 fields
  bundle_id?: string
  applied_rule_id?: string
  location_id?: string
}

export interface CreateOrderDTO {
  items: OrderItemDTO[]
  subtotal: number
  tax: number
  total: number
  customer_email?: string
  customer_phone?: string
  delivery_address?: string
  payment_method: 'card' | 'cash'
  special_instructions?: string
  // V2 fields
  location_id?: string
  applied_rule_ids?: string[]
}