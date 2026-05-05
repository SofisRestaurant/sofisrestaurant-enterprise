// supabase/functions/create-checkout-guest/index.ts
// =============================================================================
// Guest checkout pipeline — minimal, isolated, no auth dependencies.
// All error responses are emitted via errorResponse() from responses.ts.
// Shape: { ok: false, error: { code, message, requestId } }
//
// HARD CONSTRAINTS (enforced at import level, not just documented):
//   - No import of loyalty.ts, credits.ts, promos.ts, riskScore.ts
//   - No userId anywhere in executable code
//   - No bearer token handling (Authorization header → 403)
//   - No checkIntegrityHash
//   - No user_id in Stripe metadata
//   - promoId, promoCode, creditId hardcoded to null in pricing call
//
// MINIMUM ORDER ENFORCEMENT:
//   MIN_ORDER_CENTS is imported from _shared/constants.ts — NOT declared locally.
//   The check runs BEFORE findReusableGuestSession and before any Stripe API call.
//   findReusableGuestSession also enforces the same check internally
//   (defense-in-depth) to ensure the invariant holds regardless of call order or
//   future refactors.
//   Must match MIN_ORDER_CENTS in pending-cart.ts and create-checkout/index.ts.
//
// pickup_time support:
//   Validated via shared _shared/pickup-time.ts (single source of truth).
//   Written to Stripe metadata via pickupTimeToMetadata() — key is ABSENT
//   (not null) for ASAP orders. The webhook reads it and writes to orders.
//   NULL / absent = ASAP.
//
// Pre-checkout risk gate:
//   enforcePreCheckoutRisk() runs after pricing is resolved and before any
//   irreversible write (persistGuestPendingCart). On allow, three
//   pre_checkout_risk_* fields are written into Stripe metadata so the webhook
//   can persist them without re-running the post-payment scoring model.
// =============================================================================

import Stripe from "stripe";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  buildStripeLineItemsFromPricing,
  type CanonicalCartItem,
  hashPricingSnapshot,
  type PricingSnapshot,
  PricingValidationError,
  resolvePricingForCheckout,
} from "../_shared/pricing.ts";
import { MIN_ORDER_CENTS } from "../_shared/constants.ts";
import { validatePickupTime, pickupTimeToMetadata } from "../_shared/pickup-time.ts";

import { loadCanonicalCartItems } from "../create-checkout/catalog.ts";
import { corsHeadersFor } from "../create-checkout/cors.ts";
import {
  MAX_BODY_BYTES,
  MAX_ORDER_TOTAL_CENTS,
  resolveTaxRate,
  SESSION_EXPIRES_AFTER_SECONDS,
  STRIPE_API_VERSION,
} from "../create-checkout/env.ts";
import { asErr, log, prefix, sanitizeRequestId } from "../create-checkout/logging.ts";
import {
  backfillCartSessionId,
  findReusableGuestSession,
  persistGuestPendingCart,
} from "../create-checkout/pending-cart.ts";
import { mapPricingError } from "../create-checkout/pricing-errors.ts";
import { buildGuestPricingResponse } from "../create-checkout/pricing-response.ts";
import { getRequestIp } from "../create-checkout/request-context.ts";
import { checkGuestRateLimit } from "../create-checkout/rate-limit.ts";
import {
  type GuestRequestBody,
  validateGuestBody,
} from "../create-checkout/request-validation.ts";
import { BASE_HEADERS, errorResponse, successResponse } from "../create-checkout/responses.ts";
import { buildGuestIdempotencyKey } from "../create-checkout/security.ts";
import { getStripe } from "../create-checkout/stripe-client.ts";
import type { DbClient } from "../create-checkout/types.ts";
import { STRIPE_CANCEL_URL, STRIPE_SUCCESS_URL } from "../_shared/checkout-urls.ts";
import { enforcePreCheckoutRisk } from "../create-checkout/risk-gate.ts";
import type { RiskGateOutcome } from "../create-checkout/risk-gate.ts";

// ─── Local sha256Hex ──────────────────────────────────────────────────────────

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Guest token generator ────────────────────────────────────────────────────

function generateGuestToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Risk gate response ───────────────────────────────────────────────────────
//
// Handles otp_required separately: returns nonce + expiresAt as top-level
// JSON fields so the frontend can read them without parsing the message string.
// All other failure codes go through errorResponse unchanged.

function toRiskGateResponse(
  requestId: string,
  outcome: Extract<RiskGateOutcome, { passed: false }>,
  corsHeaders: Record<string, string>,
): Response {
  if (outcome.code === "otp_required" && outcome.otpPayload) {
    return new Response(
      JSON.stringify({
        ok:        false,
        code:      "otp_required",
        message:   outcome.message,
        nonce:     outcome.otpPayload.nonce,
        expiresAt: outcome.otpPayload.expiresAt,
        requestId,
      }),
      {
        status: outcome.httpStatus,
        headers: {
          ...BASE_HEADERS,
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
  return errorResponse(
    requestId,
    outcome.httpStatus,
    outcome.code,
    outcome.message,
    corsHeaders,
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = sanitizeRequestId(req.headers.get("x-request-id"));
  const start = Date.now();

  const requestOrigin = req.headers.get("origin");
  const corsHeaders = corsHeadersFor(requestOrigin);

  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    if (!corsHeaders) {
      return errorResponse(requestId, 403, "origin_not_allowed", "Origin not allowed.", {
        "Vary": "Origin",
      });
    }
    return new Response(null, {
      status: 204,
      headers: { ...BASE_HEADERS, ...corsHeaders, "X-Request-Id": requestId },
    });
  }

  if (!corsHeaders) {
    return errorResponse(requestId, 403, "origin_not_allowed", "Origin not allowed.", {
      "Vary": "Origin",
    });
  }

  // ── Method check ────────────────────────────────────────────────────────────
  if (req.method !== "POST") {
    return errorResponse(requestId, 405, "method_not_allowed", "Method not allowed.", corsHeaders);
  }

  // ── Hard reject any Authorization header ───────────────────────────────────
  if (req.headers.get("authorization")) {
    log("warn", "guest_checkout_auth_header_rejected", { requestId });
    return errorResponse(
      requestId,
      403,
      "auth_not_permitted",
      "This endpoint does not accept authentication tokens. Use the auth checkout endpoint.",
      corsHeaders,
    );
  }

  // ── Content-type check ──────────────────────────────────────────────────────
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return errorResponse(
      requestId,
      415,
      "unsupported_content_type",
      "Content-Type must be application/json.",
      corsHeaders,
    );
  }

  // ── Body read ───────────────────────────────────────────────────────────────
  let rawBody = "";
  try {
    const buffer = await req.arrayBuffer();

    if (buffer.byteLength === 0) {
      return errorResponse(requestId, 400, "empty_body", "Request body is required.", corsHeaders);
    }

    if (buffer.byteLength > MAX_BODY_BYTES) {
      log("warn", "guest_checkout_body_too_large", { requestId, bytes: buffer.byteLength });
      return errorResponse(requestId, 413, "body_too_large", "Request body too large.", corsHeaders);
    }

    rawBody = new TextDecoder().decode(buffer);
  } catch (error) {
    log("error", "guest_checkout_body_read_failed", { requestId, error: asErr(error) });
    return errorResponse(
      requestId,
      400,
      "body_read_failed",
      "Failed to read request body.",
      corsHeaders,
    );
  }

  if (rawBody.trim().length === 0) {
    return errorResponse(requestId, 400, "empty_body", "Request body is required.", corsHeaders);
  }

  // ── JSON parse ──────────────────────────────────────────────────────────────
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return errorResponse(requestId, 400, "invalid_json", "Invalid JSON.", corsHeaders);
  }

  // ── Guest validation ────────────────────────────────────────────────────────
  const validated = validateGuestBody(parsedBody);
  if (!validated.ok) {
    return errorResponse(requestId, 422, "validation_failed", validated.error, corsHeaders);
  }

  const body: GuestRequestBody = validated.value;

  // Read challenge_token from the raw parsed body — not typed in GuestRequestBody
  // but present on OTP retry requests after a risk gate challenge.
  const challengeToken: string | undefined =
    typeof (parsedBody as Record<string, unknown>).challenge_token === "string"
      ? (parsedBody as Record<string, unknown>).challenge_token as string
      : undefined;

  // ── pickup_time validation ─────────────────────────────────────────────────
const pickupTimeResult = validatePickupTime(body.pickup_time ?? null);

  if (!pickupTimeResult.ok) {
    return errorResponse(
      requestId,
      422,
      "validation_failed",
      pickupTimeResult.error,
      corsHeaders,
    );
  }

  const pickupTime = pickupTimeResult.value;

  // ── Service init ────────────────────────────────────────────────────────────
  let db: DbClient;
  let stripe: Stripe;
  try {
    db = createServiceClient();
    stripe = getStripe();
  } catch (error) {
    log("error", "guest_checkout_service_init_failed", { requestId, error: asErr(error) });
    return errorResponse(
      requestId,
      500,
      "service_unavailable",
      "Checkout service is temporarily unavailable.",
      corsHeaders,
    );
  }

  // ── IP-based rate limiting ──────────────────────────────────────────────────
  const requestIp = getRequestIp(req);
  const rawIp = requestIp ?? "unknown";
  const ipHash = await sha256Hex(rawIp);

  const rateLimit = await checkGuestRateLimit(db, ipHash, requestId);
  if (!rateLimit.allowed) {
    return errorResponse(
      requestId,
      429,
      "rate_limited",
      rateLimit.reason === "ip_blocked"
        ? "Too many checkout attempts. Please try again later."
        : "Too many requests. Please slow down.",
      {
        ...corsHeaders,
        "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
      },
    );
  }

  // ── Guest token ─────────────────────────────────────────────────────────────
  const guestToken = body.guest_token ?? generateGuestToken();

  // ── Canonical cart items ────────────────────────────────────────────────────
  let canonicalItems: CanonicalCartItem[];
  try {
    canonicalItems = await loadCanonicalCartItems(db, body.items);
  } catch (error) {
    if (error instanceof PricingValidationError) {
      return mapPricingError(requestId, error, corsHeaders);
    }
    log("error", "guest_checkout_canonical_cart_failed", { requestId, error: asErr(error) });
    return errorResponse(
      requestId,
      422,
      "pricing_failed",
      "Unable to calculate pricing. Please try again.",
      corsHeaders,
    );
  }

  // ── Pricing resolution ──────────────────────────────────────────────────────
  let snapshot: PricingSnapshot;
  let pricingHash = "";

  try {
    const pricing = await resolvePricingForCheckout({
      svc: db,
      userId: `guest:${guestToken}`,
      items: canonicalItems,
      promoId: null,    // HARDCODED — never from body
      promoCode: null,  // HARDCODED — never from body
      creditId: null,   // HARDCODED — never from body
      orderType: body.order_type,
      orderNotes: body.notes,
      taxRate: resolveTaxRate(),
    });

    snapshot = pricing.snapshot;
    pricingHash = pricing.pricingHash;
  } catch (error) {
    if (error instanceof PricingValidationError) {
      return mapPricingError(requestId, error, corsHeaders);
    }
    log("error", "guest_checkout_pricing_failed", { requestId, error: asErr(error) });
    return errorResponse(
      requestId,
      422,
      "pricing_failed",
      "Unable to calculate pricing. Please try again.",
      corsHeaders,
    );
  }

  // ── Pricing hash fallback ───────────────────────────────────────────────────
  if (!pricingHash) {
    try {
      pricingHash = await hashPricingSnapshot(snapshot);
    } catch (error) {
      log("error", "guest_checkout_pricing_hash_failed", { requestId, error: asErr(error) });
      return errorResponse(
        requestId,
        500,
        "pricing_hash_failed",
        "Internal error during checkout. Please try again.",
        corsHeaders,
      );
    }
  }

  if (!pricingHash.trim() || pricingHash.trim().length < 16) {
    return errorResponse(
      requestId,
      500,
      "pricing_hash_failed",
      "Internal error during checkout. Please try again.",
      corsHeaders,
    );
  }

  if (snapshot.totalCents <= 0 || snapshot.totalCents > MAX_ORDER_TOTAL_CENTS) {
    return errorResponse(
      requestId,
      422,
      "pricing_failed",
      "Unable to calculate pricing. Please try again.",
      corsHeaders,
    );
  }

  // ── Minimum order enforcement ─────────────────────────────────────────────
  if (snapshot.totalCents < MIN_ORDER_CENTS) {
    log("warn", "guest_checkout_below_minimum", {
      requestId,
      totalCents: snapshot.totalCents,
      minimumCents: MIN_ORDER_CENTS,
    });
    return errorResponse(
      requestId,
      400,
      "validation_failed",
      `Minimum order is $${(MIN_ORDER_CENTS / 100).toFixed(2)}. Please add more items to continue.`,
      corsHeaders,
    );
  }

  // ── Defensive snapshot integrity assertion ──────────────────────────────────
  if ((snapshot.promoDiscountCents ?? 0) !== 0 || (snapshot.creditCents ?? 0) !== 0) {
    log("error", "guest_checkout_unexpected_discount_in_snapshot", {
      requestId,
      promoDiscountCents: snapshot.promoDiscountCents,
      creditCents: snapshot.creditCents,
    });
    return errorResponse(
      requestId,
      500,
      "pricing_integrity_failed",
      "Internal error during checkout. Please try again.",
      corsHeaders,
    );
  }

  // ── Idempotency key ─────────────────────────────────────────────────────────
  let idempotencyKey = "";
  try {
    const cartHash = await sha256Hex(JSON.stringify(body.items));
    idempotencyKey = await buildGuestIdempotencyKey({
      guestEmail: body.guest_email,
      cartHash,
      pricingHash,
    });
  } catch (error) {
    log("error", "guest_checkout_idempotency_key_failed", { requestId, error: asErr(error) });
    return errorResponse(
      requestId,
      500,
      "internal_error",
      "Unable to create checkout session. Please try again.",
      corsHeaders,
    );
  }

  // ── Stage: Pre-checkout risk gate ───────────────────────────────────────────
  // Position: after pricing (needs totalCents) and idempotency key, and before
  // persistGuestPendingCart (no irreversible DB writes may exist on rejection).
  // On allow: three pre_checkout_risk_* variables are set and written into
  // Stripe metadata so the webhook does not re-run the post-payment scoring model.
  // guestToken is passed as userId — it is never queried against orders (isGuest:
  // true skips the paid-order-count DB query) and appears in logs as the
  // stable per-request guest identifier.
  const deviceFingerprint = req.headers.get("x-device-fingerprint") ?? null;

  const riskOutcome = await enforcePreCheckoutRisk({
    db,
    userId:            guestToken,
    isGuest:           true,
    requestIp,
    deviceFingerprint,
    guestEmail:        body.guest_email ?? null,
    orderTotalCents:   snapshot.totalCents,
    challengeToken,
    requestId,
  });

  if (!riskOutcome.passed) {
    return toRiskGateResponse(requestId, riskOutcome, corsHeaders);
  }

  const preCheckoutRiskScore:   number = riskOutcome.riskScore;
  const preCheckoutRiskLevel:   string = riskOutcome.riskLevel;
  const preCheckoutVerifStatus: string = riskOutcome.verificationStatus;

  // ── Session reuse check ─────────────────────────────────────────────────────
  const reusableSession = await findReusableGuestSession({
    db,
    stripe,
    guestToken,
    idempotencyKey,
    pricingHash,
    totalCents: snapshot.totalCents,
    currency: snapshot.currency,
    requestId,
  });

  if (reusableSession) {
    const reusableUrl = reusableSession.session.url;
    if (!reusableUrl) {
      return errorResponse(
        requestId,
        502,
        "stripe_session_failed",
        "Unable to reuse checkout session. Please try again.",
        corsHeaders,
      );
    }

    const ms = Date.now() - start;
    log("info", "guest_checkout_session_reused", {
      requestId,
      cartId: prefix(reusableSession.cartId),
      sessionId: prefix(reusableSession.session.id),
      amountTotal: snapshot.totalCents,
      orderType: body.order_type,
      ms,
    });

    return successResponse(
      requestId,
      "checkout_session_reused",
      {
        sessionId: reusableSession.session.id,
        url: reusableUrl,
        pricingHash,
        pricing: buildGuestPricingResponse(snapshot),
        guest_token: guestToken,
      },
      corsHeaders,
    );
  }

  // ── Persist pending cart ────────────────────────────────────────────────────
  const pendingCart = await persistGuestPendingCart({
    db,
    guestEmail: body.guest_email,
    guestToken,
    items: body.items,
    snapshot,
    pricingHash,
    idempotencyKey,
    requestId,
    pickup_time: pickupTime ?? undefined,
  } as Parameters<typeof persistGuestPendingCart>[0]);

  if (!pendingCart) {
    return errorResponse(
      requestId,
      500,
      "pending_cart_persist_failed",
      "Unable to create checkout session. Please try again.",
      corsHeaders,
    );
  }

  // ── Build Stripe line items ─────────────────────────────────────────────────
  let stripeLineItems: ReturnType<typeof buildStripeLineItemsFromPricing>;
  try {
    stripeLineItems = buildStripeLineItemsFromPricing(snapshot);
  } catch (error) {
    log("error", "guest_checkout_line_items_failed", {
      requestId,
      cartId: prefix(pendingCart.cartId),
      error: asErr(error),
    });
    return errorResponse(
      requestId,
      500,
      "line_items_failed",
      "Unable to build checkout. Please try again.",
      corsHeaders,
    );
  }

  // ── Guest Stripe metadata ───────────────────────────────────────────────────
  // MUST NOT contain: user_id, customer_uid, uid, device_fingerprint,
  // customer_ip, promo_id, credit_id, any loyalty_* fields.
  const sessionMetadata: Stripe.MetadataParam = {
    pending_cart_id: pendingCart.cartId,
    cart_ref: pendingCart.cartId,
    cart_id: pendingCart.cartId,
    order_type: body.order_type,
    pricing_hash: pricingHash,
    pricing_snapshot_version: snapshot.version,
    request_id: requestId,
    stripe_api_version: STRIPE_API_VERSION,
    currency: snapshot.currency,
    subtotal_cents: String(snapshot.subtotalCents),
    campaign_discount_cents: String(snapshot.campaignDiscountCents ?? 0),
    tax_cents: String(snapshot.taxCents),
    total_cents: String(snapshot.totalCents),
    idempotency_key: idempotencyKey,
    guest_token: guestToken,
    ...pickupTimeToMetadata(pickupTime),
    ...(snapshot.appliedCampaignIds.length
      ? { applied_campaign_ids: snapshot.appliedCampaignIds.join(",") }
      : {}),
    // Pre-checkout risk gate result — read by the webhook to persist risk fields
    // without re-running evaluateOrderRisk() post-payment.
    pre_checkout_risk_score:   String(preCheckoutRiskScore),
    pre_checkout_risk_level:   preCheckoutRiskLevel,
    pre_checkout_verif_status: preCheckoutVerifStatus,
  };

  // ── Create Stripe session ───────────────────────────────────────────────────
  let stripeSession: Stripe.Checkout.Session;
  try {
    stripeSession = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: pendingCart.cartId,
        line_items: stripeLineItems,
        success_url: STRIPE_SUCCESS_URL,
        cancel_url: STRIPE_CANCEL_URL,
        expires_at: Math.floor(Date.now() / 1000) + SESSION_EXPIRES_AFTER_SECONDS,
        metadata: sessionMetadata,
        payment_intent_data: { metadata: sessionMetadata },
        billing_address_collection: "auto",
        customer_email: body.guest_email,
        ...(body.order_type === "delivery"
          ? { phone_number_collection: { enabled: true } }
          : {}),
      },
      { idempotencyKey },
    );
  } catch (error) {
    log("error", "guest_checkout_stripe_session_failed", {
      requestId,
      cartId: prefix(pendingCart.cartId),
      error: asErr(error),
    });
    return errorResponse(
      requestId,
      502,
      "stripe_session_failed",
      "Unable to create checkout session. Please try again.",
      corsHeaders,
    );
  }

  if (!stripeSession.url) {
    log("error", "guest_checkout_stripe_session_missing_url", {
      requestId,
      cartId: prefix(pendingCart.cartId),
      sessionId: prefix(stripeSession.id),
    });
    return errorResponse(
      requestId,
      502,
      "stripe_session_failed",
      "Unable to create checkout session. Please try again.",
      corsHeaders,
    );
  }

  // ── Retrieve authoritative session URL ─────────────────────────────────────
  let authoritativeSession = stripeSession;
  try {
    const retrievedSession = await stripe.checkout.sessions.retrieve(stripeSession.id, {
      expand: ["payment_intent"],
    });
    if (retrievedSession.url) {
      authoritativeSession = retrievedSession;
    }
  } catch (error) {
    log("warn", "guest_checkout_stripe_session_refetch_failed", {
      requestId,
      cartId: prefix(pendingCart.cartId),
      sessionId: prefix(stripeSession.id),
      error: asErr(error),
    });
  }

  const checkoutUrl = authoritativeSession.url ?? stripeSession.url;
  if (!checkoutUrl) {
    return errorResponse(
      requestId,
      502,
      "stripe_session_failed",
      "Unable to create checkout session. Please try again.",
      corsHeaders,
    );
  }

  // ── Backfill stripe_session_id into pending_carts ──────────────────────────
  await backfillCartSessionId(
    db,
    pendingCart.cartId,
    authoritativeSession.id,
    snapshot,
    pricingHash,
    requestId,
  );

  const ms = Date.now() - start;
  log("info", "guest_checkout_session_created", {
    requestId,
    cartId: prefix(pendingCart.cartId),
    sessionId: prefix(authoritativeSession.id),
    amountTotal: snapshot.totalCents,
    orderType: body.order_type,
    pickupTime: pickupTime ?? null,
    ms,
  });

  return successResponse(
    requestId,
    "checkout_session_created",
    {
      sessionId: authoritativeSession.id,
      url: checkoutUrl,
      pricingHash,
      pricing: buildGuestPricingResponse(snapshot),
      guest_token: guestToken,
    },
    corsHeaders,
  );
});