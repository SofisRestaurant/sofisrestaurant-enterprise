// src/features/cart/cart.utils.ts
import type { CartItem } from '@/features/cart/cart.types'
import type { MenuItem } from '@/types/menu'

/**
 * Parameters for creating a cart item
 */
export interface CreateCartItemParams {
  menuItem: MenuItem
  quantity?: number
  customizations?: string
  specialInstructions?: string
}

/**
 * Generate a unique cart item ID
 */
export function generateCartItemId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `cart_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Clamp quantity to valid range (1..99)
 */
export function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1
  return Math.max(1, Math.min(99, Math.floor(quantity)))
}

/**
 * Validate cart item quantity
 */
export function isValidQuantity(quantity: number): boolean {
  return Number.isFinite(quantity) && quantity > 0 && quantity <= 99
}

/**
 * Create a cart item from parameters
 */
export function createCartItem(params: CreateCartItemParams): CartItem {
  return {
    id: generateCartItemId(),
    menuItem: params.menuItem,
    quantity: clampQuantity(params.quantity ?? 1),
    customizations: params.customizations?.trim() || undefined,
    specialInstructions: params.specialInstructions?.trim() || undefined,
  }
}

/**
 * Calculate item total
 */
export function calculateItemTotal(item: CartItem): number {
  return item.menuItem.price * item.quantity
}

/**
 * Calculate cart subtotal
 */
export function calculateSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + calculateItemTotal(item), 0)
}

/**
 * Round to 2 decimal places
 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Format price for display
 */
export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`
}

/**
 * Check if cart item matches menu item
 */
export function cartItemMatchesMenuItem(cartItem: CartItem, menuItemId: string): boolean {
  return cartItem.menuItem.id === menuItemId
}

/**
 * Find cart item by menu item ID
 */
export function findCartItemByMenuItemId(items: CartItem[], menuItemId: string): CartItem | undefined {
  return items.find((item) => cartItemMatchesMenuItem(item, menuItemId))
}

/**
 * Get total item count in cart
 */
export function getTotalItemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0)
}

export default {
  generateCartItemId,
  clampQuantity,
  isValidQuantity,
  createCartItem,
  calculateItemTotal,
  calculateSubtotal,
  round2,
  formatPrice,
  cartItemMatchesMenuItem,
  findCartItemByMenuItemId,
  getTotalItemCount,
}