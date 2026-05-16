// supabase/functions/create-checkout/index.ts
// =============================================================================
// Authenticated checkout pipeline - staged architecture.
//
// CHANGES (2026-05 embedded checkout migration):
//   - URL handling: client-supplied success_url / cancel_url now flow through
//     ./urls.ts resolvers after validation.
//   - ui_mode: parsed from the request body, defaulted to hosted, threaded
//     through the loyalty stage and Stripe session creation.
//   - Embedded mode: returns clientSecret instead of url and uses return_url.
//   - Hosted mode: returns url and uses success_url / cancel_url.
//   - Reusable session: requested ui_mode must match the existing session mode.
//   - Loyalty resume: only resumes when the existing session matches ui_mode.
//
// Type-hardening notes:
//   - Stripe's generated `ui_mode` type can lag behind the API version in Deno.
//     We avoid comparing Stripe's SDK union directly to our CheckoutUiMode.
//   - Embedded Checkout params are cast only at the final Stripe call boundary.
//   - successResponse body is typed as JsonObject, not Record<string, unknown>.
//
// All other staged behavior is preserved.
// =============================================================================

import Stripe from "stripe";
import type { Json } from "../_shared/database.types.ts";
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
import { MIN_ORDER_CENTS } from "../_shared/constants.ts";
import {
  pickupTimeToMetadata,
  validatePickupTime,
} from "../_shared/pickup-time.ts";
import {
  type CheckoutUiMode,
  DEFAULT_CHECKOUT_UI_MODE,
} from "../_shared/checkout-ui-mode.ts";

import { loadCanonicalCartItems } from "./catalog.ts";
import { corsHeadersFor } from "./cors.ts";
import { validateCredit } from "./credits.ts";
import { applyLoyaltyToCheckout, type LoyaltyIntent } from "./loyalty.ts";
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
import { buildAuthPricingResponse } from "./pricing-response.ts";
import { getRequestIp } from "./request-context.ts";
import { checkRateLimit } from "./rate-limit.ts";
import { validateAuthBody } from "./request-validation.ts";
import { BASE_HEADERS, errorResponse, successResponse } from "./responses.ts";
import { buildCheckoutIdempotencyKey, checkIntegrityHash } from "./security.ts";
import { getStripe } from "./stripe-client.ts";
import type {
  DbClient,
  ErrorCode,
  JsonObject,
  PendingCartUpdate,
  RequestBody,
} from "./types.ts";
import { validatePromo } from "./promos.ts";
import { enforcePreCheckoutRisk } from "./risk-gate.ts";
import type { RiskGateOutcome } from "./risk-gate.ts";
import {
  resolveCancelUrl,
  resolveReturnUrl,
  resolveSuccessUrl,
} from "./urls.ts";

// ─── Result type ──────────────────────────────────────────────────────────────

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: CheckoutFailure };

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

function fail(error: CheckoutFailure): Result<never> {
  return { ok: false, error };
}

// ─── Failure shape ────────────────────────────────────────────────────────────

interface CheckoutFailure {
  httpStatus: number;
  code: ErrorCode;
  message: string;
  extraHeaders?: Record<string, string>;
}

function failure(
  httpStatus: number,
  code: ErrorCode,
  message: string,
  extraHeaders?: Record<string, string>,
): CheckoutFailure {
  return { httpStatus, code, message, extraHeaders };
}

function toResponse(
  requestId: string,
  f: CheckoutFailure,
  corsHeaders: Record<string, string>,
): Response {
  return errorResponse(
    requestId,
    f.httpStatus,
    f.code,
    f.message,
    { ...corsHeaders, ...(f.extraHeaders ?? {}) },
  );
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

  return toResponse(
    requestId,
    failure(outcome.httpStatus, outcome.code, outcome.message),
    corsHeaders,
  );
}

// ─── ParsedBody ───────────────────────────────────────────────────────────────

interface ParsedBody {
  body: RequestBody;
  pickupTime: string | null;
  smsPhone: string | null;
  smsOptIn: boolean;
  uiMode: CheckoutUiMode;
}

// ─── Loyalty sealed outcome type ──────────────────────────────────────────────

type LoyaltyOutcome =
  | { applied: false }
  | {
      applied: true;
      discountCents: number;
      reservedPoints: number;
      accountId: string;
      couponId: string;
    };

const LOYALTY_NOT_APPLIED: LoyaltyOutcome = { applied: false };

// ─── Loyalty stage result ─────────────────────────────────────────────────────

type LoyaltyStageOutcome =
  | { kind: "applied"; loyalty: LoyaltyOutcome }
  | {
      kind: "resume";
      resumeSessionId: string;
      resumeUrl: string | null;
      resumeClientSecret: string | null;
    };

// ─── Resolved discounts ───────────────────────────────────────────────────────

interface ResolvedDiscounts {
  promoId: string | null;
  creditId: string | null;
}

// ─── Reservation state ────────────────────────────────────────────────────────

interface ReservationState {
  preSessionKey: string;
  loyalty: LoyaltyOutcome;
}

// ─── Pipeline context types ───────────────────────────────────────────────────

interface RequestContext {
  requestId: string;
  userId: string;
  requestIp: string | null;
  userAgent: string | null;
  deviceFingerprint: string | null;
  userEmail: string | null;
  corsHeaders: Record<string, string>;
}

interface PricingContext {
  canonicalItems: CanonicalCartItem[];
  snapshot: PricingSnapshot;
  pricingHash: string;
}

interface CartContext {
  cartId: string;
  idempotencyKey: string;
}

interface RiskGatePayload {
  riskScore: number;
  riskLevel: string;
  verificationStatus: string;
}

type CheckoutSessionResponseShape = {
  id: string;
  url?: string | null;
  client_secret?: string | null;
};

const LOYALTY_REDEEM_COOLDOWN_MINUTES = 30;

// ─── Stripe mode helpers ──────────────────────────────────────────────────────
//
// Stripe's generated type for `session.ui_mode` can lag behind the API version.
// Do not compare it directly against our CheckoutUiMode union. Normalize from
// unknown and treat anything non-embedded as hosted for backward compatibility.

function normalizeStripeCheckoutUiMode(value: unknown): CheckoutUiMode {
  return value === "embedded" ? "embedded" : "hosted";
}

function hasHostedSessionUrl(
  session: CheckoutSessionResponseShape,
): session is CheckoutSessionResponseShape & { url: string } {
  return typeof session.url === "string" && session.url.length > 0;
}

function hasEmbeddedClientSecret(
  session: CheckoutSessionResponseShape,
): session is CheckoutSessionResponseShape & { client_secret: string } {
  return typeof session.client_secret === "string" && session.client_secret.length > 0;
}

// ─── Pre-session key ──────────────────────────────────────────────────────────

function buildPreSessionKey(userId: string, cartId: string, requestId: string): string {
  if (!userId || !cartId || !requestId) {
    throw new Error(
      `buildPreSessionKey: all arguments must be non-empty (userId=${!!userId}, cartId=${!!cartId}, requestId=${!!requestId})`,
    );
  }

  return `${userId}:${cartId}:${requestId}`;
}

// ─── Rollback ─────────────────────────────────────────────────────────────────

async function rollbackReservations(
  db: DbClient,
  stripe: Stripe,
  state: ReservationState,
  reason: string,
  requestId: string,
): Promise<void> {
  if (state.loyalty.applied) {
    await releaseLoyaltyReserve(db, state.preSessionKey, reason, requestId);
    await deleteCouponSilently(stripe, state.loyalty.couponId, requestId);
  }
}

// ─── Stage 1: Authenticate user ───────────────────────────────────────────────

async function authenticateUser(
  req: Request,
  requestId: string,
): Promise<Result<{ userId: string; userEmail: string | null }>> {
  const bearerToken = readBearerToken(req);

  if (!bearerToken) {
    return fail(failure(401, "authorization_required", "Authorization required."));
  }

  const userClient = createAnonClient(bearerToken);
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData.user;

  if (authError || !user?.id) {
    log("warn", "checkout_auth_failed", {
      requestId,
      error: authError?.message ?? "No user returned",
    });

    return fail(failure(401, "invalid_token", "Invalid or expired token."));
  }

  return ok({ userId: user.id, userEmail: user.email ?? null });
}

// ─── Stage 2: Parse and validate request ──────────────────────────────────────

async function parseRequest(
  req: Request,
  requestId: string,
): Promise<Result<ParsedBody>> {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.includes("application/json")) {
    return fail(
      failure(415, "unsupported_content_type", "Content-Type must be application/json."),
    );
  }

  let buffer: ArrayBuffer;

  try {
    buffer = await req.arrayBuffer();
  } catch (err) {
    log("error", "checkout_body_read_failed", { requestId, error: asErr(err) });
    return fail(failure(400, "body_read_failed", "Failed to read request body."));
  }

  if (buffer.byteLength === 0) {
    return fail(failure(400, "empty_body", "Request body is required."));
  }

  if (buffer.byteLength > MAX_BODY_BYTES) {
    log("warn", "checkout_body_too_large", { requestId, bytes: buffer.byteLength });
    return fail(failure(413, "body_too_large", "Request body too large."));
  }

  const rawBody = new TextDecoder().decode(buffer);

  if (rawBody.trim().length === 0) {
    return fail(failure(400, "empty_body", "Request body is required."));
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return fail(failure(400, "invalid_json", "Invalid JSON."));
  }

  const validated = validateAuthBody(parsedJson);

  if (!validated.ok) {
    const code: ErrorCode = validated.error.startsWith("'ui_mode'")
      ? "invalid_ui_mode"
      : "validation_failed";

    return fail(failure(422, code, validated.error));
  }

  const body: RequestBody = validated.value;

  const pickupTimeResult = validatePickupTime(body.pickup_time ?? null);

  if (!pickupTimeResult.ok) {
    return fail(failure(422, "validation_failed", pickupTimeResult.error));
  }

  const isRec = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

  const rawSmsOptIn = isRec(parsedJson) && parsedJson["sms_opt_in"] === true;

  const rawSmsPhone =
    isRec(parsedJson) && typeof parsedJson["sms_phone_e164"] === "string"
      ? parsedJson["sms_phone_e164"]
      : null;

  const validSmsPhone =
    rawSmsPhone !== null && /^\+1[2-9]\d{9}$/.test(rawSmsPhone)
      ? rawSmsPhone
      : null;

  if (rawSmsOptIn && validSmsPhone === null) {
    return fail(
      failure(
        422,
        "validation_failed",
        "sms_phone_e164 must be a valid E.164 US number (+1XXXXXXXXXX) when sms_opt_in is true.",
      ),
    );
  }

  const uiMode: CheckoutUiMode = body.ui_mode ?? DEFAULT_CHECKOUT_UI_MODE;

  return ok({
    body,
    pickupTime: pickupTimeResult.value,
    smsPhone: rawSmsOptIn && validSmsPhone !== null ? validSmsPhone : null,
    smsOptIn: rawSmsOptIn && validSmsPhone !== null,
    uiMode,
  });
}

// ─── Stage 3: Init services ───────────────────────────────────────────────────

interface Services {
  db: DbClient;
  stripe: Stripe;
}

function initServices(requestId: string): Result<Services> {
  try {
    const db = createServiceClient();
    const stripe = getStripe();

    return ok({ db, stripe });
  } catch (err) {
    log("error", "checkout_service_init_failed", { requestId, error: asErr(err) });

    return fail(
      failure(500, "service_unavailable", "Checkout service is temporarily unavailable."),
    );
  }
}

// ─── Stage 4: Rate limit ──────────────────────────────────────────────────────

async function enforceRateLimit(
  db: DbClient,
  userId: string,
  requestIp: string | null,
  requestId: string,
): Promise<Result<true>> {
  const rateLimit = await checkRateLimit(db, userId, requestIp, requestId);

  if (!rateLimit.allowed) {
    return fail(
      failure(429, "rate_limited", rateLimit.reason, {
        "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
      }),
    );
  }

  return ok(true as const);
}

// ─── Stage 5: Build and validate pricing ──────────────────────────────────────

async function buildPricing(
  db: DbClient,
  userId: string,
  parsed: ParsedBody,
  requestId: string,
): Promise<Result<PricingContext>> {
  let canonicalItems: CanonicalCartItem[];

  try {
    canonicalItems = await loadCanonicalCartItems(db, parsed.body.items);
  } catch (err) {
    if (err instanceof PricingValidationError) {
      return fail(pricingValidationToFailure(err));
    }

    log("error", "checkout_canonical_cart_failed", {
      requestId,
      userId: prefix(userId),
      error: asErr(err),
    });

    return fail(
      failure(422, "pricing_failed", "Unable to calculate pricing. Please try again."),
    );
  }

  let pricingPair: { snapshot: PricingSnapshot; pricingHash: string };

  try {
    const resolved = await resolvePricingForCheckout({
      svc: db,
      userId,
      items: canonicalItems,
      promoId: parsed.body.promo_id,
      promoCode: parsed.body.promo_code,
      creditId: parsed.body.credit_id,
      orderType: parsed.body.order_type,
      orderNotes: parsed.body.notes,
      taxRate: resolveTaxRate(),
    });

    pricingPair = {
      snapshot: resolved.snapshot,
      pricingHash: resolved.pricingHash,
    };
  } catch (err) {
    if (err instanceof PricingValidationError) {
      return fail(pricingValidationToFailure(err));
    }

    log("error", "checkout_pricing_failed", {
      requestId,
      userId: prefix(userId),
      error: asErr(err),
    });

    return fail(
      failure(422, "pricing_failed", "Unable to calculate pricing. Please try again."),
    );
  }

  const { snapshot } = pricingPair;
  let { pricingHash } = pricingPair;

  if (!pricingHash) {
    try {
      pricingHash = await hashPricingSnapshot(snapshot);
    } catch (err) {
      log("error", "checkout_pricing_hash_failed", {
        requestId,
        userId: prefix(userId),
        error: asErr(err),
      });

      return fail(
        failure(500, "pricing_hash_failed", "Internal error during checkout. Please try again."),
      );
    }
  }

  if (!pricingHash.trim() || pricingHash.trim().length < 16) {
    return fail(
      failure(500, "pricing_hash_failed", "Internal error during checkout. Please try again."),
    );
  }

  if (snapshot.totalCents <= 0 || snapshot.totalCents > MAX_ORDER_TOTAL_CENTS) {
    return fail(
      failure(422, "pricing_failed", "Unable to calculate pricing. Please try again."),
    );
  }

  if (snapshot.totalCents < MIN_ORDER_CENTS) {
    log("warn", "checkout_below_minimum", {
      requestId,
      userId: prefix(userId),
      totalCents: snapshot.totalCents,
      minimumCents: MIN_ORDER_CENTS,
    });

    return fail(
      failure(
        400,
        "validation_failed",
        `Minimum order is $${(MIN_ORDER_CENTS / 100).toFixed(2)}. Please add more items to continue.`,
      ),
    );
  }

  return ok({ canonicalItems, snapshot, pricingHash });
}

function pricingValidationToFailure(err: PricingValidationError): CheckoutFailure {
  return failure(422, "pricing_failed", err.message);
}

// ─── Stage 6: Resolve discounts ───────────────────────────────────────────────

async function resolveDiscounts(
  db: DbClient,
  userId: string,
  snapshot: PricingSnapshot,
  body: RequestBody,
  requestId: string,
): Promise<Result<ResolvedDiscounts>> {
  let promoId: string | null = snapshot.promoId ?? null;
  let creditId: string | null = snapshot.creditId ?? null;

  if ((body.promo_code || body.promo_id) && !promoId) {
    const promoValidation = await validatePromo({
      db,
      promoCode: body.promo_code,
      promoId: body.promo_id,
      userId,
      subtotalCents: snapshot.subtotalCents,
      requestId,
    });

    if (!promoValidation.valid) {
      return fail(failure(422, "promo_invalid", promoValidation.error));
    }

    promoId = promoValidation.promoId;
  }

  if (body.credit_id && !creditId) {
    const creditValidation = await validateCredit({
      db,
      creditId: body.credit_id,
      userId,
      requestId,
    });

    if (!creditValidation.valid) {
      return fail(failure(422, "credit_invalid", creditValidation.error));
    }

    creditId = creditValidation.creditId;
  }

  return ok({ promoId, creditId });
}

// ─── Stage 7: Build idempotency key ───────────────────────────────────────────

async function buildIdempotencyKey(
  userId: string,
  body: RequestBody,
  pickupTime: string | null,
  pricingHash: string,
  discounts: ResolvedDiscounts,
  requestId: string,
): Promise<Result<string>> {
  try {
    const key = await buildCheckoutIdempotencyKey({
      userId,
      orderType: body.order_type,
      notes: body.notes,
      pricingHash,
      promoId: discounts.promoId,
      creditId: discounts.creditId,
      loyaltyRedeemPoints: body.loyalty_redeem_points,
      loyaltyRewardId: body.loyalty_reward_id,
      loyaltyRedemptionId: body.loyalty_redemption_id,
      pickupTime,
    });

    return ok(key);
  } catch (err) {
    log("error", "checkout_idempotency_key_failed", {
      requestId,
      userId: prefix(userId),
      error: asErr(err),
    });

    return fail(
      failure(500, "internal_error", "Unable to create checkout session. Please try again."),
    );
  }
}

// ─── Stage 8: Duplicate-order guard ───────────────────────────────────────────

async function guardDuplicateOrder(
  db: DbClient,
  userId: string,
  requestId: string,
): Promise<Result<true>> {
  const { data: recentOrder, error: orderError } = await db
    .from("orders")
    .select("id, created_at")
    .eq("customer_uid", userId)
    .eq("payment_status", "paid")
    .gte("created_at", new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .limit(1)
    .maybeSingle();

  if (orderError) {
    log("error", "checkout_duplicate_order_check_failed", {
      requestId,
      userId: prefix(userId),
      error: orderError.message,
    });

    return fail(
      failure(
        500,
        "internal_error",
        "Unable to verify order history. Please try again.",
      ),
    );
  }

  if (recentOrder?.id) {
    log("warn", "checkout_duplicate_order_blocked", {
      requestId,
      userId: prefix(userId),
      recentOrderId: prefix(recentOrder.id),
    });

    return fail(
      failure(
        429,
        "recent_order_exists",
        "You placed an order very recently. Please wait a moment before ordering again.",
      ),
    );
  }

  return ok(true as const);
}

// ─── Stage 9: Persist pending cart ────────────────────────────────────────────

async function createPendingCart(
  db: DbClient,
  userId: string,
  parsed: ParsedBody,
  pricing: PricingContext,
  discounts: ResolvedDiscounts,
  idempotencyKey: string,
  requestId: string,
): Promise<Result<CartContext>> {
  const pendingCart = await persistPendingCart({
    db,
    userId,
    items: parsed.body.items,
    snapshot: pricing.snapshot,
    pricingHash: pricing.pricingHash,
    promoId: discounts.promoId,
    creditId: discounts.creditId,
    idempotencyKey,
    requestId,
    pickupTime: parsed.pickupTime,
  });

  if (!pendingCart) {
    return fail(
      failure(
        500,
        "pending_cart_persist_failed",
        "Unable to create checkout session. Please try again.",
      ),
    );
  }

  return ok({ cartId: pendingCart.cartId, idempotencyKey });
}

// ─── Stage 10: Loyalty reservation ────────────────────────────────────────────

async function reserveLoyalty(
  db: DbClient,
  stripe: Stripe,
  userId: string,
  body: RequestBody,
  snapshot: PricingSnapshot,
  discounts: ResolvedDiscounts,
  preSessionKey: string,
  uiMode: CheckoutUiMode,
  requestId: string,
): Promise<Result<LoyaltyStageOutcome>> {
  const loyaltyIntent = buildLoyaltyIntent(body);

  if (!loyaltyIntent) {
    return ok({ kind: "applied", loyalty: LOYALTY_NOT_APPLIED });
  }

  const { loyaltyAccountId } = loyaltyIntent;

  if (discounts.promoId || body.promo_code) {
    return fail(
      failure(422, "discount_conflict", "Cannot combine promo codes with loyalty points."),
    );
  }

  const cooldownResult = await checkLoyaltyCooldown(db, loyaltyAccountId, requestId);
  if (!cooldownResult.ok) return fail(cooldownResult.error);

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
    const { reason } = loyaltyResult;

    if (reason === "active_reserve_exists") {
      const resumeResult = await findResumableLoyaltySession(
        db,
        stripe,
        loyaltyAccountId,
        uiMode,
        requestId,
      );

      if (resumeResult.resumeSessionId) {
        return ok({
          kind: "resume",
          resumeSessionId: resumeResult.resumeSessionId,
          resumeUrl: resumeResult.resumeUrl,
          resumeClientSecret: resumeResult.resumeClientSecret,
        });
      }

      if (resumeResult.staleSessionKeys.length > 0) {
        await releaseStaleReserves(db, resumeResult.staleSessionKeys, requestId);
      }

      const retryResult = await applyLoyaltyToCheckout({
        intent: loyaltyIntent,
        userId,
        subtotalCents: subtotalAfterCredit,
        stripeSessionId: preSessionKey,
        db,
        requestId,
      });

      if (!retryResult.applied) {
        return fail(loyaltyDeclineToFailure(retryResult.reason));
      }

      return commitLoyaltyWithCoupon(
        db,
        stripe,
        retryResult,
        preSessionKey,
        snapshot.currency,
        requestId,
      );
    }

    return fail(loyaltyDeclineToFailure(reason));
  }

  return commitLoyaltyWithCoupon(
    db,
    stripe,
    loyaltyResult,
    preSessionKey,
    snapshot.currency,
    requestId,
  );
}

function buildLoyaltyIntent(body: RequestBody): LoyaltyIntent | null {
  if (
    body.loyalty_redeem_points &&
    body.loyalty_redeem_points > 0 &&
    body.loyalty_account_id
  ) {
    return {
      applyPoints: true,
      pointsToRedeem: body.loyalty_redeem_points,
      loyaltyAccountId: body.loyalty_account_id,
    };
  }

  return null;
}

async function checkLoyaltyCooldown(
  db: DbClient,
  accountId: string,
  requestId: string,
): Promise<Result<true>> {
  if (!accountId.trim()) {
    log("error", "checkout_loyalty_cooldown_empty_account_id", { requestId });

    return fail(
      failure(422, "loyalty_reserve_conflict", "Unable to verify loyalty eligibility. Please try again."),
    );
  }

  const { data: acct, error: cooldownError } = await db
    .from("loyalty_accounts")
    .select("last_redeem_at")
    .eq("id", accountId)
    .maybeSingle();

  if (cooldownError) {
    log("error", "checkout_loyalty_cooldown_check_failed", {
      requestId,
      accountId: prefix(accountId),
      error: cooldownError.message,
    });

    return fail(
      failure(
        422,
        "loyalty_reserve_conflict",
        "Unable to verify loyalty redemption eligibility. Please try again.",
      ),
    );
  }

  if (acct?.last_redeem_at) {
    const minutesSince =
      (Date.now() - new Date(acct.last_redeem_at).getTime()) / 60000;

    if (minutesSince < LOYALTY_REDEEM_COOLDOWN_MINUTES) {
      const minutesLeft = Math.ceil(LOYALTY_REDEEM_COOLDOWN_MINUTES - minutesSince);

      return fail(
        failure(
          422,
          "loyalty_cooldown",
          `You recently redeemed points. Please wait ${minutesLeft} more minute${
            minutesLeft !== 1 ? "s" : ""
          } before redeeming again.`,
        ),
      );
    }
  }

  return ok(true as const);
}

function loyaltyDeclineToFailure(reason: string): CheckoutFailure {
  if (reason === "daily_limit_exceeded") {
    return failure(
      422,
      "loyalty_daily_limit",
      "You've reached your daily loyalty redemption limit. Try again tomorrow.",
    );
  }

  if (reason === "per_order_limit_exceeded") {
    return failure(
      422,
      "loyalty_order_limit",
      "You've selected more points than the per-order maximum.",
    );
  }

  return failure(
    422,
    "loyalty_reserve_conflict",
    "Unable to apply loyalty points. Please try again.",
  );
}

async function commitLoyaltyWithCoupon(
  db: DbClient,
  stripe: Stripe,
  loyaltyResult: {
    applied: true;
    discountCents: number;
    accountId: string;
    reservedPoints: number;
  },
  preSessionKey: string,
  currency: string,
  requestId: string,
): Promise<Result<LoyaltyStageOutcome>> {
  const couponId = await createLoyaltyCoupon(
    stripe,
    loyaltyResult.discountCents,
    currency,
    requestId,
  );

  if (!couponId) {
    await releaseLoyaltyReserve(
      db,
      preSessionKey,
      "coupon_create_failed",
      requestId,
    );

    return fail(
      failure(
        500,
        "loyalty_reserve_conflict",
        "Unable to apply loyalty discount. Please try again.",
      ),
    );
  }

  const outcome: LoyaltyOutcome = {
    applied: true,
    discountCents: loyaltyResult.discountCents,
    reservedPoints: loyaltyResult.reservedPoints,
    accountId: loyaltyResult.accountId,
    couponId,
  };

  log("info", "checkout_loyalty_reserved", {
    requestId,
    accountId: prefix(loyaltyResult.accountId),
    points: loyaltyResult.reservedPoints,
    discountCents: loyaltyResult.discountCents,
  });

  return ok({ kind: "applied", loyalty: outcome });
}

// ─── Loyalty resume helpers ───────────────────────────────────────────────────

interface ResumableLoyaltySession {
  resumeUrl: string | null;
  resumeClientSecret: string | null;
  resumeSessionId: string;
  staleSessionKeys: string[];
}

async function findResumableLoyaltySession(
  db: DbClient,
  stripe: Stripe,
  accountId: string,
  uiMode: CheckoutUiMode,
  requestId: string,
): Promise<ResumableLoyaltySession> {
  if (!accountId.trim()) {
    log("error", "checkout_loyalty_resume_empty_account_id", { requestId });

    return {
      resumeUrl: null,
      resumeClientSecret: null,
      resumeSessionId: "",
      staleSessionKeys: [],
    };
  }

  const staleSessionKeys: string[] = [];

  try {
    const { data: activeReserves, error: reservesError } = await db
      .from("loyalty_ledger")
      .select("idempotency_key, metadata")
      .eq("account_id", accountId)
      .eq("entry_type", "checkout_reserve")
      .order("created_at", { ascending: false })
      .limit(10);

    if (reservesError) {
      log("warn", "checkout_loyalty_reserve_list_failed", {
        requestId,
        accountId: prefix(accountId),
        error: reservesError.message,
      });

      return {
        resumeUrl: null,
        resumeClientSecret: null,
        resumeSessionId: "",
        staleSessionKeys,
      };
    }

    for (const row of activeReserves ?? []) {
      const idemKey = String(row.idempotency_key ?? "");
      const releaseKey = idemKey.replace("reserve:", "release:");

      const { data: released } = await db
        .from("loyalty_ledger")
        .select("id")
        .eq("idempotency_key", releaseKey)
        .maybeSingle();

      if (released?.id) continue;

      const metadata =
        typeof row.metadata === "object" && row.metadata !== null && !Array.isArray(row.metadata)
          ? row.metadata as Record<string, unknown>
          : {};

      const rawSessionKey = metadata["stripe_session_id"];
      const sessionKey = typeof rawSessionKey === "string" ? rawSessionKey : "";
      const cartId = sessionKey.split(":")[1];

      if (!cartId) {
        if (sessionKey) staleSessionKeys.push(sessionKey);
        continue;
      }

      const { data: cart, error: cartError } = await db
        .from("pending_carts")
        .select("stripe_session_id")
        .eq("id", cartId)
        .is("consumed_at", null)
        .maybeSingle();

      if (cartError) {
        log("warn", "checkout_loyalty_cart_lookup_failed", {
          requestId,
          cartId: prefix(cartId),
          error: cartError.message,
        });

        if (sessionKey) staleSessionKeys.push(sessionKey);
        continue;
      }

      const stripeSessionId = cart?.stripe_session_id;

      if (!stripeSessionId) {
        if (sessionKey) staleSessionKeys.push(sessionKey);
        continue;
      }

      try {
        const existing = await stripe.checkout.sessions.retrieve(stripeSessionId);

        if (existing.status !== "open") {
          if (sessionKey) staleSessionKeys.push(sessionKey);
          continue;
        }

        const existingMode = normalizeStripeCheckoutUiMode(
          (existing as { ui_mode?: unknown }).ui_mode,
        );

        if (existingMode !== uiMode) {
          log("info", "checkout_loyalty_resume_mode_mismatch", {
            requestId,
            sessionId: prefix(existing.id),
            existingMode,
            requestedMode: uiMode,
          });

          continue;
        }

        if (uiMode === "embedded") {
          if (hasEmbeddedClientSecret(existing)) {
            log("info", "checkout_loyalty_resume_existing_embedded", {
              requestId,
              sessionId: prefix(existing.id),
            });

            return {
              resumeUrl: null,
              resumeClientSecret: existing.client_secret,
              resumeSessionId: existing.id,
              staleSessionKeys,
            };
          }
        } else if (hasHostedSessionUrl(existing)) {
          log("info", "checkout_loyalty_resume_existing_hosted", {
            requestId,
            sessionId: prefix(existing.id),
          });

          return {
            resumeUrl: existing.url,
            resumeClientSecret: null,
            resumeSessionId: existing.id,
            staleSessionKeys,
          };
        }

        if (sessionKey) staleSessionKeys.push(sessionKey);
      } catch {
        if (sessionKey) staleSessionKeys.push(sessionKey);
      }
    }
  } catch (err) {
    log("warn", "checkout_loyalty_reserve_lookup_failed", {
      requestId,
      error: asErr(err),
    });
  }

  return {
    resumeUrl: null,
    resumeClientSecret: null,
    resumeSessionId: "",
    staleSessionKeys,
  };
}

async function releaseStaleReserves(
  db: DbClient,
  sessionKeys: string[],
  requestId: string,
): Promise<void> {
  const validKeys = sessionKeys.filter((key) => key.trim().length > 0);

  if (validKeys.length === 0) return;

  await Promise.allSettled(
    validKeys.map((key) =>
      releaseLoyaltyReserve(db, key, "stale_reserve_auto_release", requestId)
    ),
  );

  log("info", "checkout_loyalty_stale_reserve_cleared", {
    requestId,
    count: validKeys.length,
  });
}

// ─── Stage 11: Create Stripe session ──────────────────────────────────────────

async function createStripeSession(
  stripe: Stripe,
  ctx: RequestContext,
  parsed: ParsedBody,
  pricing: PricingContext,
  discounts: ResolvedDiscounts,
  cart: CartContext,
  loyalty: LoyaltyOutcome,
  preSessionKey: string,
  riskGate: RiskGatePayload,
): Promise<Result<Stripe.Checkout.Session>> {
  const expectedChargedCents = loyalty.applied
    ? pricing.snapshot.totalCents - loyalty.discountCents
    : pricing.snapshot.totalCents;

  if (
    !Number.isInteger(expectedChargedCents) ||
    expectedChargedCents <= 0
  ) {
    log("error", "checkout_invalid_charge_amount", {
      requestId: ctx.requestId,
      userId: prefix(ctx.userId),
      cartId: prefix(cart.cartId),
      totalCents: pricing.snapshot.totalCents,
      loyaltyDiscountCents: loyalty.applied ? loyalty.discountCents : 0,
      expectedChargedCents,
    });

    return fail(
      failure(
        422,
        "pricing_failed",
        "Unable to calculate checkout total. Please try again.",
      ),
    );
  }

  let lineItems: ReturnType<typeof buildStripeLineItemsFromPricing>;

  try {
    lineItems = buildStripeLineItemsFromPricing(pricing.snapshot);
  } catch (err) {
    log("error", "checkout_line_items_failed", {
      requestId: ctx.requestId,
      userId: prefix(ctx.userId),
      cartId: prefix(cart.cartId),
      error: asErr(err),
    });

    return fail(
      failure(500, "line_items_failed", "Unable to build checkout. Please try again."),
    );
  }

  const sessionMetadata = buildSessionMetadata(
    ctx,
    parsed,
    pricing,
    discounts,
    cart,
    loyalty,
    preSessionKey,
    riskGate,
  );

  const modeSpecificParams =
    parsed.uiMode === "embedded"
      ? {
          ui_mode: "embedded",
          return_url: resolveReturnUrl(parsed.body.success_url),
        }
      : {
          success_url: resolveSuccessUrl(parsed.body.success_url),
          cancel_url: resolveCancelUrl(parsed.body.cancel_url),
        };

  const sessionParams = {
    mode: "payment",
    client_reference_id: cart.cartId,
    line_items: lineItems,
    expires_at: Math.floor(Date.now() / 1000) + SESSION_EXPIRES_AFTER_SECONDS,
    metadata: sessionMetadata,
    payment_intent_data: { metadata: sessionMetadata },
    billing_address_collection: "auto",
    ...(ctx.userEmail ? { customer_email: ctx.userEmail } : {}),
    ...(parsed.body.order_type === "delivery"
      ? { phone_number_collection: { enabled: true } }
      : {}),
    ...(loyalty.applied ? { discounts: [{ coupon: loyalty.couponId }] } : {}),
    ...modeSpecificParams,
  } as unknown as Stripe.Checkout.SessionCreateParams;

  let session: Stripe.Checkout.Session;

  try {
    session = await stripe.checkout.sessions.create(
      sessionParams,
      { idempotencyKey: cart.idempotencyKey },
    );
  } catch (err) {
    log("error", "checkout_stripe_session_failed", {
      requestId: ctx.requestId,
      userId: prefix(ctx.userId),
      cartId: prefix(cart.cartId),
      uiMode: parsed.uiMode,
      error: asErr(err),
    });

    return fail(
      failure(502, "stripe_session_failed", "Unable to create Stripe session. Please try again."),
    );
  }

  if (parsed.uiMode === "embedded") {
    if (!hasEmbeddedClientSecret(session)) {
      log("error", "checkout_stripe_session_missing_client_secret", {
        requestId: ctx.requestId,
        sessionId: prefix(session.id),
      });

      return fail(
        failure(502, "stripe_session_failed", "Unable to create Stripe session. Please try again."),
      );
    }
  } else if (!hasHostedSessionUrl(session)) {
    log("error", "checkout_stripe_session_missing_url", {
      requestId: ctx.requestId,
      sessionId: prefix(session.id),
    });

    return fail(
      failure(502, "stripe_session_failed", "Unable to create Stripe session. Please try again."),
    );
  }

  return ok(session);
}

// ─── Session metadata builder ─────────────────────────────────────────────────

function buildSessionMetadata(
  ctx: RequestContext,
  parsed: ParsedBody,
  pricing: PricingContext,
  discounts: ResolvedDiscounts,
  cart: CartContext,
  loyalty: LoyaltyOutcome,
  preSessionKey: string,
  riskGate: RiskGatePayload,
): Stripe.MetadataParam {
  const { snapshot } = pricing;
  const { body, pickupTime, smsPhone, smsOptIn, uiMode } = parsed;

  return {
    user_id: ctx.userId,
    customer_uid: ctx.userId,
    uid: ctx.userId,
    pending_cart_id: cart.cartId,
    cart_ref: cart.cartId,
    cart_id: cart.cartId,
    order_type: body.order_type,
    pricing_hash: pricing.pricingHash,
    pricing_snapshot_version: snapshot.version,
    request_id: ctx.requestId,
    stripe_api_version: STRIPE_API_VERSION,
    checkout_ui_mode: uiMode,
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
    idempotency_key: cart.idempotencyKey,
    ...pickupTimeToMetadata(pickupTime),
    ...(discounts.promoId ? { promo_id: discounts.promoId } : {}),
    ...(discounts.creditId ? { credit_id: discounts.creditId } : {}),
    ...(snapshot.appliedCampaignIds.length
      ? { applied_campaign_ids: snapshot.appliedCampaignIds.join(",") }
      : {}),
    ...(body.loyalty_redeem_points && body.loyalty_redeem_points > 0
      ? { loyalty_redeem_points: String(body.loyalty_redeem_points) }
      : {}),
    ...(body.loyalty_reward_id
      ? { loyalty_reward_id: body.loyalty_reward_id }
      : {}),
    ...(body.loyalty_redemption_id
      ? { loyalty_redemption_id: body.loyalty_redemption_id }
      : {}),
    ...(loyalty.applied
      ? {
          loyalty_account_id: loyalty.accountId,
          loyalty_reserved_points: String(loyalty.reservedPoints),
          loyalty_discount_cents: String(loyalty.discountCents),
          loyalty_pre_session_key: preSessionKey,
        }
      : body.loyalty_account_id
        ? { loyalty_account_id: body.loyalty_account_id }
        : {}),
    pre_checkout_risk_score: String(riskGate.riskScore),
    pre_checkout_risk_level: riskGate.riskLevel,
    pre_checkout_verif_status: riskGate.verificationStatus,
    ...(smsOptIn && smsPhone !== null
      ? { sms_opt_in: "true", sms_phone_e164: smsPhone }
      : {}),
  };
}

// ─── Low-level helpers ────────────────────────────────────────────────────────

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

async function releaseLoyaltyReserve(
  db: DbClient,
  preSessionKey: string,
  reason: string,
  requestId: string,
): Promise<void> {
  if (!preSessionKey.trim()) {
    log("error", "checkout_loyalty_release_empty_key", {
      requestId,
      reason,
    });

    return;
  }

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

async function updatePendingCartWithLoyalty(
  db: DbClient,
  cartId: string,
  sessionId: string,
  loyalty: LoyaltyOutcome & { applied: true },
  requestId: string,
): Promise<void> {
  const { error } = await db
    .from("pending_carts")
    .update({
      loyalty_account_id: loyalty.accountId,
      loyalty_reserved_points: loyalty.reservedPoints,
      loyalty_discount_cents: loyalty.discountCents,
    } satisfies PendingCartUpdate)
    .eq("id", cartId);

  if (error) {
    log("warn", "checkout_loyalty_pending_cart_update_failed", {
      requestId,
      cartId: prefix(cartId),
      sessionId: prefix(sessionId),
      error: error.message,
    });
  }
}

// ─── Response body shaping ────────────────────────────────────────────────────

function buildModeResponseBody(
  session: CheckoutSessionResponseShape,
  uiMode: CheckoutUiMode,
  pricing: PricingContext,
): JsonObject {
  const pricingResponse = buildAuthPricingResponse(pricing.snapshot) as unknown as Json;

  if (uiMode === "embedded") {
    return {
      sessionId: session.id,
      clientSecret: session.client_secret ?? null,
      uiMode,
      pricingHash: pricing.pricingHash,
      pricing: pricingResponse,
    };
  }

  return {
    sessionId: session.id,
    url: session.url ?? null,
    uiMode,
    pricingHash: pricing.pricingHash,
    pricing: pricingResponse,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = sanitizeRequestId(req.headers.get("x-request-id"));
  const start = Date.now();

  const requestOrigin = req.headers.get("origin");
  const corsHeaders = corsHeadersFor(requestOrigin);

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

  if (req.method !== "POST") {
    return errorResponse(
      requestId,
      405,
      "method_not_allowed",
      "Method not allowed.",
      { ...corsHeaders, "Allow": "POST, OPTIONS" },
    );
  }

  const authResult = await authenticateUser(req, requestId);
  if (!authResult.ok) return toResponse(requestId, authResult.error, corsHeaders);

  const { userId, userEmail } = authResult.data;

  const parseResult = await parseRequest(req, requestId);
  if (!parseResult.ok) return toResponse(requestId, parseResult.error, corsHeaders);

  const parsed = parseResult.data;

  const servicesResult = initServices(requestId);
  if (!servicesResult.ok) return toResponse(requestId, servicesResult.error, corsHeaders);

  const { db, stripe } = servicesResult.data;

  const ctx: RequestContext = {
    requestId,
    userId,
    userEmail,
    requestIp: getRequestIp(req)?.slice(0, 64) ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
    deviceFingerprint: req.headers.get("x-device-fingerprint") ?? null,
    corsHeaders,
  };

  const rateLimitResult = await enforceRateLimit(db, userId, ctx.requestIp, requestId);
  if (!rateLimitResult.ok) return toResponse(requestId, rateLimitResult.error, corsHeaders);

  const pricingResult = await buildPricing(db, userId, parsed, requestId);
  if (!pricingResult.ok) return toResponse(requestId, pricingResult.error, corsHeaders);

  const pricing = pricingResult.data;

  await checkIntegrityHash({
    db,
    clientHash: parsed.body.client_integrity_hash,
    canonicalItems: pricing.canonicalItems,
    snapshot: pricing.snapshot,
    userId,
    requestId,
  });

  const riskOutcome = await enforcePreCheckoutRisk({
    db,
    userId,
    isGuest: false,
    requestIp: ctx.requestIp,
    deviceFingerprint: ctx.deviceFingerprint,
    guestEmail: parsed.body.guest_email ?? null,
    orderTotalCents: pricing.snapshot.totalCents,
    challengeToken: parsed.body.challenge_token ?? undefined,
    requestId,
  });

  if (!riskOutcome.passed) {
    return toRiskGateResponse(requestId, riskOutcome, corsHeaders);
  }

  const discountsResult = await resolveDiscounts(
    db,
    userId,
    pricing.snapshot,
    parsed.body,
    requestId,
  );

  if (!discountsResult.ok) return toResponse(requestId, discountsResult.error, corsHeaders);

  const discounts = discountsResult.data;

  const idempotencyKeyResult = await buildIdempotencyKey(
    userId,
    parsed.body,
    parsed.pickupTime,
    pricing.pricingHash,
    discounts,
    requestId,
  );

  if (!idempotencyKeyResult.ok) {
    return toResponse(requestId, idempotencyKeyResult.error, corsHeaders);
  }

  const idempotencyKey = idempotencyKeyResult.data;

  const reusableSession = await findReusableSession({
    db,
    stripe,
    userId,
    idempotencyKey,
    pricingHash: pricing.pricingHash,
    totalCents: pricing.snapshot.totalCents,
    currency: pricing.snapshot.currency,
    requestId,
  });

  if (reusableSession) {
    const reusableMode = normalizeStripeCheckoutUiMode(
      (reusableSession.session as { ui_mode?: unknown }).ui_mode,
    );

    if (reusableMode === parsed.uiMode) {
      const hasRequiredField = parsed.uiMode === "embedded"
        ? hasEmbeddedClientSecret(reusableSession.session)
        : hasHostedSessionUrl(reusableSession.session);

      if (!hasRequiredField) {
        return errorResponse(
          requestId,
          502,
          "stripe_session_failed",
          "Unable to reuse Stripe session. Please try again.",
          corsHeaders,
        );
      }

      log("info", "checkout_session_reused", {
        requestId,
        userId: prefix(userId),
        cartId: prefix(reusableSession.cartId),
        sessionId: prefix(reusableSession.session.id),
        amountTotal: pricing.snapshot.totalCents,
        orderType: parsed.body.order_type,
        uiMode: parsed.uiMode,
        ms: Date.now() - start,
      });

      return successResponse(
        requestId,
        "checkout_session_reused",
        buildModeResponseBody(reusableSession.session, parsed.uiMode, pricing),
        corsHeaders,
      );
    }

    log("info", "checkout_session_reuse_mode_mismatch", {
      requestId,
      userId: prefix(userId),
      existingMode: reusableMode,
      requestedMode: parsed.uiMode,
    });
  }

  const duplicateResult = await guardDuplicateOrder(db, userId, requestId);
  if (!duplicateResult.ok) return toResponse(requestId, duplicateResult.error, corsHeaders);

  const cartResult = await createPendingCart(
    db,
    userId,
    parsed,
    pricing,
    discounts,
    idempotencyKey,
    requestId,
  );

  if (!cartResult.ok) return toResponse(requestId, cartResult.error, corsHeaders);

  const cart = cartResult.data;
  const preSessionKey = buildPreSessionKey(userId, cart.cartId, requestId);

  const loyaltyStageResult = await reserveLoyalty(
    db,
    stripe,
    userId,
    parsed.body,
    pricing.snapshot,
    discounts,
    preSessionKey,
    parsed.uiMode,
    requestId,
  );

  if (!loyaltyStageResult.ok) {
    return toResponse(requestId, loyaltyStageResult.error, corsHeaders);
  }

  const loyaltyStage = loyaltyStageResult.data;

  if (loyaltyStage.kind === "resume") {
    log("info", "checkout_session_reused", {
      requestId,
      userId: prefix(userId),
      sessionId: prefix(loyaltyStage.resumeSessionId),
      uiMode: parsed.uiMode,
      ms: Date.now() - start,
    });

    return successResponse(
      requestId,
      "checkout_session_reused",
      buildModeResponseBody(
        {
          id: loyaltyStage.resumeSessionId,
          url: loyaltyStage.resumeUrl,
          client_secret: loyaltyStage.resumeClientSecret,
        },
        parsed.uiMode,
        pricing,
      ),
      corsHeaders,
    );
  }

  const loyalty = loyaltyStage.loyalty;
  const reservationState: ReservationState = { preSessionKey, loyalty };

  const stripeResult = await createStripeSession(
    stripe,
    ctx,
    parsed,
    pricing,
    discounts,
    cart,
    loyalty,
    preSessionKey,
    {
      riskScore: riskOutcome.riskScore,
      riskLevel: riskOutcome.riskLevel,
      verificationStatus: riskOutcome.verificationStatus,
    },
  );

  if (!stripeResult.ok) {
    await rollbackReservations(
      db,
      stripe,
      reservationState,
      "stripe_session_create_failed",
      requestId,
    );

    return toResponse(requestId, stripeResult.error, corsHeaders);
  }

  const stripeSession = stripeResult.data;

  await backfillCartSessionId(
    db,
    cart.cartId,
    stripeSession.id,
    pricing.snapshot,
    pricing.pricingHash,
    requestId,
  );

  if (loyalty.applied) {
    await updatePendingCartWithLoyalty(db, cart.cartId, stripeSession.id, loyalty, requestId);
  }

  log("info", "checkout_session_created", {
    requestId,
    userId: prefix(userId),
    cartId: prefix(cart.cartId),
    sessionId: prefix(stripeSession.id),
    amountTotal: pricing.snapshot.totalCents,
    loyaltyOff: loyalty.applied ? loyalty.discountCents : 0,
    orderType: parsed.body.order_type,
    pickupTime: parsed.pickupTime ?? null,
    uiMode: parsed.uiMode,
     ms: Date.now() - start,
  });

  return successResponse(
    requestId,
    "checkout_session_created",
    buildModeResponseBody(stripeSession, parsed.uiMode, pricing),
    corsHeaders,
  );
});