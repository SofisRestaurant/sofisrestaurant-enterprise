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
// REQUIRED FIELDS (hard failure on absence):
//   user_id (or legacy alias) OR guest_token — at least one identity
//   cart_id (or alias)
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

export type OrderType = "pickup" | "delivery" | "dine_in";

function isOrderType(value: string): value is OrderType {
  return VALID_ORDER_TYPES.has(value);
}

// ─── Parsed metadata shape ────────────────────────────────────────────────────
// Mirrors EXACTLY the fields written by buildSessionMetadata() in
// create-checkout/index.ts. New fields added there must be added here.

export type ParsedCheckoutMetadata = {
  // ── Identity ───────────────────────────────────────────────────────────────
  // userId: null  = guest checkout (no authenticated user)
  // Exactly one of userId / guestToken will be non-null.
  userId: string | null;
  guestToken: string | null;

  // ── Required tracing fields ────────────────────────────────────────────────
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

/**
 * Returns null when the string is absent, empty after trim, or not a finite
 * integer. Never returns NaN or Infinity.
 */
function safeInt(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Returns null when the string is absent or empty after trimming.
 * Never returns an empty string downstream.
 */
function safeStr(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Walks a list of candidate keys and returns the first non-null safeStr result.
 * Used for fields that have legacy aliases in the metadata schema.
 */
function pickStr(meta: Stripe.Metadata, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = safeStr(meta[key]);
    if (v !== null) return v;
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse and strictly validate all checkout session metadata.
 *
 * This is the ONLY permitted entry point for session.metadata in handler code.
 * Never read session.metadata properties directly in a handler.
 *
 * Returns WebhookFail when:
 *   - metadata is null/absent
 *   - both userId and guestToken are absent (no identity)
 *   - any required field (cartId, requestId, idempotencyKey, orderType) is
 *     absent or invalid
 *
 * Returns WebhookOk<ParsedCheckoutMetadata> on success. All optional fields
 * that are absent are null (never undefined).
 */
export function parseCheckoutMetadata(
  metadata: Stripe.Metadata | null | undefined,
  requestId: string,
): WebhookResult<ParsedCheckoutMetadata> {
  // ── Presence check ─────────────────────────────────────────────────────────
  if (metadata === null || metadata === undefined || typeof metadata !== "object") {
    log("warn", "webhook_metadata_missing", { requestId });
    return webhookFail("metadata_missing", "Session metadata is absent.");
  }

  // ── Identity ───────────────────────────────────────────────────────────────
  // user_id is canonical. customer_uid / uid are legacy aliases written by
  // create-checkout/index.ts for backward compat. Resolve once here; never
  // access these raw keys downstream.
  const userId = pickStr(metadata, "user_id", "customer_uid", "uid");
  const guestToken = safeStr(metadata["guest_token"]);

  if (userId === null && guestToken === null) {
    log("warn", "webhook_metadata_no_identity", { requestId });
    return webhookFail(
      "metadata_no_identity",
      "Metadata contains neither user_id nor guest_token.",
    );
  }

  // ── Required: cartId ───────────────────────────────────────────────────────
  // Three aliases written by buildSessionMetadata() — accept all.
  const cartId = pickStr(metadata, "cart_id", "cart_ref", "pending_cart_id");
  if (cartId === null) {
    log("warn", "webhook_metadata_missing_cart_id", { requestId });
    return webhookFail("metadata_missing_cart_id", "Metadata is missing cart_id.");
  }

  // ── Required: requestId ────────────────────────────────────────────────────
  const parsedRequestId = safeStr(metadata["request_id"]);
  if (parsedRequestId === null) {
    log("warn", "webhook_metadata_missing_request_id", { requestId });
    return webhookFail(
      "metadata_missing_request_id",
      "Metadata is missing request_id.",
    );
  }

  // ── Required: idempotencyKey ───────────────────────────────────────────────
  const idempotencyKey = safeStr(metadata["idempotency_key"]);
  if (idempotencyKey === null) {
    log("warn", "webhook_metadata_missing_idempotency_key", { requestId });
    return webhookFail(
      "metadata_missing_idempotency_key",
      "Metadata is missing idempotency_key.",
    );
  }

  // ── Required: orderType (enum-validated) ───────────────────────────────────
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

  // ── Optional fields ────────────────────────────────────────────────────────
  const pickupTime = safeStr(metadata["pickup_time"]);

  const subtotalCents       = safeInt(metadata["subtotal_cents"]);
  const discountCents       = safeInt(metadata["discount_cents"]);
  const promoDiscountCents  = safeInt(metadata["promo_discount_cents"]);
  const campaignDiscountCents = safeInt(metadata["campaign_discount_cents"]);
  const creditCents         = safeInt(metadata["credit_cents"]);
  const taxCents            = safeInt(metadata["tax_cents"]);
  const totalCents          = safeInt(metadata["total_cents"]);

  const promoId  = safeStr(metadata["promo_id"]);
  const creditId = safeStr(metadata["credit_id"]);

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
    cartId,
    requestId: parsedRequestId,
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