// src/features/cart/cart.public.ts

export type { CartItem, CartModifier, CartTotals } from '../types/cart.types';
/**
 * Public input shape for adding/upserting items into the cart store.
 * Cart store computes lineTotalCents internally.
 */
import type { CartItem } from '../types/cart.types';
export type AddToCartInput = Omit<CartItem, 'lineTotalCents'>;
