import Stripe from "stripe";
import { createServiceClient } from "../_shared/supabase.ts";
import { MAX_BODY_BYTES, mustEnv, WEBHOOK_TOLERANCE_SECONDS } from "./env.ts";
import { dispatchStripeWebhookEvent } from "./dispatcher.ts";
import { claimEvent, unclaimEvent } from "./idempotency.ts";
import { asErr, log, prefix } from "./logging.ts";
import { jsonResponse } from "./responses.ts";
import { getStripe } from "./stripe-client.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = (req.headers.get("x-request-id") ?? crypto.randomUUID())
    .slice(0, 128);
  const startedAt = Date.now();

  if (req.method !== "POST") {
    return jsonResponse(
      { ok: false, error: "Method not allowed" },
      405,
      requestId,
    );
  }

  let rawBodyText = "";

  try {
    const rawBody = new Uint8Array(await req.arrayBuffer());

    if (rawBody.byteLength > MAX_BODY_BYTES) {
      log("warn", "webhook_body_too_large", {
        requestId,
        bytes: rawBody.byteLength,
        limit: MAX_BODY_BYTES,
      });

      return jsonResponse(
        { ok: false, error: "Payload too large" },
        413,
        requestId,
      );
    }

    rawBodyText = new TextDecoder().decode(rawBody);
  } catch (error) {
    log("error", "webhook_body_read_failed", {
      requestId,
      error: asErr(error),
    });

    return jsonResponse(
      { ok: false, error: "Failed to read request body" },
      400,
      requestId,
    );
  }

  const signature = req.headers.get("stripe-signature") ?? "";

  if (signature.length === 0) {
    log("warn", "webhook_missing_signature", { requestId });
    return jsonResponse(
      { ok: false, error: "Missing Stripe-Signature header" },
      400,
      requestId,
    );
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    const webhookSecret = mustEnv("STRIPE_WEBHOOK_SECRET");

    event = await stripe.webhooks.constructEventAsync(
      rawBodyText,
      signature,
      webhookSecret,
      WEBHOOK_TOLERANCE_SECONDS,
    );
  } catch (error) {
    log("warn", "webhook_signature_invalid", {
      requestId,
      error: asErr(error),
    });

    return jsonResponse(
      { ok: false, error: "Webhook signature verification failed" },
      400,
      requestId,
    );
  }

  log("info", "webhook_received", {
    requestId,
    eventId: prefix(event.id),
    eventType: event.type,
    livemode: event.livemode,
  });

  const db = createServiceClient();
  const claimResult = await claimEvent(db, event.id, event.type);

  if (claimResult.kind === "duplicate") {
    log("info", "webhook_duplicate_skipped", {
      requestId,
      eventId: prefix(event.id),
      eventType: event.type,
    });

    return jsonResponse(
      { ok: true, skipped: true, reason: "duplicate" },
      200,
      requestId,
    );
  }

  if (claimResult.kind === "db_error") {
    log("error", "webhook_claim_db_error", {
      requestId,
      eventId: prefix(event.id),
      eventType: event.type,
      code: claimResult.code,
      message: claimResult.message,
    });

    return jsonResponse(
      { ok: false, error: "Database unavailable — will retry" },
      503,
      requestId,
    );
  }

  try {
    await dispatchStripeWebhookEvent(db, event, requestId);

    log("info", "webhook_processed", {
      requestId,
      eventId: prefix(event.id),
      eventType: event.type,
      ms: Date.now() - startedAt,
    });

    return jsonResponse({ ok: true, eventId: event.id }, 200, requestId);
  } catch (error) {
    await unclaimEvent(db, event.id);

    log("error", "webhook_handler_exception", {
      requestId,
      eventId: prefix(event.id),
      eventType: event.type,
      error: asErr(error),
      ms: Date.now() - startedAt,
    });

    return jsonResponse(
      { ok: false, error: "Handler failed — will retry", eventId: event.id },
      503,
      requestId,
    );
  }
});
