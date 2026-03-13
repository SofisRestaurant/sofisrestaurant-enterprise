// =============================================================================
// PATH: supabase/functions/create-checkout/index.ts
// =============================================================================
// create-checkout — Production Hardened (2026)
//
// Responsibilities:
//   1. Authenticate the caller (JWT → user_id)
//   2. Validate + sanitize request body
//   3. Enforce per-user rate limits via checkout_rate_limits table
//   4. Resolve server-authoritative pricing via resolvePricingForCheckout()
//   5. Validate promo code (active, applicable, per-user limit not exceeded)
//   6. Validate user credit (exists, belongs to user, unused, not expired)
//   7. Persist pending_cart BEFORE Stripe
//   8. Build Stripe Checkout Session (server-authoritative line items only)
//   9. Embed all critical identifiers in session.metadata for webhook recovery
//  10. Update pending_cart.stripe_session_id after session created
//  11. Reuse an existing open Stripe session for the same idempotency key
//  12. Return { sessionId, url } to the client
//
// Security:
//   - No client-supplied prices ever reach Stripe; all amounts come from server pricing
//   - JWT required; user identity validated with anon client auth.getUser()
//   - Per-user rate limiting via checkout_rate_limits + blocked_until
//   - Strict JSON parsing with content-type + size cap + deterministic error codes
//   - CORS is fail-closed to the allowlisted origins only
//   - No tokens / emails / phones / addresses are logged
//   - Credits are validated pre-payment only; redemption remains post-payment
//   - Loyalty redemption intent is stored only as metadata pre-payment
// =============================================================================

import Stripe from "stripe";
import {
  createAnonClient,
  createServiceClient,
  readBearerToken,
} from "../_shared/supabase.ts";
import {
  buildStripeLineItemsFromPricing,
  type CanonicalCartItem,
  hashPricingSnapshot,
  type PricingSnapshot,
  PricingValidationError,
  resolvePricingForCheckout,
} from "../_shared/pricing.ts";

import { loadCanonicalCartItems } from "./catalog.ts";
import { corsHeadersFor } from "./cors.ts";
import { validateCredit } from "./credits.ts";
import {
  MAX_BODY_BYTES,
  MAX_ORDER_TOTAL_CENTS,
  resolveTaxRate,
  SESSION_EXPIRES_AFTER_SECONDS,
  STRIPE_API_VERSION,
} from "./env.ts";
import { asErr, log, prefix, sanitizeRequestId } from "./logging.ts";
import {
  backfillCartSessionId,
  findReusableSession,
  persistPendingCart,
} from "./pending-cart.ts";
import { mapPricingError } from "./pricing-errors.ts";
import { buildCheckoutPricingResponse } from "./pricing-response.ts";
import { getRequestIp } from "./request-context.ts";
import { checkRateLimit } from "./rate-limit.ts";
import { validateBody } from "./request-validation.ts";
import { BASE_HEADERS, errorResponse, successResponse } from "./responses.ts";
import { buildCheckoutIdempotencyKey, checkIntegrityHash } from "./security.ts";
import { getStripe } from "./stripe-client.ts";
import type { DbClient } from "./types.ts";
import { validatePromo } from "./promos.ts";
import { resolveCancelUrl, resolveSuccessUrl } from "./urls.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = sanitizeRequestId(req.headers.get("x-request-id"));
  const start = Date.now();

  const requestOrigin = req.headers.get("origin");
  const corsHeaders = corsHeadersFor(requestOrigin);

  if (req.method === "OPTIONS") {
    if (!corsHeaders) {
      return errorResponse(
        requestId,
        403,
        "origin_not_allowed",
        "Origin not allowed.",
        { "Vary": "Origin" },
      );
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
    return errorResponse(
      requestId,
      403,
      "origin_not_allowed",
      "Origin not allowed.",
      { "Vary": "Origin" },
    );
  }

  if (req.method !== "POST") {
    return errorResponse(
      requestId,
      405,
      "method_not_allowed",
      "Method not allowed.",
      corsHeaders,
    );
  }

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

  const bearerToken = readBearerToken(req);
  if (!bearerToken) {
    return errorResponse(
      requestId,
      401,
      "authorization_required",
      "Authorization required.",
      corsHeaders,
    );
  }

  const userClient = createAnonClient(bearerToken);
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData.user;

  if (authError || !user?.id) {
    log("warn", "checkout_auth_failed", {
      requestId,
      error: authError?.message ?? "No user returned",
    });

    return errorResponse(
      requestId,
      401,
      "invalid_token",
      "Invalid or expired token.",
      corsHeaders,
    );
  }

  const userId = user.id;
  const requestIp = getRequestIp(req);
  const safeRequestIp = requestIp?.slice(0, 64) ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;
  const deviceFingerprint = req.headers.get("x-device-fingerprint") ?? null;

  let rawBody = "";
  try {
    const buffer = await req.arrayBuffer();

    if (buffer.byteLength === 0) {
      return errorResponse(
        requestId,
        400,
        "empty_body",
        "Request body is required.",
        corsHeaders,
      );
    }

    if (buffer.byteLength > MAX_BODY_BYTES) {
      log("warn", "checkout_body_too_large", {
        requestId,
        userId: prefix(userId),
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
    log("error", "checkout_body_read_failed", {
      requestId,
      userId: prefix(userId),
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
    return errorResponse(
      requestId,
      400,
      "empty_body",
      "Request body is required.",
      corsHeaders,
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return errorResponse(
      requestId,
      400,
      "invalid_json",
      "Invalid JSON.",
      corsHeaders,
    );
  }

  const validated = validateBody(parsedBody);
  if (!validated.ok) {
    return errorResponse(
      requestId,
      422,
      "validation_failed",
      validated.error,
      corsHeaders,
    );
  }

  const body = validated.value;

  let db: DbClient;
  let stripe: Stripe;
  try {
    db = createServiceClient();
    stripe = getStripe();
  } catch (error) {
    log("error", "checkout_service_init_failed", {
      requestId,
      userId: prefix(userId),
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

  const rateLimit = await checkRateLimit(db, userId, requestIp, requestId);
  if (!rateLimit.allowed) {
    return errorResponse(
      requestId,
      429,
      "rate_limited",
      rateLimit.reason,
      {
        ...corsHeaders,
        "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
      },
    );
  }

  let canonicalItems: CanonicalCartItem[];
  try {
    canonicalItems = await loadCanonicalCartItems(db, body.items);
  } catch (error) {
    if (error instanceof PricingValidationError) {
      return mapPricingError(requestId, error, corsHeaders);
    }

    log("error", "checkout_canonical_cart_failed", {
      requestId,
      userId: prefix(userId),
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

  let snapshot: PricingSnapshot;
  let pricingHash = "";

  try {
    const pricing = await resolvePricingForCheckout({
      svc: db,
      userId,
      items: canonicalItems,
      promoId: body.promo_id,
      promoCode: body.promo_code,
      creditId: body.credit_id,
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

    log("error", "checkout_pricing_failed", {
      requestId,
      userId: prefix(userId),
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

  if (!pricingHash) {
    try {
      pricingHash = await hashPricingSnapshot(snapshot);
    } catch (error) {
      log("error", "checkout_pricing_hash_failed", {
        requestId,
        userId: prefix(userId),
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

  await checkIntegrityHash({
    db,
    clientHash: body.client_integrity_hash,
    canonicalItems,
    snapshot,
    userId,
    requestId,
  });

  let resolvedPromoId = snapshot.promoId ?? null;
  if ((body.promo_code || body.promo_id) && !resolvedPromoId) {
    const promoValidation = await validatePromo({
      db,
      promoCode: body.promo_code,
      promoId: body.promo_id,
      userId,
      subtotalCents: snapshot.subtotalCents,
      requestId,
    });

    if (!promoValidation.valid) {
      return errorResponse(
        requestId,
        422,
        "promo_invalid",
        promoValidation.error,
        corsHeaders,
      );
    }

    resolvedPromoId = promoValidation.promoId;
  }

  let resolvedCreditId = snapshot.creditId ?? null;
  if (body.credit_id && !resolvedCreditId) {
    const creditValidation = await validateCredit({
      db,
      creditId: body.credit_id,
      userId,
      requestId,
    });

    if (!creditValidation.valid) {
      return errorResponse(
        requestId,
        422,
        "credit_invalid",
        creditValidation.error,
        corsHeaders,
      );
    }

    resolvedCreditId = creditValidation.creditId;
  }

  let idempotencyKey = "";
  try {
    idempotencyKey = await buildCheckoutIdempotencyKey({
      userId,
      orderType: body.order_type,
      notes: body.notes,
      pricingHash,
      promoId: resolvedPromoId,
      creditId: resolvedCreditId,
      loyaltyRedeemPoints: body.loyalty_redeem_points,
      loyaltyRewardId: body.loyalty_reward_id,
      loyaltyRedemptionId: body.loyalty_redemption_id,
    });
  } catch (error) {
    log("error", "checkout_idempotency_key_failed", {
      requestId,
      userId: prefix(userId),
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

  const reusableSession = await findReusableSession({
    db,
    stripe,
    userId,
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
        "Unable to reuse Stripe session. Please try again.",
        corsHeaders,
      );
    }

    const ms = Date.now() - start;

    log("info", "checkout_session_reused", {
      requestId,
      userId: prefix(userId),
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
        pricing: buildCheckoutPricingResponse(snapshot),
      },
      corsHeaders,
    );
  }

  const pendingCart = await persistPendingCart({
    db,
    userId,
    items: body.items,
    snapshot,
    pricingHash,
    promoId: resolvedPromoId,
    creditId: resolvedCreditId,
    idempotencyKey,
    requestId,
  });

  if (!pendingCart) {
    return errorResponse(
      requestId,
      500,
      "pending_cart_persist_failed",
      "Unable to create checkout session. Please try again.",
      corsHeaders,
    );
  }

  let stripeLineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
  try {
    stripeLineItems = buildStripeLineItemsFromPricing(snapshot);
  } catch (error) {
    log("error", "checkout_line_items_failed", {
      requestId,
      userId: prefix(userId),
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

  const sessionMetadata: Stripe.MetadataParam = {
    user_id: userId,
    customer_uid: userId,
    uid: userId,
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
    discount_cents: String(
      (snapshot.promoDiscountCents ?? 0) +
        (snapshot.campaignDiscountCents ?? 0) +
        (snapshot.creditCents ?? 0),
    ),
    promo_discount_cents: String(snapshot.promoDiscountCents ?? 0),
    campaign_discount_cents: String(snapshot.campaignDiscountCents ?? 0),
    credit_cents: String(snapshot.creditCents ?? 0),
    tax_cents: String(snapshot.taxCents),
    total_cents: String(snapshot.totalCents),
    idempotency_key: idempotencyKey,
    ...(safeRequestIp ? { customer_ip: safeRequestIp } : {}),
    ...(userAgent ? { customer_user_agent: userAgent.slice(0, 500) } : {}),
    ...(deviceFingerprint
      ? { device_fingerprint: deviceFingerprint.slice(0, 256) }
      : {}),
    ...(resolvedPromoId ? { promo_id: resolvedPromoId } : {}),
    ...(resolvedCreditId ? { credit_id: resolvedCreditId } : {}),
    ...(snapshot.appliedCampaignIds.length
      ? { applied_campaign_ids: snapshot.appliedCampaignIds.join(",") }
      : {}),
    ...(body.loyalty_redeem_points !== null && body.loyalty_redeem_points > 0
      ? { loyalty_redeem_points: String(body.loyalty_redeem_points) }
      : {}),
    ...(body.loyalty_reward_id
      ? { loyalty_reward_id: body.loyalty_reward_id }
      : {}),
    ...(body.loyalty_redemption_id
      ? { loyalty_redemption_id: body.loyalty_redemption_id }
      : {}),
  };

  let stripeSession: Stripe.Checkout.Session;
  try {
    stripeSession = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: pendingCart.cartId,
        line_items: stripeLineItems,
        success_url: resolveSuccessUrl(body.success_url),
        cancel_url: resolveCancelUrl(body.cancel_url),
        expires_at: Math.floor(Date.now() / 1000) +
          SESSION_EXPIRES_AFTER_SECONDS,
        metadata: sessionMetadata,
        payment_intent_data: {
          metadata: sessionMetadata,
        },
        billing_address_collection: "auto",
        ...(user.email ? { customer_email: user.email } : {}),
        ...(body.order_type === "delivery"
          ? { phone_number_collection: { enabled: true } }
          : {}),
      },
      {
        idempotencyKey,
      },
    );
  } catch (error) {
    log("error", "checkout_stripe_session_failed", {
      requestId,
      userId: prefix(userId),
      cartId: prefix(pendingCart.cartId),
      error: asErr(error),
    });

    return errorResponse(
      requestId,
      502,
      "stripe_session_failed",
      "Unable to create Stripe session. Please try again.",
      corsHeaders,
    );
  }

  if (!stripeSession.url) {
    log("error", "checkout_stripe_session_missing_url", {
      requestId,
      userId: prefix(userId),
      cartId: prefix(pendingCart.cartId),
      sessionId: prefix(stripeSession.id),
    });

    return errorResponse(
      requestId,
      502,
      "stripe_session_failed",
      "Unable to create Stripe session. Please try again.",
      corsHeaders,
    );
  }

  let authoritativeSession = stripeSession;
  try {
    const retrievedSession = await stripe.checkout.sessions.retrieve(
      stripeSession.id,
      {
        expand: ["payment_intent"],
      },
    );

    if (retrievedSession.url) {
      authoritativeSession = retrievedSession;
    }
  } catch (error) {
    log("warn", "checkout_stripe_session_refetch_failed", {
      requestId,
      userId: prefix(userId),
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
      "Unable to create Stripe session. Please try again.",
      corsHeaders,
    );
  }

  await backfillCartSessionId(
    db,
    pendingCart.cartId,
    authoritativeSession.id,
    snapshot,
    pricingHash,
    requestId,
  );

  const ms = Date.now() - start;

  log("info", "checkout_session_created", {
    requestId,
    userId: prefix(userId),
    cartId: prefix(pendingCart.cartId),
    sessionId: prefix(authoritativeSession.id),
    amountTotal: snapshot.totalCents,
    orderType: body.order_type,
    ms,
  });

  return successResponse(
    requestId,
    "checkout_session_created",
    {
      sessionId: authoritativeSession.id,
      url: checkoutUrl,
      pricingHash,
      pricing: buildCheckoutPricingResponse(snapshot),
    },
    corsHeaders,
  );
});
