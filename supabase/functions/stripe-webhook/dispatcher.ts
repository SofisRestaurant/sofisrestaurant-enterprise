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

export async function dispatchStripeWebhookEvent(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(db, event, requestId);
      return;

    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(db, event, requestId);
      return;

    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(db, event, requestId);
      return;

    case "payment_intent.canceled":
      await handlePaymentIntentCanceled(db, event, requestId);
      return;

    case "charge.refunded":
      await handleChargeRefunded(db, event, requestId);
      return;

    case "charge.dispute.created":
      await handleDisputeCreated(db, event, requestId);
      return;

    case "charge.dispute.updated":
      await handleDisputeUpdated(db, event, requestId);
      return;

    case "charge.dispute.closed":
      await handleDisputeClosed(db, event, requestId);
      return;

    case "checkout.session.expired":
      await handleCheckoutSessionExpired(db, event, requestId);
      return;

    default:
      log("info", "webhook_unhandled_event", {
        requestId,
        eventType: event.type,
        eventId: prefix(event.id),
      });
  }
}
