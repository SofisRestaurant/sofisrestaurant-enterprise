// supabase/functions/stripe-webhook/order-creation.ts
// ============================================================================
// CREATE ORDER FROM SESSION — Production hardened (2026)
// ============================================================================
// WHAT THIS FILE IS RESPONSIBLE FOR:
//   Receive PreparedCartState → validate it → persist to DB.
//   It NEVER decides order meaning. It only stores what prepareAuthoritativeCartState
//   already determined.
//
// THE TWO DB COLUMN FIX (root cause of fulfillment_type = null):
//   BEFORE: order_type: orderType  → wrote 'pickup' to orders.order_type (WRONG)
//   AFTER:  order_type: 'food'     → correct order category
//           fulfillment_type: orderType → correct fulfillment method
//
// NAMING NOTE:
//   prepared.orderType = 'pickup' | 'delivery' | 'dine_in'  (fulfillment, per pricing.ts)
//   orders.order_type  = 'food' | 'merch'                   (what was sold)
//   orders.fulfillment_type = 'pickup' | 'delivery' | ...   (how it is delivered)
// ============================================================================

import type Stripe from "stripe";

import { DB_ORD_CONFIRMED, DB_PMT_PAID } from "./env.ts";
import { log, prefix } from "./logging.ts";
import { findOrderBySessionId } from "./order-queries.ts";
import { prepareAuthoritativeCartState } from "./pending-cart.ts";
import { STRIPE_API_VERSION } from "./stripe-client.ts";
import type {
  DbClient,
  OrderInsert,
  OrderLocated,
  PreparedCartState,
} from "./types.ts";
import type { OrderType } from "../_shared/pricing.ts";
import {
  normCurrency,
  snapshotNumber,
  snapshotString,
  snapshotStringArray,
  toJson,
} from "./utils.ts";

// ─── Valid values (kept in sync with DB CHECK constraint) ─────────────────────

const VALID_ORDER_TYPES = new Set<OrderType>(['pickup', 'delivery', 'dine_in'] as const);

// ─── Order state validation factory ──────────────────────────────────────────
// Single checkpoint between prepareAuthoritativeCartState and the DB write.
// If this throws, the webhook returns 500 → Stripe retries.
// This is intentional: bad state should retry, not insert silently.

type ValidatedOrderState = {
  orderType:  OrderType;  // fulfillment — 'pickup' | 'delivery' | 'dine_in'
  totalCents: number;
  cart:       PreparedCartState['cart'];
  snapshot:   PreparedCartState['snapshot'];
  pricingHash: string;
  currency:   string;
  consumedNow: boolean;
};

function buildValidatedOrderState(
  prepared: PreparedCartState,
  requestId: string,
): ValidatedOrderState {
  const { orderType } = prepared;

  // Runtime guard — TypeScript types are erased at runtime.
  // Values come from external Stripe metadata and must be validated at this boundary.
  if (!VALID_ORDER_TYPES.has(orderType)) {
    throw new Error(
      `[${requestId}] buildValidatedOrderState: invalid orderType` +
      ` "${String(orderType)}" — must be 'pickup', 'delivery', or 'dine_in'`,
    );
  }

  const totalCents = snapshotNumber(prepared.snapshot, 'totalCents');
  if (totalCents <= 0) {
    throw new Error(
      `[${requestId}] buildValidatedOrderState: totalCents ${totalCents} is not positive`,
    );
  }

  return {
    orderType,
    totalCents,
    cart:        prepared.cart,
    snapshot:    prepared.snapshot,
    pricingHash: prepared.pricingHash,
    currency:    prepared.currency,
    consumedNow: prepared.consumedNow,
  };
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

type OrderCreationPricing = {
  subtotalCents:         number;
  promoDiscountCents:    number;
  campaignDiscountCents: number;
  creditCents:           number;
  taxCents:              number;
  deliveryFeeCents:      number;
  serviceFeeCents:       number;
  tipCents:              number;
  totalCents:            number;
  currency:              string;
};

function buildOrderCreationPricing(
  snapshot: unknown,
  fallbackCurrency: string,
): OrderCreationPricing {
  return {
    subtotalCents:         snapshotNumber(snapshot, "subtotalCents"),
    promoDiscountCents:    snapshotNumber(snapshot, "promoDiscountCents"),
    campaignDiscountCents: snapshotNumber(snapshot, "campaignDiscountCents"),
    creditCents:           snapshotNumber(snapshot, "creditCents"),
    taxCents:              snapshotNumber(snapshot, "taxCents"),
    deliveryFeeCents:      snapshotNumber(snapshot, "deliveryFeeCents"),
    serviceFeeCents:       snapshotNumber(snapshot, "serviceFeeCents"),
    tipCents:              snapshotNumber(snapshot, "tipCents"),
    totalCents:            snapshotNumber(snapshot, "totalCents"),
    currency: normCurrency(
      snapshotString(snapshot, "currency") ?? fallbackCurrency,
    ),
  };
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

function buildOrderMetadata(args: {
  requestId:    string;
  session:      Stripe.Checkout.Session;
  cartId:       string;
  orderType:    OrderType;   // fulfillment type
  pricingHash:  string;
  consumedNow:  boolean;
  pricing:      OrderCreationPricing;
  snapshot:     unknown;
}): ReturnType<typeof toJson> {
  const {
    requestId, session, cartId, orderType,
    pricingHash, consumedNow, pricing, snapshot,
  } = args;

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  return toJson({
    source:                    "stripe-webhook",
    request_id:                requestId,
    stripe_api_version:        STRIPE_API_VERSION,
    pending_cart_id:           cartId,
    stripe_session_id:         session.id,
    stripe_payment_intent_id:  paymentIntentId,
    stripe_session_status:     session.status ?? null,
    stripe_payment_status:     session.payment_status ?? null,
    // ✅ Both axes stored in metadata for analytics and debugging
    order_category:            "food",      // WHAT was sold (hardcoded — all current orders)
    fulfillment_type:          orderType,   // HOW delivered ('pickup' | 'delivery' | 'dine_in')
    promo_id:                  snapshotString(snapshot, "promoId"),
    credit_id:                 snapshotString(snapshot, "creditId"),
    applied_campaign_ids:      snapshotStringArray(snapshot, "appliedCampaignIds"),
    pricing_hash:              pricingHash,
    pricing_snapshot:          toJson(snapshot),
    pricing_summary: toJson({
      subtotalCents:         pricing.subtotalCents,
      promoDiscountCents:    pricing.promoDiscountCents,
      campaignDiscountCents: pricing.campaignDiscountCents,
      creditCents:           pricing.creditCents,
      discountCents:
        pricing.promoDiscountCents +
        pricing.campaignDiscountCents +
        pricing.creditCents,
      taxCents:              pricing.taxCents,
      deliveryFeeCents:      pricing.deliveryFeeCents,
      serviceFeeCents:       pricing.serviceFeeCents,
      tipCents:              pricing.tipCents,
      totalCents:            pricing.totalCents,
      currency:              pricing.currency,
    }),
    stripe_amount_total:       pricing.totalCents,
    stripe_currency:           pricing.currency,
    pending_cart_consumed_now: consumedNow,
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function createOrderFromSession(args: {
  db:        DbClient;
  session:   Stripe.Checkout.Session;
  userId:    string;
  requestId: string;
}): Promise<OrderLocated | null> {
  const { db, session, userId, requestId } = args;

  const prepared = await prepareAuthoritativeCartState({
    db,
    session,
    userId,
    requestId,
  });

  if (prepared === null) {
    return null;
  }

  // Validate through factory — throws on invalid state.
  // Caller lets this propagate as 500 → Stripe retries. Do not catch here.
  const state = buildValidatedOrderState(prepared, requestId);

  const {
    orderType,  // fulfillment ('pickup' | 'delivery' | 'dine_in')
    cart,
    snapshot,
    pricingHash,
    currency,
    consumedNow,
  } = state;

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  const pricing  = buildOrderCreationPricing(snapshot, currency);
  const metadata = buildOrderMetadata({
    requestId,
    session,
    cartId: cart.id,
    orderType,
    pricingHash,
    consumedNow,
    pricing,
    snapshot,
  });

  const insert: OrderInsert = {
    stripe_session_id:         session.id,
    stripe_payment_intent_id:  paymentIntentId,
    // ✅ order_type  = WHAT was sold ('food' | 'merch') — NOT the fulfillment method
    order_type:                "food",
    // ✅ fulfillment_type = HOW it is delivered — this is what orderType actually holds
    fulfillment_type:          orderType,
    customer_uid:              userId,
    customer_email:            session.customer_details?.email ?? null,
    customer_name:             session.customer_details?.name ?? null,
    customer_phone:            session.customer_details?.phone ?? null,
    amount_subtotal:           pricing.subtotalCents,
    amount_tax:                pricing.taxCents,
    amount_shipping:           pricing.deliveryFeeCents,
    amount_total:              pricing.totalCents,
    currency:                  pricing.currency,
    payment_status:            DB_PMT_PAID,
    status:                    DB_ORD_CONFIRMED,
    cart_items:                cart.items,
    metadata,
    notes:                     snapshotString(snapshot, "orderNotes"),
  };

  const { data: inserted, error: insertError } = await db
    .from("orders")
    .insert(insert)
    .select("id,amount_total,payment_status,status,customer_uid")
    .returns<OrderLocated[]>()
    .maybeSingle();

  // 23505 = unique_violation (stripe_session_id UNIQUE) → Stripe retry hit existing order
  if (insertError !== null && insertError.code !== "23505") {
    log("error", "webhook_order_insert_failed", {
      requestId,
      sessionId:        prefix(session.id),
      code:             insertError.code ?? null,
      message:          insertError.message,
      orderType,
      subtotalCents:    pricing.subtotalCents,
      taxCents:         pricing.taxCents,
      deliveryFeeCents: pricing.deliveryFeeCents,
      totalCents:       pricing.totalCents,
    });
    return null;
  }

  if (inserted !== null) {
    log("info", "webhook_order_created", {
      requestId,
      orderId:          prefix(inserted.id),
      sessionId:        prefix(session.id),
      orderCategory:    "food",
      fulfillmentType:  orderType,
      amountTotal:      pricing.totalCents,
      subtotalCents:    pricing.subtotalCents,
      taxCents:         pricing.taxCents,
      deliveryFeeCents: pricing.deliveryFeeCents,
      consumedNow,
    });

    return inserted;
  }

  // Stripe retry path — return the already-created order
  const existing = await findOrderBySessionId(db, session.id);

  if (existing !== null) {
    log("info", "webhook_order_conflict_read", {
      requestId,
      orderId:   prefix(existing.id),
      sessionId: prefix(session.id),
    });
  }

  return existing;
}