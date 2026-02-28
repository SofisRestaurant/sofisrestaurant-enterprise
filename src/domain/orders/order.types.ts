// ============================================================================
// ORDER DOMAIN MODEL — SINGLE SOURCE OF TRUTH (PRODUCTION 2026)
// ============================================================================
import type { Database } from '@/lib/supabase/database.types'
type Json =
  Database['public']['Tables']['orders']['Row']['metadata']
/**
 * Cart item stored in JSONB
 */
export interface OrderCartItem {
  id?: string
  name: string
  quantity: number
  price?: number
  notes?: string | null
}
export interface CartItemModifier {
  modifier_group_id: string
  selections: {
    id: string
    name: string
    price_adjustment: number
  }[]
}

export interface AddToCartPayload {
  item_id: string
  name: string
  base_price: number
  modifiers: CartItemModifier[]
  quantity: number
  special_instructions?: string
}
/**
 * Shipping address structure
 */
export interface ShippingAddress {
  name?: string
  line1: string
  line2?: string
  city: string
  state: string
  postal_code: string
  country: string
  phone?: string
}

/**
 * Order lifecycle status
 */
export enum OrderStatus {
  CONFIRMED = 'confirmed',
  PREPARING = 'preparing',
  READY = 'ready',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}
export const KITCHEN_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
]
/**
 * Stripe payment state
 */
export enum PaymentStatus {
  PAID = "paid",
  FAILED = "failed",
  REFUNDED = "refunded",
}

/**
 * Order type
 */
export enum OrderType {
  FOOD = 'food',
  MERCH = 'merch',
}

/**
 * Full Order domain entity
 */
export interface Order {
  id: string

  stripe_session_id: string
  stripe_payment_intent_id: string | null

  customer_uid: string | null
  customer_email: string | null
  customer_name: string | null
  customer_phone: string | null

  amount_subtotal: number
  amount_tax: number
  amount_shipping: number
  amount_total: number

  assigned_to: string | null
  currency: string

  order_type: OrderType
  payment_status: PaymentStatus
  status: OrderStatus
  order_number: number | null

  cart_items: OrderCartItem[] | null
  estimated_ready_time?: string | null
  shipping_name: string | null
  shipping_address: ShippingAddress | null
  shipping_phone: string | null
  shipping_city: string | null
  shipping_state: string | null
  shipping_zip: string | null
  shipping_country: string | null

  metadata: Json
  notes: string | null

  created_at: string
  updated_at: string
}

/**
 * Kitchen subset
 */
export interface KitchenOrder {
  id: string
  created_at: string
  customer_name: string | null
  customer_phone: string | null
  amount_total: number
  status: OrderStatus
  cart_items: OrderCartItem[]
  assigned_to: string | null
}
 
/**
 * Type guards
 */
export function isOrderType(value: string): value is OrderType {
  return Object.values(OrderType).includes(value as OrderType)
}