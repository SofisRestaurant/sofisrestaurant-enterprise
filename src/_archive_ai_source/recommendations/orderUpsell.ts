// src/_archive_ai_source/recommendations/orderUpsell.ts
// ============================================================================
// ORDER UPSELL SUGGESTIONS
// ============================================================================
// Suggests additional menu items based on what's in the cart.
//
// CartItem has no `category` field — it is a pricing snapshot.
// Category awareness comes from the full MenuItem list, not cart items.
// MenuCategory union: 'appetizers' | 'entrees' | 'desserts' | 'drinks'
// ('beverages' is not a valid category in this schema)
// ============================================================================

import type { CartItem }    from '@/features/cart/cart.types'
import type { MenuItem, MenuCategory }
  from '@/domain/menu/menu.types'
/**
 * Suggest additional items based on cart contents.
 * Looks up each cart item in allMenuItems to get its category.
 */
export function suggestUpsells(
  cartItems:     CartItem[],
  allMenuItems:  MenuItem[],
): MenuItem[] {
  if (cartItems.length === 0) return []

  // Build a lookup so we can resolve CartItem → MenuItem category
  const itemById = new Map(allMenuItems.map((m) => [m.id, m]))

  // Collect unique categories present in the cart
  const categories = new Set(
    cartItems
      .map((ci) => itemById.get(ci.item_id)?.category)
      .filter((c): c is MenuCategory => c !== undefined),
  )

  // If cart has entrees, suggest drinks or desserts
  if (categories.has('entrees')) {
    return allMenuItems
      .filter((item) => item.category === 'drinks' || item.category === 'desserts')
      .slice(0, 3)
  }

  // If cart has appetizers, suggest entrees
  if (categories.has('appetizers')) {
    return allMenuItems
      .filter((item) => item.category === 'entrees')
      .slice(0, 3)
  }

  // Default: suggest featured items not already in cart
  const cartItemIds = new Set(cartItems.map((ci) => ci.item_id))
  return allMenuItems
    .filter((item) => item.featured && !cartItemIds.has(item.id))
    .slice(0, 3)
}

/**
 * Calculate potential additional revenue from upsells.
 */
export function calculateUpsellValue(suggestedItems: MenuItem[]): number {
  return suggestedItems.reduce((sum, item) => sum + item.price, 0)
}

/**
 * Get a personalized upsell message for a given category.
 */
export function getUpsellMessage(category: MenuCategory): string {
  const messages: Record<MenuCategory, string> = {
    appetizers: 'Complete your meal with an entrée!',
    entrees:    'Add a drink or dessert?',
    desserts:   'Pair with a beverage!',
    drinks:     'Try one of our desserts!',
    // schema categories only — 'beverages' does not exist
    lunch:      'Make it a full meal!',
    breakfast:  'Start your day right!',
    specials:   "Don't miss our other specials!",
  }
  return messages[category] ?? 'Complete your order!'
}