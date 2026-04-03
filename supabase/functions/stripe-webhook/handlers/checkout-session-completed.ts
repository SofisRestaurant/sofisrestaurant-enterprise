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

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionRef.id, {
    expand: ["payment_intent"],
  });

  if (!normalizeStripePaid(session)) {
    log("info", "webhook_session_not_paid", {
      requestId,
      sessionId: prefix(session.id),
      paymentStatus: session.payment_status,
      status: session.status,
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
        status: DB_ORD_CONFIRMED,
        updated_at: nowIso(),
      })
      .eq("id", order.id);
  }

  const orderId = order.id;
  const orderTotal = order.amount_total;
  const promoId = pickMeta(session.metadata, "promo_id");
  const creditId = pickMeta(session.metadata, "credit_id");
  const promoDiscountCents = parseCents(
    pickMeta(session.metadata, "promo_discount_cents"),
  );
  const creditCents = parseCents(pickMeta(session.metadata, "credit_cents"));
  const totalCents = typeof session.amount_total === "number"
    ? session.amount_total
    : orderTotal;

  const sideEffects: Promise<void>[] = [
    upsertPaymentTransaction({ db, orderId, session, requestId }),
    backfillLoyaltyIfMissing({
      db,
      userId,
      orderId,
      amountCents: orderTotal,
      requestId,
    }),
    emitOrderEvent(
      db,
      orderId,
      userId,
      "REVIEW_NUDGE_READY",
      toJson({
        amount_cents: orderTotal,
        source: "stripe-webhook",
        event_id: event.id,
      }),
      requestId,
    ),
  ];

  if (promoId !== null) {
    sideEffects.push(
      recordPromoRedemptionIfMissing({
        db,
        promotionId: promoId,
        userId,
        sessionId: session.id,
        discountCents: promoDiscountCents,
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
          event_id: event.id,
          session_id: session.id,
          source: "stripe-webhook",
          credit_cents: creditCents,
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
        amountTotal: orderTotal,
        requestId,
      }),
    );
  }

  await Promise.all(sideEffects);

  log("info", "webhook_checkout_completed", {
    requestId,
    orderId: prefix(orderId),
    sessionId: prefix(session.id),
    wasNewOrder,
    orderTotal,
    userId: prefix(userId),
  });
}