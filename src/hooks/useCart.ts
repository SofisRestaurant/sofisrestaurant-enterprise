// src/hooks/useCart.ts
import { useCartStore } from '@/features/cart/cart.store'
import type { CartItem } from '@/features/cart/cart.types'
import type { MenuItem } from '@/types/menu'

// ============================================================================
// Types
// ============================================================================

export interface UseCartReturn {
  // Cart state
  items: CartItem[]
  itemCount: number
  subtotal: number
  tax: number
  deliveryFee: number
  total: number

  // Cart actions
  addItem: (menuItem: MenuItem, quantity?: number, specialInstructions?: string) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void

  // Helper methods
  getItemQuantity: (menuItemId: string) => number
  isItemInCart: (menuItemId: string) => boolean
  getItem: (id: string) => CartItem | undefined
  updateCustomizations: (id: string, customizations: string) => void
  updateNotes: (id: string, notes: string) => void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Cart management hook
 * Provides access to cart state and actions
 */
export function useCart(): UseCartReturn {
  const store = useCartStore()

  const getItemQuantity = (menuItemId: string): number => {
    const item = store.items.find((it) => it.menuItem.id === menuItemId)
    return item?.quantity ?? 0
  }

  const isItemInCart = (menuItemId: string): boolean => {
    return store.items.some((it) => it.menuItem.id === menuItemId)
  }

  return {
    // State
    items: store.items,
    itemCount: store.itemCount,
    subtotal: store.subtotal,
    tax: store.tax,
    deliveryFee: store.deliveryFee,
    total: store.total,

    // Actions
    addItem: store.addItem,
    removeItem: store.removeItem,
    updateQuantity: store.updateQuantity,
    clearCart: store.clearCart,

    // Helpers
    getItemQuantity,
    isItemInCart,
    getItem: store.getItem,
    updateCustomizations: store.updateCustomizations,
    updateNotes: store.updateNotes,
  }
}

export default useCart