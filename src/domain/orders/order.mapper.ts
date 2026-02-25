// src/domain/orders/order.mapper.ts
// ============================================================================
// ORDER MAPPER — DATABASE ROW TO DOMAIN ENTITY (FINAL PRODUCTION)
// ============================================================================

import type { Database } from '@/lib/supabase/database.types'
import {
  OrderType,
  isOrderType,
} from './order.types'

import type {
  Order,
  OrderStatus,
  PaymentStatus,
  OrderCartItem,
  ShippingAddress,
  KitchenOrder,
} from './order.types'

// ============================================================================
// TYPES
// ============================================================================

type OrderRow = Database['public']['Tables']['orders']['Row']

// ============================================================================
// TYPE GUARDS
// ============================================================================

function isShippingAddress(value: unknown): value is ShippingAddress {
  if (typeof value !== 'object' || value === null) return false

  const v = value as Record<string, unknown>

  return (
    typeof v.line1 === 'string' &&
    typeof v.city === 'string' &&
    typeof v.state === 'string' &&
    typeof v.postal_code === 'string' &&
    typeof v.country === 'string'
  )
}

// ============================================================================
// SAFE JSONB PARSERS
// ============================================================================

function parseCartItems(value: unknown): OrderCartItem[] | null {
  if (!Array.isArray(value)) return null

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' &&
        item !== null &&
        'name' in item &&
        'quantity' in item
    )
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : undefined,
      name: String(item.name),
      quantity: Number(item.quantity),
      price: typeof item.price === 'number' ? item.price : undefined,
      notes:
        typeof item.notes === 'string' || item.notes === null
          ? item.notes
          : null,
    }))
}

function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function parseShippingAddress(value: unknown): ShippingAddress | null {
  return isShippingAddress(value) ? value : null
}

// ============================================================================
// MAIN DOMAIN MAPPER
// ============================================================================

export function mapOrderRowToDomain(row: OrderRow): Order {
  const shippingAddr = parseShippingAddress(row.shipping_address)

  return {
    // Identity
    id: row.id,
    stripe_session_id: row.stripe_session_id,
    stripe_payment_intent_id: row.stripe_payment_intent_id ?? null,

    // Customer
    customer_uid: row.customer_uid ?? null,
    customer_email: row.customer_email ?? null,
    customer_name: row.customer_name ?? null,
    customer_phone: row.customer_phone ?? null,
    order_number: row.order_number ?? null,

    // Amounts
    amount_subtotal: row.amount_subtotal,
    amount_tax: row.amount_tax,
    amount_shipping: row.amount_shipping,
    amount_total: row.amount_total,
    currency: row.currency,

    // Assignment
    assigned_to: row.assigned_to ?? null,

    // Lifecycle
    order_type: isOrderType(row.order_type)
      ? row.order_type
      : OrderType.FOOD,
    payment_status: row.payment_status as PaymentStatus,
    status: row.status as OrderStatus,

    // Cart
    cart_items: parseCartItems(row.cart_items),

    // Shipping
    shipping_name: row.shipping_name ?? null,
    shipping_address: shippingAddr,
    shipping_phone: row.shipping_phone ?? null,
    shipping_city: shippingAddr?.city ?? null,
    shipping_state: shippingAddr?.state ?? null,
    shipping_zip: shippingAddr?.postal_code ?? null,
    shipping_country: shippingAddr?.country ?? null,

    // Metadata
    metadata: parseMetadata(row.metadata),
    notes: row.notes ?? null,

    // Timestamps
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

// ============================================================================
// LIGHTWEIGHT KITCHEN MAPPER
// ============================================================================

export function mapOrderRowToKitchen(row: OrderRow): KitchenOrder {
  return {
    id: row.id,
    created_at: row.created_at,
    customer_name: row.customer_name ?? null,
    customer_phone: row.customer_phone ?? null,
    amount_total: row.amount_total,
    status: row.status as OrderStatus,
    cart_items: parseCartItems(row.cart_items) ?? [],
    assigned_to: row.assigned_to ?? null,
  }
}