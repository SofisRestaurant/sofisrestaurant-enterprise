// supabase/functions/stripe-webhook/index.ts
// =============================================================================
// HTTP entry point for the stripe-webhook Supabase Edge Function.
//
// Responsibilities (this file only):
//   1. Read raw body before any parsing (required for Stripe signature)
//   2. Verify Stripe webhook signature — reject early if invalid
//   3. Initialise the service-role DB client
//   4. Hand off to dispatchStripeWebhookEvent() for all business logic
//
// All event-specific logic lives in:
//   dispatcher.ts → handlers/*.ts → order-creation.ts, side-effects.ts, etc.
//
// Do NOT add business logic here.
// =============================================================================

import Stripe from "stripe";
import { createServiceClient } from "../_shared/supabase.ts";
import { getStripe } from "./stripe-client.ts";
import { asErr, log, sanitizeRequestId } from "./logging.ts";
import { dispatchStripeWebhookEvent } from "./dispatcher.ts";

// ─── Environment ──────────────────────────────────────────────────────────────

function resolveWebhookSecret(): string {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return secret;
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // sanitizeRequestId strips control characters and non-ASCII from the
  // caller-supplied header before it touches any log entry.
  const requestId = sanitizeRequestId(req.headers.get("x-request-id"));

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // ── Raw body read ─────────────────────────────────────────────────────────
  // Must happen before any JSON parsing. Stripe signature verification
  // requires the exact raw bytes as received over the wire.

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (err) {
    log("error", "webhook_body_read_failed", { requestId, error: asErr(err) });
    return new Response("Bad Request", { status: 400 });
  }

  // ── Stripe signature verification ─────────────────────────────────────────
  // Reject requests without a valid signature before touching the DB or Stripe
  // API. This is the primary defence against spoofed webhook calls.

  const stripeSignature = req.headers.get("stripe-signature");
  if (!stripeSignature) {
    log("warn", "webhook_missing_signature", { requestId });
    return new Response("Unauthorized", { status: 401 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    const webhookSecret = resolveWebhookSecret();
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      stripeSignature,
      webhookSecret,
    );
  } catch (err) {
    log("warn", "webhook_signature_verification_failed", {
      requestId,
      error: asErr(err),
    });
    return new Response("Webhook signature verification failed", { status: 400 });
  }

  log("info", "webhook_received", {
    requestId,
    eventId:   event.id,
    eventType: event.type,
  });

  // ── Service client ────────────────────────────────────────────────────────
  // Service role bypasses RLS so handlers can write orders, mark carts
  // consumed, and run side-effects without per-row auth checks.
  // The service key is only available inside the Edge Function runtime.

  let db: ReturnType<typeof createServiceClient>;
  try {
    db = createServiceClient();
  } catch (err) {
    log("error", "webhook_service_init_failed", { requestId, error: asErr(err) });
    return new Response("Service Unavailable", { status: 500 });
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────
  // Any unhandled exception returns 500 so Stripe retries the event.
  // Handlers own their own idempotency — a retry must be safe to process.

  try {
    await dispatchStripeWebhookEvent(db, event, requestId);
  } catch (err) {
    log("error", "webhook_handler_exception", {
      requestId,
      eventType: event.type,
      eventId:   event.id,
      error:     asErr(err),
    });
    return new Response("Internal Server Error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});