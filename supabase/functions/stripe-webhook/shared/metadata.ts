// supabase/functions/stripe-webhook/shared/metadata.ts
// =============================================================================
// Canonical Stripe checkout metadata parser — Phase 2 hardened.
//
// CONTRACT:
//   - parseCheckoutMetadata() is the ONLY permitted access point for
//     session.metadata anywhere in webhook handler code.
//   - Returns WebhookResult<ParsedCheckoutMetadata> — callers must handle
//     both ok and fail branches explicitly.
//   - Required fields: if any are absent or invalid the result is a hard
//     failure. The handler must bail out and return without side effects.
//   - Optional fields: absent or unparseable → null (never undefined).
//   - Numeric fields: all Stripe metadata values are strings. safeInt()
//     returns null on absent/empty/non-numeric — never NaN, never 0.
//   - user_id is the ONLY canonical identity field. customer_uid and uid
//     are legacy aliases resolved here and nowhere else downstream.
//
// CHANGE LOG:
//   2026-05 hardening pass:
//     Added pendingCartId to ParsedCheckoutMetadata (canonical cart UUID).
//     cartId preserved as backward-compat alias.
//
//   2026-05 pre-checkout risk gate:
//     Added extractPreCheckoutRisk() and hasPreCheckoutRisk().
//     These are used by order-creation.ts to bypass evaluateOrderRisk() for
//     sessions processed by the pre-checkout gate. See order-creation.ts P3.
//
// REQUIRED FIELDS (hard failure on absence):
//   user_id (or legacy alias) OR guest_token — at least one identity
//   cart_id (or alias) → exposed as both cartId and pendingCartId
//   request_id
//   idempotency_key
//   order_type
//
// All other fields are optional and return null when absent.
// =============================================================================

import type Stripe from "stripe";
import { log } from "../logging.ts";

// ─── Result type ──────────────────────────────────────────────────────────────

export type WebhookOk<T> = { ok: true; value: T };
export type WebhookFail = { ok: false; code: string; message: string };
export type WebhookResult<T> = WebhookOk<T> | WebhookFail;

export function webhookOk<T>(value: T): WebhookOk<T> {
  return { ok: true, value };
}

export function webhookFail(code: string, message: string): WebhookFail {
  return { ok: false, code, message };
}

// ─── Valid order types ────────────────────────────────────────────────────────

const VALID_ORDER_TYPES = new Set(["pickup", "delivery", "dine_in"]);
const VALID_RISK_LEVELS = new Set(["low", "medium", "high", "critical"]);
const VALID_VERIFICATION_STATUSES = new Set(["not_required", "verified", "required"]);

export type OrderType = "pickup" | "delivery" | "dine_in";

function isOrderType(value: string): value is OrderType {
  return VALID_ORDER_TYPES.has(value);
}

// ─── Pre-checkout risk result ─────────────────────────────────────────────────
//
// Written into Stripe session metadata by create-checkout/risk-gate.ts after
// the pre-checkout gate passes. The three keys are:
//   pre_checkout_risk_score   — numeric 0–100
//   pre_checkout_risk_level   — 'low' | 'medium' | 'high' | 'critical'
//   pre_checkout_verif_status — 'not_required' | 'verified' | 'required'
// //
// When present, order-creation.ts uses these values directly and does NOT
// call evaluateOrderRisk(). This prevents the post-payment re-scoring that
// was overriding the pre-checkout allow decision for low-risk guest orders.

export interface PreCheckoutRiskMeta {
  riskScore:          number;
  riskLevel:          string;
  verificationStatus: string;
}

/**
 * Extracts pre-checkout risk fields from Stripe session metadata.
 *
 * Returns null when:
 *   - metadata is absent
 *   - any of the three fields is absent or empty (partial write = untrusted)
 *   - riskScore is not a finite integer in [0, 100]
 *
 * A null return means the session predates the pre-checkout gate or the
 * gate was bypassed — fall back to evaluateOrderRisk() in that case.
 */
export function extractPreCheckoutRisk(
  metadata: Stripe.Metadata | null | undefined,
): PreCheckoutRiskMeta | null {
  if (!metadata) return null;

  const rawScore = metadata["pre_checkout_risk_score"];
  const rawLevel = metadata["pre_checkout_risk_level"];
  const rawStatus = metadata["pre_checkout_verif_status"];

  // All three must be non-empty. A partially written session is treated as
  // legacy — safer to re-evaluate than to use an incomplete risk decision.
  if (
    rawScore == null ||
    rawScore === "" ||
    rawLevel == null ||
    rawLevel === "" ||
    rawStatus == null ||
    rawStatus === ""
  ) {
    return null;
  }

  const riskScore = Number(rawScore);

  if (
    !Number.isSafeInteger(riskScore) ||
    riskScore < 0 ||
    riskScore > 100
  ) {
    return null;
  }

  if (!VALID_RISK_LEVELS.has(rawLevel)) {
    return null;
  }

  if (!VALID_VERIFICATION_STATUSES.has(rawStatus)) {
    return null;
  }

  return {
    riskScore,
    riskLevel: rawLevel,
    verificationStatus: rawStatus,
  };
}

/**
 * Type guard — true when the session was processed by the pre-checkout gate.
 * Equivalent to `extractPreCheckoutRisk(metadata) !== null` but avoids
 * allocating the result object when the caller only needs the boolean.
 */
export function hasPreCheckoutRisk(
  metadata: Stripe.Metadata | null | undefined,
): boolean {
  if (!metadata) return false;
  return (
    metadata["pre_checkout_risk_score"]  != null && metadata["pre_checkout_risk_score"]  !== "" &&
    metadata["pre_checkout_risk_level"]  != null && metadata["pre_checkout_risk_level"]  !== "" &&
    metadata["pre_checkout_verif_status"] != null && metadata["pre_checkout_verif_status"] !== ""
  );
}

// ─── Parsed metadata shape ────────────────────────────────────────────────────

export type ParsedCheckoutMetadata = {
  // ── Identity ───────────────────────────────────────────────────────────────
  userId: string | null;
  guestToken: string | null;

  // ── Required tracing fields ────────────────────────────────────────────────
  /**
   * Canonical pending cart UUID.
   * Resolved from: pending_cart_id → cart_ref → cart_id (priority order).
   */
  pendingCartId: string | null;

  /**
   * Backward-compatible alias for pendingCartId.
   * @deprecated Use pendingCartId.
   */
  cartId: string;

  requestId: string;
  idempotencyKey: string;

  // ── Required order shape ───────────────────────────────────────────────────
  orderType: OrderType;

  // ── Optional order fields ──────────────────────────────────────────────────
  pickupTime: string | null;

  // ── Money (all cents, all optional) ───────────────────────────────────────
  subtotalCents: number | null;
  discountCents: number | null;
  promoDiscountCents: number | null;
  campaignDiscountCents: number | null;
  creditCents: number | null;
  taxCents: number | null;
  totalCents: number | null;

  // ── Discounts (optional) ───────────────────────────────────────────────────
  promoId: string | null;
  creditId: string | null;
  appliedCampaignIds: string[];

  // ── Loyalty (optional) ────────────────────────────────────────────────────
  loyaltyAccountId: string | null;
  loyaltyReservedPoints: number | null;
  loyaltyDiscountCents: number | null;
  loyaltyPreSessionKey: string | null;
};

// ─── Internal safe coercions ──────────────────────────────────────────────────

function safeInt(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  if (!/^-?\d+$/.test(trimmed)) return null;

  const n = Number(trimmed);
  return Number.isSafeInteger(n) ? n : null;
}

function safeStr(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickStr(meta: Stripe.Metadata, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = safeStr(meta[key]);
    if (v !== null) return v;
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function parseCheckoutMetadata(
  metadata: Stripe.Metadata | null | undefined,
  requestId: string,
): WebhookResult<ParsedCheckoutMetadata> {
  if (metadata === null || metadata === undefined || typeof metadata !== "object") {
    log("warn", "webhook_metadata_missing", { requestId });
    return webhookFail("metadata_missing", "Session metadata is absent.");
  }

const userId     = pickStr(metadata, "user_id", "customer_uid", "uid");
const guestToken = safeStr(metadata["guest_token"]);

const hasUserIdentity = userId !== null;
const hasGuestIdentity = guestToken !== null;

if (hasUserIdentity === hasGuestIdentity) {
  log("warn", "webhook_metadata_invalid_identity", {
    requestId,
    hasUserIdentity,
    hasGuestIdentity,
  });

  return webhookFail(
    "metadata_invalid_identity",
    "Metadata must contain exactly one identity: user_id or guest_token.",
  );
}

  const resolvedCartId = pickStr(
    metadata,
    "pending_cart_id",
    "cart_ref",
    "cart_id",
  );

  if (resolvedCartId === null) {
    log("warn", "webhook_metadata_missing_cart_id", { requestId });
    return webhookFail("metadata_missing_cart_id", "Metadata is missing cart_id.");
  }

  const parsedRequestId = safeStr(metadata["request_id"]);
  if (parsedRequestId === null) {
    log("warn", "webhook_metadata_missing_request_id", { requestId });
    return webhookFail(
      "metadata_missing_request_id",
      "Metadata is missing request_id.",
    );
  }

  const idempotencyKey = safeStr(metadata["idempotency_key"]);
  if (idempotencyKey === null) {
    log("warn", "webhook_metadata_missing_idempotency_key", { requestId });
    return webhookFail(
      "metadata_missing_idempotency_key",
      "Metadata is missing idempotency_key.",
    );
  }

  const rawOrderType = safeStr(metadata["order_type"]);
  if (rawOrderType === null || !isOrderType(rawOrderType)) {
    log("warn", "webhook_metadata_invalid_order_type", {
      requestId,
      rawOrderType: rawOrderType ?? "(absent)",
    });
    return webhookFail(
      "metadata_invalid_order_type",
      `Metadata order_type is invalid or absent: "${rawOrderType ?? ""}"`,
    );
  }
  const orderType: OrderType = rawOrderType;

  const pickupTime            = safeStr(metadata["pickup_time"]);
  const subtotalCents         = safeInt(metadata["subtotal_cents"]);
  const discountCents         = safeInt(metadata["discount_cents"]);
  const promoDiscountCents    = safeInt(metadata["promo_discount_cents"]);
  const campaignDiscountCents = safeInt(metadata["campaign_discount_cents"]);
  const creditCents           = safeInt(metadata["credit_cents"]);
  const taxCents              = safeInt(metadata["tax_cents"]);
  const totalCents            = safeInt(metadata["total_cents"]);
  const promoId               = safeStr(metadata["promo_id"]);
  const creditId              = safeStr(metadata["credit_id"]);

  const rawCampaignIds = safeStr(metadata["applied_campaign_ids"]);
  const appliedCampaignIds: string[] = rawCampaignIds
    ? rawCampaignIds.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
    : [];

  const loyaltyAccountId      = safeStr(metadata["loyalty_account_id"]);
  const loyaltyReservedPoints = safeInt(metadata["loyalty_reserved_points"]);
  const loyaltyDiscountCents  = safeInt(metadata["loyalty_discount_cents"]);
  const loyaltyPreSessionKey  = safeStr(metadata["loyalty_pre_session_key"]);

  const parsed: ParsedCheckoutMetadata = {
    userId,
    guestToken,
    pendingCartId: resolvedCartId,
    cartId:        resolvedCartId,
    requestId:     parsedRequestId,
    idempotencyKey,
    orderType,
    pickupTime,
    subtotalCents,
    discountCents,
    promoDiscountCents,
    campaignDiscountCents,
    creditCents,
    taxCents,
    totalCents,
    promoId,
    creditId,
    appliedCampaignIds,
    loyaltyAccountId,
    loyaltyReservedPoints,
    loyaltyDiscountCents,
    loyaltyPreSessionKey,
  };

  return webhookOk(parsed);
}