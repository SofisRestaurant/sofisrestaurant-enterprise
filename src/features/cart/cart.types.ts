// src/features/cart/cart.types.ts
// ============================================================================
// CART TYPES — DOMAIN MODELS FOR CART SYSTEM
// ============================================================================

import type { MenuItem } from '@/types/menu'

// ============================================================================
// CART ITEM
// ============================================================================

export interface CartItem {
  id: string
  menuItem: MenuItem
  quantity: number
  specialInstructions?: string
  customizations?: string
}

// ============================================================================
// CART STORE
// ============================================================================

export interface CartStore {
  // State
  items: CartItem[]
  itemCount: number
  subtotal: number
  tax: number
  deliveryFee: number
  total: number

  // Basic operations
  addItem: (
    menuItem: MenuItem,
    quantity?: number,
    specialInstructions?: string
  ) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
  getItem: (id: string) => CartItem | undefined

  // Customization
  updateCustomizations: (id: string, customizations: string) => void
  updateNotes: (id: string, notes: string) => void

  // 🔥 CHECKOUT LIFECYCLE METHODS (ALL REQUIRED)
  backupCart: () => void
  restoreCart: () => boolean
  clearBackup: () => void
  prepareForCheckout: (sessionId: string) => void
  finalizeOrder: () => void
  cancelCheckout: () => void
  isCheckoutInProgress: () => boolean
}