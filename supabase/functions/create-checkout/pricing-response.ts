import type { Json } from "../_shared/database.types.ts";
import type { PricingSnapshot } from "../_shared/pricing.ts";

// ─── Auth pricing response ────────────────────────────────────────────────────
// Full discount breakdown. Only returned to authenticated sessions.
// Exposes promo, campaign, and credit discount lines.

export function buildAuthPricingResponse(snapshot: PricingSnapshot): Json {
  return {
    subtotalCents: snapshot.subtotalCents,
    promoDiscountCents: snapshot.promoDiscountCents ?? 0,
    campaignDiscountCents: snapshot.campaignDiscountCents ?? 0,
    creditCents: snapshot.creditCents ?? 0,
    taxCents: snapshot.taxCents,
    totalCents: snapshot.totalCents,
    currency: snapshot.currency,
  };
}

// ─── Guest pricing response ───────────────────────────────────────────────────
// Minimal subset. Does NOT expose promoDiscountCents or creditCents.
// campaignDiscountCents is included because campaigns are server-configured
// auto-apply discounts — not user-supplied — and appear on the Stripe receipt.

export function buildGuestPricingResponse(snapshot: PricingSnapshot): Json {
  return {
    subtotalCents: snapshot.subtotalCents,
    campaignDiscountCents: snapshot.campaignDiscountCents ?? 0,
    taxCents: snapshot.taxCents,
    totalCents: snapshot.totalCents,
    currency: snapshot.currency,
  };
}