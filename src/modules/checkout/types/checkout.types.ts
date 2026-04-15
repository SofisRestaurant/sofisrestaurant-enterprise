// src/modules/checkout/types/checkout.types.ts
// =============================================================================
// Merged type definitions — existing pipeline + dual-pipeline additions.
// Existing: CheckoutData, CheckoutSession (used by checkout.api.ts + useCheckout.ts)
// New:      AuthCheckoutInput, GuestCheckoutInput, CheckoutResult, pricing responses
// =============================================================================

// ─── Existing types (used by checkout.api.ts and original useCheckout.ts) ────

export type CheckoutData = {
  items: Array<Record<string, unknown>>;
  customer: {
    customer_uid: string;
    email: string;
    name?: string | null;
    phone?: string | null;
  };
  successUrl: string;
  cancelUrl: string;
  // Optional extras passed through by useCheckout
  orderType?: "pickup" | "delivery" | "dine_in";
  notes?: string | null;
};

export type CheckoutSession = {
  id: string;
  url: string;
  status: string;
};

// ─── New: dual-pipeline result type ──────────────────────────────────────────

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

// ─── New: pricing response shapes ────────────────────────────────────────────

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

// ─── New: guest checkout input ────────────────────────────────────────────────
// Only fields the guest endpoint accepts.
// promo, credit, loyalty fields are explicitly absent — not optional.

export type GuestCheckoutInput = {
  orderType: "pickup" | "delivery" | "dine_in";
  guestEmail: string;
  notes?: string;
  successUrl?: string;
  cancelUrl?: string;
};

// ─── New: auth checkout input ─────────────────────────────────────────────────

export type AuthCheckoutInput = {
  orderType: "pickup" | "delivery" | "dine_in";
  notes?: string;
  promoCode?: string;
  promoId?: string;
  creditId?: string;
  loyaltyRedeemPoints?: number;
  loyaltyAccountId?: string;
  loyaltyRewardId?: string;
  loyaltyRedemptionId?: string;
  clientIntegrityHash?: string;
  successUrl?: string;
  cancelUrl?: string;
};