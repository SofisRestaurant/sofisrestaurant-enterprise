// src/domain/orders/order.types.ts
// =============================================================================
// ORDER DOMAIN — canonical persistence-layer types
// =============================================================================
// This is the SINGLE SOURCE OF TRUTH for order-related types.
//
// FILE CONSOLIDATION NOTE:
//   This file replaces both:
//     - src/modules/orders/types/order.types.ts  (delete this)
//     - src/domain/orders/order.types.ts          (this file — keep this)
//
//   Any file that imported from the modules path must be updated to import
//   from '@/domain/orders/order.types' instead.
//
// Dependency rule (strict — violations cause duplicate brand errors):
//   ✅ IsoTimestamp  → from '@/domain/value-objects/pickup-time'
//   ✅ PickupSchedule constructors → from '@/domain/order/pickup-schedule'
//      (only needed by consumers; this file only uses IsoTimestamp)
//   ❌ Must NOT import from: src/modules/shared/domain/pickup  (deleted)
//   ❌ Must NOT import from: checkout.types, hooks, Stripe SDK, React
//   ❌ Must NOT define IsoTimestamp or PickupSchedule inline — use the domain
//
// Import graph:
//   domain/value-objects/pickup-time.ts   (IsoTimestamp — no deps)
//               ↓
//   domain/orders/order.types.ts           ← YOU ARE HERE
//               ↓
//   domain/adapters/pickup-schedule.adapter.ts
//               ↓
//   modules/checkout/types/checkout.types.ts
// =============================================================================

import type { Database } from '@/types/supabase';

// IsoTimestamp comes exclusively from the value-objects layer.
// Never redefine it here — duplicate unique symbols cause TS2322.
import type { IsoTimestamp } from '@/domain/value-objects/pickup-time';

export type { IsoTimestamp };

// =============================================================================
// BRANDED PRIMITIVES
// =============================================================================
// Each brand uses its own unique symbol so the types are nominally distinct.
// Construction goes through validated factory functions below.

declare const __orderIdBrand:             unique symbol;
declare const __stripeSessionIdBrand:     unique symbol;
declare const __stripePaymentIntentBrand: unique symbol;
declare const __userIdBrand:              unique symbol;
declare const __guestTokenBrand:          unique symbol;
declare const __centsBrand:               unique symbol;

export type OrderId               = string & { readonly [__orderIdBrand]: 'OrderId' };
export type StripeSessionId       = string & { readonly [__stripeSessionIdBrand]: 'StripeSessionId' };
export type StripePaymentIntentId = string & { readonly [__stripePaymentIntentBrand]: 'StripePaymentIntentId' };
export type UserId                = string & { readonly [__userIdBrand]: 'UserId' };
export type GuestToken            = string & { readonly [__guestTokenBrand]: 'GuestToken' };
export type Cents                 = number & { readonly [__centsBrand]: 'Cents' };

export function toOrderId(raw: string): OrderId {
  if (!raw.trim()) throw new TypeError('toOrderId: empty string');
  return raw as OrderId;
}
export function toStripeSessionId(raw: string): StripeSessionId {
  if (!raw.trim()) throw new TypeError('toStripeSessionId: empty string');
  return raw as StripeSessionId;
}
export function toStripePaymentIntentId(raw: string): StripePaymentIntentId {
  if (!raw.trim()) throw new TypeError('toStripePaymentIntentId: empty string');
  return raw as StripePaymentIntentId;
}
export function toUserId(raw: string): UserId {
  if (!raw.trim()) throw new TypeError('toUserId: empty string');
  return raw as UserId;
}
export function toGuestToken(raw: string): GuestToken {
  if (!raw.trim()) throw new TypeError('toGuestToken: empty string');
  return raw as GuestToken;
}
export function toCents(raw: number): Cents {
  if (!Number.isFinite(raw) || raw < 0 || !Number.isInteger(raw)) {
    throw new TypeError(`toCents: expected non-negative integer, got ${raw}`);
  }
  return raw as Cents;
}

// =============================================================================
// FULFILLMENT TYPE
// =============================================================================
// How the order reaches the customer. Distinct from OrderType (food vs merch).

export const FULFILLMENT_TYPE_VALUES = ['pickup', 'delivery', 'dine_in'] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPE_VALUES)[number];

export function isFulfillmentType(v: string): v is FulfillmentType {
  return (FULFILLMENT_TYPE_VALUES as readonly string[]).includes(v);
}

export function assertFulfillmentType(
  v: string,
  context = 'assertFulfillmentType',
): asserts v is FulfillmentType {
  if (!isFulfillmentType(v)) {
    throw new TypeError(
      `${context}: "${v}" is not a valid FulfillmentType. ` +
      `Expected one of: ${FULFILLMENT_TYPE_VALUES.join(', ')}`,
    );
  }
}

// =============================================================================
// ORDER TYPE (product category — food vs merch)
// =============================================================================

export enum OrderType {
  FOOD  = 'food',
  MERCH = 'merch',
}

export const ORDER_TYPE_VALUES = [OrderType.FOOD, OrderType.MERCH] as const;

export function isOrderType(v: string): v is OrderType {
  return (ORDER_TYPE_VALUES as readonly string[]).includes(v);
}

// =============================================================================
// ORDER STATUS
// =============================================================================

export enum OrderStatus {
  CONFIRMED = 'confirmed',
  PREPARING = 'preparing',
  READY     = 'ready',
  SHIPPED   = 'shipped',
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
  [OrderStatus.READY]:     'Ready',
  [OrderStatus.SHIPPED]:   'Shipped',
  [OrderStatus.DELIVERED]: 'Delivered',
  [OrderStatus.CANCELLED]: 'Cancelled',
};

export const KITCHEN_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
];

export function isOrderStatus(v: string): v is OrderStatus {
  return (ORDER_STATUS_VALUES as readonly string[]).includes(v);
}

export function getNextOrderStatus(status: OrderStatus): OrderStatus | null {
  switch (status) {
    case OrderStatus.CONFIRMED: return OrderStatus.PREPARING;
    case OrderStatus.PREPARING: return OrderStatus.READY;
    case OrderStatus.READY:     return OrderStatus.DELIVERED;
    case OrderStatus.SHIPPED:
    case OrderStatus.DELIVERED:
    case OrderStatus.CANCELLED: return null;
  }
}

// =============================================================================
// PAYMENT STATUS
// =============================================================================

export enum PaymentStatus {
  PAID     = 'paid',
  FAILED   = 'failed',
  REFUNDED = 'refunded',
}

export const PAYMENT_STATUS_VALUES = [
  PaymentStatus.PAID,
  PaymentStatus.FAILED,
  PaymentStatus.REFUNDED,
] as const;

export function isPaymentStatus(v: string): v is PaymentStatus {
  return (PAYMENT_STATUS_VALUES as readonly string[]).includes(v);
}

// =============================================================================
// VERIFICATION STATUS
// =============================================================================

export const VERIFICATION_STATUS_VALUES = [
  'not_required',
  'pending',
  'verified',
  'failed',
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUS_VALUES)[number];

export function isVerificationStatus(v: string): v is VerificationStatus {
  return (VERIFICATION_STATUS_VALUES as readonly string[]).includes(v);
}

// =============================================================================
// RISK LEVEL
// =============================================================================

export const RISK_LEVEL_VALUES = ['low', 'medium', 'high'] as const;
export type RiskLevel = (typeof RISK_LEVEL_VALUES)[number];

export function isRiskLevel(v: string): v is RiskLevel {
  return (RISK_LEVEL_VALUES as readonly string[]).includes(v);
}

// =============================================================================
// ORDER SOURCE
// =============================================================================

export const ORDER_SOURCE_VALUES = ['auth', 'guest'] as const;
export type OrderSource = (typeof ORDER_SOURCE_VALUES)[number];

export function isOrderSource(v: string): v is OrderSource {
  return (ORDER_SOURCE_VALUES as readonly string[]).includes(v);
}

// =============================================================================
// CUSTOMER IDENTITY — discriminated union
// =============================================================================
// Replaces dual-nullable `customer_uid: string | null, guest_token: string | null`.
// "Both null" is unrepresentable at the type level.

export type AuthenticatedIdentity = {
  readonly source:     'auth';
  readonly userId:     UserId;
  readonly guestToken: null;
};

export type GuestIdentity = {
  readonly source:     'guest';
  readonly userId:     null;
  readonly guestToken: GuestToken;
};

export type CustomerIdentity = AuthenticatedIdentity | GuestIdentity;

export function authenticatedIdentity(userId: UserId): AuthenticatedIdentity {
  return { source: 'auth', userId, guestToken: null };
}

export function guestIdentity(token: GuestToken): GuestIdentity {
  return { source: 'guest', userId: null, guestToken: token };
}

export function isAuthenticatedIdentity(id: CustomerIdentity): id is AuthenticatedIdentity {
  return id.source === 'auth';
}

export function isGuestIdentity(id: CustomerIdentity): id is GuestIdentity {
  return id.source === 'guest';
}

// =============================================================================
// CART ITEM TYPES
// =============================================================================

export interface ModifierSelection {
  readonly id:               string;
  readonly name:             string;
  readonly price_adjustment: number;
}

// Backward-compatibility alias — the mapper imports this name.
// New code should use ModifierSelection.
export type OrderCartItemModifierSelection = ModifierSelection;

export interface OrderCartItemModifier {
  readonly id:               string;
  readonly group_id:         string;
  readonly group_name:       string | null;
  readonly name:             string | null;
  readonly price_adjustment: number;
  readonly selections:       readonly ModifierSelection[];
}

export interface OrderCartItem {
  readonly id:                   string | null;
  readonly menu_item_id:         string;
  readonly name:                 string;
  readonly quantity:             number;
  readonly unit_price_cents:     number;
  // Legacy price fields — kept for backward compatibility with mappers and
  // existing cart_items JSON blobs stored in the DB. New code should use
  // unit_price_cents. These are optional so existing typed objects don't break.
  readonly price?:               number;
  readonly base_price?:          number;
  readonly unit_price?:          number;
  readonly notes:                string | null;
  readonly special_instructions: string | null;
  readonly modifiers:            readonly OrderCartItemModifier[];
}

export interface CartItemModifierInput {
  readonly modifier_group_id: string;
  readonly selections: readonly {
    readonly id:               string;
    readonly name:             string;
    readonly price_adjustment: number;
  }[];
}

// Backward-compatibility alias — index.ts imports this name.
export type CartItemModifier = CartItemModifierInput;

export interface AddToCartPayload {
  readonly item_id:               string;
  readonly name:                  string;
  readonly base_price:            number;
  readonly modifiers:             readonly CartItemModifierInput[];
  readonly quantity:              number;
  readonly special_instructions?: string;
}

// =============================================================================
// SHIPPING ADDRESS
// =============================================================================

export interface ShippingAddress {
  readonly name?:       string;
  readonly line1:       string;
  readonly line2?:      string;
  readonly city:        string;
  readonly state:       string;
  readonly postal_code: string;
  readonly country:     string;
  readonly phone?:      string;
}

// =============================================================================
// ORDER PRICING
// =============================================================================

export interface OrderPricing {
  readonly subtotal_cents:     Cents;
  readonly tax_cents:          Cents;
  readonly tip_cents:          Cents;
  readonly discount_cents:     Cents;
  readonly delivery_fee_cents: Cents;
  readonly service_fee_cents:  Cents;
  readonly total_cents:        Cents;
  readonly currency:           string;
}

// =============================================================================
// CORE ORDER TYPE
// =============================================================================

type DbJson = Database['public']['Tables']['orders']['Row']['metadata'];

export interface Order {
  // ── Identity ──────────────────────────────────────────────────────────────
  readonly id:           OrderId;
  readonly order_number: number | null;

  // ── Stripe ────────────────────────────────────────────────────────────────
  readonly stripe_session_id:        StripeSessionId;
  readonly stripe_payment_intent_id: StripePaymentIntentId | null;

  // ── Customer ──────────────────────────────────────────────────────────────
  readonly identity:       CustomerIdentity;
  readonly customer_uid:   string | null;
  readonly guest_token:    string | null;
  readonly source:         OrderSource;
  readonly customer_email: string | null;
  readonly customer_name:  string | null;
  readonly customer_phone: string | null;

  // ── Classification ─────────────────────────────────────────────────────────
  readonly order_type:       OrderType;
  readonly fulfillment_type: FulfillmentType;

  // ── Pickup scheduling ──────────────────────────────────────────────────────
  // Raw DB value. null = ASAP, ISO string = scheduled.
  // To get the typed domain object: fromRaw(order.pickup_time) from the adapter.
  readonly pickup_time: IsoTimestamp | null;

  // ── Pricing ────────────────────────────────────────────────────────────────
  readonly amount_subtotal: number;
  readonly amount_tax:      number;
  readonly amount_shipping: number;
  readonly amount_total:    number;
  // currency is also available flat for direct access (e.g. in mappers/API).
  // It duplicates pricing.currency but is kept for backward compatibility.
  readonly currency:        string;
  readonly pricing:         OrderPricing;

  // ── Status ─────────────────────────────────────────────────────────────────
  readonly payment_status: PaymentStatus;
  readonly status:         OrderStatus;

  // ── Risk & verification ────────────────────────────────────────────────────
  readonly risk_score:          number | null;
  readonly risk_level:          RiskLevel | null;
  readonly verification_status: VerificationStatus;

  // ── Cart ───────────────────────────────────────────────────────────────────
  readonly cart_items: readonly OrderCartItem[] | null;

  // ── Delivery ───────────────────────────────────────────────────────────────
  readonly assigned_to:      string | null;
  readonly shipping_name:    string | null;
  readonly shipping_address: ShippingAddress | null;
  readonly shipping_phone:   string | null;
  readonly shipping_city:    string | null;
  readonly shipping_state:   string | null;
  readonly shipping_zip:     string | null;
  readonly shipping_country: string | null;

  // ── Misc ───────────────────────────────────────────────────────────────────
  readonly notes:                string | null;
  readonly estimated_ready_time: IsoTimestamp | null;
  readonly metadata:             DbJson;

  // ── Timestamps ─────────────────────────────────────────────────────────────
  readonly created_at: IsoTimestamp;
  readonly updated_at: IsoTimestamp;
}

// =============================================================================
// KITCHEN ORDER VIEW
// =============================================================================

export interface KitchenOrder {
  readonly id:               OrderId;
  readonly created_at:       IsoTimestamp;
  readonly customer_name:    string | null;
  readonly customer_phone:   string | null;
  readonly amount_total:     number;
  readonly status:           OrderStatus;
  readonly fulfillment_type: FulfillmentType;
  readonly pickup_time:      IsoTimestamp | null;
  readonly cart_items:       readonly OrderCartItem[];
  readonly assigned_to:      string | null;
  readonly notes:            string | null;
}

// =============================================================================
// ORDER EVENTS
// =============================================================================

export type OrderEventData = Record<string, unknown>;

export interface OrderEvent {
  readonly id:         string;
  readonly order_id:   OrderId;
  readonly event_type: string;
  readonly event_data: OrderEventData | null;
  readonly created_at: IsoTimestamp;
  readonly user_id:    UserId | null;
}

export interface RecordEventRequest {
  readonly order_id:    OrderId;
  readonly event_type:  string;
  readonly user_id?:    UserId | null;
  readonly event_data?: OrderEventData | null;
}

export function normaliseRecordEventRequest(
  raw: Readonly<Record<string, unknown>>,
): RecordEventRequest {
  const orderId   = (raw['order_id']   ?? raw['orderId'])                                       as string | undefined;
  const eventType = (raw['event_type'] ?? raw['eventType'])                                     as string | undefined;
  const userId    = (raw['user_id']    ?? raw['userId'] ?? raw['actor_uid'] ?? raw['actorUid']) as string | null | undefined;
  const eventData = (raw['event_data'] ?? raw['eventData'] ?? raw['metadata'] ?? raw['data'])   as OrderEventData | null | undefined;

  if (!orderId)   throw new TypeError('normaliseRecordEventRequest: missing order_id');
  if (!eventType) throw new TypeError('normaliseRecordEventRequest: missing event_type');

  return {
    order_id:   toOrderId(orderId),
    event_type: eventType,
    user_id:    userId ? toUserId(userId) : null,
    event_data: eventData ?? null,
  };
}

// =============================================================================
// TIMELINE & METRICS
// =============================================================================

export interface OrderTimeline {
  readonly amount_total:   number;
  readonly current_status: string;
  readonly customer_uid:   UserId | null;
  readonly event_data:     OrderEventData | null;
  readonly event_id:       string | null;
  readonly event_time:     IsoTimestamp | null;
  readonly event_type:     string | null;
  readonly order_id:       OrderId;
  readonly order_number:   string;
  readonly user_id:        UserId | null;
}

export interface OrderPerformanceMetrics {
  readonly created_at:   IsoTimestamp;
  readonly order_id:     OrderId;
  readonly order_number: string | null;
  readonly status:       string;
  readonly updated_at:   IsoTimestamp;
}