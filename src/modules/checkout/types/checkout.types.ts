// src/modules/checkout/types/checkout.types.ts
// =============================================================================
// Type definitions for the dual-pipeline checkout (auth + guest).
//
// Stripe redirect URLs (success_url / cancel_url) are SERVER-CONTROLLED.
// The Edge Functions build them from the SITE_URL env var — no field for
// either URL appears in these input types.
// =============================================================================

// ─── Dual-pipeline result type ──────────────────────────────────────────────

export type CheckoutResult =
  | {
      ok: true;
      url: string;
      sessionId?: string;
      pricingHash?: string;
      pricing?: CheckoutPricingResponse;
    }
  | {
      ok: false;
      error: string;
      code?: string;
    };

// ─── Pricing response shapes ────────────────────────────────────────────────

export type GuestCheckoutPricingResponse = {
  subtotalCents: number;
  campaignDiscountCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
};

export type AuthCheckoutPricingResponse = GuestCheckoutPricingResponse & {
  promoDiscountCents: number;
  creditCents: number;
};

export type CheckoutPricingResponse =
  | GuestCheckoutPricingResponse
  | AuthCheckoutPricingResponse;

// ─── Guest checkout input ────────────────────────────────────────────────────
// Server owns Stripe redirect URLs via SITE_URL.
// pickup_time: ISO 8601 string (seconds precision), omit if not a scheduled order.

export type GuestCheckoutInput = {
  orderType: 'pickup' | 'delivery' | 'dine_in';
  guestEmail: string;
  notes?: string;
  pickup_time?: string;
};

// ─── Auth checkout input ─────────────────────────────────────────────────────
// Server owns Stripe redirect URLs via SITE_URL.
// pickup_time: ISO 8601 string (seconds precision), omit if not a scheduled order.

export type AuthCheckoutInput = {
  orderType: 'pickup' | 'delivery' | 'dine_in';
  notes?: string;
  promoCode?: string;
  promoId?: string;
  creditId?: string;
  loyaltyRedeemPoints?: number;
  loyaltyAccountId?: string;
  loyaltyRewardId?: string;
  loyaltyRedemptionId?: string;
  clientIntegrityHash?: string;
  pickup_time?: string;
};