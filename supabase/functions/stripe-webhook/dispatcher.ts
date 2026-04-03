
import type Stripe from "stripe";
import { log, prefix } from "./logging.ts";
import { handleCheckoutSessionCompleted } from "./handlers/checkout-session-completed.ts";
import {
  handlePaymentIntentCanceled,
  handlePaymentIntentFailed,
  handlePaymentIntentSucceeded,
} from "./handlers/payment-intent.ts";
import { handleChargeRefunded } from "./handlers/refunds.ts";
import {
  handleDisputeClosed,
  handleDisputeCreated,
  handleDisputeUpdated,
} from "./handlers/disputes.ts";
import { handleCheckoutSessionExpired } from "./handlers/checkout-session-expired.ts";
import type { DbClient } from "./types.ts";

// Events we receive but intentionally ignore (no handler needed).
// Listed explicitly so future engineers know they were considered.
const SILENTLY_IGNORED = new Set([
  "charge.succeeded",
  "charge.updated",
  "payment_intent.created",
  "mandate.updated",
]);

export async function dispatchStripeWebhookEvent(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  // Drop known-ignorable events immediately (no DB work, no logging noise)
  if (SILENTLY_IGNORED.has(event.type)) {
    return;
  }

  switch (event.type) {
    // ── ORDER CREATION (sole path) ──────────────────────────────────────────
    // checkout.session.completed is the only event that creates an order.
    // It has access to session.metadata (pending_cart_id, user_id, order_type)
    // which are required by prepareAuthoritativeCartState.
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(db, event, requestId);
      return;

    // ── PAYMENT STATE UPDATES (no order creation) ───────────────────────────
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(db, event, requestId);
      return;

    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(db, event, requestId);
      return;

    case "payment_intent.canceled":
      await handlePaymentIntentCanceled(db, event, requestId);
      return;

    // ── REFUNDS ─────────────────────────────────────────────────────────────
    case "charge.refunded":
      await handleChargeRefunded(db, event, requestId);
      return;

    // ── DISPUTES ────────────────────────────────────────────────────────────
    case "charge.dispute.created":
      await handleDisputeCreated(db, event, requestId);
      return;

    case "charge.dispute.updated":
      await handleDisputeUpdated(db, event, requestId);
      return;

    case "charge.dispute.closed":
      await handleDisputeClosed(db, event, requestId);
      return;

    // ── CART CLEANUP ────────────────────────────────────────────────────────
    case "checkout.session.expired":
      await handleCheckoutSessionExpired(db, event, requestId);
      return;

    // ── UNKNOWN ─────────────────────────────────────────────────────────────
    default:
      log("info", "webhook_unhandled_event", {
        requestId,
        eventType: event.type,
        eventId: prefix(event.id),
      });
  }
}