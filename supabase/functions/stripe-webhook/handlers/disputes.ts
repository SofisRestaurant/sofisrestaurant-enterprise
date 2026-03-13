import type Stripe from "stripe";
import { DB_ORD_CONFIRMED, DB_PMT_DISPUTED, DB_PMT_PAID } from "../env.ts";
import { log, nowIso, prefix } from "../logging.ts";
import {
  findOrderByPaymentIntentId,
  loadLatestOrderEvents,
  loadOrderFulfillmentEvidence,
  loadOrderPaymentDetails,
} from "../order-queries.ts";
import { emitOrderEvent, logSecurityEvent, notify } from "../side-effects.ts";
import {
  parseDisputeEventPayload,
  shouldRepairToPaid,
  toJson,
} from "../utils.ts";
import type { DbClient } from "../types.ts";

export async function handleDisputeCreated(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const dispute = parseDisputeEventPayload(event);

  if (dispute === null) {
    log("warn", "webhook_dispute_created_invalid_payload", {
      requestId,
      eventId: prefix(event.id),
    });
    return;
  }

  const order = dispute.paymentIntentId === null
    ? null
    : await findOrderByPaymentIntentId(db, dispute.paymentIntentId);

  const disputeAmountDollars = (dispute.amount / 100).toFixed(2);
  const evidenceDueBy = dispute.evidenceDueByUnix === null
    ? null
    : new Date(dispute.evidenceDueByUnix * 1000).toISOString();
  const evidenceDueDate = evidenceDueBy === null
    ? "check dashboard"
    : evidenceDueBy.split("T")[0];

  let paymentDetails: Record<string, unknown> | null = null;
  let fulfillmentEvidence: Record<string, unknown> | null = null;
  let recentOrderEvents: Array<Record<string, unknown>> = [];

  if (order !== null) {
    [paymentDetails, fulfillmentEvidence, recentOrderEvents] = await Promise
      .all([
        loadOrderPaymentDetails(db, order.id),
        loadOrderFulfillmentEvidence(db, order.id),
        loadLatestOrderEvents(db, order.id, 10),
      ]);
  }

  const disputeSnapshot = toJson({
    source: "stripe-webhook",
    request_id: requestId,
    event_id: event.id,
    dispute_id: dispute.id,
    dispute_amount: dispute.amount,
    dispute_reason: dispute.reason,
    dispute_status: dispute.status,
    dispute_network_reason_code: dispute.networkReasonCode,
    charge_id: dispute.chargeId,
    payment_intent_id: dispute.paymentIntentId,
    order_id: order?.id ?? null,
    evidence_due_by: evidenceDueBy,
    payment_details: paymentDetails === null ? null : toJson(paymentDetails),
    fulfillment_evidence: fulfillmentEvidence === null
      ? null
      : toJson(fulfillmentEvidence),
    recent_order_events: recentOrderEvents.length > 0
      ? toJson(recentOrderEvents)
      : null,
    stripe_evidence_summary: dispute.evidenceSummary === null ? null : toJson({
      has_customer_signature: dispute.evidenceSummary.hasCustomerSignature,
      has_receipt: dispute.evidenceSummary.hasReceipt,
      has_service_documentation:
        dispute.evidenceSummary.hasServiceDocumentation,
      has_shipping_documentation:
        dispute.evidenceSummary.hasShippingDocumentation,
      has_customer_communication:
        dispute.evidenceSummary.hasCustomerCommunication,
      uncategorized_text: dispute.evidenceSummary.uncategorizedText,
    }),
  });

  await logSecurityEvent(
    db,
    "stripe_dispute_created",
    disputeSnapshot,
    requestId,
  );

  if (order !== null) {
    const { error: statusError } = await db
      .from("orders")
      .update({
        payment_status: DB_PMT_DISPUTED,
        updated_at: nowIso(),
      })
      .eq("id", order.id)
      .eq("payment_status", DB_PMT_PAID);

    if (statusError !== null) {
      log("warn", "webhook_dispute_status_update_failed", {
        requestId,
        orderId: prefix(order.id),
        disputeId: prefix(dispute.id),
        code: statusError.code ?? null,
      });
    }

    const evidenceAvailable: string[] = [];
    if (paymentDetails !== null) {
      evidenceAvailable.push("payment/device metadata");
    }
    if (fulfillmentEvidence !== null) {
      evidenceAvailable.push("fulfillment evidence");
    }
    if (recentOrderEvents.length > 0) {
      evidenceAvailable.push(`${recentOrderEvents.length} order events`);
    }

    const evidenceSummaryText = evidenceAvailable.length > 0
      ? `Evidence on file: ${evidenceAvailable.join(", ")}.`
      : "No pre-collected evidence found — manual review required.";

    const notificationMessage =
      `⚠️ Dispute of $${disputeAmountDollars} opened — reason: ${
        dispute.reason ?? "unknown"
      }. ` +
      `Evidence due: ${evidenceDueDate}. ${evidenceSummaryText}`;

    await Promise.all([
      emitOrderEvent(
        db,
        order.id,
        null,
        "DISPUTE_CREATED",
        toJson({
          dispute_id: dispute.id,
          dispute_amount: dispute.amount,
          dispute_reason: dispute.reason,
          dispute_status: dispute.status,
          dispute_network_reason_code: dispute.networkReasonCode,
          evidence_due_by: evidenceDueBy,
          has_payment_details: paymentDetails !== null,
          has_fulfillment_evidence: fulfillmentEvidence !== null,
          recent_event_count: recentOrderEvents.length,
          source: "stripe-webhook",
          event_id: event.id,
        }),
        requestId,
      ),
      notify(db, order.id, "dispute_created", notificationMessage, requestId),
    ]);
  }

  log("warn", "webhook_dispute_created", {
    requestId,
    disputeId: prefix(dispute.id),
    orderId: prefix(order?.id ?? null),
    reason: dispute.reason,
    amount: dispute.amount,
    paymentIntentId: prefix(dispute.paymentIntentId),
    hasPaymentDetails: paymentDetails !== null,
    hasFulfillmentEvidence: fulfillmentEvidence !== null,
    recentEventCount: recentOrderEvents.length,
    evidenceDueBy,
  });
}

export async function handleDisputeUpdated(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const dispute = parseDisputeEventPayload(event);

  if (dispute === null) {
    log("warn", "webhook_dispute_updated_invalid_payload", {
      requestId,
      eventId: prefix(event.id),
    });
    return;
  }

  const order = dispute.paymentIntentId === null
    ? null
    : await findOrderByPaymentIntentId(db, dispute.paymentIntentId);

  if (order === null) {
    log("info", "webhook_dispute_updated_no_order", {
      requestId,
      disputeId: prefix(dispute.id),
      paymentIntentId: prefix(dispute.paymentIntentId),
    });
    return;
  }

  await emitOrderEvent(
    db,
    order.id,
    null,
    "DISPUTE_UPDATED",
    toJson({
      dispute_id: dispute.id,
      dispute_status: dispute.status,
      dispute_reason: dispute.reason,
      source: "stripe-webhook",
      event_id: event.id,
    }),
    requestId,
  );

  log("info", "webhook_dispute_updated", {
    requestId,
    disputeId: prefix(dispute.id),
    orderId: prefix(order.id),
    status: dispute.status,
  });
}

export async function handleDisputeClosed(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const dispute = parseDisputeEventPayload(event);

  if (dispute === null) {
    log("warn", "webhook_dispute_closed_invalid_payload", {
      requestId,
      eventId: prefix(event.id),
    });
    return;
  }

  const order = dispute.paymentIntentId === null
    ? null
    : await findOrderByPaymentIntentId(db, dispute.paymentIntentId);

  if (order === null) {
    log("info", "webhook_dispute_closed_no_order", {
      requestId,
      disputeId: prefix(dispute.id),
    });
    return;
  }

  const disputeWon = dispute.status === "won";
  const disputeLost = dispute.status === "lost";

  if (disputeWon && shouldRepairToPaid(order)) {
    await db
      .from("orders")
      .update({
        payment_status: DB_PMT_PAID,
        status: DB_ORD_CONFIRMED,
        updated_at: nowIso(),
      })
      .eq("id", order.id);
  }

  const outcomeLabel = disputeWon ? "won" : disputeLost ? "lost" : "closed";
  const notificationMessage = `Dispute ${outcomeLabel}: ${
    disputeWon
      ? "Resolved in your favor."
      : "Resolved against you — funds forfeited."
  }`;

  await Promise.all([
    emitOrderEvent(
      db,
      order.id,
      null,
      "DISPUTE_CLOSED",
      toJson({
        dispute_id: dispute.id,
        dispute_status: dispute.status,
        dispute_won: disputeWon,
        dispute_lost: disputeLost,
        source: "stripe-webhook",
        event_id: event.id,
      }),
      requestId,
    ),
    notify(
      db,
      order.id,
      `dispute_${outcomeLabel}`,
      notificationMessage,
      requestId,
    ),
  ]);

  log(disputeLost ? "warn" : "info", "webhook_dispute_closed", {
    requestId,
    disputeId: prefix(dispute.id),
    orderId: prefix(order.id),
    status: dispute.status,
    disputeWon,
  });
}
