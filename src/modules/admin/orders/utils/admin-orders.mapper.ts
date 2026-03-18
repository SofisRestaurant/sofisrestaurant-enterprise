// =============================================================================
// PATH: src/modules/admin/orders/admin-orders.mapper.ts
// =============================================================================
// Transforms raw backend data into the AdminOrder UI shape.
// =============================================================================

import type { Database } from '@/types/supabase';
import type { AdminOrder, CartItem, RawItem } from '../types/admin-orders.types';
import {
  isRecord,
  readText,
  readNumber,
  normalizeMoneyToCents,
} from './admin-orders.parsers';

type OrderRow = Database['public']['Tables']['orders']['Row'];

// ─── Cart items ───────────────────────────────────────────────────────────────

/**
 * Safely parses a raw cart_items array into CartItem[]
 */
export function parseCartItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];

  const items: CartItem[] = [];

  for (const rawItem of value) {
    if (!isRecord(rawItem)) continue;

    const menuItemId = readText(rawItem, ['id', 'menu_item_id', 'menuItemId']);
    if (!menuItemId) continue; // skip if no id

    const name = readText(rawItem, ['name', 'title']) ?? 'Item';
    const quantity = Math.max(
      1,
      Math.round(readNumber(rawItem, ['quantity', 'qty']) ?? 1),
    );
    const rawPrice = readNumber(rawItem, [
      'price_cents',
      'priceCents',
      'unit_price_cents',
      'unitPriceCents',
      'price',
      'unit_price',
      'unitPrice',
    ]);
    const unitPriceCents = rawPrice === null ? 0 : normalizeMoneyToCents(rawPrice);

    items.push({
      menuItemId,
      name,
      quantity,
      unitPriceCents,
      // modifiers can be added later if needed
    });
  }

  return items;
}

// ─── DB row → AdminOrder ──────────────────────────────────────────────────────

export function mapOrderRow(row: OrderRow): AdminOrder {
  return {
    id: row.id,
    orderNumber: row.order_number === null ? null : String(row.order_number),
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    orderType: row.order_type,
    status: row.status,
    paymentStatus: row.payment_status,
    amountSubtotalCents: row.amount_subtotal,
    amountTaxCents: row.amount_tax,
    amountTotalCents: row.amount_total,
    createdAt: row.created_at,
    notes: row.notes,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    cartItems: parseCartItems(row.cart_items),
  };
}

// ─── Realtime payload → AdminOrder ────────────────────────────────────────────

export function parseRealtimeOrder(value: unknown): AdminOrder | null {
  if (!isRecord(value)) return null;

  const id = readText(value, ['id']);
  const createdAt = readText(value, ['created_at', 'createdAt']);
  if (!id || !createdAt) return null;

  return {
    id,
    orderNumber: readText(value, ['order_number', 'orderNumber']),
    customerName: readText(value, ['customer_name', 'customerName']),
    customerEmail: readText(value, ['customer_email', 'customerEmail']),
    customerPhone: readText(value, ['customer_phone', 'customerPhone']),
    orderType: readText(value, ['order_type', 'orderType']),
    status: readText(value, ['status']) ?? 'unknown',
    paymentStatus: readText(value, ['payment_status', 'paymentStatus']) ?? 'unknown',
    amountSubtotalCents: readNumber(value, ['amount_subtotal', 'amountSubtotal']) ?? 0,
    amountTaxCents: readNumber(value, ['amount_tax', 'amountTax']) ?? 0,
    amountTotalCents: readNumber(value, ['amount_total', 'amountTotal']) ?? 0,
    createdAt,
    notes: readText(value, ['notes']),
    stripePaymentIntentId: readText(value, [
      'stripe_payment_intent_id',
      'stripePaymentIntentId',
    ]),
    cartItems: parseCartItems(value.cart_items),
  };
}

// Optional helper: convert a raw array to CartItem[]
export function mapOrderToCartItems(rawItems: RawItem[]): CartItem[] {
  return rawItems.map((rawItem) => ({
    menuItemId: rawItem.id,
    name: rawItem.name,
    quantity: rawItem.quantity,
    unitPriceCents: rawItem.unitPriceCents,
  }));
}