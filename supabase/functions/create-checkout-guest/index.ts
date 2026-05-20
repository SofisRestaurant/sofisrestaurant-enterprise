// supabase/functions/create-checkout-guest/index.ts
// =============================================================================
// Guest checkout pipeline — minimal, isolated, no auth dependencies.
//
// HOURS ENFORCEMENT:
//   assertStoreOpen() from _shared/store-hours.ts is called after rate
//   limiting and before pricing. If the store is closed, a 409 STORE_CLOSED
//   error is returned immediately — no Stripe session is created.
//
// HARD CONSTRAINTS:
//   - No import of loyalty.ts, credits.ts, promos.ts, riskScore.ts
//   - No userId anywhere in executable auth/customer context
//   - No bearer token handling. Authorization header is rejected with 403.
//   - No checkIntegrityHash
//   - No user_id / customer_uid / uid in Stripe metadata
//   - promoId, promoCode, creditId hardcoded to null in pricing call
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
import {
  pickupTimeToMetadata,
  validatePickupTime,
} from "../_shared/pickup-time.ts";
import { getStoreHoursStatus } from "../_shared/store-hours.ts";
import {
  sanitizeAttribution,
  attributionToMetadata,
} from "../_shared/attribution.ts";

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
import {
  BASE_HEADERS,
  errorResponse,
  successResponse,
} from "../create-checkout/responses.ts";
import { buildGuestIdempotencyKey } from "../create-checkout/security.ts";
import { getStripe } from "../create-checkout/stripe-client.ts";
import type { DbClient, JsonObject } from "../create-checkout/types.ts";
import { enforcePreCheckoutRisk } from "../create-checkout/risk-gate.ts";
import type { RiskGateOutcome } from "../create-checkout/risk-gate.ts";
import {
  resolveCancelUrl,
  resolveSuccessUrl,
} from "../create-checkout/urls.ts";

// ─── Runtime guards ───────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasHostedUrl(session: Stripe.Checkout.Session): boolean {
  return typeof session.url === "string" && session.url.length > 0;
}

// ─── E.164 US phone validation ────────────────────────────────────────────────

const E164_US_PHONE_RE = /^\+1[2-9]\d{9}$/;

// ─── Local sha256Hex ──────────────────────────────────────────────────────────

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Guest token generator ────────────────────────────────────────────────────

function generateGuestToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Risk gate response ───────────────────────────────────────────────────────

function toRiskGateResponse(
  requestId: string,
  outcome: Extract<RiskGateOutcome, { passed: false }>,
  corsHeaders: Record<string, string>,
): Response {
  if (outcome.code === "otp_required" && outcome.otpPayload) {
    return new Response(
      JSON.stringify({
        ok: false,
        code: "otp_required",
        message: outcome.message,
        nonce: outcome.otpPayload.nonce,
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

// ─── Store-hours response ─────────────────────────────────────────────────────

function storeClosedResponse(
  requestId: string,
  message: string,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: "STORE_CLOSED",
      message,
      requestId,
    }),
    {
      status: 409,
      headers: {
        ...BASE_HEADERS,
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
}

// ─── Response body shaping ────────────────────────────────────────────────────

function buildGuestModeResponseBody(
  session: Stripe.Checkout.Session,
  pricingHash: string,
  snapshot: PricingSnapshot,
  guestToken: string,
): JsonObject {
  return {
    sessionId: session.id,
    url: session.url,
    pricingHash,
    pricing: buildGuestPricingResponse(snapshot),
    guest_token: guestToken,
  } as JsonObject;
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
        Vary: "Origin",
      });
    }

    return new Response(null, {
      status: 204,
      headers: {
        ...BASE_HEADERS,
        ...corsHeaders,
        "X-Request-Id": requestId,
      },
    });
  }

  if (!corsHeaders) {
    return errorResponse(requestId, 403, "origin_not_allowed", "Origin not allowed.", {
      Vary: "Origin",
    });
  }

  // ── Method check ────────────────────────────────────────────────────────────
  if (req.method !== "POST") {
    return errorResponse(
      requestId,
      405,
      "method_not_allowed",
      "Method not allowed.",
      {
        ...corsHeaders,
        Allow: "POST, OPTIONS",
      },
    );
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
  let rawBody: string;

  try {
    const buffer = await req.arrayBuffer();

    if (buffer.byteLength === 0) {
      return errorResponse(requestId, 400, "empty_body", "Request body is required.", corsHeaders);
    }

    if (buffer.byteLength > MAX_BODY_BYTES) {
      log("warn", "guest_checkout_body_too_large", {
        requestId,
        bytes: buffer.byteLength,
      });

      return errorResponse(
        requestId,
        413,
        "body_too_large",
        "Request body too large.",
        corsHeaders,
      );
    }

    rawBody = new TextDecoder().decode(buffer);
  } catch (error) {
    log("error", "guest_checkout_body_read_failed", {
      requestId,
      error: asErr(error),
    });

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
    return errorResponse(
      requestId,
      422,
      "validation_failed",
      validated.error,
      corsHeaders,
    );
  }

  const body: GuestRequestBody = validated.value;
  const rawBodyRecord = isRecord(parsedBody) ? parsedBody : {};

  // ── Optional raw-body fields ────────────────────────────────────────────────
  const challengeToken: string | undefined =
    typeof rawBodyRecord["challenge_token"] === "string"
      ? rawBodyRecord["challenge_token"]
      : undefined;

  const suppliedSuccessUrl =
    typeof rawBodyRecord["success_url"] === "string"
      ? rawBodyRecord["success_url"]
      : null;

  const suppliedCancelUrl =
    typeof rawBodyRecord["cancel_url"] === "string"
      ? rawBodyRecord["cancel_url"]
      : null;

  const rawSmsOptIn = rawBodyRecord["sms_opt_in"];
  const rawGuestPhone = rawBodyRecord["guest_phone"];

  const smsOptIn = rawSmsOptIn === true;
  let guestPhoneE164: string | null = null;

  if (smsOptIn) {
    if (typeof rawGuestPhone !== "string" || !E164_US_PHONE_RE.test(rawGuestPhone)) {
      return errorResponse(
        requestId,
        422,
        "validation_failed",
        "A valid 10-digit US mobile number is required to receive SMS order updates.",
        corsHeaders,
      );
    }

    guestPhoneE164 = rawGuestPhone;
  }

  // ── Attribution (optional, non-blocking) ──────────────────────────────────
  const rawAttribution = isRecord(rawBodyRecord) ? rawBodyRecord["attribution"] : null;
  const attribution = sanitizeAttribution(rawAttribution);

  // ── pickup_time validation ──────────────────────────────────────────────────
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
    log("error", "guest_checkout_service_init_failed", {
      requestId,
      error: asErr(error),
    });

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

// ── Store hours gate ────────────────────────────────────────────────────────
// Must run before any pricing, pending cart, or Stripe work.
// Uses shared backend store-hours logic so guest checkout matches auth checkout.
const storeHours = await getStoreHoursStatus(db);

if (!storeHours.isOpen) {
  log("info", "guest_checkout_store_closed", {
    requestId,
    message: storeHours.message,
  });

  return storeClosedResponse(requestId, storeHours.message, corsHeaders);
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

    log("error", "guest_checkout_canonical_cart_failed", {
      requestId,
      error: asErr(error),
    });

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
  let pricingHash: string;

  try {
    const pricing = await resolvePricingForCheckout({
      svc: db,
      userId: `guest:${guestToken}`,
      items: canonicalItems,
      promoId: null,
      promoCode: null,
      creditId: null,
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

    log("error", "guest_checkout_pricing_failed", {
      requestId,
      error: asErr(error),
    });

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
      log("error", "guest_checkout_pricing_hash_failed", {
        requestId,
        error: asErr(error),
      });

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

  // ── Minimum order enforcement ───────────────────────────────────────────────
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
  let idempotencyKey: string;

try {
  const cartHash = await sha256Hex(
    JSON.stringify({
      items: body.items,
      orderType: body.order_type,
      pickupTime,
      smsOptIn,
      guestPhoneE164: guestPhoneE164 ?? null,
    }),
  );

  idempotencyKey = await buildGuestIdempotencyKey({
    guestEmail: body.guest_email,
    cartHash,
    pricingHash,
  });
  
  } catch (error) {
    log("error", "guest_checkout_idempotency_key_failed", {
      requestId,
      error: asErr(error),
    });

    return errorResponse(
      requestId,
      500,
      "internal_error",
      "Unable to create checkout session. Please try again.",
      corsHeaders,
    );
  }

  // ── Pre-checkout risk gate ──────────────────────────────────────────────────
  const deviceFingerprint = req.headers.get("x-device-fingerprint") ?? null;

  const riskOutcome = await enforcePreCheckoutRisk({
    db,
    userId: guestToken,
    isGuest: true,
    requestIp,
    deviceFingerprint,
    guestEmail: body.guest_email ?? null,
    orderTotalCents: snapshot.totalCents,
    challengeToken,
    requestId,
  });

  if (!riskOutcome.passed) {
    return toRiskGateResponse(requestId, riskOutcome, corsHeaders);
  }

  const preCheckoutRiskScore = riskOutcome.riskScore;
  const preCheckoutRiskLevel = riskOutcome.riskLevel;
  const preCheckoutVerifStatus = riskOutcome.verificationStatus;

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
    if (!hasHostedUrl(reusableSession.session)) {
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
      buildGuestModeResponseBody(
        reusableSession.session,
        pricingHash,
        snapshot,
        guestToken,
      ),
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
  const sessionMetadata: Stripe.MetadataParam = {
    pending_cart_id: pendingCart.cartId,
    cart_ref: pendingCart.cartId,
    cart_id: pendingCart.cartId,
    order_type: body.order_type,
    pricing_hash: pricingHash,
    pricing_snapshot_version: snapshot.version,
    request_id: requestId,
    stripe_api_version: STRIPE_API_VERSION,
    checkout_ui_mode: "hosted",
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
    pre_checkout_risk_score: String(preCheckoutRiskScore),
    pre_checkout_risk_level: preCheckoutRiskLevel,
    pre_checkout_verif_status: preCheckoutVerifStatus,
    ...(smsOptIn && guestPhoneE164 !== null
      ? {
          guest_sms_opt_in: "true",
          guest_phone_e164: guestPhoneE164,
        }
      : {}),
    // ── Attribution (campaign tracking) ──────────────────────────────────────
    ...(attribution !== null
      ? attributionToMetadata(attribution)
      : {}),
  };

  // ── Create Stripe hosted Checkout session ───────────────────────────────────
  let stripeSession: Stripe.Checkout.Session;

  try {
    stripeSession = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: pendingCart.cartId,
        line_items: stripeLineItems,
        expires_at: Math.floor(Date.now() / 1000) + SESSION_EXPIRES_AFTER_SECONDS,
        metadata: sessionMetadata,
        payment_intent_data: { metadata: sessionMetadata },
        billing_address_collection: "auto",
        customer_email: body.guest_email,
        ...(body.order_type === "delivery"
          ? { phone_number_collection: { enabled: true } }
          : {}),
        success_url: resolveSuccessUrl(suppliedSuccessUrl),
        cancel_url: resolveCancelUrl(suppliedCancelUrl),
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

  if (!hasHostedUrl(stripeSession)) {
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

  if (!hasHostedUrl(authoritativeSession)) {
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
    smsOptIn,
    ms,
  });

  return successResponse(
    requestId,
    "checkout_session_created",
    buildGuestModeResponseBody(
      authoritativeSession,
      pricingHash,
      snapshot,
      guestToken,
    ),
    corsHeaders,
  );
});