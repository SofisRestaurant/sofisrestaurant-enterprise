// src/hooks/useCart.ts
// ============================================================================
// useCart — thin facade over the Zustand cart store
// ============================================================================
// Exposes a stable, typed API so components never import from the store
// directly and never depend on Zustand internals.
// ============================================================================

import { useCartStore }    from '@/features/cart/cart.store'
import type { CartItem }   from '@/features/cart/cart.types'
import type { AddToCartPayload } from '@/features/cart/cart.types'  // lives here, not in domain/orders

export interface UseCartReturn {
  items:           CartItem[]
  itemCount:       number
  subtotal:        number
  tax:             number
  deliveryFee:     number
  total:           number
  addItem:         (payload: AddToCartPayload) => void
  removeItem:      (id: string) => void
  updateQuantity:  (id: string, quantity: number) => void
  clearCart:       () => void
  getItemQuantity: (menuItemId: string) => number
  isItemInCart:    (menuItemId: string) => boolean
  getItem:         (id: string) => CartItem | undefined
  updateNotes:     (id: string, notes: string) => void
}

export function useCart(): UseCartReturn {
  const store = useCartStore()

  const getItemQuantity = (menuItemId: string): number => {
    const item = store.items.find((it) => it.item_id === menuItemId)
    return item?.quantity ?? 0
  }

  const isItemInCart = (menuItemId: string): boolean => {
    return store.items.some((it) => it.item_id === menuItemId)
  }

  return {
    items:          store.items,
    itemCount:      store.itemCount,
    subtotal:       store.subtotal,
    tax:            store.tax,
    deliveryFee:    store.deliveryFee,
    total:          store.total,
    addItem:        store.addItem,
    removeItem:     store.removeItem,
    updateQuantity: store.updateQuantity,
    clearCart:      store.clearCart,
    getItemQuantity,
    isItemInCart,
    getItem:        store.getItem,
    updateNotes:    store.updateNotes,
  }
}

export default useCart