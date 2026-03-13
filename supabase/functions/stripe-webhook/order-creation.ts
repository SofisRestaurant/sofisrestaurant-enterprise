import type Stripe from "stripe";

import { DB_ORD_CONFIRMED, DB_PMT_PAID } from "./env.ts";
import { log, prefix } from "./logging.ts";
import { findOrderBySessionId } from "./order-queries.ts";
import { prepareAuthoritativeCartState } from "./pending-cart.ts";
import { STRIPE_API_VERSION } from "./stripe-client.ts";
import type { DbClient, OrderInsert, OrderLocated } from "./types.ts";
import {
  normCurrency,
  snapshotNumber,
  snapshotString,
  snapshotStringArray,
  toJson,
} from "./utils.ts";

type OrderCreationPricing = {
  subtotalCents: number;
  promoDiscountCents: number;
  campaignDiscountCents: number;
  creditCents: number;
  taxCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  tipCents: number;
  totalCents: number;
  currency: string;
};

function buildOrderCreationPricing(
  snapshot: unknown,
  fallbackCurrency: string,
): OrderCreationPricing {
  return {
    subtotalCents: snapshotNumber(snapshot, "subtotalCents"),
    promoDiscountCents: snapshotNumber(snapshot, "promoDiscountCents"),
    campaignDiscountCents: snapshotNumber(snapshot, "campaignDiscountCents"),
    creditCents: snapshotNumber(snapshot, "creditCents"),
    taxCents: snapshotNumber(snapshot, "taxCents"),
    deliveryFeeCents: snapshotNumber(snapshot, "deliveryFeeCents"),
    serviceFeeCents: snapshotNumber(snapshot, "serviceFeeCents"),
    tipCents: snapshotNumber(snapshot, "tipCents"),
    totalCents: snapshotNumber(snapshot, "totalCents"),
    currency: normCurrency(
      snapshotString(snapshot, "currency") ?? fallbackCurrency,
    ),
  };
}

function buildOrderMetadata(args: {
  requestId: string;
  session: Stripe.Checkout.Session;
  cartId: string;
  orderType: string;
  pricingHash: string;
  consumedNow: boolean;
  pricing: OrderCreationPricing;
  snapshot: unknown;
}): ReturnType<typeof toJson> {
  const {
    requestId,
    session,
    cartId,
    orderType,
    pricingHash,
    consumedNow,
    pricing,
    snapshot,
  } = args;

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  return toJson({
    source: "stripe-webhook",
    request_id: requestId,
    stripe_api_version: STRIPE_API_VERSION,
    pending_cart_id: cartId,
    stripe_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    stripe_session_status: session.status ?? null,
    stripe_payment_status: session.payment_status ?? null,
    order_type: orderType,
    order_service_type: orderType,
    promo_id: snapshotString(snapshot, "promoId"),
    credit_id: snapshotString(snapshot, "creditId"),
    applied_campaign_ids: snapshotStringArray(snapshot, "appliedCampaignIds"),
    pricing_hash: pricingHash,
    pricing_snapshot: toJson(snapshot),
    pricing_summary: toJson({
      subtotalCents: pricing.subtotalCents,
      promoDiscountCents: pricing.promoDiscountCents,
      campaignDiscountCents: pricing.campaignDiscountCents,
      creditCents: pricing.creditCents,
      discountCents: pricing.promoDiscountCents +
        pricing.campaignDiscountCents + pricing.creditCents,
      taxCents: pricing.taxCents,
      deliveryFeeCents: pricing.deliveryFeeCents,
      serviceFeeCents: pricing.serviceFeeCents,
      tipCents: pricing.tipCents,
      totalCents: pricing.totalCents,
      currency: pricing.currency,
    }),
    stripe_amount_total: pricing.totalCents,
    stripe_currency: pricing.currency,
    pending_cart_consumed_now: consumedNow,
  });
}

export async function createOrderFromSession(args: {
  db: DbClient;
  session: Stripe.Checkout.Session;
  userId: string;
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

  const { cart, snapshot, pricingHash, orderType, currency, consumedNow } =
    prepared;

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  const pricing = buildOrderCreationPricing(snapshot, currency);
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
    stripe_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    order_type: orderType,
    customer_uid: userId,
    customer_email: session.customer_details?.email ?? null,
    customer_name: session.customer_details?.name ?? null,
    customer_phone: session.customer_details?.phone ?? null,
    amount_subtotal: pricing.subtotalCents,
    amount_tax: pricing.taxCents,
    amount_shipping: pricing.deliveryFeeCents,
    amount_total: pricing.totalCents,
    currency: pricing.currency,
    payment_status: DB_PMT_PAID,
    status: DB_ORD_CONFIRMED,
    cart_items: cart.items,
    metadata,
    notes: snapshotString(snapshot, "orderNotes"),
  };

  const { data: inserted, error: insertError } = await db
    .from("orders")
    .insert(insert)
    .select("id,amount_total,payment_status,status,customer_uid")
    .returns<OrderLocated[]>()
    .maybeSingle();

  if (insertError !== null && insertError.code !== "23505") {
    log("error", "webhook_order_insert_failed", {
      requestId,
      sessionId: prefix(session.id),
      code: insertError.code ?? null,
      message: insertError.message,
      subtotalCents: pricing.subtotalCents,
      taxCents: pricing.taxCents,
      deliveryFeeCents: pricing.deliveryFeeCents,
      totalCents: pricing.totalCents,
    });
    return null;
  }

  if (inserted !== null) {
    log("info", "webhook_order_created", {
      requestId,
      orderId: prefix(inserted.id),
      sessionId: prefix(session.id),
      amountTotal: pricing.totalCents,
      subtotalCents: pricing.subtotalCents,
      taxCents: pricing.taxCents,
      deliveryFeeCents: pricing.deliveryFeeCents,
      consumedNow,
    });

    return inserted;
  }

  const existing = await findOrderBySessionId(db, session.id);

  if (existing !== null) {
    log("info", "webhook_order_conflict_read", {
      requestId,
      orderId: prefix(existing.id),
      sessionId: prefix(session.id),
    });
  }

  return existing;
}
