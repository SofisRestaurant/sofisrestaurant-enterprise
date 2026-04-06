import type Stripe from "stripe";
import type { DbClient } from "../types.ts";
import { getStripe } from "../stripe-client.ts";
import { createOrderFromSession } from "../order-creation.ts";
import { findOrderBySessionId } from "../order-queries.ts";
import {
  backfillLoyaltyIfMissing,
  emitOrderEvent,
  markCreditUsedIfPending,
  notify,
  recordPromoRedemptionIfMissing,
  upsertPaymentTransaction,
} from "../side-effects.ts";
import { notifyKitchen } from "../kitchen-notify.ts";
import { DB_ORD_CONFIRMED, DB_PMT_PAID } from "../env.ts";
import { log, nowIso, prefix } from "../logging.ts";
import {
  normalizeStripePaid,
  parseCents,
  parseCheckoutSessionEventRef,
  pickMeta,
  shouldRepairToPaid,
  toJson,
} from "../utils.ts";

// ─── Loyalty finalization ─────────────────────────────────────────────────────
//
// Points were atomically debited at checkout start (entry_type='checkout_reserve').
// On payment success:
//   1. Flip ledger entry_type to 'redeemed' for clean reporting.
//   2. Update loyalty_accounts.last_redeem_at.
//
// Best-effort side-effect — failure does NOT fail the webhook.
// Idempotent: filters on entry_type='checkout_reserve', so a second call
// on an already-flipped row is a safe no-op.

async function finalizeLoyaltyReserve(args: {
  db:        DbClient;
  session:   Stripe.Checkout.Session;
  requestId: string;
}): Promise<void> {
  const { db, session, requestId } = args;

  const loyaltyAccountId = pickMeta(session.metadata, "loyalty_account_id");
  const preSessionKey    = pickMeta(session.metadata, "loyalty_pre_session_key");
  const loyaltyPoints    = parseCents(pickMeta(session.metadata, "loyalty_reserved_points"));
  const loyaltyCents     = parseCents(pickMeta(session.metadata, "loyalty_discount_cents"));

  if (loyaltyAccountId === null || loyaltyPoints <= 0 || preSessionKey === null) return;

  const reserveIdemKey = `reserve:${preSessionKey}`;

const { error: flipError } = await db
    .from("loyalty_ledger")
    .insert({
      account_id:      loyaltyAccountId,
      amount:          0,
      balance_after:   0,
      entry_type:      "checkout_release",
      source:          "online_checkout",
      idempotency_key: reserveIdemKey.replace("reserve:", "release:"),
      metadata: {
        stripe_session_id: session.id,
        reason:            "payment_completed",
        loyalty_points:    loyaltyPoints,
        loyalty_cents:     loyaltyCents,
      },
    });

  if (flipError) {
    // Non-critical — balance already correct from the reserve debit. Log and continue.
    log("warn", "webhook_loyalty_ledger_flip_failed", {
      requestId,
      sessionId:  prefix(session.id),
      accountId:  prefix(loyaltyAccountId),
      error:      flipError.message,
    });
  } else {
    log("info", "webhook_loyalty_reserve_finalized", {
      requestId,
      sessionId:     prefix(session.id),
      accountId:     prefix(loyaltyAccountId),
      points:        loyaltyPoints,
      discountCents: loyaltyCents,
    });
  }

  // Update last_redeem_at — best-effort, same pattern as backfillLoyaltyIfMissing
  const { error: acctError } = await db
    .from("loyalty_accounts")
    .update({ last_redeem_at: nowIso(), updated_at: nowIso() })
    .eq("id", loyaltyAccountId);

  if (acctError) {
    log("warn", "webhook_loyalty_account_redeem_ts_failed", {
      requestId,
      accountId: prefix(loyaltyAccountId),
      error:     acctError.message,
    });
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleCheckoutSessionCompleted(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const sessionRef = parseCheckoutSessionEventRef(event);

  if (sessionRef === null) {
    log("warn", "webhook_session_missing_id", {
      requestId,
      eventId: prefix(event.id),
    });
    return;
  }

  const stripe  = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionRef.id, {
    expand: ["payment_intent"],
  });

  if (!normalizeStripePaid(session)) {
    log("info", "webhook_session_not_paid", {
      requestId,
      sessionId:     prefix(session.id),
      paymentStatus: session.payment_status,
      status:        session.status,
    });
    return;
  }

  const userId = pickMeta(session.metadata, "user_id", "customer_uid", "uid");

  if (userId === null) {
    log("warn", "webhook_session_no_user_id", {
      requestId,
      sessionId: prefix(session.id),
    });
    return;
  }

  let order = await findOrderBySessionId(db, session.id);
  let wasNewOrder = false;

  if (order === null) {
    order = await createOrderFromSession({ db, session, userId, requestId });

    if (order === null) {
      throw new Error(`webhook_order_create_failed:${session.id}`);
    }

    wasNewOrder = true;
  } else if (shouldRepairToPaid(order)) {
    await db
      .from("orders")
      .update({
        payment_status: DB_PMT_PAID,
        status:         DB_ORD_CONFIRMED,
        updated_at:     nowIso(),
      })
      .eq("id", order.id);
  }

  const orderId            = order.id;
  const orderTotal         = order.amount_total;
  const promoId            = pickMeta(session.metadata, "promo_id");
  const creditId           = pickMeta(session.metadata, "credit_id");
  const promoDiscountCents = parseCents(pickMeta(session.metadata, "promo_discount_cents"));
  const subtotalCents = parseCents(pickMeta(session.metadata, "subtotal_cents")) ?? orderTotal;
  const creditCents        = parseCents(pickMeta(session.metadata, "credit_cents"));
  const totalCents         = typeof session.amount_total === "number"
    ? session.amount_total
    : orderTotal;

  const sideEffects: Promise<void>[] = [
    upsertPaymentTransaction({ db, orderId, session, requestId }),
    backfillLoyaltyIfMissing({
      db,
      userId,
      orderId,
      amountCents: subtotalCents,
      requestId,
    }),
    emitOrderEvent(
      db,
      orderId,
      userId,
      "REVIEW_NUDGE_READY",
      toJson({
        amount_cents: orderTotal,
        source:       "stripe-webhook",
        event_id:     event.id,
      }),
      requestId,
    ),
    // Finalize loyalty reserve — flip checkout_reserve → redeemed in ledger.
    // Best-effort: runs concurrently, never blocks order creation.
    finalizeLoyaltyReserve({ db, session, requestId }),
  ];

  if (promoId !== null) {
    sideEffects.push(
      recordPromoRedemptionIfMissing({
        db,
        promotionId:     promoId,
        userId,
        sessionId:       session.id,
        discountCents:   promoDiscountCents,
        orderTotalCents: totalCents,
        requestId,
      }),
    );
  }

  if (creditId !== null) {
    sideEffects.push(
      markCreditUsedIfPending({
        db,
        creditId,
        userId,
        sessionId: session.id,
        requestId,
      }),
    );
  }

  if (wasNewOrder) {
    sideEffects.push(
      emitOrderEvent(
        db,
        orderId,
        userId,
        "ORDER_CONFIRMED_WEBHOOK",
        toJson({
          event_id:             event.id,
          session_id:           session.id,
          source:               "stripe-webhook",
          credit_cents:         creditCents,
          promo_discount_cents: promoDiscountCents,
        }),
        requestId,
      ),
      notify(
        db,
        orderId,
        "new_order",
        "New order confirmed via Stripe webhook.",
        requestId,
      ),
      // ✅ Kitchen screen notification — triggers Realtime on order_events
      // so new orders appear instantly without polling.
      notifyKitchen({
        db,
        orderId,
        userId,
        fulfillmentType: pickMeta(session.metadata, "order_type") ?? "pickup",
        amountTotal:     orderTotal,
        requestId,
      }),
    );
  }

  await Promise.all(sideEffects);

  log("info", "webhook_checkout_completed", {
    requestId,
    orderId:    prefix(orderId),
    sessionId:  prefix(session.id),
    wasNewOrder,
    orderTotal,
    userId:     prefix(userId),
  });
}