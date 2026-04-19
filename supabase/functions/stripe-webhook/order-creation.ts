// supabase/functions/stripe-webhook/order-creation.ts
// =============================================================================
// Changes from prior version:
//
//   1. createOrderFromSession now accepts:
//        userId:     string | null   (null for guest checkouts)
//        guestToken: string | null   (non-null for guest checkouts)
//
//   2. Validates that exactly one identity is provided.
//
//   3. INSERT now sets:
//        customer_uid → userId (null for guests)
//        guest_token  → guestToken (null for auth users)
//        source       → 'guest' | 'auth'
//      These columns already exist on the orders table.
//
//   4. prepareAuthoritativeCartState receives the nullable userId and the
//      guestToken so it can apply the correct ownership check.
// =============================================================================

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
import type { OrderType, PricingSnapshot } from "../_shared/pricing.ts";
import { buildStoredOrderCartItemsFromSnapshot } from "../_shared/order-cart-items-builder.ts";
import {
  normCurrency,
  pickMeta,
  snapshotNumber,
  snapshotString,
  snapshotStringArray,
  toJson,
} from "./utils.ts";

// ─── Valid values (kept in sync with DB CHECK constraint) ─────────────────────

const VALID_ORDER_TYPES = new Set<OrderType>(['pickup', 'delivery', 'dine_in'] as const);

// ─── Order state validation factory ──────────────────────────────────────────

type ValidatedOrderState = {
  orderType:            OrderType;
  totalCents:           number;
  stripeAmountTotal:    number;
  cart:                 PreparedCartState['cart'];
  snapshot:             PricingSnapshot;
  pricingHash:          string;
  currency:             string;
  consumedNow:          boolean;
  loyaltyDiscountCents: number;
};

function assertPricingSnapshot(
  snapshot: unknown,
  requestId: string,
): asserts snapshot is PricingSnapshot {
  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    !("lines" in snapshot) ||
    !Array.isArray((snapshot as { lines?: unknown }).lines)
  ) {
    throw new Error(`[${requestId}] invalid pricing snapshot`);
  }
}

function buildValidatedOrderState(
  prepared:  PreparedCartState,
  session:   Stripe.Checkout.Session,
  requestId: string,
): ValidatedOrderState {
  assertPricingSnapshot(prepared.snapshot, requestId);
  const { orderType } = prepared;

  if (!VALID_ORDER_TYPES.has(orderType)) {
    throw new Error(
      `[${requestId}] buildValidatedOrderState: invalid orderType` +
      ` "${String(orderType)}" — must be 'pickup', 'delivery', or 'dine_in'`,
    );
  }

  const totalCents = prepared.snapshot.totalCents;
  if (totalCents <= 0) {
    throw new Error(
      `[${requestId}] buildValidatedOrderState: totalCents ${totalCents} is not positive`,
    );
  }

  const loyaltyDiscountCents = parseInt(
    pickMeta(session.metadata, "loyalty_discount_cents") ?? "0",
    10,
  ) || 0;

  const stripeAmountTotal = typeof session.amount_total === "number"
    ? session.amount_total
    : totalCents - loyaltyDiscountCents;

  return {
    orderType,
    totalCents,
    stripeAmountTotal,
    cart:                 prepared.cart,
    snapshot:             prepared.snapshot,
    pricingHash:          prepared.pricingHash,
    currency:             prepared.currency,
    consumedNow:          prepared.consumedNow,
    loyaltyDiscountCents,
  };
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

type OrderCreationPricing = {
  subtotalCents:         number;
  promoDiscountCents:    number;
  campaignDiscountCents: number;
  creditCents:           number;
  loyaltyDiscountCents:  number;
  taxCents:              number;
  deliveryFeeCents:      number;
  serviceFeeCents:       number;
  tipCents:              number;
  totalCents:            number;
  chargedCents:          number;
  currency:              string;
};

function buildOrderCreationPricing(
  snapshot:             unknown,
  fallbackCurrency:     string,
  loyaltyDiscountCents: number,
  stripeAmountTotal:    number,
): OrderCreationPricing {
  return {
    subtotalCents:         snapshotNumber(snapshot, "subtotalCents"),
    promoDiscountCents:    snapshotNumber(snapshot, "promoDiscountCents"),
    campaignDiscountCents: snapshotNumber(snapshot, "campaignDiscountCents"),
    creditCents:           snapshotNumber(snapshot, "creditCents"),
    loyaltyDiscountCents,
    taxCents:              snapshotNumber(snapshot, "taxCents"),
    deliveryFeeCents:      snapshotNumber(snapshot, "deliveryFeeCents"),
    serviceFeeCents:       snapshotNumber(snapshot, "serviceFeeCents"),
    tipCents:              snapshotNumber(snapshot, "tipCents"),
    totalCents:            snapshotNumber(snapshot, "totalCents"),
    chargedCents:          stripeAmountTotal,
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
  orderType:    OrderType;
  pricingHash:  string;
  consumedNow:  boolean;
  pricing:      OrderCreationPricing;
  snapshot:     unknown;
  isGuest:      boolean;
  guestToken:   string | null;
}): ReturnType<typeof toJson> {
  const {
    requestId, session, cartId, orderType,
    pricingHash, consumedNow, pricing, snapshot, isGuest, guestToken,
  } = args;

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  return toJson({
    source:                   "stripe-webhook",
    request_id:               requestId,
    stripe_api_version:       STRIPE_API_VERSION,
    pending_cart_id:          cartId,
    stripe_session_id:        session.id,
    stripe_payment_intent_id: paymentIntentId,
    stripe_session_status:    session.status ?? null,
    stripe_payment_status:    session.payment_status ?? null,
    order_category:           "food",
    fulfillment_type:         orderType,
    is_guest:                 isGuest,
    guest_token:              guestToken ?? null,
    promo_id:                 snapshotString(snapshot, "promoId"),
    credit_id:                snapshotString(snapshot, "creditId"),
    applied_campaign_ids:     snapshotStringArray(snapshot, "appliedCampaignIds"),
    pricing_hash:             pricingHash,
    pricing_snapshot:         toJson(snapshot),
    pricing_summary: toJson({
      subtotalCents:         pricing.subtotalCents,
      promoDiscountCents:    pricing.promoDiscountCents,
      campaignDiscountCents: pricing.campaignDiscountCents,
      creditCents:           pricing.creditCents,
      loyaltyDiscountCents:  pricing.loyaltyDiscountCents,
      discountCents:
        pricing.promoDiscountCents +
        pricing.campaignDiscountCents +
        pricing.creditCents +
        pricing.loyaltyDiscountCents,
      taxCents:         pricing.taxCents,
      deliveryFeeCents: pricing.deliveryFeeCents,
      serviceFeeCents:  pricing.serviceFeeCents,
      tipCents:         pricing.tipCents,
      totalCents:       pricing.chargedCents,
      snapshotTotal:    pricing.totalCents,
      currency:         pricing.currency,
    }),
    stripe_amount_total:       pricing.chargedCents,
    stripe_currency:           pricing.currency,
    pending_cart_consumed_now: consumedNow,
  });
}

// ─── Order items ──────────────────────────────────────────────────────────────

async function insertOrderItemsFromSnapshot(args: {
  db:          DbClient;
  orderId:     string;
  snapshot:    PricingSnapshot;
  pricingHash: string;
  requestId:   string;
}): Promise<void> {
  const { db, orderId, snapshot, pricingHash, requestId } = args;

  try {
    const { data: existing } = await db
      .from("order_items")
      .select("id")
      .eq("order_id", orderId)
      .limit(1)
      .maybeSingle();

    if (existing?.id) return;

    const builtItems = buildStoredOrderCartItemsFromSnapshot(snapshot, pricingHash);

    if (builtItems.length === 0) {
      log("warn", "webhook_order_items_empty", {
        requestId,
        orderId: prefix(orderId),
      });
      return;
    }

    const rows = builtItems.map((item, index) => ({
      order_id:         orderId,
      line_index:       index,
      menu_item_id:     item.menuItemId,
      name:             item.name,
      quantity:         item.quantity,
      unit_price_cents: item.unitPriceCents,
      line_total_cents: item.lineTotalCents,
      modifiers:        item.modifiers as unknown as import("../_shared/database.types.ts").Json,
      notes:            item.notes,
      pricing_hash:     item.pricingHash,
    }));

    const { error } = await db.from("order_items").insert(rows);

    if (error !== null) {
      log("warn", "webhook_order_items_insert_failed", {
        requestId,
        orderId: prefix(orderId),
        code:    error.code ?? null,
        message: error.message,
      });
      return;
    }

    log("info", "webhook_order_items_inserted", {
      requestId,
      orderId: prefix(orderId),
      count:   rows.length,
    });
  } catch (err) {
    log("warn", "webhook_order_items_crash", {
      requestId,
      orderId: prefix(orderId),
      error:   err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function createOrderFromSession(args: {
  db:         DbClient;
  session:    Stripe.Checkout.Session;
  userId:     string | null;   // null for guest checkouts
  guestToken: string | null;   // null for auth checkouts
  requestId:  string;
}): Promise<OrderLocated | null> {
  const { db, session, userId, guestToken, requestId } = args;

  // Exactly one identity must be present — both null means the handler
  // should have already rejected the session before reaching here.
  if (userId === null && guestToken === null) {
    log("error", "webhook_order_no_identity", {
      requestId,
      sessionId: prefix(session.id),
    });
    return null;
  }

  const isGuest = userId === null;

const prepared = await prepareAuthoritativeCartState({
    db,
    session,
    userId,
    _guestToken: guestToken,
    requestId,
  });

  if (prepared === null) {
    return null;
  }

  const state: ValidatedOrderState = buildValidatedOrderState(prepared, session, requestId);

  const {
    orderType,
    cart,
    snapshot,
    pricingHash,
    currency,
    consumedNow,
    stripeAmountTotal,
    loyaltyDiscountCents,
  } = state;

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  const pricing  = buildOrderCreationPricing(snapshot, currency, loyaltyDiscountCents, stripeAmountTotal);
  const metadata = buildOrderMetadata({
    requestId,
    session,
    cartId:     cart.id,
    orderType,
    pricingHash,
    consumedNow,
    pricing,
    snapshot,
    isGuest,
    guestToken,
  });

  // ── Build insert ───────────────────────────────────────────────────────────
  // guest_token and source are columns that already exist on the orders table.
  // Auth orders set customer_uid; guest orders set guest_token.
  // Both set source to distinguish the pipeline in queries and logs.

  const insert = {
    stripe_session_id:         session.id,
    stripe_payment_intent_id:  paymentIntentId,
    order_type:                "food",
    fulfillment_type:          orderType,
    // Identity — one of these will be non-null
    customer_uid:              userId,
    guest_token:               guestToken ?? null,
    source:                    isGuest ? "guest" : "auth",
    // Customer details from Stripe (populated for both pipelines when available)
    customer_email:            session.customer_details?.email ?? null,
    customer_name:             session.customer_details?.name ?? null,
    customer_phone:            session.customer_details?.phone ?? null,
    // Pricing
    amount_subtotal:           pricing.subtotalCents,
    amount_tax:                pricing.taxCents,
    amount_shipping:           pricing.deliveryFeeCents,
    amount_total:              pricing.chargedCents,
    subtotal_cents:            pricing.subtotalCents,
    tax_cents:                 pricing.taxCents,
    tip_cents:                 pricing.tipCents,
    discount_cents:
      pricing.promoDiscountCents +
      pricing.campaignDiscountCents +
      pricing.creditCents +
      pricing.loyaltyDiscountCents,
    delivery_fee_cents:        pricing.deliveryFeeCents,
    service_fee_cents:         pricing.serviceFeeCents,
    total_cents:               pricing.chargedCents,
    currency:                  pricing.currency,
    payment_status:            DB_PMT_PAID,
    status:                    DB_ORD_CONFIRMED,
    cart_items:                cart.items,
    metadata,
    notes:                     snapshotString(snapshot, "orderNotes"),
  } as OrderInsert & { fulfillment_type: string; guest_token: string | null; source: string };

  const { data: inserted, error: insertError } = await db
    .from("orders")
    .insert(insert)
    .select("id,amount_total,payment_status,status,customer_uid")
    .returns<OrderLocated[]>()
    .maybeSingle();

  // 23505 = unique_violation (stripe_session_id UNIQUE) → already exists
  if (insertError !== null && insertError.code !== "23505") {
    log("error", "webhook_order_insert_failed", {
      requestId,
      sessionId:        prefix(session.id),
      code:             insertError.code ?? null,
      message:          insertError.message,
      orderType,
      isGuest,
      subtotalCents:    pricing.subtotalCents,
      taxCents:         pricing.taxCents,
      deliveryFeeCents: pricing.deliveryFeeCents,
      chargedCents:     pricing.chargedCents,
    });
    return null;
  }

  if (inserted !== null) {
    log("info", "webhook_order_created", {
      requestId,
      orderId:              prefix(inserted.id),
      sessionId:            prefix(session.id),
      orderCategory:        "food",
      fulfillmentType:      orderType,
      chargedCents:         pricing.chargedCents,
      loyaltyDiscountCents: pricing.loyaltyDiscountCents,
      subtotalCents:        pricing.subtotalCents,
      taxCents:             pricing.taxCents,
      isGuest,
      consumedNow,
    });

    await insertOrderItemsFromSnapshot({
      db,
      orderId:     inserted.id,
      snapshot,
      pricingHash,
      requestId,
    });

    return inserted;
  }

  // Stripe retry path — order already exists, return it
  const existing = await findOrderBySessionId(db, session.id);

  if (existing !== null) {
    log("info", "webhook_order_conflict_read", {
      requestId,
      orderId:   prefix(existing.id),
      sessionId: prefix(session.id),
    });

    await insertOrderItemsFromSnapshot({
      db,
      orderId:     existing.id,
      snapshot,
      pricingHash,
      requestId,
    });
  }

  return existing;
}