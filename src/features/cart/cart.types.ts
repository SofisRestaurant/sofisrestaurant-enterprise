// src/features/cart/cart.types.ts
// ============================================================================
// CART STORE INTERFACE
// ============================================================================
// CartItem is defined in @/domain/menu/menu.types — this file only defines the store shape.
// ============================================================================

import type { CartItem, CartItemModifier } from '@/domain/menu/menu.types'

export type { CartItem }

// ── Add-to-cart payload (MenuItemModal → useCartStore.addItem) ─────────────

export interface AddToCartPayload {
  item_id:               string
  name:                  string
  image_url?:            string
  base_price:            number
  modifiers:             CartItemModifier[]
  quantity:              number
  special_instructions?: string
}

// ── Cart store interface ───────────────────────────────────────────────────

export interface CartStore {
  // State
  items:       CartItem[]
  itemCount:   number
  subtotal:    number
  tax:         number
  deliveryFee: number
  total:       number

  // Item operations
  addItem:        (payload: AddToCartPayload) => void
  removeItem:     (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart:      () => void
  getItem:        (id: string) => CartItem | undefined
  updateNotes:    (id: string, notes: string) => void

  // Checkout lifecycle
  backupCart:           () => void
  restoreCart:          () => boolean
  clearBackup:          () => void
  prepareForCheckout:   (sessionId: string) => void
  finalizeOrder:        () => void
  cancelCheckout:       () => void
  isCheckoutInProgress: () => boolean
}