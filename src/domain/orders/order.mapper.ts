// src/domain/orders/order.mapper.ts
// ============================================================================
// ORDER MAPPER — DATABASE ROW → DOMAIN ENTITY (Enterprise 2026)
// ============================================================================
// Why this exists:
// - DB has string columns (order_type, status, payment_status)
// - Domain uses enums (OrderType, OrderStatus, PaymentStatus)
// - Checkout "service type" is NOT OrderType. It belongs in metadata.
//
// Guarantees:
// - Never returns invalid enum values
// - Preserves service mode in metadata.order_service_type when present
// - Safe JSON parsing for cart_items + shipping_address
// ============================================================================

import type { Database } from '@/types/supabase'

import {
  OrderType,
  OrderStatus,
  PaymentStatus,
  isOrderType,
  type Order,
  type OrderCartItem,
  type ShippingAddress,
  type KitchenOrder,
} from './order.types'

type OrderRow = Database['public']['Tables']['orders']['Row']
type Json = Database['public']['Tables']['orders']['Row']['metadata']

// Checkout service mode used across app/edge
export type OrderServiceType = 'pickup' | 'delivery' | 'dine_in'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown, max = 500): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  return s.length > max ? s.slice(0, max) : s
}

function asNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

function clampInt(v: unknown, min: number, max: number, fallback = min): number {
  const n = asNumber(v)
  if (n === null) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

function isOrderStatus(v: unknown): v is OrderStatus {
  return typeof v === 'string' && Object.values(OrderStatus).includes(v as OrderStatus)
}

function isPaymentStatus(v: unknown): v is PaymentStatus {
  return typeof v === 'string' && Object.values(PaymentStatus).includes(v as PaymentStatus)
}

function isServiceType(v: unknown): v is OrderServiceType {
  return v === 'pickup' || v === 'delivery' || v === 'dine_in'
}

function mergeMetadata(base: Json, patch: Record<string, unknown>): Json {
  const obj = isRecord(base) ? base : {}
  return { ...obj, ...patch } as Json
}

// ─────────────────────────────────────────────────────────────
// JSONB Parsers
// ─────────────────────────────────────────────────────────────

function parseCartItems(value: unknown): OrderCartItem[] | null {
  if (!Array.isArray(value)) return null

  const out: OrderCartItem[] = []
  for (const raw of value) {
    if (!isRecord(raw)) continue

    const name = asString(raw.name, 140)
    if (!name) continue

    const quantity = clampInt(raw.quantity, 1, 99, 1)
    const price = asNumber(raw.price)

    out.push({
      id: typeof raw.id === 'string' ? raw.id : undefined,
      name,
      quantity,
      price: typeof price === 'number' ? price : undefined,
      notes: typeof raw.notes === 'string' ? asString(raw.notes, 1200) : raw.notes === null ? null : null,
    })
  }

  return out.length ? out : null
}

function isShippingAddress(value: unknown): value is ShippingAddress {
  if (!isRecord(value)) return false
  return (
    typeof value.line1 === 'string' &&
    typeof value.city === 'string' &&
    typeof value.state === 'string' &&
    typeof value.postal_code === 'string' &&
    typeof value.country === 'string'
  )
}

function parseShippingAddress(value: unknown): ShippingAddress | null {
  return isShippingAddress(value) ? value : null
}

// ─────────────────────────────────────────────────────────────
// OrderType normalization
// ─────────────────────────────────────────────────────────────
// Domain OrderType is FOOD|MERCH. Checkout service type is separate.
// If DB order_type contains pickup/delivery/dine_in (legacy write),
// we map domain order_type to FOOD and preserve service type in metadata.

function normalizeOrderType(rowOrderType: unknown): { orderType: OrderType; serviceType: OrderServiceType | null } {
  if (typeof rowOrderType === 'string' && isOrderType(rowOrderType)) {
    return { orderType: rowOrderType as OrderType, serviceType: null }
  }
  if (isServiceType(rowOrderType)) {
    return { orderType: OrderType.FOOD, serviceType: rowOrderType }
  }
  // unknown → default FOOD
  return { orderType: OrderType.FOOD, serviceType: null }
}

// ─────────────────────────────────────────────────────────────
// Main mapper
// ─────────────────────────────────────────────────────────────

export function mapOrderRowToDomain(row: OrderRow): Order {
  const shippingAddr = parseShippingAddress(row.shipping_address)

  const { orderType, serviceType } = normalizeOrderType(row.order_type)
  const metadata = serviceType ? mergeMetadata(row.metadata, { order_service_type: serviceType }) : row.metadata

  const status: OrderStatus = isOrderStatus(row.status) ? (row.status as OrderStatus) : OrderStatus.CONFIRMED
  const payment_status: PaymentStatus = isPaymentStatus(row.payment_status)
    ? (row.payment_status as PaymentStatus)
    : PaymentStatus.PAID

  return {
    id: row.id,
    stripe_session_id: row.stripe_session_id,
    stripe_payment_intent_id: row.stripe_payment_intent_id ?? null,

    customer_uid: row.customer_uid ?? null,
    customer_email: row.customer_email ?? null,
    customer_name: row.customer_name ?? null,
    customer_phone: row.customer_phone ?? null,

    amount_subtotal: row.amount_subtotal,
    amount_tax: row.amount_tax,
    amount_shipping: row.amount_shipping,
    amount_total: row.amount_total,

    assigned_to: row.assigned_to ?? null,
    currency: row.currency,

    order_type: orderType,
    payment_status,
    status,
    order_number: row.order_number ?? null,

    cart_items: parseCartItems(row.cart_items),

    estimated_ready_time: null,
    shipping_name: row.shipping_name ?? null,
    shipping_address: shippingAddr,
    shipping_phone: row.shipping_phone ?? null,
    shipping_city: shippingAddr?.city ?? null,
    shipping_state: shippingAddr?.state ?? null,
    shipping_zip: shippingAddr?.postal_code ?? null,
    shipping_country: shippingAddr?.country ?? null,

    metadata,
    notes: row.notes ?? null,

    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function mapOrderRowToKitchen(row: OrderRow): KitchenOrder {
  return {
    id: row.id,
    created_at: row.created_at,
    customer_name: row.customer_name ?? null,
    customer_phone: row.customer_phone ?? null,
    amount_total: row.amount_total,
    status: isOrderStatus(row.status) ? (row.status as OrderStatus) : OrderStatus.CONFIRMED,
    cart_items: parseCartItems(row.cart_items) ?? [],
    assigned_to: row.assigned_to ?? null,
  }
}