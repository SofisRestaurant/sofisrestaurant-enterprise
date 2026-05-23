// supabase/functions/create-checkout/index.ts
// =============================================================================
// Authenticated checkout pipeline — staged architecture.
//
// Each stage accepts a typed context and returns Result<T, CheckoutFailure>.
// No shared mutable state crosses stage boundaries.
// All external side-effects are tracked in ReservationState and reversed via
// rollbackReservations() on any failure after the first irreversible side-effect.
//
// Identity: user_id is the ONLY canonical identifier in all TypeScript code.
//   The DB column `orders.customer_uid` is a legacy schema name that stores
//   the canonical user_id value — it is NOT a separate identifier concept.
//   Legacy Stripe metadata aliases (customer_uid, uid) are written once, at the
//   final metadata assembly step, solely to satisfy downstream webhook consumers
//   that have not yet been migrated.
//
// Result<T> note:
//   The single-parameter form is intentional. The two-parameter form
//   Result<T, CheckoutFailure> causes TypeScript to collapse E to `never` when
//   the return type of validateAuthBody (a conditional type) is not fully
//   resolved at downstream usage sites, producing cascading `never` errors.
//   The error type is always CheckoutFailure — it is captured in the
//   CheckoutFailure interface rather than in the generic parameter.
//
// pickup_time:
//   Validated via shared _shared/pickup-time.ts.
//   Written to Stripe metadata via pickupTimeToMetadata().
//   Absent key (not null) = ASAP order.
//
// Rollback contract:
//   commitLoyaltyWithCoupon() is the ONLY place that issues a loyalty reserve
//   AND creates a Stripe coupon atomically. If coupon creation fails it
//   releases the reserve before returning failure, so the main handler's
//   post-loyalty failure branch never needs to roll back a stranded reserve.
//   rollbackReservations() is called only after a successfully returned
//   LoyaltyOutcome (applied: true) to undo both the reserve and coupon when
//   a downstream stage (e.g. Stripe session create) subsequently fails.
// =============================================================================

import Stripe from "stripe";
import {
  createAnonClient,
  createServiceClient,
  readBearerToken,
} from "../_shared/supabase.ts";
import { getStoreHoursStatus } from "../_shared/store-hours.ts";
import {
  sanitizeAttribution,
} from "../_shared/attribution.ts";
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
  validatePickupTime,
} from "../_shared/pickup-time.ts";
import { STRIPE_CANCEL_URL, STRIPE_SUCCESS_URL } from "../_shared/checkout-urls.ts";

import { loadCanonicalCartItems } from "./catalog.ts";
import { corsHeadersFor } from "./cors.ts";
import { validateCredit } from "./credits.ts";
import { applyLoyaltyToCheckout, type LoyaltyIntent } from "./loyalty.ts";
import {
  MAX_BODY_BYTES,
  MAX_ORDER_TOTAL_CENTS,
  resolveTaxRate,
  SESSION_EXPIRES_AFTER_SECONDS,
} from "./env.ts";
import { asErr, log, prefix, sanitizeRequestId } from "./logging.ts";
import { buildSessionMetadata } from "./metadata.ts";
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
  CartContext,
  DbClient,
  ErrorCode,
  LoyaltyOutcome,
  ParsedBody,
  PendingCartUpdate,
  PricingContext,
  RequestBody,
  RequestContext,
  ResolvedDiscounts,
  RiskGatePayload,
} from "./types.ts";
import { validatePromo } from "./promos.ts";
import { enforcePreCheckoutRisk } from "./risk-gate.ts";
import type { RiskGateOutcome } from "./risk-gate.ts";

// ─── Result type ──────────────────────────────────────────────────────────────
//
// Single-parameter generic. See file-level comment for rationale.

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: CheckoutFailure };

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

// Explicit return type annotation prevents `never` from propagating into callers
// when this function is used in a generic position.
function fail(error: CheckoutFailure): Result<never> {
  return { ok: false, error };
}

// ─── Failure shape ────────────────────────────────────────────────────────────
//
// `code` is narrowed to ErrorCode (the union from types.ts) so that every call
// site is checked against the declared error code set at compile time.

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
//
// Handles the otp_required case specially: returns nonce + expiresAt as
// top-level JSON fields so the frontend can read them without parsing the
// message string. All other failure codes go through the standard toResponse.

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
  return toResponse(
    requestId,
    failure(outcome.httpStatus, outcome.code, outcome.message),
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
// ─── Pipeline types ───────────────────────────────────────────────────────────
//
// ParsedBody, LoyaltyOutcome, ResolvedDiscounts, RequestContext, PricingContext,
// CartContext, and RiskGatePayload are now in types.ts (shared with metadata.ts).

const LOYALTY_NOT_APPLIED: LoyaltyOutcome = { applied: false };

// ─── Loyalty stage result ─────────────────────────────────────────────────────
//
// Discriminated on `kind` (string literal) rather than on null vs. non-null
// properties, which TypeScript narrows reliably in all strict-mode settings.

type LoyaltyStageOutcome =
  | { kind: "applied"; loyalty: LoyaltyOutcome }
  | { kind: "resume"; resumeUrl: string; resumeSessionId: string };

// ─── Reservation state ────────────────────────────────────────────────────────
//
// Carries every reversible side-effect so rollbackReservations() has a
// complete view of what to undo without inspecting global or closure state.
// Constructed only after reserveLoyalty() returns ok(), which guarantees
// loyalty.couponId is present when loyalty.applied === true.

interface ReservationState {
  preSessionKey: string;
  loyalty: LoyaltyOutcome;
}

const LOYALTY_REDEEM_COOLDOWN_MINUTES = 30;

// ─── Pre-session key ──────────────────────────────────────────────────────────
//
// Single authoritative builder. Never reconstruct this key via inline
// string concatenation anywhere else in the codebase. The resulting key is
// used as the idempotency key in the loyalty_ledger and as the stripe_session_id
// parameter to the reserve/release RPCs.
//
// All three components are validated before reaching this call:
//   userId    — from JWT (authenticateUser)
//   cartId    — from persistPendingCart (non-null on success)
//   requestId — from sanitizeRequestId (always a non-empty string)
// An explicit guard is included so that any future refactor that bypasses
// upstream validation still fails loudly rather than silently writing an
// empty key to the ledger.

function buildPreSessionKey(userId: string, cartId: string, requestId: string): string {
  if (!userId || !cartId || !requestId) {
    // This path indicates a programmer error — all three inputs are validated
    // upstream and should never be empty at this call site.
    throw new Error(
      `buildPreSessionKey: all arguments must be non-empty (userId=${!!userId}, cartId=${!!cartId}, requestId=${!!requestId})`,
    );
  }
  return `${userId}:${cartId}:${requestId}`;
}

// ─── Rollback ─────────────────────────────────────────────────────────────────
//
// Called only after a LoyaltyOutcome with applied=true has been returned from
// reserveLoyalty() and a downstream stage subsequently fails. At that point
// both the DB reserve and the Stripe coupon exist and must be undone.
//
// commitLoyaltyWithCoupon() handles the earlier failure case (reserve committed
// but coupon creation failed) internally, so this function is never responsible
// for that scenario.

async function rollbackReservations(
  db: DbClient,
  stripe: Stripe,
  state: ReservationState,
  reason: string,
  requestId: string,
): Promise<void> {
  if (state.loyalty.applied) {
    // Release the DB reserve first — if coupon deletion fails below the user's
    // points balance is at least restored.
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
    return fail(failure(422, "validation_failed", validated.error));
  }

  // Assign to an explicitly typed const so TypeScript anchors this as
  // RequestBody and does not re-evaluate the conditional in validateAuthBody's
  // return type at every downstream usage site.
  const body: RequestBody = validated.value;

  const pickupTimeResult = validatePickupTime(body.pickup_time ?? null);
  if (!pickupTimeResult.ok) {
    return fail(failure(422, "validation_failed", pickupTimeResult.error));
  }

 const isRec = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

  const rawSmsOptIn =
    isRec(parsedJson) && parsedJson["sms_opt_in"] === true;

  const rawSmsPhone =
    isRec(parsedJson) && typeof parsedJson["sms_phone_e164"] === "string"
      ? (parsedJson["sms_phone_e164"] as string)
      : null;

  // Server-side E.164 US validation — mirrors toE164UsPhone() on the client.
  // +1, area code first digit 2–9, exactly 9 more digits → 12 characters.
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

  const rawAttribution = isRec(parsedJson) ? parsedJson["attribution"] : null;
  const attribution = sanitizeAttribution(rawAttribution);

  const parsed: ParsedBody = {
    body,
    pickupTime: pickupTimeResult.value,
    smsPhone:   rawSmsOptIn && validSmsPhone !== null ? validSmsPhone : null,
    smsOptIn:   rawSmsOptIn && validSmsPhone !== null,
    attribution,
  };

  return ok(parsed);
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

  // Use an intermediate typed pair so `snapshot` is provably assigned before
  // any subsequent use — avoids non-null assertions and "used before assigned"
  // errors when TypeScript cannot follow control flow through try/catch.
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
    pricingPair = { snapshot: resolved.snapshot, pricingHash: resolved.pricingHash };
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

  // resolvePricingForCheckout may return an empty hash in edge cases — fall
  // back to hashing the snapshot directly.
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

// Converts a PricingValidationError into a CheckoutFailure. If pricing-errors.ts
// maps specific PricingValidationError codes to non-422 statuses, extend this
// function to mirror those mappings.
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
  // `customer_uid` is the physical column name in the orders table. It stores
  // the canonical user_id value. The column will be renamed to user_id in a
  // future schema migration — this is NOT a separate identifier concept.
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

// ─── Stage 10: Loyalty reservation ───────────────────────────────────────────
//
// Failure contract (see file-level comment):
//   Any path that commits a DB reserve and subsequently fails to create the
//   Stripe coupon is handled by commitLoyaltyWithCoupon(), which releases the
//   reserve before returning failure. Callers of this function never need to
//   roll back a stranded reserve on a returned failure — that invariant is
//   enforced by the structure below, not by caller discipline.

async function reserveLoyalty(
  db: DbClient,
  stripe: Stripe,
  userId: string,
  body: RequestBody,
  snapshot: PricingSnapshot,
  discounts: ResolvedDiscounts,
  preSessionKey: string,
  requestId: string,
): Promise<Result<LoyaltyStageOutcome>> {
  const loyaltyIntent = buildLoyaltyIntent(body);

  if (!loyaltyIntent) {
    return ok({ kind: "applied", loyalty: LOYALTY_NOT_APPLIED });
  }

  // loyaltyIntent.loyaltyAccountId is guaranteed non-empty by buildLoyaltyIntent.
  // Use it directly — never fall back to body.loyalty_account_id ?? "".
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
        requestId,
      );

      if (resumeResult.resumeUrl !== null) {
        return ok({
          kind: "resume",
          resumeUrl: resumeResult.resumeUrl,
          resumeSessionId: resumeResult.resumeSessionId,
        });
      }

      if (resumeResult.staleSessionKeys.length > 0) {
        await releaseStaleReserves(db, resumeResult.staleSessionKeys, requestId);
      }

      // Re-attempt after stale reserves are cleared. If this succeeds (reserve
      // committed), commitLoyaltyWithCoupon owns the rollback on coupon failure.
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

  // loyaltyResult.applied === true: reserve committed in DB.
  // commitLoyaltyWithCoupon owns the rollback if coupon creation fails.
  return commitLoyaltyWithCoupon(
    db,
    stripe,
    loyaltyResult,
    preSessionKey,
    snapshot.currency,
    requestId,
  );
}

// ─── buildLoyaltyIntent ───────────────────────────────────────────────────────
//
// Returns null if any required loyalty field is absent or invalid.
// The loyaltyAccountId in the returned intent is guaranteed non-empty.

function buildLoyaltyIntent(_body: RequestBody): LoyaltyIntent | null {
  // PHASE 1: Cash-like point redemption disabled.
  // Points-to-dollar conversion removed pending reward-based upgrade.
  // Main handler guard rejects explicit loyalty_redeem_points > 0 with 422.
  return null;
}
// ─── checkLoyaltyCooldown ─────────────────────────────────────────────────────

async function checkLoyaltyCooldown(
  db: DbClient,
  accountId: string,
  requestId: string,
): Promise<Result<true>> {
  // Guard: accountId must be non-empty before any DB call.
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
    // Fail closed — cannot verify cooldown eligibility, block the redemption.
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

// ─── loyaltyDeclineToFailure ──────────────────────────────────────────────────
//
// All reason strings originate from loyalty RPC check_violation messages.
// Using ErrorCode literals keeps the failure() call site type-safe.

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
  // Covers active_reserve_exists (post-retry), reserve_rpc_error, and any
  // future RPC reasons that are not yet mapped.
  return failure(
    422,
    "loyalty_reserve_conflict",
    "Unable to apply loyalty points. Please try again.",
  );
}

// ─── commitLoyaltyWithCoupon ──────────────────────────────────────────────────
//
// The ONLY function that transitions from a committed loyalty reserve to a
// completed LoyaltyOutcome. Creates the Stripe coupon and, if that fails,
// releases the already-committed reserve before returning failure.
//
// This coupling is intentional: it is not possible to return a failure from
// this function and leave a stranded reserve in the DB.

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
    // Reserve is committed in DB but coupon creation failed. Release the reserve
    // before returning failure so the user's points balance is not permanently
    // locked and no retry is left in an inconsistent state.
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
  resumeSessionId: string;
  staleSessionKeys: string[];
}

async function findResumableLoyaltySession(
  db: DbClient,
  stripe: Stripe,
  accountId: string,
  requestId: string,
): Promise<ResumableLoyaltySession> {
  // Guard: accountId must be non-empty before any DB call.
  if (!accountId.trim()) {
    log("error", "checkout_loyalty_resume_empty_account_id", { requestId });
    return { resumeUrl: null, resumeSessionId: "", staleSessionKeys: [] };
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
      return { resumeUrl: null, resumeSessionId: "", staleSessionKeys };
    }

    for (const row of activeReserves ?? []) {
      const idemKey = (row.idempotency_key as string) ?? "";
      const releaseKey = idemKey.replace("reserve:", "release:");

      const { data: released } = await db
        .from("loyalty_ledger")
        .select("id")
        .eq("idempotency_key", releaseKey)
        .maybeSingle();

      if (released?.id) continue;

      const sessionKey =
        ((row.metadata as Record<string, string>)?.stripe_session_id) ?? "";
      const cartId = sessionKey.split(":")[1];

      if (!cartId) {
        // Only push non-empty session keys — releaseLoyaltyReserve guards
        // against empty keys, but filtering here avoids unnecessary log noise.
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
        if (existing.status === "open" && existing.url) {
          log("info", "checkout_loyalty_resume_existing", {
            requestId,
            sessionId: prefix(existing.id),
          });
          return {
            resumeUrl: existing.url,
            resumeSessionId: existing.id,
            staleSessionKeys,
          };
        } else {
          if (sessionKey) staleSessionKeys.push(sessionKey);
        }
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

  return { resumeUrl: null, resumeSessionId: "", staleSessionKeys };
}

async function releaseStaleReserves(
  db: DbClient,
  sessionKeys: string[],
  requestId: string,
): Promise<void> {
  // Empty keys are filtered at the push sites in findResumableLoyaltySession,
  // but filter defensively here as well since this function is called from
  // multiple paths.
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
  // ── [FIX 1] Final charge amount guard ──────────────────────────────────────
  // Verify that the amount Stripe will actually charge (snapshot total minus
  // any loyalty coupon) is a positive integer before creating the session.
  // A zero or negative final charge would be rejected by Stripe and by the
  // webhook — prevent it here so we never create an unchargeble session.
  //
  // Line items are built from the full snapshot total. The loyalty coupon is
  // applied as a Stripe discount on top of those line items. The net amount
  // Stripe charges is therefore: totalCents - loyalty.discountCents.
  const expectedChargedCents: number = loyalty.applied
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

  // buildStripeLineItemsFromPricing throws PricingValidationError when line
  // items do not reconcile to the snapshot total. Catch it here so the caller
  // can roll back reservations before responding.
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

  // preSessionKey is passed in (computed once in the main handler) rather than
  // recomputed here, ensuring a single source of truth for the key value.
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

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: cart.cartId,
        line_items: lineItems,
        success_url: STRIPE_SUCCESS_URL,
        cancel_url: STRIPE_CANCEL_URL,
        expires_at: Math.floor(Date.now() / 1000) + SESSION_EXPIRES_AFTER_SECONDS,
        metadata: sessionMetadata,
        payment_intent_data: { metadata: sessionMetadata },
        billing_address_collection: "auto",
        ...(ctx.userEmail ? { customer_email: ctx.userEmail } : {}),
        ...(parsed.body.order_type === "delivery"
          ? { phone_number_collection: { enabled: true } }
          : {}),
        ...(loyalty.applied ? { discounts: [{ coupon: loyalty.couponId }] } : {}),
      },
      { idempotencyKey: cart.idempotencyKey },
    );
  } catch (err) {
    log("error", "checkout_stripe_session_failed", {
      requestId: ctx.requestId,
      userId: prefix(ctx.userId),
      cartId: prefix(cart.cartId),
      error: asErr(err),
    });
    return fail(
      failure(502, "stripe_session_failed", "Unable to create Stripe session. Please try again."),
    );
  }

  // DO NOT re-fetch the session after creation. If session.url is absent,
  // fail explicitly — there is no safe fallback URL.
  if (!session.url) {
    log("error", "checkout_stripe_session_missing_url", {
      requestId: ctx.requestId,
      userId: prefix(ctx.userId),
      cartId: prefix(cart.cartId),
      sessionId: prefix(session.id),
    });
    return fail(
      failure(502, "stripe_session_failed", "Unable to create Stripe session. Please try again."),
    );
  }

  return ok(session);
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
  // Guard: an empty key would match no rows in the DB but constitutes a
  // programmer error — log it clearly so it surfaces in alerting.
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
  // Intersection type narrows to the `applied: true` branch — satisfies the
  // PendingCartUpdate constraint without asserting non-null on individual fields.
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

  // [FIX 5] Include Allow header so clients and load balancers know which
  // methods this endpoint accepts.
  if (req.method !== "POST") {
    return errorResponse(
      requestId,
      405,
      "method_not_allowed",
      "Method not allowed.",
      { ...corsHeaders, "Allow": "POST, OPTIONS" },
    );
  }

  // ── Stage: Authenticate ────────────────────────────────────────────────────
  const authResult = await authenticateUser(req, requestId);

  if (!authResult.ok) 
    
    return toResponse(requestId, authResult.error, corsHeaders);
  const { userId, userEmail } = authResult.data;

  // ── Stage: Parse request ───────────────────────────────────────────────────
  const parseResult = await parseRequest(req, requestId);
  if (!parseResult.ok) return toResponse(requestId, parseResult.error, corsHeaders);
  // Explicit type annotation prevents inference drift in downstream stage calls.
  const parsed: ParsedBody = parseResult.data;

  // ── Stage: Init services ───────────────────────────────────────────────────
  const servicesResult = initServices(requestId);
  if (!servicesResult.ok) return toResponse(requestId, servicesResult.error, corsHeaders);
  const { db, stripe } = servicesResult.data;

  const ctx: RequestContext = {
    requestId,
    userId,
    userEmail,
    // Truncated at ingestion so the value never exceeds 64 chars downstream.
    requestIp: getRequestIp(req)?.slice(0, 64) ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
    deviceFingerprint: req.headers.get("x-device-fingerprint") ?? null,
    corsHeaders,
  };

  // ── Stage: Rate limit ──────────────────────────────────────────────────────
  const rateLimitResult = await enforceRateLimit(db, userId, ctx.requestIp, requestId);
  if (!rateLimitResult.ok) return toResponse(requestId, rateLimitResult.error, corsHeaders);

  // ── Stage: Store hours + emergency pause guard ─────────────────────────────
  // Reads DB pause switch; falls back to hardcoded hours if row is missing.
  // Runs after rate limiting and before pricing/Stripe session creation.
  const storeHours = await getStoreHoursStatus(db);

  if (!storeHours.isOpen) {
    log("info", "checkout_store_closed", {
      requestId,
      userId: prefix(userId),
      message: storeHours.message,
    });

    return storeClosedResponse(requestId, storeHours.message, corsHeaders);
  }

  // ── Stage: Pricing ─────────────────────────────────────────────────────────
  const pricingResult = await buildPricing(db, userId, parsed, requestId);
  if (!pricingResult.ok) return toResponse(requestId, pricingResult.error, corsHeaders);
  const pricing: PricingContext = pricingResult.data;

  // ── Integrity hash (advisory — logged, not hard-rejected) ──────────────────
  await checkIntegrityHash({
    db,
    clientHash: parsed.body.client_integrity_hash,
    canonicalItems: pricing.canonicalItems,
    snapshot: pricing.snapshot,
    userId,
    requestId,
  });

  // ── Stage: Pre-checkout risk gate ──────────────────────────────────────────
  // Position: after buildPricing (needs totalCents for scoring) and before
  // persistPendingCart (no irreversible DB writes may exist on rejection).
  // Trusted auth users (≥3 paid orders, ≥7 days old) bypass with score=0.
  const riskOutcome = await enforcePreCheckoutRisk({
    db,
    userId,
    isGuest:           false,       // create-checkout is auth-only
    requestIp:         ctx.requestIp,
    deviceFingerprint: ctx.deviceFingerprint,
    guestEmail:        parsed.body.guest_email ?? null,
    orderTotalCents:   pricing.snapshot.totalCents,
    challengeToken:    parsed.body.challenge_token ?? undefined,
    requestId,
  });

  if (!riskOutcome.passed) {
    return toRiskGateResponse(requestId, riskOutcome, corsHeaders);
  }

  // Carry the pre-checkout risk decision forward into session metadata.
  // The webhook reads these three fields to avoid re-scoring post-payment.
  const preCheckoutRiskScore:   number = riskOutcome.riskScore;
  const preCheckoutRiskLevel:   string = riskOutcome.riskLevel;
  const preCheckoutVerifStatus: string = riskOutcome.verificationStatus;

  // ── Stage: Resolve discounts ───────────────────────────────────────────────
  const discountsResult = await resolveDiscounts(
    db,
    userId,
    pricing.snapshot,
    parsed.body,
    requestId,
  );
  if (!discountsResult.ok) return toResponse(requestId, discountsResult.error, corsHeaders);
  const discounts: ResolvedDiscounts = discountsResult.data;

  // ── Stage: Build idempotency key ───────────────────────────────────────────
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
  const idempotencyKey: string = idempotencyKeyResult.data;

  // ── Stage: Reusable session check ──────────────────────────────────────────
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
    if (!reusableSession.session.url) {
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
      ms: Date.now() - start,
    });

    return successResponse(
      requestId,
      "checkout_session_reused",
      {
        sessionId: reusableSession.session.id,
        url: reusableSession.session.url,
        pricingHash: pricing.pricingHash,
        pricing: buildAuthPricingResponse(pricing.snapshot),
      },
      corsHeaders,
    );
  }

  // ── Stage: Duplicate-order guard ───────────────────────────────────────────
  const duplicateResult = await guardDuplicateOrder(db, userId, requestId);
  if (!duplicateResult.ok) return toResponse(requestId, duplicateResult.error, corsHeaders);

  // ── Stage: Persist pending cart ────────────────────────────────────────────
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
  const cart: CartContext = cartResult.data;

  // Computed once here and threaded through all downstream calls.
  // buildPreSessionKey throws on empty input — a failure here indicates a
  // programmer error upstream (cart.cartId or userId unexpectedly empty).
  const preSessionKey = buildPreSessionKey(userId, cart.cartId, requestId);
// ── Guard: cash-like point redemption disabled (Phase 1) ───────────────
  if (
    parsed.body.loyalty_redeem_points != null &&
    parsed.body.loyalty_redeem_points > 0
  ) {
    log("info", "checkout_redemption_disabled", {
      requestId,
      userId: prefix(userId),
      pointsRequested: parsed.body.loyalty_redeem_points,
    });
    return errorResponse(
      requestId,
      422,
      "validation_failed",
      "Reward redemption is being upgraded. Your points are safe and can still be earned.",
      corsHeaders,
    );
  }
  // ── Stage: Loyalty reservation ─────────────────────────────────────────────
  // Failure contract: any failure returned by reserveLoyalty() either:
  //   (a) occurred before any reserve was committed (no cleanup needed), or
  //   (b) occurred after committing a reserve but was handled internally by
  //       commitLoyaltyWithCoupon() (reserve already released).
  // No rollback is required here on failure.
  const loyaltyStageResult = await reserveLoyalty(
    db,
    stripe,
    userId,
    parsed.body,
    pricing.snapshot,
    discounts,
    preSessionKey,
    requestId,
  );

  if (!loyaltyStageResult.ok) {
    return toResponse(requestId, loyaltyStageResult.error, corsHeaders);
  }

  const loyaltyStage: LoyaltyStageOutcome = loyaltyStageResult.data;

  // Resume path: an open Stripe session with a valid loyalty reserve exists.
  if (loyaltyStage.kind === "resume") {
    log("info", "checkout_session_reused", {
      requestId,
      userId: prefix(userId),
      sessionId: prefix(loyaltyStage.resumeSessionId),
      ms: Date.now() - start,
    });
    return successResponse(
      requestId,
      "checkout_session_reused",
      {
        sessionId: loyaltyStage.resumeSessionId,
        url: loyaltyStage.resumeUrl,
        pricingHash: pricing.pricingHash,
        pricing: buildAuthPricingResponse(pricing.snapshot),
      },
      corsHeaders,
    );
  }

  // kind === "applied" — narrowed by the discriminant above.
  const loyalty: LoyaltyOutcome = loyaltyStage.loyalty;

  // ReservationState is constructed here — after reserveLoyalty() returns ok()
  // — so that rollbackReservations() has a complete view of committed
  // side-effects (loyalty reserve + coupon) if a downstream stage fails.
  const reservationState: ReservationState = { preSessionKey, loyalty };

  // ── Stage: Create Stripe session ───────────────────────────────────────────
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
      riskScore:          preCheckoutRiskScore,
      riskLevel:          preCheckoutRiskLevel,
      verificationStatus: preCheckoutVerifStatus,
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

  const stripeSession: Stripe.Checkout.Session = stripeResult.data;

  // ── Post-session bookkeeping ────────────────────────────────────────────────
  // Both calls are fire-and-forget (non-blocking on success path). Failures are
  // logged as warnings — they do not roll back the session or fail the response.
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
    ms: Date.now() - start,
  });

  return successResponse(
    requestId,
    "checkout_session_created",
    {
      sessionId: stripeSession.id,
      // url is guaranteed non-null: createStripeSession validates it and returns
      // a failure before ok() if it is absent. The cast is safe.
      url: stripeSession.url as string,
      pricingHash: pricing.pricingHash,
      pricing: buildAuthPricingResponse(pricing.snapshot),
    },
    corsHeaders,
  );
});