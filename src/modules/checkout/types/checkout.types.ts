// src/modules/checkout/types/checkout.types.ts
// =============================================================================
// CHECKOUT DOMAIN — intent layer types
// =============================================================================

import {
  toTransport,
  type PickupSchedule,
  type IsoTimestamp,
  ASAP_PICKUP,
  scheduledPickup,
} from '@/domain/adapters/pickup-schedule.adapter';

export type { PickupSchedule, IsoTimestamp };
export { ASAP_PICKUP, scheduledPickup };

export {
  isAsapPickup,
  isScheduledPickup,
  formatPickupSchedule,
} from '@/domain/orders/pickup-schedule';

// FulfillmentType inline — avoids tsc -b re-export resolution issues
export type FulfillmentType = 'pickup' | 'delivery' | 'dine_in';

// =============================================================================
// CHECKOUT RESULT
// =============================================================================

export type CheckoutResult =
  | {
      readonly ok:           true;
      readonly url:          string;
      readonly sessionId?:   string;
      readonly pricingHash?: string;
      readonly pricing?:     CheckoutPricingResponse;
    }
  | {
      readonly ok:    false;
      readonly error: string;
      readonly code?: string;
    };

// =============================================================================
// PRICING RESPONSE SHAPES
// =============================================================================

export type GuestCheckoutPricingResponse = {
  readonly subtotalCents:         number;
  readonly campaignDiscountCents: number;
  readonly taxCents:              number;
  readonly totalCents:            number;
  readonly currency:              string;
};

export type AuthCheckoutPricingResponse = GuestCheckoutPricingResponse & {
  readonly promoDiscountCents: number;
  readonly creditCents:        number;
};

export type CheckoutPricingResponse =
  | GuestCheckoutPricingResponse
  | AuthCheckoutPricingResponse;

export function isAuthPricingResponse(
  r: CheckoutPricingResponse,
): r is AuthCheckoutPricingResponse {
  return 'promoDiscountCents' in r;
}

// =============================================================================
// CHECKOUT INPUT TYPES
// =============================================================================

export type GuestCheckoutInput = {
  readonly orderType:       FulfillmentType;
  readonly guestEmail:      string;
  readonly notes?:          string;
  readonly pickupSchedule?: PickupSchedule;
};

export type AuthCheckoutInput = {
  readonly orderType:            FulfillmentType;
  readonly notes?:               string;
  readonly promoCode?:           string;
  readonly promoId?:             string;
  readonly creditId?:            string;
  readonly loyaltyRedeemPoints?: number;
  readonly loyaltyAccountId?:    string;
  readonly loyaltyRewardId?:     string;
  readonly loyaltyRedemptionId?: string;
  readonly clientIntegrityHash?: string;
  readonly pickupSchedule?:      PickupSchedule;
};

// =============================================================================
// WIRE BODY SHAPES
// =============================================================================

export type GuestCheckoutWireBody = {
  readonly order_type:   FulfillmentType;
  readonly guest_email:  string;
  readonly notes?:       string;
  readonly pickup_time?: string;
};

export type AuthCheckoutWireBody = {
  readonly order_type:             FulfillmentType;
  readonly notes?:                 string;
  readonly promo_code?:            string;
  readonly promo_id?:              string;
  readonly credit_id?:             string;
  readonly loyalty_redeem_points?: number;
  readonly loyalty_account_id?:    string;
  readonly loyalty_reward_id?:     string;
  readonly loyalty_redemption_id?: string;
  readonly client_integrity_hash?: string;
  readonly pickup_time?:           string;
};

// =============================================================================
// SERIALISERS
// =============================================================================

export function serialiseGuestCheckoutInput(
  input: GuestCheckoutInput,
): GuestCheckoutWireBody {
  const pickupTime: IsoTimestamp | undefined = input.pickupSchedule
    ? toTransport(input.pickupSchedule)
    : undefined;

  return {
    order_type:  input.orderType,
    guest_email: input.guestEmail,
    ...(input.notes ? { notes: input.notes }     : {}),
    ...(pickupTime  ? { pickup_time: pickupTime } : {}),
  };
}

export function serialiseAuthCheckoutInput(
  input: AuthCheckoutInput,
): AuthCheckoutWireBody {
  const pickupTime: IsoTimestamp | undefined = input.pickupSchedule
    ? toTransport(input.pickupSchedule)
    : undefined;

  return {
    order_type: input.orderType,
    ...(input.notes               ? { notes: input.notes }                               : {}),
    ...(input.promoCode           ? { promo_code: input.promoCode }                      : {}),
    ...(input.promoId             ? { promo_id: input.promoId }                          : {}),
    ...(input.creditId            ? { credit_id: input.creditId }                        : {}),
    ...(input.loyaltyRedeemPoints ? { loyalty_redeem_points: input.loyaltyRedeemPoints } : {}),
    ...(input.loyaltyAccountId    ? { loyalty_account_id: input.loyaltyAccountId }       : {}),
    ...(input.loyaltyRewardId     ? { loyalty_reward_id: input.loyaltyRewardId }         : {}),
    ...(input.loyaltyRedemptionId ? { loyalty_redemption_id: input.loyaltyRedemptionId } : {}),
    ...(input.clientIntegrityHash ? { client_integrity_hash: input.clientIntegrityHash } : {}),
    ...(pickupTime                ? { pickup_time: pickupTime }                          : {}),
  };
}