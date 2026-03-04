// supabase/functions/stripe-webhook/index.ts
// =============================================================================
// STRIPE WEBHOOK — ENTERPRISE GRADE (2026) • Sofi’s Restaurant V2
// =============================================================================
//
// Goals
// - ✅ Verify Stripe signature (raw body)
// - ✅ Atomic replay lock (stripe_events)
// - ✅ Idempotent order finalization (unique orders.stripe_session_id)
// - ✅ Fraud signal + server-side total revalidation (best-effort)
// - ✅ Financial transaction ledger
// - ✅ Loyalty awarding is **V2 authoritative** (loyalty_ledger + loyalty_accounts)
// - ✅ Order-resolvable loyalty linkage WITHOUT mutating the append-only ledger
// - ✅ Safe structured logs (no secrets / no PII leaks)
// - ✅ Fail-open strategy to prevent Stripe retry storms
//
// CRITICAL NOTE (your DB design):
// - loyalty_ledger is APPEND-ONLY (updates are blocked by trigger).
// - Therefore, “patch loyalty_ledger row after insert” MUST NOT be done here.
// - Instead, we rely on deterministic idempotency keys (award:<orderId>)
//   and/or a view that derives order_id from idempotency_key.
// - If you truly need reference_id = orderId, add it at INSERT time in the RPC.
// =============================================================================

import Stripe from "stripe";
import { createServiceClient } from "../_shared/supabase.ts";
import type { Json } from "../_shared/database.types.ts";

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  WEBHOOK_TIMEOUT_MS: 25_000,
  EXPECTED_CURRENCY: "usd",

  // Max raw body bytes to avoid memory abuse (Stripe payloads are small)
  MAX_BODY_BYTES: 512_000,

  // Stripe itself typically won’t send Origin. Do NOT rely on Origin for security.
  STRICT_ORIGIN: false,

  // Restaurant-growth (optional; keep off by default)
  ENABLE_REVIEW_NUDGE_EVENT: false,
  ENABLE_RETURN_INCENTIVE_EVENT: false,

  // Loyalty awarding mode:
  // - "v2" = authoritative (loyalty_ledger + loyalty_accounts) ✅
  // - "legacy" = v1 (loyalty_transactions) ❌ not recommended
  LOYALTY_MODE: "v2" as "v2" | "legacy",

  // Defensive limits
  MAX_CART_ITEMS: 200,
  MAX_ITEM_QTY: 50,
  MAX_AWARD_AMOUNT_CENTS: 500_000, // $5,000 safety cap
  MAX_ORDER_TOTAL_CENTS: 500_000, // $5,000 safety cap

  // Mismatch tolerance (cents) for server-side menu total vs Stripe total
  TOTAL_TOLERANCE_CENTS: 1,

  // If order already exists, attempt best-effort V2 award (idempotent)
  ENABLE_V2_AWARD_ON_EXISTING_ORDER: true,

  // Idempotency keys (deterministic by order id)
  V2_AWARD_IDEMPOTENCY_PREFIX: "award:",

  // Optional: include requestId in 200 responses for observability (safe)
  RETURN_REQUEST_ID: true,
} as const;

// ─────────────────────────────────────────────────────────────
// Env
// ─────────────────────────────────────────────────────────────

function mustEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || !v.trim()) throw new Error(`Missing ${name}`);
  return v.trim();
}

// Your project uses a 2026 Stripe API version (including suffix like ".clover").
const DEFAULT_STRIPE_API_VERSION = "2026-02-25.clover";

function isValidStripeApiVersion(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(\.[a-zA-Z0-9_-]+)?$/.test(v);
}

const STRIPE_SECRET_KEY = mustEnv("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = mustEnv("STRIPE_WEBHOOK_SECRET");

const ENV_STRIPE_API_VERSION = (Deno.env.get("STRIPE_API_VERSION") ?? "").trim();
const STRIPE_API_VERSION = (isValidStripeApiVersion(ENV_STRIPE_API_VERSION)
  ? ENV_STRIPE_API_VERSION
  : DEFAULT_STRIPE_API_VERSION) as Stripe.LatestApiVersion;

// ─────────────────────────────────────────────────────────────
// Stripe client (Deno-compatible)
// ─────────────────────────────────────────────────────────────

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION,
  httpClient: Stripe.createFetchHttpClient(),
});

// ─────────────────────────────────────────────────────────────
// Supabase SERVICE ROLE client (bypasses RLS)
// ─────────────────────────────────────────────────────────────

const supabase = createServiceClient();

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;
type CartItemNorm = { menuItemId: string; quantity: number };
type LoyaltyAwardMode = typeof CONFIG.LOYALTY_MODE;

type LoyaltyV2Result = {
  points_earned: number;
  new_balance: number;
  new_lifetime: number;
  new_tier: string;
  streak: number;
  tier_changed: boolean;
  was_duplicate: boolean;
};

type LoyaltyLegacyResult = {
  points_earned: number;
  base_points: number;
  tier_multiplier: number;
  streak_multiplier: number;
  new_balance: number;
  new_lifetime: number;
  streak: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
  tier_changed: boolean;
  tier_before: string;
  same_day_order: boolean;
};

// ─────────────────────────────────────────────────────────────
// Main Handler
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  const start = Date.now();

  // Method gate
  if (req.method !== "POST") return respond(405, { error: "Method not allowed" }, requestId);

  // Dev-only origin gate (NOT a Stripe security boundary)
  if (CONFIG.STRICT_ORIGIN) {
    const origin = (req.headers.get("origin") ?? "").trim();
    if (!origin) return respond(403, { error: "Origin required" }, requestId);
  }

  // Read raw body with cap (required for signature verification)
  let rawBody: string;
  try {
    const ab = await req.arrayBuffer();
    if (ab.byteLength > CONFIG.MAX_BODY_BYTES) {
      log("warn", "payload_too_large", { requestId, bytes: ab.byteLength });
      return respond(400, { error: "Payload too large" }, requestId);
    }
    rawBody = new TextDecoder().decode(ab);
  } catch (e) {
    log("error", "body_read_failed", { requestId, error: asErr(e) });
    return respond(400, { error: "Failed to read request body" }, requestId);
  }

  // Signature verification (ONLY reason to return 400 on production)
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    log("warn", "missing_signature", { requestId });
    return respond(400, { error: "Missing stripe-signature header" }, requestId);
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    log("warn", "signature_verification_failed", { requestId, error: asErr(e) });
    return respond(400, { error: "Webhook signature verification failed" }, requestId);
  }

  // Acquire replay lock FIRST (atomic). If DB is down, fail-open 200.
  let lockAcquired = false;
  try {
    lockAcquired = await acquireEventLock(event.id, event.type);
  } catch (e) {
    log("error", "replay_lock_error", {
      requestId,
      eventId: event.id,
      eventType: event.type,
      error: asErr(e),
    });
    return respond(200, { received: true, error: "replay_lock_unavailable" }, requestId);
  }

  if (!lockAcquired) {
    log("info", "replay_detected", { requestId, eventId: event.id, eventType: event.type });
    return respond(200, { received: true, skipped: "duplicate" }, requestId);
  }

  log("info", "event_verified", {
    requestId,
    eventId: event.id,
    eventType: event.type,
    stripeApiVersion: STRIPE_API_VERSION,
  });

  // Timeout wrapper (avoid hanging edge worker)
  try {
    const timeout = new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error("HANDLER_TIMEOUT")), CONFIG.WEBHOOK_TIMEOUT_MS),
    );

    const handler = routeEvent(event, requestId);
    const res = await Promise.race([handler, timeout]);

    log("info", "webhook_complete", {
      requestId,
      ms: Date.now() - start,
      eventId: event.id,
    });

    return res;
  } catch (e) {
    // Fail-open 200 to prevent Stripe retry storm; debug via logs.
    log("error", "handler_error", {
      requestId,
      eventId: event.id,
      eventType: event.type,
      error: asErr(e),
      ms: Date.now() - start,
    });
    return respond(200, { received: true, error: "internal_handler_error" }, requestId);
  }
});

// ─────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────

async function routeEvent(event: Stripe.Event, requestId: string): Promise<Response> {
  switch (event.type) {
    case "checkout.session.completed":
      return await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, event.id, requestId);

    case "payment_intent.payment_failed":
      return await handlePaymentFailed(event.data.object as Stripe.PaymentIntent, event.id, requestId);

    case "charge.refunded":
      return await handleRefund(event.data.object as Stripe.Charge, event.id, requestId);

    case "charge.dispute.created":
      return await handleDisputeCreated(event.data.object as Stripe.Dispute, event.id, requestId);

    case "charge.dispute.closed":
      return await handleDisputeClosed(event.data.object as Stripe.Dispute, event.id, requestId);

    default:
      log("info", "event_ignored", { requestId, eventType: event.type });
      return respond(200, { received: true, skipped: "unhandled_event" }, requestId);
  }
}

// ============================================================================
// HANDLER: checkout.session.completed
// ============================================================================

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventId: string,
  requestId: string,
): Promise<Response> {
  const sessionId = session.id;

  log("info", "checkout_session_started", {
    requestId,
    sessionId: prefix(sessionId),
    paymentStatus: session.payment_status,
    currency: session.currency,
    amountTotal: session.amount_total,
  });

  // 1) Payment gate
  if (session.payment_status !== "paid") {
    log("warn", "payment_not_paid", { requestId, sessionId: prefix(sessionId) });
    return respond(200, { received: true, skipped: "payment_not_paid" }, requestId);
  }

  // 2) Currency gate
  if ((session.currency ?? "").toLowerCase() !== CONFIG.EXPECTED_CURRENCY) {
    log("warn", "unexpected_currency", { requestId, sessionId: prefix(sessionId), currency: session.currency });
    return respond(200, { received: true, skipped: "unexpected_currency" }, requestId);
  }

  // 3) Amount guard
  const stripeTotal = typeof session.amount_total === "number" ? session.amount_total : 0;
  if (stripeTotal <= 0) {
    log("warn", "invalid_total", { requestId, sessionId: prefix(sessionId), stripeTotal });
    return respond(200, { received: true, skipped: "invalid_total" }, requestId);
  }
  if (stripeTotal > CONFIG.MAX_ORDER_TOTAL_CENTS) {
    log("warn", "total_exceeds_cap", { requestId, sessionId: prefix(sessionId), stripeTotal });
    return respond(200, { received: true, skipped: "total_exceeds_cap" }, requestId);
  }

  // 4) Extract metadata
  const metadata = session.metadata ?? {};
  const customerUid = safeStr(metadata.user_id) ?? safeStr(metadata.customer_uid) ?? safeStr(metadata.uid);
  const cartId = safeStr(metadata.cart_ref) ?? safeStr(metadata.pending_cart_id) ?? safeStr(metadata.cart_id);
  const orderType = safeStr(metadata.order_type) ?? "food";

  if (!customerUid) {
    log("warn", "missing_customer_uid", { requestId, sessionId: prefix(sessionId) });
    return respond(200, { received: true, skipped: "missing_customer_uid" }, requestId);
  }
  if (!cartId) {
    log("warn", "missing_cart_ref", { requestId, sessionId: prefix(sessionId) });
    return respond(200, { received: true, skipped: "missing_cart_ref" }, requestId);
  }

  // 5) Capture payment intent + charge id (best-effort)
  const paymentIntentId =
    typeof session.payment_intent === "string" && session.payment_intent.trim() ? session.payment_intent.trim() : null;

  const { chargeId: stripeChargeId } = await bestEffortChargeLookup(paymentIntentId, requestId);

  // 6) Pre-check for existing order (idempotency safety)
  const { data: existingOrder, error: existingErr } = await supabase
    .from("orders")
    .select("id, order_number, amount_total, customer_uid")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (existingErr) {
    log("warn", "orders_precheck_failed", { requestId, sessionId: prefix(sessionId), code: existingErr.code ?? null });
  }

  if (existingOrder?.id) {
    if (CONFIG.ENABLE_V2_AWARD_ON_EXISTING_ORDER && CONFIG.LOYALTY_MODE === "v2") {
      const amountCents = typeof existingOrder.amount_total === "number" ? existingOrder.amount_total : stripeTotal;
      await ensureV2AwardLinkedToOrder({
        requestId,
        userId: String(existingOrder.customer_uid ?? customerUid),
        orderId: existingOrder.id,
        amountCents,
        reason: "order_exists_precheck",
      });
    }

    log("info", "order_already_exists_precheck", {
      requestId,
      sessionId: prefix(sessionId),
      orderId: prefix(existingOrder.id),
    });

    return respond(
      200,
      { received: true, skipped: "order_already_exists", orderId: existingOrder.id, orderNumber: existingOrder.order_number },
      requestId,
    );
  }

  // 7) Load pending cart (best-effort)
  const cartRow = await supabase
    .from("pending_carts")
    .select("items, total_cents, subtotal_cents, tax_cents, discount_cents, promo_id, credit_id")
    .eq("id", cartId)
    .maybeSingle();

  if (cartRow.error) {
    log("error", "pending_cart_fetch_failed", { requestId, cartId: prefix(cartId), error: cartRow.error.message });
  }

  const pendingTotalCents = cartRow.data?.total_cents ?? null;
  const cartItems = parsePendingCartItems(cartRow.data?.items ?? null);

  if (cartItems.length > CONFIG.MAX_CART_ITEMS) {
    log("warn", "cart_item_count_excessive", { requestId, cartId: prefix(cartId), count: cartItems.length });
  }

  // 8) Server-side revalidation (best-effort)
  const serverTotal = await bestEffortServerTotal({ requestId, orderType, cartItems });

  if (serverTotal != null) {
    const diff = stripeTotal - serverTotal;
    if (Math.abs(diff) > CONFIG.TOTAL_TOLERANCE_CENTS) {
      log("warn", "total_mismatch_detected", { requestId, sessionId: prefix(sessionId), stripeTotal, serverTotal, diff });

      // Best-effort fraud log
      try {
        await supabase.from("fraud_logs").insert({
          user_id: customerUid,
          reason: "total_mismatch",
          frontend_total: pendingTotalCents,
          server_total: serverTotal,
          stripe_total: stripeTotal,
          metadata: { session_id: sessionId, cart_id: cartId, event_id: eventId, order_type: orderType },
        });
      } catch {
        // ignore
      }
    }
  }

  // 9) Shipping details (best-effort)
  const shipping = getShippingDetails(session);
  const shippingAddress = shipping?.address
    ? {
        line1: shipping.address.line1 ?? null,
        line2: shipping.address.line2 ?? null,
        city: shipping.address.city ?? null,
        state: shipping.address.state ?? null,
        postal_code: shipping.address.postal_code ?? null,
        country: shipping.address.country ?? null,
      }
    : null;

  // 10) Insert order (service role)
  const cartItemsJson: Json | null = cartItems.length ? (cartItems as unknown as Json) : null;

  const { data: newOrder, error: orderError } = await supabase
    .from("orders")
    .insert({
      stripe_session_id: sessionId,
      stripe_payment_intent_id: paymentIntentId,
      order_type: orderType,
      customer_uid: customerUid,
      customer_email: nullSafe(session.customer_details?.email),
      customer_name: nullSafe(session.customer_details?.name),
      customer_phone: nullSafe(session.customer_details?.phone),
      amount_subtotal: session.amount_subtotal ?? 0,
      amount_tax: session.total_details?.amount_tax ?? 0,
      amount_shipping: session.total_details?.amount_shipping ?? 0,
      amount_total: stripeTotal,
      currency: CONFIG.EXPECTED_CURRENCY,
      payment_status: "paid",
      status: "confirmed",
      shipping_name: shipping?.name ?? null,
      shipping_address: shippingAddress,
      shipping_phone: nullSafe(session.customer_details?.phone),
      cart_items: cartItemsJson,
      metadata: {
        cart_id: cartId,
        stripe_event_id: eventId,
        stripe_charge_id: stripeChargeId,
        stripe_api_version: STRIPE_API_VERSION,
        server_total_cents: serverTotal ?? null,
        promo_id: cartRow.data?.promo_id ?? null,
        credit_id: cartRow.data?.credit_id ?? null,
      },
    })
    .select("id, order_number, amount_total, customer_uid")
    .single();

  if (orderError) {
    log("error", "order_insert_failed", { requestId, sessionId: prefix(sessionId), code: orderError.code, error: orderError.message });

    if (orderError.code === "23505") {
      // parallel delivery
      log("info", "order_already_exists_safety_net", { requestId, sessionId: prefix(sessionId) });

      if (CONFIG.ENABLE_V2_AWARD_ON_EXISTING_ORDER && CONFIG.LOYALTY_MODE === "v2") {
        const { data: ex2 } = await supabase
          .from("orders")
          .select("id, amount_total, customer_uid")
          .eq("stripe_session_id", sessionId)
          .maybeSingle();

        if (ex2?.id) {
          const amountCents = typeof ex2.amount_total === "number" ? ex2.amount_total : stripeTotal;
          await ensureV2AwardLinkedToOrder({
            requestId,
            userId: String(ex2.customer_uid ?? customerUid),
            orderId: ex2.id,
            amountCents,
            reason: "unique_violation_safety_net",
          });
        }
      }

      return respond(200, { received: true, skipped: "order_already_exists" }, requestId);
    }

    // fail-open
    return respond(200, { received: true, error: "order_insert_failed" }, requestId);
  }

  log("info", "order_inserted", { requestId, orderId: prefix(newOrder.id), orderNumber: newOrder.order_number, sessionId: prefix(sessionId) });

  // 11) Financial ledger (best-effort)
  const { error: finErr } = await supabase.from("financial_transactions").insert({
    order_id: newOrder.id,
    stripe_payment_intent_id: paymentIntentId,
    stripe_charge_id: stripeChargeId,
    transaction_type: "payment",
    amount: stripeTotal,
    currency: CONFIG.EXPECTED_CURRENCY,
    metadata: { session_id: sessionId, event_id: eventId, cart_id: cartId },
  });

  if (finErr) log("error", "financial_ledger_insert_failed", { requestId, orderId: prefix(newOrder.id), error: finErr.message });

  // 12) Loyalty award (V2 authoritative)
  await awardLoyalty({ mode: CONFIG.LOYALTY_MODE, requestId, customerUid, orderId: newOrder.id, amountCents: stripeTotal });

  // 13) Growth hooks (optional)
  await maybeEmitGrowthEvents({ requestId, orderId: newOrder.id, userId: customerUid, amountCents: stripeTotal });

  // 14) Delete pending cart (best-effort)
  const { error: cartDeleteErr } = await supabase.from("pending_carts").delete().eq("id", cartId);
  if (cartDeleteErr) log("warn", "pending_cart_delete_failed", { requestId, cartId: prefix(cartId), error: cartDeleteErr.message });

  return respond(200, { received: true, orderId: newOrder.id, orderNumber: newOrder.order_number }, requestId);
}

// ============================================================================
// Other handlers
// ============================================================================

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent, eventId: string, requestId: string): Promise<Response> {
  log("info", "payment_failed", { requestId, paymentIntentId: prefix(paymentIntent.id) });

  const { error } = await supabase
    .from("orders")
    .update({
      payment_status: "failed",
      metadata: {
        failure_reason: paymentIntent.last_payment_error?.message ?? "unknown",
        failure_code: paymentIntent.last_payment_error?.code ?? null,
        event_id: eventId,
      },
    })
    .eq("stripe_payment_intent_id", paymentIntent.id);

  if (error) log("warn", "payment_failed_order_update_skipped", { requestId, paymentIntentId: prefix(paymentIntent.id), error: error.message });
  return respond(200, { received: true }, requestId);
}

async function handleRefund(charge: Stripe.Charge, eventId: string, requestId: string): Promise<Response> {
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;

  log("info", "refund_received", { requestId, chargeId: prefix(charge.id), paymentIntentId: paymentIntentId ? prefix(paymentIntentId) : null, amountRefunded: charge.amount_refunded });

  if (!paymentIntentId) return respond(200, { received: true, skipped: "no_payment_intent" }, requestId);

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (fetchError || !order) {
    log("warn", "refund_order_not_found", { requestId, paymentIntentId: prefix(paymentIntentId), error: fetchError?.message ?? null });
    return respond(200, { received: true, skipped: "order_not_found" }, requestId);
  }

  await supabase.from("orders").update({ payment_status: "refunded" }).eq("id", order.id);

  await supabase.from("financial_transactions").insert({
    order_id: order.id,
    stripe_charge_id: charge.id,
    transaction_type: "refund",
    amount: -(charge.amount_refunded),
    currency: (charge.currency ?? CONFIG.EXPECTED_CURRENCY).toLowerCase(),
    metadata: { charge_id: charge.id, event_id: eventId, refund_reason: charge.refunds?.data?.[0]?.reason ?? null },
  });

  return respond(200, { received: true }, requestId);
}

async function handleDisputeCreated(dispute: Stripe.Dispute, eventId: string, requestId: string): Promise<Response> {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : (dispute.charge as Stripe.Charge)?.id ?? null;

  log("warn", "dispute_created", { requestId, disputeId: prefix(dispute.id), chargeId: chargeId ? prefix(chargeId) : null, amount: dispute.amount, reason: dispute.reason, status: dispute.status });

  const order = await findOrderByChargeId(chargeId, requestId);
  if (!order) return respond(200, { received: true, skipped: "order_not_found" }, requestId);

  await supabase.from("orders").update({ payment_status: "disputed" }).eq("id", order.id);

  await supabase.from("financial_transactions").insert({
    order_id: order.id,
    stripe_charge_id: chargeId,
    transaction_type: "dispute",
    amount: -(dispute.amount),
    currency: (dispute.currency ?? CONFIG.EXPECTED_CURRENCY).toLowerCase(),
    metadata: { dispute_id: dispute.id, reason: dispute.reason, status: dispute.status, event_id: eventId },
  });

  return respond(200, { received: true }, requestId);
}

async function handleDisputeClosed(dispute: Stripe.Dispute, eventId: string, requestId: string): Promise<Response> {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : (dispute.charge as Stripe.Charge)?.id ?? null;

  log("info", "dispute_closed", { requestId, disputeId: prefix(dispute.id), chargeId: chargeId ? prefix(chargeId) : null, status: dispute.status });

  const order = await findOrderByChargeId(chargeId, requestId);
  if (!order) return respond(200, { received: true, skipped: "order_not_found" }, requestId);

  const isLost = dispute.status === "lost";
  const isWon = dispute.status === "won";

  if (isLost) await supabase.from("orders").update({ payment_status: "lost_dispute" }).eq("id", order.id);
  else if (isWon) await supabase.from("orders").update({ payment_status: "paid" }).eq("id", order.id);

  await supabase.from("financial_transactions").insert({
    order_id: order.id,
    stripe_charge_id: chargeId,
    transaction_type: isLost ? "dispute_lost" : "dispute_won",
    amount: isLost ? -(dispute.amount) : dispute.amount,
    currency: (dispute.currency ?? CONFIG.EXPECTED_CURRENCY).toLowerCase(),
    metadata: { dispute_id: dispute.id, status: dispute.status, reason: dispute.reason, event_id: eventId },
  });

  return respond(200, { received: true }, requestId);
}

// ============================================================================
// LOYALTY (V2 authoritative) — no ledger updates
// ============================================================================

async function awardLoyalty(args: { mode: LoyaltyAwardMode; requestId: string; customerUid: string; orderId: string; amountCents: number }): Promise<void> {
  const { mode, requestId, customerUid, orderId } = args;
  const amountCents = clampAmountCents(args.amountCents);

  if (!customerUid || amountCents <= 0) {
    log("info", "loyalty_skipped", { requestId, orderId: prefix(orderId), reason: !customerUid ? "guest_checkout" : "zero_amount" });
    return;
  }

  try {
    if (mode === "legacy") {
      const { data, error } = await supabase.rpc("award_loyalty_points", { p_user_id: customerUid, p_order_id: orderId, p_amount_cents: amountCents });
      if (error) {
        log("error", "loyalty_award_failed_legacy", { requestId, orderId: prefix(orderId), code: error.code ?? null });
        return;
      }
      const parsed = parseLegacyAwardResult(data);
      log("info", "loyalty_awarded_legacy", { requestId, orderId: prefix(orderId), points: parsed?.points_earned ?? null, tier: parsed?.tier ?? null });
      return;
    }

    await ensureV2AwardLinkedToOrder({ requestId, userId: customerUid, orderId, amountCents, reason: "webhook_award" });
  } catch (e) {
    log("error", "loyalty_award_crash", { requestId, orderId: prefix(orderId), error: asErr(e) });
  }
}

async function ensureV2AwardLinkedToOrder(args: { requestId: string; userId: string; orderId: string; amountCents: number; reason: string }): Promise<void> {
  const { requestId, userId, orderId, reason } = args;
  const amountCents = clampAmountCents(args.amountCents);
  if (amountCents <= 0) return;

  const { data: acct, error: acctErr } = await supabase.from("loyalty_accounts").select("id").eq("user_id", userId).maybeSingle();
  if (acctErr || !acct?.id) {
    log("error", "loyalty_account_missing", { requestId, orderId: prefix(orderId), userId: prefix(userId), code: acctErr?.code ?? null, reason });
    return;
  }

  const accountId = String(acct.id);
  const idem = `${CONFIG.V2_AWARD_IDEMPOTENCY_PREFIX}${orderId}`;

  // Light precheck (RPC is also idempotent)
  const { data: exists } = await supabase.from("loyalty_ledger").select("id").eq("account_id", accountId).eq("idempotency_key", idem).limit(1).maybeSingle();
  if (exists?.id) {
    log("info", "loyalty_award_skipped_existing_v2", { requestId, orderId: prefix(orderId), reason });
    return;
  }

  const { data: awardRaw, error } = await supabase.rpc("v2_award_points", {
    p_account_id: accountId,
    p_admin_id: userId,
    p_amount_cents: amountCents,
    p_idempotency_key: idem,
  });

  if (error) {
    log("error", "loyalty_award_failed_v2", { requestId, orderId: prefix(orderId), code: error.code ?? null, reason });
    return;
  }

  const res = parseV2AwardResult(awardRaw);
  log("info", "loyalty_awarded_v2", {
    requestId,
    orderId: prefix(orderId),
    earned: res?.points_earned ?? null,
    newBalance: res?.new_balance ?? null,
    tierChanged: res?.tier_changed ?? null,
    wasDuplicate: res?.was_duplicate ?? null,
    reason,
  });
}

// ============================================================================
// Growth hooks
// ============================================================================

async function maybeEmitGrowthEvents(args: { requestId: string; orderId: string; userId: string; amountCents: number }) {
  const { requestId, orderId, userId, amountCents } = args;
  if (!CONFIG.ENABLE_REVIEW_NUDGE_EVENT && !CONFIG.ENABLE_RETURN_INCENTIVE_EVENT) return;

  if (CONFIG.ENABLE_REVIEW_NUDGE_EVENT) {
    try {
      await supabase.from("order_events").insert({
        order_id: orderId,
        event_type: "REVIEW_NUDGE_READY",
        event_data: { user_id: userId, amount_cents: amountCents } as unknown as Json,
      });
      log("info", "review_nudge_event_emitted", { requestId, orderId: prefix(orderId) });
    } catch {
      // ignore
    }
  }

  if (CONFIG.ENABLE_RETURN_INCENTIVE_EVENT) {
    try {
      await supabase.from("order_events").insert({
        order_id: orderId,
        event_type: "RETURN_INCENTIVE_CANDIDATE",
        event_data: { user_id: userId, amount_cents: amountCents } as unknown as Json,
      });
      log("info", "return_incentive_event_emitted", { requestId, orderId: prefix(orderId) });
    } catch {
      // ignore
    }
  }
}

// ============================================================================
// Helpers: replay lock
// ============================================================================

async function acquireEventLock(eventId: string, eventType: string): Promise<boolean> {
  const { error } = await supabase.from("stripe_events").insert({ id: eventId, type: eventType, created_at: new Date().toISOString() });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(`Replay lock failure: ${error.message}`);
}

// ============================================================================
// Helpers: charge lookup
// ============================================================================

async function bestEffortChargeLookup(paymentIntentId: string | null, requestId: string) {
  if (!paymentIntentId) return { chargeId: null as string | null };

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const chargeId = pi.latest_charge ? String(pi.latest_charge) : null;
    log("info", "payment_intent_verified", { requestId, paymentIntentId: prefix(paymentIntentId), status: pi.status, chargeId: chargeId ? prefix(chargeId) : null });
    return { chargeId };
  } catch (e) {
    log("warn", "payment_intent_fetch_failed", { requestId, paymentIntentId: prefix(paymentIntentId), error: asErr(e) });
    return { chargeId: null as string | null };
  }
}

// ============================================================================
// Helpers: server-side total
// ============================================================================

async function bestEffortServerTotal(args: { requestId: string; orderType: string; cartItems: CartItemNorm[] }): Promise<number | null> {
  const { requestId, orderType, cartItems } = args;
  if (orderType !== "food") return null;
  if (!cartItems.length) return null;

  const capped = cartItems.slice(0, CONFIG.MAX_CART_ITEMS);
  const itemIds = capped.map((i) => i.menuItemId);

  const { data: menuItems, error } = await supabase.from("menu_items").select("id, price").in("id", itemIds);
  if (error || !menuItems) {
    log("error", "menu_items_fetch_failed", { requestId, error: error?.message ?? "unknown" });
    return null;
  }

  const priceMap = new Map<string, number>();
  for (const m of menuItems as Array<{ id: string; price: number | string }>) {
    const priceNum = typeof m.price === "number" ? m.price : Number(m.price);
    if (Number.isFinite(priceNum) && priceNum >= 0) priceMap.set(m.id, priceNum);
  }

  let total = 0;
  for (const item of capped) {
    const unitDollars = priceMap.get(item.menuItemId);
    if (unitDollars == null) continue;
    const qty = clampInt(item.quantity, 1, CONFIG.MAX_ITEM_QTY);
    total += Math.round(unitDollars * 100) * qty;
  }

  return total;
}

// ============================================================================
// Helpers: disputes - map charge -> order
// ============================================================================

async function findOrderByChargeId(chargeId: string | null, requestId: string): Promise<{ id: string } | null> {
  if (!chargeId) return null;

  const { data: byMeta } = await supabase.from("orders").select("id").eq("metadata->>stripe_charge_id", chargeId).maybeSingle();
  if (byMeta?.id) return byMeta;

  log("info", "charge_meta_miss_fallback", { requestId, chargeId: prefix(chargeId) });

  try {
    const charge = await stripe.charges.retrieve(chargeId);
    const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
    if (!paymentIntentId) return null;

    const { data: byIntent } = await supabase.from("orders").select("id").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
    return byIntent?.id ? byIntent : null;
  } catch (e) {
    log("warn", "charge_fallback_failed", { requestId, chargeId: prefix(chargeId), error: asErr(e) });
    return null;
  }
}

// ============================================================================
// Helpers: respond/log/sanitize
// ============================================================================

function respond(status: number, body: Record<string, unknown>, requestId?: string): Response {
  const payload = CONFIG.RETURN_REQUEST_ID && requestId ? { ...body, requestId } : body;
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function log(level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>): void {
  const entry = JSON.stringify({ level, event, service: "stripe-webhook", ts: new Date().toISOString(), ...(data ?? {}) });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

function asErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function prefix(id: string | null | undefined, n = 8): string | null {
  if (!id) return null;
  return id.slice(0, n);
}

function nullSafe(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function safeStr(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function clampAmountCents(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  const c = Math.max(0, Math.trunc(n));
  return Math.min(c, CONFIG.MAX_AWARD_AMOUNT_CENTS);
}

function getShippingDetails(
  session: Stripe.Checkout.Session,
): { name?: string | null; phone?: string | null; address?: Stripe.Address | null } | null {
  const s = session as unknown as {
    shipping_details?: { name?: string | null; phone?: string | null; address?: Stripe.Address | null } | null;
    customer_details?: { name?: string | null; phone?: string | null; address?: Stripe.Address | null } | null;
  };
  return s.shipping_details ?? s.customer_details ?? null;
}

// Cart parsing
function isObj(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}
function asFiniteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function asInt(v: unknown): number | null {
  const n = asFiniteNumber(v);
  if (n === null) return null;
  return Number.isInteger(n) ? n : Math.round(n);
}
function toCartItemNorm(v: Record<string, unknown>): CartItemNorm | null {
  const menuItemId = asNonEmptyString(v.menuItemId) ?? asNonEmptyString(v.menu_item_id) ?? asNonEmptyString(v.id);
  const quantity = asInt(v.quantity);
  if (!menuItemId || quantity === null || quantity <= 0) return null;
  return { menuItemId, quantity };
}
function parsePendingCartItems(itemsJson: unknown): CartItemNorm[] {
  if (!Array.isArray(itemsJson)) return [];
  const out: CartItemNorm[] = [];
  for (const el of itemsJson) {
    if (!isObj(el)) continue;
    const norm = toCartItemNorm(el);
    if (norm) out.push(norm);
  }
  return out;
}

// Loyalty parsing
function parseV2AwardResult(raw: unknown): LoyaltyV2Result | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(row)) return null;
  const num = (k: string) => typeof row[k] === "number" && Number.isFinite(row[k] as number);
  const bool = (k: string) => typeof row[k] === "boolean";
  if (!num("new_balance") || !num("new_lifetime") || !num("points_earned") || !num("streak") || !bool("tier_changed") || !bool("was_duplicate")) return null;
  return {
    new_balance: row.new_balance as number,
    new_lifetime: row.new_lifetime as number,
    new_tier: typeof row.new_tier === "string" ? (row.new_tier as string) : "unknown",
    points_earned: row.points_earned as number,
    streak: row.streak as number,
    tier_changed: row.tier_changed as boolean,
    was_duplicate: row.was_duplicate as boolean,
  };
}

function parseLegacyAwardResult(raw: unknown): LoyaltyLegacyResult | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!isObj(row)) return null;

  const num = (k: string) => typeof row[k] === "number" && Number.isFinite(row[k] as number);
  const bool = (k: string) => typeof row[k] === "boolean";
  const str = (k: string) => typeof row[k] === "string";

  if (!num("points_earned") || !num("base_points") || !num("tier_multiplier") || !num("streak_multiplier") || !num("new_balance") || !num("new_lifetime") || !num("streak") || !bool("tier_changed") || !str("tier") || !str("tier_before") || !bool("same_day_order")) {
    return null;
  }

  return row as unknown as LoyaltyLegacyResult;
}