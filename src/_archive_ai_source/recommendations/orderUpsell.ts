// =============================================================================
// src/_archive_ai_source/recommendations/orderUpsell.ts
// =============================================================================
// Production-ready upsell recommendations (2026 cart model)
// - Uses CartItem from "@/features/cart/cart.types" (your source of truth)
// - Uses DB enum menu_category for consistency
// - No `any`, no cart-shape guessing, no nested menu item assumptions
// - Deterministic ranking, excludes items already in cart
// =============================================================================


import type { Database } from '@/types/supabase'
import type { CartItem } from '@/modules/cart/types/cart.types'

export type MenuCategory = Database['public']['Enums']['menu_category']

/**
 * Minimal menu item shape required for upsells.
 * Works with:
 * - Database['public']['Tables']['menu_items']['Row']
 * - menu_items_public view rows
 * - any normalized menu list you already use
 */
export type UpsellMenuItem = {
  id: string
  name: string
  category: MenuCategory | null
  price: number // in cents (matches menu_items.price)
  available: boolean | null
  featured?: boolean | null
}

export type UpsellRule = {
  ifCartHas: MenuCategory[]
  suggest: MenuCategory[]
  priority: number
}

export type SuggestUpsellsOptions = {
  limit?: number
  rules?: UpsellRule[]
  /**
   * If false (default), we avoid suggesting same-category items when no rules match.
   */
  allowSameCategory?: boolean
}

const DEFAULT_RULES: UpsellRule[] = [
  { ifCartHas: ['entrees'], suggest: ['drinks', 'desserts'], priority: 1 },
  { ifCartHas: ['appetizers'], suggest: ['entrees'], priority: 2 },
  { ifCartHas: ['breakfast'], suggest: ['drinks'], priority: 3 },
  { ifCartHas: ['lunch'], suggest: ['drinks', 'desserts'], priority: 4 },
]

function isCategory(v: unknown): v is MenuCategory {
  return (
    v === 'appetizers' ||
    v === 'entrees' ||
    v === 'desserts' ||
    v === 'drinks' ||
    v === 'lunch' ||
    v === 'breakfast' ||
    v === 'specials'
  )
}

function safeCategory(v: unknown): MenuCategory | null {
  return isCategory(v) ? v : null
}

/**
 * Suggest additional items based on cart contents.
 * Deterministic & stable: same cart + menu list => same suggestions.
 */
export function suggestUpsells(
  cartItems: CartItem[],
  allMenuItems: UpsellMenuItem[],
  options: SuggestUpsellsOptions = {},
): UpsellMenuItem[] {
  const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 3
  const rules = options.rules ?? DEFAULT_RULES
  const allowSameCategory = options.allowSameCategory === true

  if (!Array.isArray(cartItems) || cartItems.length === 0) return []
  if (!Array.isArray(allMenuItems) || allMenuItems.length === 0) return []

  // IDs already in cart (never suggest duplicates)
  const cartIds = new Set(cartItems.map((ci) => ci.menuItemId))

  // Categories present in cart (your cart already stores category!)
  const cartCategories = new Set<MenuCategory>()
  for (const ci of cartItems) {
    const cat = safeCategory(ci.category)
    if (cat) cartCategories.add(cat)
  }

  // Determine preferred suggestion categories based on first matching (highest priority) rule
  const matching = rules
    .filter((r) => r.ifCartHas.some((c) => cartCategories.has(c)))
    .sort((a, b) => a.priority - b.priority)

  const preferredCats = new Set<MenuCategory>()
  if (matching.length > 0) {
    for (const c of matching[0].suggest) preferredCats.add(c)
  }

  // Build candidate set
  const candidates = allMenuItems.filter((mi) => {
    if (!mi || typeof mi.id !== 'string') return false
    if (cartIds.has(mi.id)) return false

    const cat = safeCategory(mi.category)
    if (!cat) return false

    // Only available items
    if (mi.available === false) return false

    // If we have preferred categories, enforce them
    if (preferredCats.size > 0) return preferredCats.has(cat)

    // Otherwise: optionally avoid suggesting same-category items
    if (!allowSameCategory && cartCategories.size > 0 && cartCategories.has(cat)) return false

    return true
  })

  // Deterministic ranking:
  // 1) featured first
  // 2) cheaper items slightly preferred (easy add-ons)
  // 3) stable tie-breaker by id
  candidates.sort((a, b) => {
    const fa = a.featured ? 1 : 0
    const fb = b.featured ? 1 : 0
    if (fa !== fb) return fb - fa

    if (a.price !== b.price) return a.price - b.price

    return a.id.localeCompare(b.id)
  })

  return candidates.slice(0, limit)
}

/**
 * Calculate potential additional revenue from upsells.
 * Returns cents (because your system is cents-based).
 */
export function calculateUpsellValueCents(suggested: UpsellMenuItem[]): number {
  if (!Array.isArray(suggested) || suggested.length === 0) return 0
  return suggested.reduce((sum, item) => sum + (Number.isFinite(item.price) ? item.price : 0), 0)
}

/**
 * Get an upsell message based on a primary cart category.
 */
export function getUpsellMessage(category: MenuCategory): string {
  const messages: Record<MenuCategory, string> = {
    appetizers: 'Want to add an entrée to complete your meal?',
    entrees: 'Add a drink or dessert to finish strong?',
    desserts: 'Pair it with a drink?',
    drinks: 'Want something sweet on the side?',
    lunch: 'Add a drink or dessert?',
    breakfast: 'Add a drink with your breakfast?',
    specials: "Don't miss our other specials!",
  }

  return messages[category] ?? 'Complete your order with something extra!'
}