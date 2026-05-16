// src/modules/checkout/types/checkout.types.ts
// =============================================================================
// CHECKOUT DOMAIN — intent layer types
// =============================================================================
//
// Purpose:
// - Domain-level checkout inputs used by hooks/components.
// - Wire serializers that convert safe domain fields into Edge Function payloads.
// - Runtime guards/parsers for checkout responses.
//
// Rules:
// - No `any`.
// - No raw phone strings in SMS-enabled checkout inputs.
// - UI mode is camelCase in domain types, snake_case on the wire.
// - SMS opt-in is represented as literal `true` when present, never `false`.
// - Optional fields are omitted from the wire body instead of being sent as
//   empty strings, false, or null sentinels.
// =============================================================================

import {
  toTransport,
  type PickupSchedule,
  type IsoTimestamp,
  ASAP_PICKUP,
  scheduledPickup,
} from '@/domain/adapters/pickup-schedule.adapter';
import type {
  CheckoutUiMode,
  E164UsPhone,
} from '@/modules/checkout/types/checkout-wire.types';

export type { E164UsPhone };
export type { PickupSchedule, IsoTimestamp };
export { ASAP_PICKUP, scheduledPickup };

export {
  isAsapPickup,
  isScheduledPickup,
  formatPickupSchedule,
} from '@/domain/orders/pickup-schedule';

export type FulfillmentType = 'pickup' | 'delivery' | 'dine_in';

// =============================================================================
// RUNTIME GUARD
// =============================================================================

/**
 * Narrows unknown to Record<string, unknown>.
 * Apply at every response.json() boundary before accessing properties.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// =============================================================================
// PRICING RESPONSE SHAPES
// =============================================================================

export type GuestCheckoutPricingResponse = {
  readonly subtotalCents: number;
  readonly campaignDiscountCents: number;
  readonly taxCents: number;
  readonly totalCents: number;
  readonly currency: string;
};

export type AuthCheckoutPricingResponse = GuestCheckoutPricingResponse & {
  readonly promoDiscountCents: number;
  readonly creditCents: number;
};

export type CheckoutPricingResponse =
  | GuestCheckoutPricingResponse
  | AuthCheckoutPricingResponse;

export function isAuthPricingResponse(
  response: CheckoutPricingResponse,
): response is AuthCheckoutPricingResponse {
  return 'promoDiscountCents' in response;
}

// =============================================================================
// PRICING RESPONSE PARSER
// =============================================================================

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isGuestPricingShape(value: unknown): value is GuestCheckoutPricingResponse {
  if (!isRecord(value)) return false;

  return (
    isFiniteNumber(value.subtotalCents) &&
    isFiniteNumber(value.campaignDiscountCents) &&
    isFiniteNumber(value.taxCents) &&
    isFiniteNumber(value.totalCents) &&
    isNonEmptyString(value.currency)
  );
}

function isAuthPricingShape(value: unknown): value is AuthCheckoutPricingResponse {
  if (!isRecord(value)) return false;

  return (
    isFiniteNumber(value.subtotalCents) &&
    isFiniteNumber(value.campaignDiscountCents) &&
    isFiniteNumber(value.taxCents) &&
    isFiniteNumber(value.totalCents) &&
    isNonEmptyString(value.currency) &&
    isFiniteNumber(value.promoDiscountCents) &&
    isFiniteNumber(value.creditCents)
  );
}

export function parseCheckoutPricingResponse(
  value: unknown,
): CheckoutPricingResponse | undefined {
  if (isAuthPricingShape(value)) return value;
  if (isGuestPricingShape(value)) return value;
  return undefined;
}

// =============================================================================
// CHECKOUT RESULT — DISCRIMINATED UNION
// =============================================================================

export type CheckoutResultSuccess = {
  readonly ok: true;

  /**
   * Hosted Stripe Checkout redirect URL.
   * Present when uiMode is hosted.
   */
  readonly url?: string;

  /**
   * Embedded Stripe Checkout client secret.
   * Present when uiMode is embedded.
   */
  readonly clientSecret?: string;

  /**
   * Explicit Stripe UI mode echo when available.
   */
  readonly uiMode?: CheckoutUiMode;

  readonly sessionId?: string;
  readonly pricingHash?: string;
  readonly pricing?: CheckoutPricingResponse;
};

export type CheckoutResultOtpRequired = {
  readonly ok: false;
  readonly code: 'otp_required';
  readonly error: string;
  readonly nonce: string;
  readonly expiresAt: string;
};

export type CheckoutResultBlocked = {
  readonly ok: false;
  readonly code: 'checkout_blocked';
  readonly error: string;
};

export type CheckoutResultFailure = {
  readonly ok: false;
  readonly code: string | null | undefined;
  readonly error: string;
};

export type CheckoutResult =
  | CheckoutResultSuccess
  | CheckoutResultOtpRequired
  | CheckoutResultBlocked
  | CheckoutResultFailure;

export function isCheckoutSuccess(result: CheckoutResult): result is CheckoutResultSuccess {
  return result.ok === true;
}

export function isOtpRequired(result: CheckoutResult): result is CheckoutResultOtpRequired {
  return result.ok === false && result.code === 'otp_required';
}

export function isCheckoutBlocked(result: CheckoutResult): result is CheckoutResultBlocked {
  return result.ok === false && result.code === 'checkout_blocked';
}

export function isCheckoutFailure(result: CheckoutResult): result is CheckoutResultFailure {
  return result.ok === false && result.code !== 'otp_required' && result.code !== 'checkout_blocked';
}

// =============================================================================
// CHECKOUT INPUT TYPES — DOMAIN LAYER
// =============================================================================

export type GuestCheckoutInput = {
  readonly orderType: FulfillmentType;
  readonly guestEmail: string;
  readonly notes?: string;
  readonly pickupSchedule?: PickupSchedule;

  /**
   * Stripe Checkout mode.
   * Domain layer uses camelCase. Serializer emits ui_mode.
   */
  readonly uiMode?: CheckoutUiMode;

  /**
   * Validated E.164 US phone number (+1XXXXXXXXXX).
   * Must come from toE164UsPhone().
   */
  readonly guestPhone?: E164UsPhone;

  /**
   * Literal true only. Absence means no SMS opt-in.
   */
  readonly smsOptIn?: true;
};

export type AuthCheckoutInput = {
  readonly orderType: FulfillmentType;
  readonly notes?: string;
  readonly promoCode?: string;
  readonly promoId?: string;
  readonly creditId?: string;
  readonly loyaltyRedeemPoints?: number;
  readonly loyaltyAccountId?: string;
  readonly loyaltyRewardId?: string;
  readonly loyaltyRedemptionId?: string;
  readonly clientIntegrityHash?: string;
  readonly pickupSchedule?: PickupSchedule;

  /**
   * Stripe Checkout mode.
   * Domain layer uses camelCase. Serializer emits ui_mode.
   */
  readonly uiMode?: CheckoutUiMode;

  /**
   * Validated E.164 US phone for transactional SMS order updates.
   * Must come from toE164UsPhone().
   */
  readonly smsPhone?: E164UsPhone;

  /**
   * Literal true only. Absence means no SMS opt-in.
   */
  readonly smsOptIn?: true;
};

// =============================================================================
// WIRE BODY SHAPES — EDGE FUNCTION PAYLOADS
// =============================================================================

export type GuestCheckoutWireBody = {
  readonly order_type: FulfillmentType;
  readonly guest_email: string;
  readonly notes?: string;
  readonly pickup_time?: string;

  /**
   * Stripe Checkout mode.
   * Wire layer uses snake_case.
   */
  readonly ui_mode?: CheckoutUiMode;

  /**
   * Guest Edge Function SMS field.
   *
   * Keep this aligned with create-checkout-guest. If your guest Edge Function
   * expects guest_phone_e164 instead, rename this field and the serializer
   * output together.
   */
  readonly guest_phone?: E164UsPhone;

  /**
   * Explicit SMS opt-in. Always true when present.
   */
  readonly sms_opt_in?: true;
};

export type AuthCheckoutWireBody = {
  readonly order_type: FulfillmentType;
  readonly notes?: string;
  readonly promo_code?: string;
  readonly promo_id?: string;
  readonly credit_id?: string;
  readonly loyalty_redeem_points?: number;
  readonly loyalty_account_id?: string;
  readonly loyalty_reward_id?: string;
  readonly loyalty_redemption_id?: string;
  readonly client_integrity_hash?: string;
  readonly pickup_time?: string;

  /**
   * Stripe Checkout mode.
   * Wire layer uses snake_case.
   */
  readonly ui_mode?: CheckoutUiMode;

  /**
   * Auth Edge Function SMS field.
   * Server create-checkout reads sms_phone_e164.
   */
  readonly sms_phone_e164?: E164UsPhone;

  /**
   * Explicit SMS opt-in. Always true when present.
   */
  readonly sms_opt_in?: true;
};

// =============================================================================
// SERIALISERS
// =============================================================================

function hasText(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function getPickupTime(pickupSchedule: PickupSchedule | undefined): IsoTimestamp | undefined {
  return pickupSchedule ? toTransport(pickupSchedule) : undefined;
}

/**
 * Converts GuestCheckoutInput into create-checkout-guest wire body.
 */
export function serialiseGuestCheckoutInput(
  input: GuestCheckoutInput,
): GuestCheckoutWireBody {
  const pickupTime = getPickupTime(input.pickupSchedule);

  return {
    order_type: input.orderType,
    guest_email: input.guestEmail,
    ...(hasText(input.notes) ? { notes: input.notes } : {}),
    ...(pickupTime ? { pickup_time: pickupTime } : {}),
    ...(input.uiMode ? { ui_mode: input.uiMode } : {}),
    ...(input.smsOptIn === true && input.guestPhone !== undefined
      ? {
          guest_phone: input.guestPhone,
          sms_opt_in: true as const,
        }
      : {}),
  };
}

/**
 * Converts AuthCheckoutInput into create-checkout wire body.
 */
export function serialiseAuthCheckoutInput(
  input: AuthCheckoutInput,
): AuthCheckoutWireBody {
  const pickupTime = getPickupTime(input.pickupSchedule);

  return {
    order_type: input.orderType,
    ...(hasText(input.notes) ? { notes: input.notes } : {}),
    ...(hasText(input.promoCode) ? { promo_code: input.promoCode } : {}),
    ...(hasText(input.promoId) ? { promo_id: input.promoId } : {}),
    ...(hasText(input.creditId) ? { credit_id: input.creditId } : {}),
    ...(typeof input.loyaltyRedeemPoints === 'number' && input.loyaltyRedeemPoints > 0
      ? { loyalty_redeem_points: input.loyaltyRedeemPoints }
      : {}),
    ...(hasText(input.loyaltyAccountId)
      ? { loyalty_account_id: input.loyaltyAccountId }
      : {}),
    ...(hasText(input.loyaltyRewardId)
      ? { loyalty_reward_id: input.loyaltyRewardId }
      : {}),
    ...(hasText(input.loyaltyRedemptionId)
      ? { loyalty_redemption_id: input.loyaltyRedemptionId }
      : {}),
    ...(hasText(input.clientIntegrityHash)
      ? { client_integrity_hash: input.clientIntegrityHash }
      : {}),
    ...(pickupTime ? { pickup_time: pickupTime } : {}),
    ...(input.uiMode ? { ui_mode: input.uiMode } : {}),
    ...(input.smsOptIn === true && input.smsPhone !== undefined
      ? {
          sms_phone_e164: input.smsPhone,
          sms_opt_in: true as const,
        }
      : {}),
  };
}