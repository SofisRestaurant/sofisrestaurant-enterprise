// supabase/functions/stripe-webhook/handlers/refunds.ts
// =============================================================================
// Phase 2 hardened:
//   - checkEventIdempotency() is first; DB errors throw.
//   - Charge events carry no checkout session metadata — parser not used.
//   - Two-layer dedup retained and documented:
//       Layer 1 (event-level): checkEventIdempotency() — blocks duplicate
//         Stripe deliveries of the same charge.refunded event.
//       Layer 2 (refund-level): financial_transactions stripe_charge_id lookup
//         — blocks duplicate recording of the same refundId within an order
//         (relevant when a charge is partially refunded multiple times and
//         Stripe re-delivers the charge event with a new refund appended).
// =============================================================================

import type Stripe from "stripe";
import { DB_PMT_PARTIAL_REFUND, DB_PMT_REFUNDED } from "../env.ts";
import { log, nowIso, prefix } from "../logging.ts";
import { findOrderByPaymentIntentId } from "../order-queries.ts";
import { emitOrderEvent, notify } from "../side-effects.ts";
import {
  normCurrency,
  parseChargeEventPayload,
  resolveLatestRefund,
  toJson,
} from "../utils.ts";
import type { DbClient, FinancialTxInsert, RefundKind } from "../types.ts";
import { checkEventIdempotency } from "../shared/idempotency.ts";

export async function handleChargeRefunded(
  db:        DbClient,
  event:     Stripe.Event,
  requestId: string,
): Promise<void> {
  // ── 1. Idempotency guard (event-level) ────────────────────────────────────
  const idempotency = await checkEventIdempotency(db, event.id, event.type, requestId);
  if (idempotency.alreadyProcessed) return;
  if (idempotency.dbError) {
    throw new Error(`webhook_idempotency_failed:${event.id} — ${idempotency.error}`);
  }

  const charge = parseChargeEventPayload(event);
  if (charge === null) {
    log("warn", "webhook_refund_invalid_payload", {
      requestId,
      eventId: prefix(event.id),
    });
    return;
  }

  if (charge.paymentIntentId === null) {
    log("warn", "webhook_refund_no_pi", {
      requestId,
      chargeId: prefix(charge.id),
    });
    return;
  }

  const order = await findOrderByPaymentIntentId(db, charge.paymentIntentId);
  if (order === null) {
    log("info", "webhook_refund_no_order", {
      requestId,
      paymentIntentId: prefix(charge.paymentIntentId),
    });
    return;
  }

  const latestRefund   = resolveLatestRefund(charge.refunds);
  const refundId       = latestRefund?.id ?? null;
  const refundAmount   = latestRefund?.amount ?? charge.amountRefunded;
  const refundCurrency = normCurrency(latestRefund?.currency ?? charge.currency);

  if (refundAmount <= 0) return;

  // ── 2. Idempotency guard (refund-level) ───────────────────────────────────
  // Guards against a charge re-delivery that carries the same refundId.
  // The event-level guard above already blocked exact duplicate event IDs;
  // this catches the distinct case where Stripe generates a new event ID
  // for what is effectively the same refund (partial-refund re-deliveries).
  if (refundId !== null) {
    const { data: existingRefundTx } = await db
      .from("financial_transactions")
      .select("id")
      .eq("order_id", order.id)
      .eq("stripe_charge_id", refundId)
      .returns<Array<{ id: string }>>()
      .maybeSingle();

    if (existingRefundTx !== null) {
      log("info", "webhook_refund_already_recorded", {
        requestId,
        orderId:  prefix(order.id),
        refundId: prefix(refundId),
      });
      return;
    }
  }

  const isFullRefund      = charge.amountRefunded >= charge.amount;
  const transactionType: RefundKind = isFullRefund ? "refund" : "partial_refund";
  const newPaymentStatus  = isFullRefund ? DB_PMT_REFUNDED : DB_PMT_PARTIAL_REFUND;

  const transaction: FinancialTxInsert = {
    order_id:                 order.id,
    stripe_payment_intent_id: charge.paymentIntentId,
    stripe_charge_id:         refundId ?? charge.id,
    transaction_type:         transactionType,
    amount:                   -refundAmount,
    currency:                 refundCurrency,
    metadata: toJson({
      source:                "stripe-webhook",
      request_id:            requestId,
      event_id:              event.id,
      charge_id:             charge.id,
      refund_id:             refundId,
      refund_reason:         latestRefund?.reason  ?? null,
      refund_status:         latestRefund?.status  ?? null,
      total_amount_refunded: charge.amountRefunded,
      charge_amount:         charge.amount,
    }),
  };

  const { error: transactionError } = await db
    .from("financial_transactions")
    .insert(transaction);

  if (transactionError !== null) {
    log("warn", "webhook_refund_tx_failed", {
      requestId,
      orderId: prefix(order.id),
      code:    transactionError.code ?? null,
    });
  }

  await db
    .from("orders")
    .update({ payment_status: newPaymentStatus, updated_at: nowIso() })
    .eq("id", order.id);

  const refundDollars       = (refundAmount / 100).toFixed(2);
  const eventTypeLabel      = isFullRefund ? "ORDER_REFUNDED" : "ORDER_PARTIALLY_REFUNDED";
  const notificationType    = isFullRefund ? "full_refund" : "partial_refund";
  const notificationMessage = `${isFullRefund ? "Full" : "Partial"} refund of $${refundDollars} processed.`;

  await Promise.all([
    emitOrderEvent(
      db,
      order.id,
      null,
      eventTypeLabel,
      toJson({
        refund_id:      refundId,
        refund_amount:  refundAmount,
        refund_reason:  latestRefund?.reason ?? null,
        total_refunded: charge.amountRefunded,
        charge_amount:  charge.amount,
        is_full_refund: isFullRefund,
        source:         "stripe-webhook",
        event_id:       event.id,
      }),
      requestId,
    ),
    notify(db, order.id, notificationType, notificationMessage, requestId),
  ]);

  log("info", "webhook_refund_processed", {
    requestId,
    orderId:         prefix(order.id),
    paymentIntentId: prefix(charge.paymentIntentId),
    refundAmount,
    isFullRefund,
    refundId:        prefix(refundId),
  });
}