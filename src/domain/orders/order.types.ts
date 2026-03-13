import type { Database } from '@/types/supabase';

type Json = Database['public']['Tables']['orders']['Row']['metadata'];

export interface OrderCartItemModifierSelection {
  id: string;
  name: string;
  price_adjustment: number;
}

export interface OrderCartItemModifier {
  id?: string;
  modifier_group_id?: string;
  group_id?: string;
  group_name?: string | null;
  name?: string | null;
  price_adjustment?: number;
  selections: OrderCartItemModifierSelection[];
}

export interface OrderCartItem {
  id?: string;
  menu_item_id?: string;
  name: string;
  quantity: number;
  price?: number;
  base_price?: number;
  unit_price?: number;
  notes?: string | null;
  special_instructions?: string | null;
  modifiers?: OrderCartItemModifier[];
}

export interface CartItemModifier {
  modifier_group_id: string;
  selections: {
    id: string;
    name: string;
    price_adjustment: number;
  }[];
}

export interface AddToCartPayload {
  item_id: string;
  name: string;
  base_price: number;
  modifiers: CartItemModifier[];
  quantity: number;
  special_instructions?: string;
}

export interface ShippingAddress {
  name?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone?: string;
}

export enum OrderStatus {
  CONFIRMED = 'confirmed',
  PREPARING = 'preparing',
  READY = 'ready',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export const ORDER_STATUS_VALUES = [
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
] as const;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.CONFIRMED]: 'New',
  [OrderStatus.PREPARING]: 'Preparing',
  [OrderStatus.READY]: 'Ready',
  [OrderStatus.SHIPPED]: 'Shipped',
  [OrderStatus.DELIVERED]: 'Delivered',
  [OrderStatus.CANCELLED]: 'Cancelled',
};

export const KITCHEN_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
];

export enum PaymentStatus {
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export const PAYMENT_STATUS_VALUES = [
  PaymentStatus.PAID,
  PaymentStatus.FAILED,
  PaymentStatus.REFUNDED,
] as const;

export enum OrderType {
  FOOD = 'food',
  MERCH = 'merch',
}

export const ORDER_TYPE_VALUES = [OrderType.FOOD, OrderType.MERCH] as const;

export interface Order {
  id: string;
  stripe_session_id: string;
  stripe_payment_intent_id: string | null;
  customer_uid: string | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  amount_subtotal: number;
  amount_tax: number;
  amount_shipping: number;
  amount_total: number;
  assigned_to: string | null;
  currency: string;
  order_type: OrderType;
  payment_status: PaymentStatus;
  status: OrderStatus;
  order_number: number | null;
  cart_items: OrderCartItem[] | null;
  estimated_ready_time?: string | null;
  shipping_name: string | null;
  shipping_address: ShippingAddress | null;
  shipping_phone: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
  shipping_country: string | null;
  metadata: Json;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface KitchenOrder {
  id: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  amount_total: number;
  status: OrderStatus;
  cart_items: OrderCartItem[];
  assigned_to: string | null;
}

export type OrderEventData = Record<string, unknown>;

export interface OrderEvent {
  id: string;
  order_id: string;
  event_type: string;
  event_data: OrderEventData | null;
  created_at: string;
  user_id: string | null;
}

export interface RecordEventRequest {
  order_id?: string;
  orderId?: string;
  event_type?: string;
  eventType?: string;
  user_id?: string | null;
  userId?: string | null;
  actor_uid?: string | null;
  actorUid?: string | null;
  created_at?: string;
  createdAt?: string;
  event_data?: OrderEventData | null;
  eventData?: OrderEventData | null;
  metadata?: OrderEventData | null;
  data?: OrderEventData | null;
}

export interface OrderTimeline {
  amount_total: number;
  current_status: string;
  customer_uid: string | null;
  event_data: OrderEventData | null;
  event_id: string | null;
  event_time: string | null;
  event_type: string | null;
  order_id: string;
  order_number: string;
  user_id: string | null;
}

export interface OrderPerformanceMetrics {
  created_at: string;
  order_id: string;
  order_number: string | null;
  status: string;
  updated_at: string;
}

function isStringInSet<TValue extends string>(
  value: string,
  allowed: readonly TValue[],
): value is TValue {
  return (allowed as readonly string[]).includes(value);
}

export function isOrderType(value: string): value is OrderType {
  return isStringInSet(value, ORDER_TYPE_VALUES);
}

export function isOrderStatus(value: string): value is OrderStatus {
  return isStringInSet(value, ORDER_STATUS_VALUES);
}

export function isPaymentStatus(value: string): value is PaymentStatus {
  return isStringInSet(value, PAYMENT_STATUS_VALUES);
}

export function getNextOrderStatus(status: OrderStatus): OrderStatus | null {
  switch (status) {
    case OrderStatus.CONFIRMED:
      return OrderStatus.PREPARING;
    case OrderStatus.PREPARING:
      return OrderStatus.READY;
    case OrderStatus.READY:
      return OrderStatus.DELIVERED;
    case OrderStatus.SHIPPED:
    case OrderStatus.DELIVERED:
    case OrderStatus.CANCELLED:
      return null;
  }
}