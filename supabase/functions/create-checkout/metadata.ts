// supabase/functions/create-checkout/metadata.ts
// =============================================================================
// Stripe session + payment_intent metadata builder.
//
// Extracted from index.ts. Pure function — no side effects, no DB/Stripe calls.
//
// preSessionKey is passed in from the single computed value in the main handler.
// It must NOT be recomputed here — doing so risks a mismatch if any input has
// changed between the point of computation and this call.
//
// [FIX 2] customer_ip, device_fingerprint, and customer_user_agent are NOT
// written to Stripe metadata. These values are privacy-sensitive and are
// already captured in your own risk gate system (pre_checkout_risk_score /
// pre_checkout_risk_level / pre_checkout_verif_status). Sending full IP and
// device fingerprint into Stripe's metadata storage is unnecessary for
// payment processing and increases PII exposure surface.
//
// The three risk gate fields ARE kept because the webhook reads them to skip
// re-scoring post-payment.
// =============================================================================

import Stripe from "stripe";
import {
  pickupTimeToMetadata,
} from "../_shared/pickup-time.ts";
import {
  attributionToMetadata,
} from "../_shared/attribution.ts";
import { STRIPE_API_VERSION } from "./env.ts";
import type {
  CartContext,
  LoyaltyOutcome,
  ParsedBody,
  PricingContext,
  RequestContext,
  ResolvedDiscounts,
  RiskGatePayload,
} from "./types.ts";

export function buildSessionMetadata(
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
  const { body, pickupTime, smsPhone, smsOptIn } = parsed;

  return {
    // Canonical identity. customer_uid and uid are legacy aliases kept for
    // backward-compat with existing webhook consumers that have not yet been
    // migrated to user_id. Do not introduce new consumers of these fields —
    // use user_id exclusively going forward.
    user_id:      ctx.userId,
    customer_uid: ctx.userId,
    uid:          ctx.userId,

    pending_cart_id: cart.cartId,
    cart_ref:        cart.cartId,
    cart_id:         cart.cartId,
    order_type:      body.order_type,
    pricing_hash:    pricing.pricingHash,
    pricing_snapshot_version: snapshot.version,
    request_id:      ctx.requestId,
    stripe_api_version: STRIPE_API_VERSION,
    currency:        snapshot.currency,
    subtotal_cents:  String(snapshot.subtotalCents),
    discount_cents:  String(
      (snapshot.promoDiscountCents ?? 0) +
        (snapshot.campaignDiscountCents ?? 0) +
        (snapshot.creditCents ?? 0),
    ),
    promo_discount_cents:    String(snapshot.promoDiscountCents ?? 0),
    campaign_discount_cents: String(snapshot.campaignDiscountCents ?? 0),
    credit_cents:            String(snapshot.creditCents ?? 0),
    tax_cents:               String(snapshot.taxCents),
    total_cents:             String(snapshot.totalCents),
    idempotency_key:         cart.idempotencyKey,
    ...pickupTimeToMetadata(pickupTime),
    ...(discounts.promoId  ? { promo_id:  discounts.promoId  } : {}),
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
    // [FIX 3+4] Loyalty metadata — cleaned up formatting, behavior unchanged.
    // Redeem path: applied=true writes all four loyalty fields plus the
    //   pre-session key (needed by the webhook to release/confirm the reserve).
    // Earn-only path: applied=false but loyalty_account_id present — write
    //   the account ID so the webhook can credit earn points post-payment.
    ...(loyalty.applied
      ? {
          loyalty_account_id:      loyalty.accountId,
          loyalty_reserved_points: String(loyalty.reservedPoints),
          loyalty_discount_cents:  String(loyalty.discountCents),
          // preSessionKey was computed once in the main handler and passed
          // through — never recomputed at this stage.
          loyalty_pre_session_key: preSessionKey,
        }
      : body.loyalty_account_id
      ? { loyalty_account_id: body.loyalty_account_id }
      : {}),
    // Pre-checkout risk gate result — read by the webhook to set order risk
    // fields without re-running evaluateOrderRisk() post-payment.
    pre_checkout_risk_score:   String(riskGate.riskScore),
    pre_checkout_risk_level:   riskGate.riskLevel,
    pre_checkout_verif_status: riskGate.verificationStatus,
    // Transactional SMS opt-in for auth checkout.
    // Written only when the user explicitly opted in and a valid phone was
    // provided. The webhook reads these two fields to persist sms_opt_in and
    // guest_phone_e164 on the order so send-sms can dispatch.
    // Distinct key names from the guest path (guest_sms_opt_in / guest_phone_e164)
    // so the webhook can resolve the correct pair per-path via isGuest.
    ...(smsOptIn && smsPhone !== null
      ? { sms_opt_in: "true", sms_phone_e164: smsPhone }
      : {}),

    // Campaign attribution from paid ads, organic links, QR codes, etc.
    // Values are sanitized before this point and converted to Stripe-safe
    // metadata keys by attributionToMetadata().
    ...(parsed.attribution !== null
      ? attributionToMetadata(parsed.attribution)
      : {}),
  };
}