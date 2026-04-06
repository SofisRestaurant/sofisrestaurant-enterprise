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
  applyLoyaltyToCheckout,
  type LoyaltyIntent,
} from "./loyalty.ts";
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
import type { DbClient, PendingCartUpdate } from "./types.ts";
import { validatePromo } from "./promos.ts";
import { resolveCancelUrl, resolveSuccessUrl } from "./urls.ts";

// ─── Loyalty helpers ──────────────────────────────────────────────────────────

/**
 * Creates a one-time Stripe coupon for the loyalty discount.
 * Negative line-item unit_amount is NOT supported in Checkout Sessions —
 * coupons via session.discounts[] is the only Stripe-safe approach.
 * The coupon is deleted immediately after the session claims it.
 */
async function createLoyaltyCoupon(
  stripe: Stripe,
  discountCents: number,
  currency: string,
  requestId: string,
): Promise<string | null> {
  try {
    const coupon = await stripe.coupons.create({
      amount_off: discountCents,
      currency: currency.toLowerCase(),
      name: "Loyalty Rewards",
      duration: "once",
      metadata: { request_id: requestId, source: "loyalty_checkout" },
    });
    return coupon.id;
  } catch (err) {
    log("error", "checkout_loyalty_coupon_create_failed", {
      requestId,
      error: asErr(err),
    });
    return null;
  }
}

async function deleteCouponSilently(
  stripe: Stripe,
  couponId: string,
  requestId: string,
): Promise<void> {
  try {
    await stripe.coupons.del(couponId);
  } catch (err) {
    log("warn", "checkout_loyalty_coupon_delete_failed", {
      requestId,
      couponId,
      error: asErr(err),
    });
  }
}

/**
 * Best-effort loyalty reserve release.
 * Called when Stripe session creation fails after a successful reserve,
 * or when coupon creation fails. Never throws.
 */
async function tryReleaseLoyalty(
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
      log("warn", "checkout_loyalty_release_failed", {
        requestId,
        reason,
        error: error.message,
      });
    } else {
      log("info", "checkout_loyalty_reserve_released", { requestId, reason });
    }
  } catch (err) {
    log("error", "checkout_loyalty_release_exception", {
      requestId,
      error: asErr(err),
    });
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

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

  // ── Loyalty reservation ───────────────────────────────────────────────────
  // Must run BEFORE Stripe session creation so the discount is applied to the
  // correct server-computed total. On any failure the checkout proceeds at
  // full price — loyalty is never a blocking dependency.
  //
  // preSessionKey = globally unique idempotency key for the ledger entry:
  //   userId + cartId + requestId (all server-generated, not client-supplied)
  const preSessionKey = `${userId}:${pendingCart.cartId}:${requestId}`;

  let loyaltyDiscountCents = 0;
  let loyaltyAccountId = "";
  let loyaltyPoints = 0;
  let stripeCouponId: string | null = null;

  const loyaltyIntent: LoyaltyIntent | null =
    body.loyalty_redeem_points && body.loyalty_redeem_points > 0 &&
      body.loyalty_account_id
      ? {
        applyPoints: true,
        pointsToRedeem: body.loyalty_redeem_points,
        loyaltyAccountId: body.loyalty_account_id,
      }
      : null;

  if (loyaltyIntent && (resolvedPromoId || body.promo_code)) {
    return errorResponse(
      requestId,
      422,
      "discount_conflict",
      "Cannot combine promo codes with loyalty points.",
      corsHeaders,
    );
  }

  if (loyaltyIntent) {
    const subtotalAfterCredit = Math.max(
      0,
      snapshot.subtotalCents - (snapshot.creditCents ?? 0),
    );

    const loyaltyResult = await applyLoyaltyToCheckout({
      intent: loyaltyIntent,
      userId,
      subtotalCents: subtotalAfterCredit,
      stripeSessionId: preSessionKey,
      db,
      requestId,
    });

    if (!loyaltyResult.applied) {
      const reason = loyaltyResult.reason;

      if (reason === "active_reserve_exists") {
        // The reserve's stripe_session_id in ledger metadata is the preSessionKey
        // format: userId:cartId:requestId — extract cartId to find the pending
        // cart and its actual Stripe session URL so the customer can resume.
        let resumeUrl: string | null = null;
        let resumeSessionId = "";
        const staleSessionKeys: string[] = [];

        try {
          const { data: activeReserves } = await db
            .from("loyalty_ledger")
            .select("idempotency_key, metadata")
            .eq("account_id", body.loyalty_account_id ?? "")
            .eq("entry_type", "checkout_reserve")
            .order("created_at", { ascending: false })
            .limit(10);

          for (const row of activeReserves ?? []) {
            const idemKey = row.idempotency_key as string ?? "";
            const releaseKey = idemKey.replace("reserve:", "release:");

            // Skip if already released
            const { data: released } = await db
              .from("loyalty_ledger")
              .select("id")
              .eq("idempotency_key", releaseKey)
              .maybeSingle();
            if (released?.id) continue;

            // Extract cartId from preSessionKey: userId:cartId:requestId
            const sessionKey = (row.metadata as Record<string, string>)
              ?.stripe_session_id ?? "";
            const parts = sessionKey.split(":");
            const cartId = parts[1];

            if (!cartId) {
              staleSessionKeys.push(sessionKey);
              continue;
            }

            // Look up the pending cart's actual Stripe session ID
            const { data: cart } = await db
              .from("pending_carts")
              .select("stripe_session_id")
              .eq("id", cartId)
              .is("consumed_at", null)
              .maybeSingle();

            const stripeSessionId = cart?.stripe_session_id;
            if (!stripeSessionId) {
              staleSessionKeys.push(sessionKey);
              continue;
            }

            try {
              const existing = await stripe.checkout.sessions.retrieve(stripeSessionId);
              if (existing.status === "open" && existing.url) {
                resumeUrl = existing.url;
                resumeSessionId = existing.id;
                log("info", "checkout_loyalty_resume_existing", {
                  requestId,
                  userId: prefix(userId),
                  sessionId: prefix(existing.id),
                });
                break;
              } else {
                staleSessionKeys.push(sessionKey);
              }
            } catch {
              staleSessionKeys.push(sessionKey);
            }
          }
        } catch (err) {
          log("warn", "checkout_loyalty_reserve_lookup_failed", {
            requestId,
            error: asErr(err),
          });
        }

        if (resumeUrl) {
          // Customer has an open checkout — redirect them to complete it.
          return successResponse(
            requestId,
            "checkout_session_reused",
            {
              sessionId: resumeSessionId,
              url: resumeUrl,
              pricingHash,
              pricing: buildCheckoutPricingResponse(snapshot),
            },
            corsHeaders,
          );
        }

        // No open session found — auto-release stale reserves so the
        // customer isn't permanently blocked from using their points.
        for (const sessionKey of staleSessionKeys) {
          await tryReleaseLoyalty(db, sessionKey, "stale_reserve_auto_release", requestId);
        }

        log("info", "checkout_loyalty_stale_reserve_cleared", {
          requestId,
          userId: prefix(userId),
          count: staleSessionKeys.length,
        });
        // Fall through — checkout proceeds without loyalty discount.
        // Customer can retry points on the next attempt.
      }

      if (reason === "daily_limit_exceeded") {
        return errorResponse(
          requestId,
          422,
          "loyalty_daily_limit",
          "You've reached your daily loyalty redemption limit. Try again tomorrow.",
          corsHeaders,
        );
      }
      if (reason === "per_order_limit_exceeded") {
        return errorResponse(
          requestId,
          422,
          "loyalty_order_limit",
          "You've selected more points than the per-order maximum.",
          corsHeaders,
        );
      }
      // All other skips (insufficient balance, zero balance, etc.) proceed silently at full price
    }

    if (loyaltyResult.applied) {
      loyaltyDiscountCents = loyaltyResult.discountCents;
      loyaltyAccountId = loyaltyResult.accountId;
      loyaltyPoints = loyaltyResult.reservedPoints;

      // Create a one-time Stripe coupon for the discount.
      // Negative unit_amount on line items is not supported in payment mode.
      stripeCouponId = await createLoyaltyCoupon(
        stripe,
        loyaltyDiscountCents,
        snapshot.currency,
        requestId,
      );

      if (!stripeCouponId) {
        // Coupon creation failed — release the reserve and proceed at full price.
        await tryReleaseLoyalty(
          db,
          preSessionKey,
          "coupon_create_failed",
          requestId,
        );
        loyaltyDiscountCents = 0;
        loyaltyAccountId = "";
        loyaltyPoints = 0;
      } else {
        log("info", "checkout_loyalty_reserved", {
          requestId,
          userId: prefix(userId),
          accountId: prefix(loyaltyAccountId),
          points: loyaltyPoints,
          discountCents: loyaltyDiscountCents,
        });
      }
    }
    // Skips are already logged inside applyLoyaltyToCheckout via skip()
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

    // Release loyalty reserve before returning — line items failed after reserve
    if (loyaltyAccountId && loyaltyPoints > 0) {
      await tryReleaseLoyalty(
        db,
        preSessionKey,
        "line_items_build_failed",
        requestId,
      );
    }
    if (stripeCouponId) await deleteCouponSilently(stripe, stripeCouponId, requestId);

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
    ...(body.loyalty_redeem_points !== null &&
        body.loyalty_redeem_points !== undefined &&
        body.loyalty_redeem_points > 0
      ? { loyalty_redeem_points: String(body.loyalty_redeem_points) }
      : {}),
    ...(body.loyalty_reward_id
      ? { loyalty_reward_id: body.loyalty_reward_id }
      : {}),
    ...(body.loyalty_redemption_id
      ? { loyalty_redemption_id: body.loyalty_redemption_id }
      : {}),
    // Loyalty reservation fields — written only when a reserve was committed.
    // The webhook uses these to finalize (completed) or release (expired).
    ...(loyaltyAccountId
      ? {
        loyalty_account_id: loyaltyAccountId,
        loyalty_reserved_points: String(loyaltyPoints),
        loyalty_discount_cents: String(loyaltyDiscountCents),
        loyalty_pre_session_key: preSessionKey,
      }
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
        // Loyalty coupon — shows as "Loyalty Rewards -$X.XX" on Stripe's
        // hosted payment page and on the customer receipt.
        ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
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

    // Stripe failed after loyalty reserve — restore points immediately.
    // Guard on loyaltyAccountId && loyaltyPoints > 0, NOT just discountCents,
    // because a reserve can succeed even if the cents value rounded to zero.
    if (loyaltyAccountId && loyaltyPoints > 0) {
      await tryReleaseLoyalty(
        db,
        preSessionKey,
        "stripe_session_create_failed",
        requestId,
      );
    }
    if (stripeCouponId) await deleteCouponSilently(stripe, stripeCouponId, requestId);

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

  // Write loyalty columns to pending_carts so the webhook can find reservation
  // context without re-parsing Stripe metadata. Best-effort — Stripe metadata
  // is the authoritative fallback if this update fails.
  if (loyaltyAccountId) {
    const { error: loyaltyUpdateErr } = await db
      .from("pending_carts")
      .update({
        loyalty_account_id: loyaltyAccountId,
        loyalty_reserved_points: loyaltyPoints,
        loyalty_discount_cents: loyaltyDiscountCents,
      } as PendingCartUpdate)
      .eq("id", pendingCart.cartId);

    if (loyaltyUpdateErr) {
      log("warn", "checkout_loyalty_pending_cart_update_failed", {
        requestId,
        cartId: prefix(pendingCart.cartId),
        sessionId: prefix(authoritativeSession.id),
        error: loyaltyUpdateErr.message,
      });
    }
  }

  const ms = Date.now() - start;

  log("info", "checkout_session_created", {
    requestId,
    userId: prefix(userId),
    cartId: prefix(pendingCart.cartId),
    sessionId: prefix(authoritativeSession.id),
    amountTotal: snapshot.totalCents,
    loyaltyOff: loyaltyDiscountCents,
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