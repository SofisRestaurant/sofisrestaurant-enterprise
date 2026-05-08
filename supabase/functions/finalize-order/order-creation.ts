// =============================================================================
// supabase/functions/finalize-order/order-creation.ts
// =============================================================================
//
// [FIX] insertOrReadFinalOrder now sets verification_status, risk_score, and
//       risk_level on every insert. These fields were previously absent,
//       creating schema divergence vs webhook-created orders (nulls in columns
//       that the rest of the system assumes are populated). finalize-order is
//       auth-only, so verification_status is always 'not_required' — the
//       authenticated user has already proven session ownership. risk_score and
//       risk_level are null because no pre-checkout data is available at
//       reconciliation time. Schema: verification_status TEXT NOT NULL DEFAULT
//       'not_required', risk_score INTEGER NULL, risk_level TEXT NULL.
// =============================================================================

import Stripe from 'stripe';
import type { DbClient, PendingCartRecord, PendingCartUpdate, OrderInsert, ExistingOrderRow } from './types.ts';
import type { Json } from '../_shared/database.types.ts';
import type { PricingSnapshot } from '../_shared/pricing.ts';
import { nowIso, log, prefix } from './utils.ts';
import { DB_PAYMENT_STATUS_PAID, DB_ORDER_STATUS_CONFIRMED, DB_ORDER_TYPE_FOOD } from './config.ts';
import { resolveSnapshotOrderType } from './snapshot.ts';

export async function consumePendingCart(args: {
  db: DbClient;
  pendingCart: PendingCartRecord;
  sessionId: string;
  snapshot: PricingSnapshot;
  pricingHash: string;
}): Promise<boolean> {
  const { db, pendingCart, sessionId, snapshot, pricingHash } = args;

  const consumePatch: PendingCartUpdate = {
    consumed_at: nowIso(),
    stripe_session_id: sessionId,
    pricing_snapshot: snapshot as unknown as Json,
    pricing_hash: pricingHash,
  };

  const { data, error } = await db
    .from('pending_carts')
    .update(consumePatch)
    .eq('id', pendingCart.id)
    .is('consumed_at', null)
    .select('id');

  if (error) throw new Error(`PENDING_CART_CONSUME_FAILED:${error.code ?? 'unknown'}`);
  return Array.isArray(data) && data.length > 0;
}

export async function getExistingOrderBySession(
  db: DbClient,
  sessionId: string,
): Promise<ExistingOrderRow | null> {
  const { data } = await db
    .from('orders')
    .select('id,amount_total,payment_status,status')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();
  return data ?? null;
}

export function buildOrderMetadata(args: {
  requestId: string;
  pendingCart: PendingCartRecord;
  snapshot: PricingSnapshot;
  pricingHash: string;
  stripeSession: Stripe.Checkout.Session;
  stripeApiVersion: string;
  stripeAmountTotal: number;
  stripeCurrency: string;
  consumedNow: boolean;
}): Json {
  const { requestId, pendingCart, snapshot, pricingHash, stripeSession, stripeApiVersion, stripeAmountTotal, stripeCurrency, consumedNow } = args;
  const serviceType = resolveSnapshotOrderType(stripeSession, snapshot);

  return {
    source: 'finalize-order',
    request_id: requestId,
    pending_cart_id: pendingCart.id,
    service_type: serviceType,
    order_service_type: serviceType,
    stripe_session_status: stripeSession.status ?? null,
    stripe_payment_status: stripeSession.payment_status ?? null,
    stripe_api_version: stripeApiVersion,
    promo_id: snapshot.promoId,
    credit_id: snapshot.creditId,
    applied_campaign_ids: snapshot.appliedCampaignIds,
    pricing_hash: pricingHash,
    pricing_snapshot: snapshot,
    stripe_amount_total: stripeAmountTotal,
    stripe_currency: stripeCurrency,
    pending_cart_consumed_now: consumedNow,
  } as Json;
}

export async function insertOrReadFinalOrder(args: {
  db: DbClient;
  requestId: string;
  sessionId: string;
  userId: string;
  userEmail: string | null;
  stripeSession: Stripe.Checkout.Session;
  paymentIntentId: string | null;
  snapshot: PricingSnapshot;
  pendingCart: PendingCartRecord;
  orderMetadata: Json;
}): Promise<{ order: ExistingOrderRow; inserted: boolean }> {
  const { db, requestId, sessionId, userId, userEmail, stripeSession, paymentIntentId, snapshot, pendingCart, orderMetadata } = args;

  const totalDiscountCents =
    snapshot.campaignDiscountCents + snapshot.promoDiscountCents + snapshot.creditCents;

  const orderInsert = {
    stripe_session_id: sessionId,
    stripe_payment_intent_id: paymentIntentId,
    order_type: DB_ORDER_TYPE_FOOD,
    customer_uid: userId,
    customer_email: stripeSession.customer_details?.email ?? userEmail ?? null,
    customer_name: stripeSession.customer_details?.name ?? null,
    customer_phone: stripeSession.customer_details?.phone ?? null,
    amount_subtotal: snapshot.subtotalCents,
    amount_tax: snapshot.taxCents,
    amount_shipping: 0,
    amount_total: snapshot.totalCents,
    currency: snapshot.currency,
    payment_status: DB_PAYMENT_STATUS_PAID,
    status: DB_ORDER_STATUS_CONFIRMED,
    cart_items: pendingCart.items,
    metadata: orderMetadata,
    notes: snapshot.orderNotes,
    payment_method_type: 'unknown',
    subtotal_cents: snapshot.subtotalCents,
    tax_cents: snapshot.taxCents,
    tip_cents: 0,
    discount_cents: totalDiscountCents,
    delivery_fee_cents: 0,
    service_fee_cents: 0,
    total_cents: snapshot.totalCents,
    amount_received_cents: snapshot.totalCents,
    refunded_amount_cents: 0,
    // DO NOT include net_amount_cents — generated column
    // ── FIX: risk + verification fields ─────────────────────────────────
    // finalize-order is auth-only: the authenticated user has already proven
    // ownership, so no post-payment OTP gate is appropriate.
    // risk_score/risk_level are null — no pre-checkout scoring data is
    // available at reconciliation time.
    verification_status: 'not_required',
    risk_score: null,
    risk_level: null,
  } as OrderInsert & {
    verification_status: string;
    risk_score: number | null;
    risk_level: string | null;
  };

  const { data: insertedOrder, error: insertError } = await db
    .from('orders')
    .insert(orderInsert)
    .select('id,amount_total,payment_status,status')
    .maybeSingle();

  if (insertError) {
    log('warn', 'order_insert_failed', {
      requestId, sessionId: prefix(sessionId),
      code: insertError.code ?? null, message: insertError.message,
    });
  }

  if (insertedOrder?.id) return { order: insertedOrder, inserted: true };

  const existing = await getExistingOrderBySession(db, sessionId);
  if (existing?.id) return { order: existing, inserted: false };

  throw new Error('ORDER_CREATE_FAILED');
}