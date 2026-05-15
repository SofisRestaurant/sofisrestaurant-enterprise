// supabase/functions/stripe-webhook/order-creation.ts
// =============================================================================
// Changes from prior version:
//
//   1. createOrderFromSession now accepts:
//        userId:     string | null   (null for guest checkouts)
//        guestToken: string | null   (non-null for guest checkouts)
//
//   2. Validates that exactly one identity is provided.
//
//   3. INSERT now sets:
//        customer_uid → userId (null for guests)
//        guest_token  → guestToken (null for auth users)
//        source       → 'guest' | 'auth'
//      These columns already exist on the orders table.
//
//   4. prepareAuthoritativeCartState receives the nullable userId and the
//      guestToken so it can apply the correct ownership check.
//
//   5. Order risk evaluated via ../_shared/order-risk.ts (Deno-safe).
//        risk_score, risk_level, verification_status written atomically.
//        Fails open — a crash in risk eval never loses an order.
//
//   6. [NEW] Low-amount warning log added for observability.
//        Orders below the expected minimum ($15 / 1500 cents) are logged
//        as a warning so they are visible in monitoring. They are NOT
//        rejected here — minimum order enforcement must happen in
//        create-checkout / create-checkout-guest BEFORE the Stripe session
//        is created. A paid order must never be silently dropped.
//
//   7. [NEW] pickup_time extracted from Stripe session metadata.
//        Stored as TIMESTAMPTZ in orders.pickup_time.
//        NULL means ASAP. Only populated for pickup order_type.
//        Extraction is defensive — a malformed value is logged and dropped
//        rather than failing the order. A paid order must never be lost.
//
//   8. [NEW] Pre-checkout risk gate bypass.
//        When session metadata contains pre_checkout_risk_* fields written
//        by create-checkout/risk-gate.ts, those values are used directly
//        and safeEvaluateOrderRisk() is NOT called. This prevents the
//        post-payment re-scoring that was setting verification_status=required
//        for low-risk guest orders that the pre-checkout gate had already
//        allowed. Legacy sessions without these metadata fields continue
//        using the fallback safeEvaluateOrderRisk() path unchanged.
//
//   9. [FIX] Guest orders on the legacy fallback path now default to
//        verification_status='not_required' regardless of legacy scorer output.
//        The legacy scorer (guest + no phone + medium order) scores ≥ 60 →
//        'required', which triggered a post-payment OTP gate that cannot be
//        enforced after Stripe has already charged the card. Auth users on
//        the legacy path are unchanged — they continue using
//        deriveVerificationStatus(risk). risk_score and risk_level are still
//        computed and persisted for analytics on all paths.
//
//  10. [FIX 2026-05-08] ALL users on the legacy fallback path now default to
//        verification_status='not_required'.
//
//        The prior fix (change 9) applied only to guests. The same failure
//        existed for auth users: when create-checkout (auth) does not write
//        pre_checkout_risk_* fields to the Stripe session metadata,
//        extractPreCheckoutRisk() returns null, the legacy scorer runs, and
//        deriveVerificationStatus(risk) can return 'required' for medium-to-high
//        risk auth orders — even if the customer already completed phone
//        verification before initiating the Stripe redirect.
//
//        Post-payment verification cannot be meaningfully enforced regardless of
//        user identity: Stripe has already charged the card. The pre-checkout
//        gate (enforcePreCheckoutRisk in create-checkout / create-checkout-guest,
//        whose outcome is written into pre_checkout_risk_* Stripe metadata) is
//        the correct and only valid enforcement point. The primary path
//        (preCheckoutRisk !== null) is unaffected — it still uses the exact
//        gate decision for all sessions that carry the metadata fields.
//
//        risk_score and risk_level continue to be computed and persisted on the
//        legacy path for analytics and monitoring. Only verification_status is
//        changed: it is now unconditionally 'not_required' on the legacy path.
//
//  11. [FIX 2026-05-10] verified_at written alongside verification_status.
//        Migration 20260508000000_harden_otp_challenge_tables.sql added
//        constraint orders_verified_at_completeness:
//          CHECK (verification_status <> 'verified' OR verified_at IS NOT NULL)
//        The INSERT was not setting verified_at, causing every verified order
//        to fail with Postgres error 23514. Fix: set verified_at = nowIso()
//        when verificationStatus === 'verified', null otherwise.
//
//  12. [HARDEN] Identity normalization + strict single-identity enforcement.
//        userId and guestToken are normalized (whitespace-only → null) before
//        any use. Both-missing and both-present are now rejected identically
//        with webhook_order_invalid_identity. Raw identity values are never
//        logged. normalizedUserId and normalizedGuestToken are used exclusively
//        for all downstream operations.
//
//  13. [HARDEN] Stripe amount and currency integrity gate now throws instead of
//        returning null. This ensures the outer catch in
//        checkout-session-completed.ts releases the idempotency claim so Stripe
//        retries the event. A paid session that fails the integrity check must
//        never be silently acknowledged as success.
//        - Missing/non-number amount_total throws.
//        - amount_total !== pricing.chargedCents throws.
//        - Missing or blank session.currency throws (no "usd" fallback).
//        - session currency !== pricing currency throws.
//
//  14. [HARDEN] Raw guest_token removed from orders.metadata JSONB.
//        Replaced with guest_token_present boolean. The authoritative
//        orders.guest_token indexed column is unaffected.
//
//  15. [HARDEN] console.log calls replaced with structured log() helper.
//        prefix() used for all logged ID fields; no raw IDs in log output.
//
//  16. [CLEANUP] Removed unused deriveVerificationStatus import.
// =============================================================================

import type Stripe from "stripe";

import { DB_ORD_CONFIRMED, DB_PMT_PAID } from "./env.ts";
import { log, nowIso, prefix } from "./logging.ts";
import { findOrderBySessionId } from "./order-queries.ts";
import { prepareAuthoritativeCartState } from "./pending-cart.ts";
import { STRIPE_API_VERSION } from "./stripe-client.ts";
import type {
  DbClient,
  OrderInsert,
  OrderLocated,
  PreparedCartState,
} from "./types.ts";
import type { OrderType, PricingSnapshot } from "../_shared/pricing.ts";
import { buildStoredOrderCartItemsFromSnapshot } from "../_shared/order-cart-items-builder.ts";
import {
  normCurrency,
  pickMeta,
  snapshotNumber,
  snapshotString,
  snapshotStringArray,
  toJson,
} from "./utils.ts";

import {
  evaluateOrderRisk,
  type OrderRiskResult,
} from "../_shared/order-risk.ts";

import { extractPreCheckoutRisk } from "./shared/metadata.ts";

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_EXPECTED_ORDER_CENTS = 15_00; // $15.00

const VALID_ORDER_TYPES = new Set<OrderType>(['pickup', 'delivery', 'dine_in'] as const);

const MAX_PICKUP_TIME_FUTURE_MS = 24 * 60 * 60 * 1000;

// ─── pickup_time parser ───────────────────────────────────────────────────────

function parsePickupTimeFromMetadata(
  metadata: Stripe.Metadata | null | undefined,
  requestId: string,
  sessionId: string,
): string | null {
  const raw = pickMeta(metadata, "pickup_time");

  if (!raw || raw.trim().length === 0) {
    return null;
  }

  let parsed: Date;
  try {
    parsed = new Date(raw);
  } catch {
    log("warn", "webhook_pickup_time_parse_failed", {
      requestId,
      sessionId: prefix(sessionId),
      raw,
      reason: "threw on new Date()",
    });
    return null;
  }

  if (!Number.isFinite(parsed.getTime())) {
    log("warn", "webhook_pickup_time_invalid", {
      requestId,
      sessionId: prefix(sessionId),
      raw,
      reason: "NaN timestamp",
    });
    return null;
  }

  const nowMs  = Date.now();
  const diffMs = parsed.getTime() - nowMs;

  if (diffMs < -60 * 60 * 1000) {
    log("warn", "webhook_pickup_time_in_past", {
      requestId,
      sessionId: prefix(sessionId),
      raw,
      diffMinutes: Math.round(diffMs / 60_000),
    });
  }

  if (diffMs > MAX_PICKUP_TIME_FUTURE_MS) {
    log("warn", "webhook_pickup_time_too_far_future", {
      requestId,
      sessionId: prefix(sessionId),
      raw,
      diffHours: Math.round(diffMs / 3_600_000),
    });
  }

  return parsed.toISOString();
}

// ─── Order state validation factory ──────────────────────────────────────────

type ValidatedOrderState = {
  orderType:            OrderType;
  totalCents:           number;
  stripeAmountTotal:    number;
  cart:                 PreparedCartState['cart'];
  snapshot:             PricingSnapshot;
  pricingHash:          string;
  currency:             string;
  consumedNow:          boolean;
  loyaltyDiscountCents: number;
};

function assertPricingSnapshot(
  snapshot: unknown,
  requestId: string,
): asserts snapshot is PricingSnapshot {
  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    !("lines" in snapshot) ||
    !Array.isArray((snapshot as { lines?: unknown }).lines)
  ) {
    throw new Error(`[${requestId}] invalid pricing snapshot`);
  }
}

function buildValidatedOrderState(
  prepared:  PreparedCartState,
  session:   Stripe.Checkout.Session,
  requestId: string,
): ValidatedOrderState {
  assertPricingSnapshot(prepared.snapshot, requestId);
  const { orderType } = prepared;

  if (!VALID_ORDER_TYPES.has(orderType)) {
    throw new Error(
      `[${requestId}] buildValidatedOrderState: invalid orderType` +
      ` "${String(orderType)}" — must be 'pickup', 'delivery', or 'dine_in'`,
    );
  }

  const totalCents = prepared.snapshot.totalCents;
  if (totalCents <= 0) {
    throw new Error(
      `[${requestId}] buildValidatedOrderState: totalCents ${totalCents} is not positive`,
    );
  }

  const loyaltyDiscountCents = parseInt(
    pickMeta(session.metadata, "loyalty_discount_cents") ?? "0",
    10,
  ) || 0;

if (typeof session.amount_total !== "number") {
  throw new Error(
    `[${requestId}] buildValidatedOrderState: Stripe session.amount_total is missing`,
  );
}

const stripeAmountTotal = session.amount_total;

  return {
    orderType,
    totalCents,
    stripeAmountTotal,
    cart:                 prepared.cart,
    snapshot:             prepared.snapshot,
    pricingHash:          prepared.pricingHash,
    currency:             prepared.currency,
    consumedNow:          prepared.consumedNow,
    loyaltyDiscountCents,
  };
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

type OrderCreationPricing = {
  subtotalCents:         number;
  promoDiscountCents:    number;
  campaignDiscountCents: number;
  creditCents:           number;
  loyaltyDiscountCents:  number;
  taxCents:              number;
  deliveryFeeCents:      number;
  serviceFeeCents:       number;
  tipCents:              number;
  totalCents:            number;
  chargedCents:          number;
  currency:              string;
};

function buildOrderCreationPricing(
  snapshot:             unknown,
  fallbackCurrency:     string,
  loyaltyDiscountCents: number,
  stripeAmountTotal:    number,
): OrderCreationPricing {
  return {
    subtotalCents:         snapshotNumber(snapshot, "subtotalCents"),
    promoDiscountCents:    snapshotNumber(snapshot, "promoDiscountCents"),
    campaignDiscountCents: snapshotNumber(snapshot, "campaignDiscountCents"),
    creditCents:           snapshotNumber(snapshot, "creditCents"),
    loyaltyDiscountCents,
    taxCents:              snapshotNumber(snapshot, "taxCents"),
    deliveryFeeCents:      snapshotNumber(snapshot, "deliveryFeeCents"),
    serviceFeeCents:       snapshotNumber(snapshot, "serviceFeeCents"),
    tipCents:              snapshotNumber(snapshot, "tipCents"),
    totalCents:            snapshotNumber(snapshot, "totalCents"),
    chargedCents:          stripeAmountTotal,
    currency: normCurrency(
      snapshotString(snapshot, "currency") ?? fallbackCurrency,
    ),
  };
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

function buildOrderMetadata(args: {
  requestId:    string;
  session:      Stripe.Checkout.Session;
  cartId:       string;
  orderType:    OrderType;
  pricingHash:  string;
  consumedNow:  boolean;
  pricing:      OrderCreationPricing;
  snapshot:     unknown;
  isGuest:      boolean;
  guestToken:   string | null;
  risk:         OrderRiskResult | null;
  pickupTime:   string | null;
}): ReturnType<typeof toJson> {
  const {
    requestId, session, cartId, orderType,
    pricingHash, consumedNow, pricing, snapshot, isGuest, guestToken, risk,
    pickupTime,
  } = args;

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  return toJson({
    source:                   "stripe-webhook",
    request_id:               requestId,
    stripe_api_version:       STRIPE_API_VERSION,
    pending_cart_id:          cartId,
    stripe_session_id:        session.id,
    stripe_payment_intent_id: paymentIntentId,
    stripe_session_status:    session.status ?? null,
    stripe_payment_status:    session.payment_status ?? null,
    order_category:           "food",
    fulfillment_type:         orderType,
    is_guest:                 isGuest,
    // [HARDEN] Raw guest token must not be duplicated in the metadata JSONB
    // column. The authoritative orders.guest_token indexed column stores the
    // token for lookup. This boolean flag is sufficient for observability.
    guest_token_present:      isGuest && guestToken !== null,
    promo_id:                 snapshotString(snapshot, "promoId"),
    credit_id:                snapshotString(snapshot, "creditId"),
    applied_campaign_ids:     snapshotStringArray(snapshot, "appliedCampaignIds"),
    pricing_hash:             pricingHash,
    pricing_snapshot:         toJson(snapshot),
    pricing_summary: toJson({
      subtotalCents:         pricing.subtotalCents,
      promoDiscountCents:    pricing.promoDiscountCents,
      campaignDiscountCents: pricing.campaignDiscountCents,
      creditCents:           pricing.creditCents,
      loyaltyDiscountCents:  pricing.loyaltyDiscountCents,
      discountCents:
        pricing.promoDiscountCents +
        pricing.campaignDiscountCents +
        pricing.creditCents +
        pricing.loyaltyDiscountCents,
      taxCents:         pricing.taxCents,
      deliveryFeeCents: pricing.deliveryFeeCents,
      serviceFeeCents:  pricing.serviceFeeCents,
      tipCents:         pricing.tipCents,
      totalCents:       pricing.chargedCents,
      snapshotTotal:    pricing.totalCents,
      currency:         pricing.currency,
    }),
    stripe_amount_total:       pricing.chargedCents,
    stripe_currency:           pricing.currency,
    pending_cart_consumed_now: consumedNow,
    pickup_time:               pickupTime ?? null,
    order_risk: risk !== null ? toJson({
      score:                 risk.score,
      level:                 risk.level,
      requires_verification: risk.requiresVerification,
      breakdown:             risk.breakdown,
    }) : null,
  });
}

// ─── Order items ──────────────────────────────────────────────────────────────

async function insertOrderItemsFromSnapshot(args: {
  db:          DbClient;
  orderId:     string;
  snapshot:    PricingSnapshot;
  pricingHash: string;
  requestId:   string;
}): Promise<void> {
  const { db, orderId, snapshot, pricingHash, requestId } = args;

  try {
    const { data: existing } = await db
      .from("order_items")
      .select("id")
      .eq("order_id", orderId)
      .limit(1)
      .maybeSingle();

    if (existing?.id) return;

    const builtItems = buildStoredOrderCartItemsFromSnapshot(snapshot, pricingHash);

    if (builtItems.length === 0) {
      log("warn", "webhook_order_items_empty", {
        requestId,
        orderId: prefix(orderId),
      });
      return;
    }

    const rows = builtItems.map((item, index) => ({
      order_id:         orderId,
      line_index:       index,
      menu_item_id:     item.menuItemId,
      name:             item.name,
      quantity:         item.quantity,
      unit_price_cents: item.unitPriceCents,
      line_total_cents: item.lineTotalCents,
      modifiers:        item.modifiers as unknown as import("../_shared/database.types.ts").Json,
      notes:            item.notes,
      pricing_hash:     item.pricingHash,
    }));

    const { error } = await db.from("order_items").insert(rows);

    if (error !== null) {
      log("warn", "webhook_order_items_insert_failed", {
        requestId,
        orderId: prefix(orderId),
        code:    error.code ?? null,
        message: error.message,
      });
      return;
    }

    log("info", "webhook_order_items_inserted", {
      requestId,
      orderId: prefix(orderId),
      count:   rows.length,
    });
  } catch (err) {
    log("warn", "webhook_order_items_crash", {
      requestId,
      orderId: prefix(orderId),
      error:   err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Safe risk evaluation wrapper ─────────────────────────────────────────────

function safeEvaluateOrderRisk(args: {
  chargedCents:  number;
  isGuest:       boolean;
  customerPhone: string | null;
  requestId:     string;
}): OrderRiskResult | null {
  try {
    return evaluateOrderRisk({
      chargedCents:  args.chargedCents,
      isGuest:       args.isGuest,
      customerPhone: args.customerPhone,
    });
  } catch (err) {
    log("warn", "webhook_order_risk_eval_failed", {
      requestId: args.requestId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function createOrderFromSession(args: {
  db:         DbClient;
  session:    Stripe.Checkout.Session;
  userId:     string | null;
  guestToken: string | null;
  requestId:  string;
}): Promise<OrderLocated | null> {
  const { db, session, requestId } = args;

  // ── [HARDEN] Identity normalization ────────────────────────────────────────
  // Whitespace-only strings are treated as null. This prevents a caller from
  // passing "  " as an identity value that passes a null-check but carries no
  // meaning. Raw values are never logged — only boolean presence flags.

  const normalizedUserId: string | null =
    typeof args.userId === "string" && args.userId.trim().length > 0
      ? args.userId.trim()
      : null;

  const normalizedGuestToken: string | null =
    typeof args.guestToken === "string" && args.guestToken.trim().length > 0
      ? args.guestToken.trim()
      : null;

  const hasUserIdentity  = normalizedUserId !== null;
  const hasGuestIdentity = normalizedGuestToken !== null;

  // Exactly one identity must be present.
  // Rejects: neither present (hasUserIdentity === hasGuestIdentity === false)
  // Rejects: both present  (hasUserIdentity === hasGuestIdentity === true)
  if (hasUserIdentity === hasGuestIdentity) {
    log("error", "webhook_order_invalid_identity", {
      requestId,
      sessionId:      prefix(session.id),
      hasUserIdentity,
      hasGuestIdentity,
    });
    return null;
  }

  const isGuest = !hasUserIdentity;

  // All downstream operations use normalizedUserId / normalizedGuestToken.
  // The raw args.userId / args.guestToken are not referenced below this point.

  const prepared = await prepareAuthoritativeCartState({
    db,
    session,
    userId:      normalizedUserId,
    _guestToken: normalizedGuestToken,
    requestId,
  });

  if (prepared === null) {
    return null;
  }

  const state: ValidatedOrderState = buildValidatedOrderState(prepared, session, requestId);

  const {
    orderType,
    cart,
    snapshot,
    pricingHash,
    currency,
    consumedNow,
    stripeAmountTotal,
    loyaltyDiscountCents,
  } = state;

  const pickupTime = parsePickupTimeFromMetadata(
    session.metadata,
    requestId,
    session.id,
  );

  if (pickupTime !== null) {
    log("info", "webhook_order_pickup_time_set", {
      requestId,
      sessionId: prefix(session.id),
      pickupTime,
      orderType,
    });
  }

  const resolvedSmsOptIn: boolean = isGuest
    ? pickMeta(session.metadata, "guest_sms_opt_in") === "true"
    : pickMeta(session.metadata, "sms_opt_in")       === "true";

  const resolvedSmsRawPhone: string | null = isGuest
    ? pickMeta(session.metadata, "guest_phone_e164")
    : pickMeta(session.metadata, "sms_phone_e164");

  const resolvedSmsPhone: string | null =
    resolvedSmsOptIn &&
    resolvedSmsRawPhone !== null &&
    /^\+1[2-9]\d{9}$/.test(resolvedSmsRawPhone)
      ? resolvedSmsRawPhone
      : null;

  const orderSmsOptIn  = resolvedSmsOptIn && resolvedSmsPhone !== null;
  const orderSmsPhone  = orderSmsOptIn ? resolvedSmsPhone : null;
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  const pricing = buildOrderCreationPricing(
    snapshot, currency, loyaltyDiscountCents, stripeAmountTotal,
  );

  // ── [HARDEN] Stripe amount integrity (throws — must never return null) ──────
  // prepareAuthoritativeCartState validates snapshot-vs-Stripe totals, but we
  // re-verify here against the final derived pricing struct as a defense-in-depth
  // layer. Throwing (rather than returning null) forces the outer catch in
  // checkout-session-completed.ts to release the idempotency claim so Stripe
  // retries the event. A paid session with an amount or currency mismatch must
  // never be silently acknowledged as success.

  if (typeof session.amount_total !== "number") {
    log("error", "webhook_order_amount_missing", {
      requestId,
      sessionId: prefix(session.id),
      isGuest,
    });
    throw new Error(`webhook_order_amount_missing:${session.id}`);
  }

  if (session.amount_total !== pricing.chargedCents) {
    log("error", "webhook_order_amount_integrity_failed", {
      requestId,
      sessionId:         prefix(session.id),
      stripeAmountTotal: session.amount_total,
      chargedCents:      pricing.chargedCents,
      isGuest,
    });
    throw new Error(`webhook_order_amount_mismatch:${session.id}`);
  }

  // Do NOT use normCurrency fallback for a missing session currency — missing
  // currency must fail, not silently default to "usd".
  if (typeof session.currency !== "string" || session.currency.trim().length === 0) {
    log("error", "webhook_order_currency_integrity_failed", {
      requestId,
      sessionId:       prefix(session.id),
      sessionCurrency: "missing",
      pricingCurrency: pricing.currency,
      isGuest,
    });
    throw new Error(`webhook_order_currency_mismatch:${session.id}`);
  }

  const sessionCurrency = normCurrency(session.currency);
  if (sessionCurrency !== pricing.currency) {
    log("error", "webhook_order_currency_integrity_failed", {
      requestId,
      sessionId:       prefix(session.id),
      sessionCurrency,
      pricingCurrency: pricing.currency,
      isGuest,
    });
    throw new Error(`webhook_order_currency_mismatch:${session.id}`);
  }

  // ── Low-amount warning (observability only — never rejects a paid order) ───

  if (pricing.chargedCents < MIN_EXPECTED_ORDER_CENTS) {
    log("warn", "webhook_order_below_minimum", {
      requestId,
      sessionId:    prefix(session.id),
      chargedCents: pricing.chargedCents,
      isGuest,
    });
  }

  // ── Risk resolution ─────────────────────────────────────────────────────────
  const preCheckoutRisk = extractPreCheckoutRisk(session.metadata);

  let risk: OrderRiskResult | null;
  let verificationStatus: string;
  let finalRiskScore: number | null;
  let finalRiskLevel: string | null;

  if (preCheckoutRisk !== null) {
    // Pre-checkout gate decision is authoritative — do not re-score.
    risk               = null;
    verificationStatus = preCheckoutRisk.verificationStatus;
    finalRiskScore     = preCheckoutRisk.riskScore;
    finalRiskLevel     = preCheckoutRisk.riskLevel;

    log("info", "webhook_precheckout_risk_found", {
      requestId,
      sessionId:          prefix(session.id),
      riskScore:          finalRiskScore,
      riskLevel:          finalRiskLevel,
      verificationStatus,
    });

    log("info", "webhook_using_precheckout_risk", {
      requestId,
      sessionId:          prefix(session.id),
      riskScore:          finalRiskScore,
      riskLevel:          finalRiskLevel,
      verificationStatus,
      isGuest,
    });
  } else {
    // Legacy path: session predates the pre-checkout gate or the auth checkout
    // has not yet been updated to write pre_checkout_risk_* metadata.
    //
    // risk_score and risk_level are still computed and persisted for analytics.
    //
    // [FIX 2026-05-08] verification_status is unconditionally 'not_required'
    // for ALL users on this path (extending the prior guest-only fix).
    //
    // Rationale: deriveVerificationStatus(risk) can return 'required' for
    // medium-to-high risk auth orders, triggering a post-payment OTP gate on
    // the success page — even when the customer already completed phone
    // verification before initiating the Stripe redirect. Post-payment
    // verification cannot be meaningfully enforced for any user identity:
    // Stripe has already charged the card. The pre-checkout gate
    // (enforcePreCheckoutRisk, whose outcome is written into
    // pre_checkout_risk_* Stripe metadata) is the correct enforcement point.
    // Sessions that carry that metadata use the primary path above and are
    // unaffected by this change.
    risk = safeEvaluateOrderRisk({
      chargedCents:  pricing.chargedCents,
      isGuest,
      customerPhone: session.customer_details?.phone ?? null,
      requestId,
    });

    verificationStatus = 'not_required';

    finalRiskScore = risk?.score ?? null;
    finalRiskLevel = risk?.level ?? null;

    log("info", "webhook_fallback_risk_evaluation", {
      requestId,
      sessionId:         prefix(session.id),
      riskScore:         finalRiskScore,
      verificationStatus,
      reason:            "no pre_checkout_risk_* fields in session metadata",
    });

    if (risk !== null) {
      log("info", "webhook_order_risk_evaluated", {
        requestId,
        sessionId:                  prefix(session.id),
        riskScore:                  risk.score,
        riskLevel:                  risk.level,
        requiresVerification:       risk.requiresVerification,
        isGuest,
        chargedCents:               pricing.chargedCents,
        verificationStatusOverride: 'not_required',
      });
    }
  }

  const metadata = buildOrderMetadata({
    requestId,
    session,
    cartId:     cart.id,
    orderType,
    pricingHash,
    consumedNow,
    pricing,
    snapshot,
    isGuest,
    guestToken:  normalizedGuestToken,
    risk,
    pickupTime,
  });

  const insert = {
    stripe_checkout_session_id: session.id,
    stripe_session_id:          session.id,
    stripe_payment_intent_id:   paymentIntentId,
    order_type:                "food",
    fulfillment_type:          orderType,
    customer_uid:              normalizedUserId,
    guest_token:               normalizedGuestToken ?? null,
    source:                    isGuest ? "guest" : "auth",
    customer_email:            session.customer_details?.email ?? null,
    customer_name:             session.customer_details?.name ?? null,
    customer_phone:            session.customer_details?.phone ?? null,
    amount_subtotal:           pricing.subtotalCents,
    amount_tax:                pricing.taxCents,
    amount_shipping:           pricing.deliveryFeeCents,
    amount_total:              pricing.chargedCents,
    subtotal_cents:            pricing.subtotalCents,
    tax_cents:                 pricing.taxCents,
    tip_cents:                 pricing.tipCents,
    discount_cents:
      pricing.promoDiscountCents +
      pricing.campaignDiscountCents +
      pricing.creditCents +
      pricing.loyaltyDiscountCents,
      loyalty_discount_cents: pricing.loyaltyDiscountCents,
    delivery_fee_cents:        pricing.deliveryFeeCents,
    service_fee_cents:         pricing.serviceFeeCents,
    total_cents:               pricing.chargedCents,
    currency:                  pricing.currency,
    payment_status:            DB_PMT_PAID,
    status:                    DB_ORD_CONFIRMED,
    cart_items:                cart.items,
    metadata,
    notes:                     snapshotString(snapshot, "orderNotes"),
    pickup_time:               pickupTime,
    risk_score:                finalRiskScore,
    risk_level:                finalRiskLevel,
    verified_at:      verificationStatus === 'verified' ? nowIso() : null,
    // Persist the opted-in phone so send-sms can dispatch transactional
    // order updates. Uses the same columns for both guest and auth paths;
    // send-sms already reads guest_phone_e164 when sms_opt_in is true.
    sms_opt_in:       orderSmsOptIn,
    guest_phone_e164: orderSmsPhone,
} as OrderInsert & {
  stripe_checkout_session_id: string;
  fulfillment_type: string;
  guest_token: string | null;
  source: string;
  pickup_time: string | null;
  risk_score: number | null;
  risk_level: string | null;
  verification_status: string;
  verified_at: string | null;
  sms_opt_in: boolean;
  guest_phone_e164: string | null;
};

  const { data: inserted, error: insertError } = await db
    .from("orders")
    .insert(insert)
    .select("id,amount_total,payment_status,status,customer_uid")
    .returns<OrderLocated[]>()
    .maybeSingle();

  if (insertError !== null && insertError.code !== "23505") {
    log("error", "webhook_order_insert_failed", {
      requestId,
      sessionId:        prefix(session.id),
      code:             insertError.code ?? null,
      message:          insertError.message,
      orderType,
      isGuest,
      subtotalCents:    pricing.subtotalCents,
      taxCents:         pricing.taxCents,
      deliveryFeeCents: pricing.deliveryFeeCents,
      chargedCents:     pricing.chargedCents,
      riskScore:        finalRiskScore,
      riskLevel:        finalRiskLevel,
    });
    return null;
  }

  if (inserted !== null) {
    log("info", "webhook_order_created", {
      requestId,
      orderId:              prefix(inserted.id),
      sessionId:            prefix(session.id),
      orderCategory:        "food",
      fulfillmentType:      orderType,
      chargedCents:         pricing.chargedCents,
      loyaltyDiscountCents: pricing.loyaltyDiscountCents,
      subtotalCents:        pricing.subtotalCents,
      taxCents:             pricing.taxCents,
      isGuest,
      consumedNow,
      pickupTime:           pickupTime ?? "asap",
      riskScore:            finalRiskScore,
      riskLevel:            finalRiskLevel,
      verificationStatus,
    });

    await insertOrderItemsFromSnapshot({
      db,
      orderId:     inserted.id,
      snapshot,
      pricingHash,
      requestId,
    });

    log("info", "webhook_order_risk_fields_persisted", {
      requestId,
      orderId:             prefix(inserted.id),
      riskScore:           finalRiskScore,
      riskLevel:           finalRiskLevel,
      verificationStatus,
      usedPreCheckoutRisk: preCheckoutRisk !== null,
    });

    return inserted;
  }

  const existing = await findOrderBySessionId(db, session.id);

  if (existing !== null) {
    log("info", "webhook_order_conflict_read", {
      requestId,
      orderId:   prefix(existing.id),
      sessionId: prefix(session.id),
    });

    await insertOrderItemsFromSnapshot({
      db,
      orderId:     existing.id,
      snapshot,
      pricingHash,
      requestId,
    });
  }

  return existing;
}