import type Stripe from "stripe";
import {
  DB_ORD_CANCELED,
  DB_ORD_CONFIRMED,
  DB_PMT_CANCELED,
  DB_PMT_FAILED,
  DB_PMT_PAID,
} from "../env.ts";
import { log, nowIso, prefix } from "../logging.ts";
import { findOrderByPaymentIntentId } from "../order-queries.ts";
import {
  backfillLoyaltyIfMissing,
  emitOrderEvent,
  notify,
  upsertPaymentIntentTransaction,
} from "../side-effects.ts";
import {
  parsePaymentIntentEventPayload,
  shouldAllowFailureTransition,
  shouldRepairToPaid,
  toJson,
} from "../utils.ts";
import type { DbClient } from "../types.ts";

export async function handlePaymentIntentSucceeded(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const paymentIntent = parsePaymentIntentEventPayload(event);

  if (paymentIntent === null) {
    log("warn", "webhook_pi_succeeded_invalid_payload", {
      requestId,
      eventId: prefix(event.id),
    });
    return;
  }

  const order = await findOrderByPaymentIntentId(db, paymentIntent.id);

  if (order === null) {
    log("info", "webhook_pi_succeeded_no_order", {
      requestId,
      paymentIntentId: prefix(paymentIntent.id),
    });
    return;
  }

  if (shouldRepairToPaid(order)) {
    await db
      .from("orders")
      .update({
        payment_status: DB_PMT_PAID,
        status: DB_ORD_CONFIRMED,
        updated_at: nowIso(),
      })
      .eq("id", order.id);
  }

  await upsertPaymentIntentTransaction({
    db,
    orderId: order.id,
    paymentIntent,
    eventId: event.id,
    requestId,
  });

  if (order.customer_uid !== null) {
    await backfillLoyaltyIfMissing({
      db,
      userId: order.customer_uid,
      orderId: order.id,
      amountCents: order.amount_total,
      requestId,
    });
  }

  log("info", "webhook_pi_succeeded", {
    requestId,
    orderId: prefix(order.id),
    paymentIntentId: prefix(paymentIntent.id),
    amountReceived: paymentIntent.amountReceived,
  });
}

export async function handlePaymentIntentFailed(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const paymentIntent = parsePaymentIntentEventPayload(event);

  if (paymentIntent === null) {
    log("warn", "webhook_pi_failed_invalid_payload", {
      requestId,
      eventId: prefix(event.id),
    });
    return;
  }

  const order = await findOrderByPaymentIntentId(db, paymentIntent.id);

  if (order === null) {
    log("info", "webhook_pi_failed_no_order", {
      requestId,
      paymentIntentId: prefix(paymentIntent.id),
    });
    return;
  }

  if (shouldAllowFailureTransition(order)) {
    await db
      .from("orders")
      .update({
        payment_status: DB_PMT_FAILED,
        updated_at: nowIso(),
      })
      .eq("id", order.id);
  }

  const failureCode = paymentIntent.lastPaymentError?.code ?? null;
  const declineCode = paymentIntent.lastPaymentError?.declineCode ?? null;
  const failureMessage = paymentIntent.lastPaymentError?.message ?? null;
  const failureType = paymentIntent.lastPaymentError?.type ?? null;

  await Promise.all([
    emitOrderEvent(
      db,
      order.id,
      order.customer_uid,
      "PAYMENT_FAILED",
      toJson({
        payment_intent_id: paymentIntent.id,
        failure_code: failureCode,
        decline_code: declineCode,
        failure_type: failureType,
        failure_message: failureMessage,
        source: "stripe-webhook",
        event_id: event.id,
      }),
      requestId,
    ),
    notify(
      db,
      order.id,
      "payment_failed",
      `Payment failed: ${
        declineCode ?? failureCode ?? failureMessage ?? "unknown reason"
      }.`,
      requestId,
    ),
  ]);

  log("warn", "webhook_payment_failed", {
    requestId,
    orderId: prefix(order.id),
    paymentIntentId: prefix(paymentIntent.id),
    failureCode,
    declineCode,
  });
}

export async function handlePaymentIntentCanceled(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const paymentIntent = parsePaymentIntentEventPayload(event);

  if (paymentIntent === null) {
    log("warn", "webhook_pi_canceled_invalid_payload", {
      requestId,
      eventId: prefix(event.id),
    });
    return;
  }

  const order = await findOrderByPaymentIntentId(db, paymentIntent.id);

  if (order === null) {
    log("info", "webhook_pi_canceled_no_order", {
      requestId,
      paymentIntentId: prefix(paymentIntent.id),
    });
    return;
  }

  if (shouldAllowFailureTransition(order)) {
    await db
      .from("orders")
      .update({
        payment_status: DB_PMT_CANCELED,
        status: DB_ORD_CANCELED,
        updated_at: nowIso(),
      })
      .eq("id", order.id);

    await emitOrderEvent(
      db,
      order.id,
      order.customer_uid,
      "PAYMENT_CANCELED",
      toJson({
        payment_intent_id: paymentIntent.id,
        cancellation_reason: paymentIntent.cancellationReason,
        source: "stripe-webhook",
        event_id: event.id,
      }),
      requestId,
    );
  }

  log("info", "webhook_pi_canceled", {
    requestId,
    orderId: prefix(order.id),
    paymentIntentId: prefix(paymentIntent.id),
    reason: paymentIntent.cancellationReason,
  });
}
