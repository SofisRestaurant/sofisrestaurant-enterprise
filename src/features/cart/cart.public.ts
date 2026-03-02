// src/features/cart/cart.public.ts

export type { CartItem, CartModifier, CartTotals } from './cart.types'

/**
 * Public input shape for adding/upserting items into the cart store.
 * Cart store computes lineTotalCents internally.
 */
export type AddToCartInput = Omit<import('./cart.types').CartItem, 'lineTotalCents'>