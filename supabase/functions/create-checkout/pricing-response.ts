import type { Json } from "../_shared/database.types.ts";
import type { PricingSnapshot } from "../_shared/pricing.ts";

export function buildCheckoutPricingResponse(snapshot: PricingSnapshot): Json {
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
