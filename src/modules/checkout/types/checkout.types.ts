// src/modules/checkout/types/checkout.types.ts
// =============================================================================
// CHECKOUT DOMAIN — intent layer types
// =============================================================================
//
// CHANGES FROM PRIOR VERSION:
//
//   [1] parseCheckoutPricingResponse rewritten — TS2339 fix. (unchanged)
//
//   [2] Both helper predicates are module-private. (unchanged)
//
//   [3] SMS fields added to GuestCheckoutInput, GuestCheckoutWireBody,
//       and serialiseGuestCheckoutInput(). (unchanged)
//
//   [4] SMS fields added to AuthCheckoutInput, AuthCheckoutWireBody,
//       and serialiseAuthCheckoutInput().
//
//       AuthCheckoutInput gains:
//         smsPhone?:  E164UsPhone  — branded phone from useCheckoutRouter
//         smsOptIn?:  true         — narrowed to literal true (never false;
//                                    false intent = field absent)
//
//       AuthCheckoutWireBody gains:
//         sms_phone_e164?: E164UsPhone  — present only when opted in + valid phone
//         sms_opt_in?:     true         — always true when present; absent otherwise
//
//       serialiseAuthCheckoutInput() emits both wire fields when smsOptIn is
//       true and smsPhone is present. When smsOptIn is absent or false the
//       output is byte-for-byte identical to the previous version — no
//       regression for callers that don't pass SMS fields.
//
//       On the server, create-checkout independently validates sms_phone_e164
//       against the same E.164 regex before writing the fields to Stripe
//       metadata. The webhook reads the metadata and persists sms_opt_in and
//       guest_phone_e164 on the order so send-sms can dispatch.
//
// All other types, guards, and serializers are unchanged.
// =============================================================================

import {
  toTransport,
  type PickupSchedule,
  type IsoTimestamp,
  ASAP_PICKUP,
  scheduledPickup,
} from '@/domain/adapters/pickup-schedule.adapter';

import type { E164UsPhone } from './checkout-wire.types';

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
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

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
// PRICING RESPONSE PARSER
// =============================================================================

function isAuthPricingShape(v: unknown): v is AuthCheckoutPricingResponse {
  if (!isRecord(v)) return false;
  return (
    typeof v['subtotalCents']         === 'number' &&
    typeof v['campaignDiscountCents'] === 'number' &&
    typeof v['taxCents']              === 'number' &&
    typeof v['totalCents']            === 'number' &&
    typeof v['currency']              === 'string' && v['currency'].length > 0 &&
    typeof v['promoDiscountCents']    === 'number' &&
    typeof v['creditCents']           === 'number'
  );
}

function isGuestPricingShape(v: unknown): v is GuestCheckoutPricingResponse {
  if (!isRecord(v)) return false;
  return (
    typeof v['subtotalCents']         === 'number' &&
    typeof v['campaignDiscountCents'] === 'number' &&
    typeof v['taxCents']              === 'number' &&
    typeof v['totalCents']            === 'number' &&
    typeof v['currency']              === 'string' && v['currency'].length > 0
  );
}

export function parseCheckoutPricingResponse(
  v: unknown,
): CheckoutPricingResponse | undefined {
  if (isAuthPricingShape(v)) return v;
  if (isGuestPricingShape(v)) return v;
  return undefined;
}

// =============================================================================
// CHECKOUT RESULT — discriminated union
// =============================================================================

export type CheckoutResultSuccess = {
  readonly ok:           true;
  readonly url:          string;
  readonly sessionId?:   string;
  readonly pricingHash?: string;
  readonly pricing?:     CheckoutPricingResponse;
};

export type CheckoutResultOtpRequired = {
  readonly ok:        false;
  readonly code:      'otp_required';
  readonly error:     string;
  readonly nonce:     string;
  readonly expiresAt: string;
};

export type CheckoutResultBlocked = {
  readonly ok:    false;
  readonly code:  'checkout_blocked';
  readonly error: string;
};

export type CheckoutResultFailure = {
  readonly ok:    false;
  readonly code:  string | null | undefined;
  readonly error: string;
};

export type CheckoutResult =
  | CheckoutResultSuccess
  | CheckoutResultOtpRequired
  | CheckoutResultBlocked
  | CheckoutResultFailure;

export function isCheckoutSuccess(r: CheckoutResult): r is CheckoutResultSuccess {
  return r.ok === true;
}

export function isOtpRequired(r: CheckoutResult): r is CheckoutResultOtpRequired {
  return r.ok === false && r.code === 'otp_required';
}

export function isCheckoutBlocked(r: CheckoutResult): r is CheckoutResultBlocked {
  return r.ok === false && r.code === 'checkout_blocked';
}

export function isCheckoutFailure(r: CheckoutResult): r is CheckoutResultFailure {
  return r.ok === false && r.code !== 'otp_required' && r.code !== 'checkout_blocked';
}

// =============================================================================
// CHECKOUT INPUT TYPES
// =============================================================================

export type GuestCheckoutInput = {
  readonly orderType:       FulfillmentType;
  readonly guestEmail:      string;
  readonly notes?:          string;
  readonly pickupSchedule?: PickupSchedule;
  /**
   * Validated E.164 US phone number (+1XXXXXXXXXX).
   * Only ever populated when smsOptIn is true and the number passed
   * toE164UsPhone() in useCheckoutRouter. The branded type enforces this at
   * compile time: a raw string cannot be assigned here.
   */
  readonly guestPhone?:     E164UsPhone;
  /**
   * Narrowed to literal `true` — never `false`. Absent field = no opt-in.
   * When true, guestPhone must also be present for serialiseGuestCheckoutInput
   * to emit the SMS wire fields.
   */
  readonly smsOptIn?:       true;
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
  /**
   * Validated E.164 US phone for transactional SMS order updates.
   * Branded via toE164UsPhone() in useCheckoutRouter — a raw string cannot
   * be assigned here. Only populated when smsOptIn is true.
   */
  readonly smsPhone?:            E164UsPhone;
  /**
   * Narrowed to literal `true` — never `false`. Absent field = no opt-in.
   * Mirrors the semantics of GuestCheckoutInput.smsOptIn.
   * When true, smsPhone must also be present for serialiseAuthCheckoutInput
   * to emit the SMS wire fields.
   */
  readonly smsOptIn?:            true;
};

// =============================================================================
// WIRE BODY SHAPES
// =============================================================================

export type GuestCheckoutWireBody = {
  readonly order_type:   FulfillmentType;
  readonly guest_email:  string;
  readonly notes?:       string;
  readonly pickup_time?: string;
  /**
   * Validated E.164 US phone. Present only when the guest opted in and the
   * number passed toE164UsPhone(). Never a null or empty-string sentinel —
   * the field is absent entirely when SMS is off.
   */
  readonly guest_phone?: E164UsPhone;
  /**
   * Explicit SMS opt-in flag for the backend. Always `true` when present;
   * omitted entirely when the guest has not opted in.
   */
  readonly sms_opt_in?:  true;
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
  /**
   * Validated E.164 US phone for opted-in SMS order updates.
   * Present only when sms_opt_in is true. Never a null or empty-string
   * sentinel — the field is absent entirely when SMS is off.
   * create-checkout re-validates this server-side before writing to Stripe
   * metadata. The webhook reads the metadata and persists to guest_phone_e164.
   */
  readonly sms_phone_e164?:        E164UsPhone;
  /**
   * Explicit SMS opt-in flag. Always `true` when present; omitted otherwise.
   * Mirrors the guest wire field sms_opt_in; both land on the same DB column.
   */
  readonly sms_opt_in?:            true;
};

// =============================================================================
// SERIALISERS
// =============================================================================

/**
 * Converts a validated GuestCheckoutInput into the flat wire body sent to
 * create-checkout-guest. This is the single place that maps domain field names
 * to snake_case wire names for the guest path.
 *
 * SMS fields (guest_phone, sms_opt_in) are emitted only when both smsOptIn
 * is true AND guestPhone is present. Either condition alone is insufficient —
 * this mirrors the validation gate in useCheckoutRouter that guarantees the
 * pair is always populated together when SMS opt-in is active.
 *
 * When smsOptIn is absent or false the output is identical to the pre-SMS
 * version of this function.
 */
export function serialiseGuestCheckoutInput(
  input: GuestCheckoutInput,
): GuestCheckoutWireBody {
  const pickupTime: IsoTimestamp | undefined = input.pickupSchedule
    ? toTransport(input.pickupSchedule)
    : undefined;

  return {
    order_type:  input.orderType,
    guest_email: input.guestEmail,
    ...(input.notes      ? { notes:       input.notes  } : {}),
    ...(pickupTime       ? { pickup_time: pickupTime   } : {}),
    ...(input.smsOptIn === true && input.guestPhone !== undefined
      ? { guest_phone: input.guestPhone, sms_opt_in: true as const }
      : {}),
  };
}

/**
 * Converts a validated AuthCheckoutInput into the flat wire body sent to
 * create-checkout. This is the single place that maps domain field names to
 * snake_case wire names for the auth path.
 *
 * SMS fields (sms_phone_e164, sms_opt_in) are emitted only when both smsOptIn
 * is true AND smsPhone is present. The server independently re-validates the
 * phone before writing it to Stripe metadata.
 *
 * When smsOptIn is absent or false the output is byte-for-byte identical to
 * the pre-SMS version of this function — no regression for existing callers.
 */
export function serialiseAuthCheckoutInput(
  input: AuthCheckoutInput,
): AuthCheckoutWireBody {
  const pickupTime: IsoTimestamp | undefined = input.pickupSchedule
    ? toTransport(input.pickupSchedule)
    : undefined;

  return {
    order_type: input.orderType,
    ...(input.notes               ? { notes:                input.notes                } : {}),
    ...(input.promoCode           ? { promo_code:           input.promoCode            } : {}),
    ...(input.promoId             ? { promo_id:             input.promoId              } : {}),
    ...(input.creditId            ? { credit_id:            input.creditId             } : {}),
    ...(input.loyaltyRedeemPoints ? { loyalty_redeem_points: input.loyaltyRedeemPoints } : {}),
    ...(input.loyaltyAccountId    ? { loyalty_account_id:   input.loyaltyAccountId     } : {}),
    ...(input.loyaltyRewardId     ? { loyalty_reward_id:    input.loyaltyRewardId      } : {}),
    ...(input.loyaltyRedemptionId ? { loyalty_redemption_id: input.loyaltyRedemptionId } : {}),
    ...(input.clientIntegrityHash ? { client_integrity_hash: input.clientIntegrityHash } : {}),
    ...(pickupTime                ? { pickup_time:          pickupTime                 } : {}),
    // Emit SMS fields only when both conditions are satisfied. smsPhone is
    // E164UsPhone (branded) so TypeScript enforces it was validated upstream.
    // create-checkout re-validates server-side — defense in depth.
    ...(input.smsOptIn === true && input.smsPhone !== undefined
      ? { sms_phone_e164: input.smsPhone, sms_opt_in: true as const }
      : {}),
  };
}