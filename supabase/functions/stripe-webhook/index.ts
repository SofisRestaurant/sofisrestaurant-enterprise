// =============================================================================
// supabase/functions/stripe-webhook/index.ts
// =============================================================================
// Stripe webhook handler — production hardened, no guest/auth branching.
//
// Architecture:
//   - Single source of truth: pending_carts DB row
//   - Stripe metadata is cross-checked but never trusted for amounts
//   - State machine: pending_carts.status transitions are the audit trail
//   - Auth rows: loyalty + credit finalization runs when columns are non-null
//   - Guest rows: loyalty/credit columns are null — those steps simply do not run
//   - No if (user_id IS NULL) branches anywhere in core fulfillment
//
// Handled events:
//   checkout.session.completed   → create order, finalize discounts, mark consumed
//   checkout.session.expired     → mark failed, release loyalty reserve if any
//   payment_intent.payment_failed → mark failed, release loyalty reserve if any
// =============================================================================

import Stripe from "stripe";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  parsePricingSnapshot,
  type PricingSnapshot,
} from "../_shared/pricing.ts";
import { log, prefix, asErr, sanitizeRequestId } from "../create-checkout/logging.ts";
import { BASE_HEADERS } from "../create-checkout/responses.ts";
import { getStripe } from "../create-checkout/stripe-client.ts";
import { pickMeta } from "../create-checkout/request-validation.ts";
import type { DbClient } from "../create-checkout/types.ts";

// ─── Environment ──────────────────────────────────────────────────────────────

function resolveWebhookSecret(): string {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return secret;
}

// ─── pending_carts status values ─────────────────────────────────────────────
// These match the pending_carts.status column CHECK constraint.

type PendingCartStatus =
  | "created"
  | "priced"
  | "stripe_session_created"
  | "completed"
  | "failed";

// ─── DB row types ─────────────────────────────────────────────────────────────

type PendingCartRow = {
  id: string;
  user_id: string | null;
  guest_email: string | null;
  guest_token: string | null;
  stripe_session_id: string | null;
  pricing_snapshot: unknown;
  pricing_hash: string;
  promo_id: string | null;
  credit_id: string | null;
  idempotency_key: string;
  status: PendingCartStatus;
  consumed_at: string | null;
  // Auth-only loyalty columns (null for guest rows — never touched for guest)
  loyalty_account_id: string | null;
  loyalty_reserved_points: number | null;
  loyalty_discount_cents: number | null;
};

// ─── Utility: safe metadata extraction ───────────────────────────────────────

function resolveCartId(event: Stripe.Event): string | null {
  const obj = event.data.object as Stripe.Checkout.Session | Stripe.PaymentIntent;

  // Primary: client_reference_id (checkout sessions)
  if ("client_reference_id" in obj && typeof obj.client_reference_id === "string") {
    return obj.client_reference_id.trim() || null;
  }

  // Fallback: metadata fields (both session and payment_intent carry them)
  const meta = "metadata" in obj ? (obj.metadata as Stripe.Metadata | null) : null;
  return (
    pickMeta(meta, "pending_cart_id", "cart_ref", "cart_id") ?? null
  );
}

// ─── Loyalty reserve release ──────────────────────────────────────────────────
// Only called when cart row has loyalty_account_id set (auth rows only).
// For guest rows this function is never invoked.

async function releaseLoyaltyReserve(
  db: DbClient,
  preSessionKey: string,
  reason: string,
  requestId: string,
): Promise<void> {
  try {
    const { error } = await db.rpc(
      "v2_release_loyalty_reserve" as never,
      { p_stripe_session_id: preSessionKey, p_reason: reason } as never,
    );
    if (error) {
      log("warn", "webhook_loyalty_release_failed", {
        requestId,
        reason,
        error: error.message,
      });
    } else {
      log("info", "webhook_loyalty_reserve_released", { requestId, reason });
    }
  } catch (err) {
    log("error", "webhook_loyalty_release_exception", {
      requestId,
      error: asErr(err),
    });
  }
}

// ─── Finalize loyalty points ──────────────────────────────────────────────────
// Converts the checkout_reserve ledger entry to a final redemption.
// Only called when cart.loyalty_account_id is non-null (auth rows only).

async function finalizeLoyalty(
  db: DbClient,
  cart: PendingCartRow,
  stripeSessionId: string,
  requestId: string,
): Promise<void> {
  if (!cart.loyalty_account_id || !cart.loyalty_reserved_points) {
    return;
  }

  // Commit the reserve to a final redemption via RPC
  try {
    const { error } = await db.rpc(
      "v2_commit_loyalty_redemption" as never,
      {
        p_stripe_session_id: stripeSessionId,
        p_account_id: cart.loyalty_account_id,
      } as never,
    );

    if (error) {
      log("warn", "webhook_loyalty_commit_failed", {
        requestId,
        cartId: prefix(cart.id),
        sessionId: prefix(stripeSessionId),
        error: error.message,
      });
    } else {
      log("info", "webhook_loyalty_committed", {
        requestId,
        cartId: prefix(cart.id),
        accountId: prefix(cart.loyalty_account_id),
        points: cart.loyalty_reserved_points,
      });
    }
  } catch (err) {
    log("error", "webhook_loyalty_commit_exception", {
      requestId,
      cartId: prefix(cart.id),
      error: asErr(err),
    });
  }
}

// ─── Finalize credit ──────────────────────────────────────────────────────────
// Marks the credit row as used. Only called when cart.credit_id is non-null.

async function finalizeCredit(
  db: DbClient,
  cart: PendingCartRow,
  stripeSessionId: string,
  requestId: string,
): Promise<void> {
  if (!cart.credit_id) {
    return;
  }

  const { error } = await db
    .from("user_credits")
    .update({
      used: true,
      checkout_session_id: stripeSessionId,
    })
    .eq("id", cart.credit_id)
    .eq("used", false); // Idempotent guard

  if (error) {
    log("warn", "webhook_credit_finalize_failed", {
      requestId,
      cartId: prefix(cart.id),
      creditId: prefix(cart.credit_id),
      error: error.message,
    });
  } else {
    log("info", "webhook_credit_finalized", {
      requestId,
      cartId: prefix(cart.id),
      creditId: prefix(cart.credit_id),
    });
  }
}

// ─── Create order ─────────────────────────────────────────────────────────────
// Writes the orders row from the authoritative pending_carts data.
// The pricing_snapshot in the DB row is the source of truth for amounts.
// Stripe metadata amounts are logged for audit but never used for order values.

async function createOrder(
  db: DbClient,
  cart: PendingCartRow,
  session: Stripe.Checkout.Session,
  snapshot: PricingSnapshot,
  requestId: string,
): Promise<{ orderId: string } | null> {
  // Detect pipeline from presence of user_id — no behavioral difference in
  // order creation, only which identity field is set.
  const isGuest = cart.user_id === null;

  const orderInsert = {
    pending_cart_id: cart.id,
    stripe_session_id: session.id,
    stripe_payment_intent_id: typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null,
    pricing_snapshot: cart.pricing_snapshot,
    pricing_hash: cart.pricing_hash,
    order_type: snapshot.orderType,
    notes: snapshot.orderNotes ?? null,
    subtotal_cents: snapshot.subtotalCents,
    campaign_discount_cents: snapshot.campaignDiscountCents ?? 0,
    promo_discount_cents: snapshot.promoDiscountCents ?? 0,
    credit_cents: snapshot.creditCents ?? 0,
    tax_cents: snapshot.taxCents,
    total_cents: snapshot.totalCents,
    currency: snapshot.currency,
    promo_id: cart.promo_id,
    credit_id: cart.credit_id,
    // Auth identity
    customer_uid: cart.user_id ?? null,
    // Guest identity
    guest_email: cart.guest_email ?? null,
    guest_token: cart.guest_token ?? null,
    // Loyalty (null for guest rows — no loyalty in guest pipeline)
    loyalty_account_id: cart.loyalty_account_id ?? null,
    loyalty_points_redeemed: cart.loyalty_reserved_points ?? null,
    loyalty_discount_cents: cart.loyalty_discount_cents ?? null,
    payment_status: "paid",
    idempotency_key: cart.idempotency_key,
    source: isGuest ? "guest" : "auth",
  };

  const { data, error } = await db
    .from("orders")
    .insert(orderInsert as never)
    .select("id")
    .single();

  if (error) {
    // Duplicate order (idempotent retry) — not a fatal error
    if (error.code === "23505") {
      log("info", "webhook_order_already_exists", {
        requestId,
        cartId: prefix(cart.id),
        sessionId: prefix(session.id),
      });
      // Fetch existing order id for logging
      const { data: existing } = await db
        .from("orders")
        .select("id")
        .eq("pending_cart_id", cart.id)
        .maybeSingle();

      const existingId = (existing as Record<string, unknown> | null)?.["id"];
      return typeof existingId === "string" ? { orderId: existingId } : null;
    }

    log("error", "webhook_order_create_failed", {
      requestId,
      cartId: prefix(cart.id),
      sessionId: prefix(session.id),
      error: error.message,
    });
    return null;
  }

  const orderId = (data as Record<string, unknown>)["id"];
  if (typeof orderId !== "string") return null;

  return { orderId };
}

// ─── Mark cart consumed ───────────────────────────────────────────────────────

async function markCartConsumed(
  db: DbClient,
  cartId: string,
  status: "completed" | "failed",
  requestId: string,
): Promise<void> {
  const { error } = await db
    .from("pending_carts")
    .update({
      status,
      consumed_at: new Date().toISOString(),
    })
    .eq("id", cartId)
    .is("consumed_at", null); // Idempotent: skip if already consumed

  if (error) {
    log("warn", "webhook_cart_mark_consumed_failed", {
      requestId,
      cartId: prefix(cartId),
      status,
      error: error.message,
    });
  }
}

// ─── Load pending cart ────────────────────────────────────────────────────────

async function loadPendingCart(
  db: DbClient,
  cartId: string,
  requestId: string,
): Promise<PendingCartRow | null> {
  const { data, error } = await db
    .from("pending_carts")
    .select(
      "id, user_id, guest_email, guest_token, stripe_session_id, pricing_snapshot, pricing_hash, promo_id, credit_id, idempotency_key, status, consumed_at, loyalty_account_id, loyalty_reserved_points, loyalty_discount_cents",
    )
    .eq("id", cartId)
    .maybeSingle();

  if (error) {
    log("error", "webhook_cart_load_failed", {
      requestId,
      cartId: prefix(cartId),
      error: error.message,
    });
    return null;
  }

  if (!data) {
    log("warn", "webhook_cart_not_found", {
      requestId,
      cartId: prefix(cartId),
    });
    return null;
  }

  return data as unknown as PendingCartRow;
}

// ─── Handle checkout.session.completed ───────────────────────────────────────

async function handleSessionCompleted(
  db: DbClient,
  session: Stripe.Checkout.Session,
  requestId: string,
): Promise<void> {
  const cartId = resolveCartId({
    data: { object: session },
    type: "checkout.session.completed",
  } as Stripe.Event);

  if (!cartId) {
    log("error", "webhook_completed_no_cart_id", {
      requestId,
      sessionId: prefix(session.id),
    });
    return;
  }

  const cart = await loadPendingCart(db, cartId, requestId);
  if (!cart) return;

  // Idempotency: already processed
  if (cart.consumed_at !== null) {
    log("info", "webhook_completed_already_consumed", {
      requestId,
      cartId: prefix(cartId),
      sessionId: prefix(session.id),
    });
    return;
  }

  // Parse the authoritative pricing snapshot from DB
  // NEVER use Stripe metadata amounts for order values
  const snapshot = parsePricingSnapshot(cart.pricing_snapshot);
  if (!snapshot) {
    log("error", "webhook_completed_invalid_snapshot", {
      requestId,
      cartId: prefix(cartId),
      sessionId: prefix(session.id),
    });
    // Mark failed so retries don't loop endlessly
    await markCartConsumed(db, cartId, "failed", requestId);
    return;
  }

  // Verify Stripe amount matches server-computed total
  // This is a final integrity check — mismatch indicates a serious bug
  if (
    session.amount_total !== null &&
    session.amount_total !== snapshot.totalCents
  ) {
    log("error", "webhook_completed_amount_mismatch", {
      requestId,
      cartId: prefix(cartId),
      sessionId: prefix(session.id),
      stripeTotal: session.amount_total,
      snapshotTotal: snapshot.totalCents,
    });
    await markCartConsumed(db, cartId, "failed", requestId);
    return;
  }

  // Create the order row
  const order = await createOrder(db, cart, session, snapshot, requestId);
  if (!order) {
    // createOrder already logged the error
    return;
  }

  // ── Auth-only post-fulfillment steps ──────────────────────────────────────
  // These run only when the cart has auth-specific columns populated.
  // Guest rows have null for all these columns — the functions return immediately.
  await finalizeCredit(db, cart, session.id, requestId);
  await finalizeLoyalty(db, cart, session.id, requestId);

  // Mark consumed
  await markCartConsumed(db, cartId, "completed", requestId);

  log("info", "webhook_completed_processed", {
    requestId,
    cartId: prefix(cartId),
    orderId: prefix(order.orderId),
    sessionId: prefix(session.id),
    totalCents: snapshot.totalCents,
    isGuest: cart.user_id === null,
  });
}

// ─── Handle checkout.session.expired ─────────────────────────────────────────

async function handleSessionExpired(
  db: DbClient,
  session: Stripe.Checkout.Session,
  requestId: string,
): Promise<void> {
  const cartId = resolveCartId({
    data: { object: session },
    type: "checkout.session.expired",
  } as Stripe.Event);

  if (!cartId) {
    log("warn", "webhook_expired_no_cart_id", {
      requestId,
      sessionId: prefix(session.id),
    });
    return;
  }

  const cart = await loadPendingCart(db, cartId, requestId);
  if (!cart) return;

  if (cart.consumed_at !== null) {
    log("info", "webhook_expired_already_consumed", {
      requestId,
      cartId: prefix(cartId),
    });
    return;
  }

  // Release loyalty reserve if one was made (auth rows only)
  if (cart.loyalty_account_id && cart.loyalty_reserved_points) {
    // Reconstruct the pre-session key from metadata
    const meta = session.metadata as Stripe.Metadata | null;
    const preSessionKey = pickMeta(meta, "loyalty_pre_session_key");

    if (preSessionKey) {
      await releaseLoyaltyReserve(
        db,
        preSessionKey,
        "session_expired",
        requestId,
      );
    } else {
      log("warn", "webhook_expired_no_pre_session_key", {
        requestId,
        cartId: prefix(cartId),
        sessionId: prefix(session.id),
      });
    }
  }

  await markCartConsumed(db, cartId, "failed", requestId);

  log("info", "webhook_expired_processed", {
    requestId,
    cartId: prefix(cartId),
    sessionId: prefix(session.id),
    isGuest: cart.user_id === null,
  });
}

// ─── Handle payment_intent.payment_failed ────────────────────────────────────

async function handlePaymentFailed(
  db: DbClient,
  paymentIntent: Stripe.PaymentIntent,
  requestId: string,
): Promise<void> {
  const cartId = resolveCartId({
    data: { object: paymentIntent },
    type: "payment_intent.payment_failed",
  } as Stripe.Event);

  if (!cartId) {
    log("warn", "webhook_payment_failed_no_cart_id", {
      requestId,
      paymentIntentId: prefix(paymentIntent.id),
    });
    return;
  }

  const cart = await loadPendingCart(db, cartId, requestId);
  if (!cart) return;

  if (cart.consumed_at !== null) {
    log("info", "webhook_payment_failed_already_consumed", {
      requestId,
      cartId: prefix(cartId),
    });
    return;
  }

  // Release loyalty reserve if one was made (auth rows only)
  if (cart.loyalty_account_id && cart.loyalty_reserved_points) {
    const meta = paymentIntent.metadata as Stripe.Metadata | null;
    const preSessionKey = pickMeta(meta, "loyalty_pre_session_key");

    if (preSessionKey) {
      await releaseLoyaltyReserve(
        db,
        preSessionKey,
        "payment_failed",
        requestId,
      );
    }
  }

  // Do NOT mark consumed on payment_failed — the session may still be open
  // for retry. Only mark failed when the session itself expires.
  // Log the failure for monitoring but leave the cart in its current state.
  log("info", "webhook_payment_failed_logged", {
    requestId,
    cartId: prefix(cartId),
    paymentIntentId: prefix(paymentIntent.id),
    isGuest: cart.user_id === null,
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = sanitizeRequestId(req.headers.get("x-request-id"));

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Read raw body — required for Stripe signature verification
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (err) {
    log("error", "webhook_body_read_failed", { requestId, error: asErr(err) });
    return new Response("Bad Request", { status: 400 });
  }

  // ── Stripe signature verification ─────────────────────────────────────────
  // Must happen before any body parsing. Reject without signature.
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
    eventId: prefix(event.id),
    eventType: event.type,
  });

  // ── Service client init ───────────────────────────────────────────────────
  let db: DbClient;
  try {
    db = createServiceClient();
  } catch (err) {
    log("error", "webhook_service_init_failed", { requestId, error: asErr(err) });
    // Return 500 so Stripe retries
    return new Response("Service Unavailable", { status: 500 });
  }

  // ── Event dispatch ────────────────────────────────────────────────────────
  // No guest/auth branching here. The handler functions themselves handle
  // both row types by checking whether auth-specific columns are null.
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        await handleSessionCompleted(
          db,
          event.data.object as Stripe.Checkout.Session,
          requestId,
        );
        break;
      }

      case "checkout.session.expired": {
        await handleSessionExpired(
          db,
          event.data.object as Stripe.Checkout.Session,
          requestId,
        );
        break;
      }

      case "payment_intent.payment_failed": {
        await handlePaymentFailed(
          db,
          event.data.object as Stripe.PaymentIntent,
          requestId,
        );
        break;
      }

      default: {
        // Unhandled event types are acknowledged silently
        log("info", "webhook_event_ignored", {
          requestId,
          eventType: event.type,
        });
      }
    }
  } catch (err) {
    log("error", "webhook_handler_exception", {
      requestId,
      eventType: event.type,
      eventId: prefix(event.id),
      error: asErr(err),
    });
    // Return 500 so Stripe retries the event
    return new Response("Internal Server Error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/json",
    },
  });
});