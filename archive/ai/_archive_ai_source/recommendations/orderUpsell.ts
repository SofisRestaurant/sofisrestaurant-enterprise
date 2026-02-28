// src/_archive_ai_source/recommendations/orderUpsell.ts
import type { CartItem, MenuItem, MenuCategory } from '@/domain/menu/menu.types';

/**
 * Suggest additional items based on cart contents
 */
export function suggestUpsells(
  cartItems: CartItem[],
  allMenuItems: MenuItem[]
): MenuItem[] {
  if (cartItems.length === 0) return [];

  // Get unique categories from cart
  const categories = cartItems
    .map((item) => item.menuItem.category)
    .filter(Boolean);

  // If cart has entrees, suggest beverages or desserts
  if (categories.includes('entrees')) {
    return allMenuItems.filter(
      (item) =>
        item.category === 'beverages' || item.category === 'desserts'
    ).slice(0, 3);
  }

  // If cart has appetizers, suggest entrees
  if (categories.includes('appetizers')) {
    return allMenuItems.filter(
      (item) => item.category === 'entrees'
    ).slice(0, 3);
  }

  // Default: suggest popular items
  return allMenuItems
    .filter((item) => item.featured)
    .slice(0, 3);
}

/**
 * Calculate potential additional revenue from upsells
 */
export function calculateUpsellValue(suggestedItems: MenuItem[]): number {
  return suggestedItems.reduce((sum, item) => sum + item.price, 0);
}

/**
 * Get personalized upsell message
 */
export function getUpsellMessage(category: MenuCategory): string {
  const messages: Record<MenuCategory, string> = {
    appetizers: 'Complete your meal with an entrée!',
    entrees: 'Add a drink or dessert?',
    desserts: 'Pair with a beverage!',
    beverages: 'Try one of our desserts!',
    specials: 'Don\'t miss our other specials!',
  };

  return messages[category] || 'Complete your order!';
}

export {};