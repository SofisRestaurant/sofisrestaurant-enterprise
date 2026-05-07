// src/modules/checkout/types/checkout.types.ts
// =============================================================================
// CHECKOUT DOMAIN — intent layer types
// =============================================================================
//
// CHANGES FROM PRIOR VERSION:
//
//   [1] parseCheckoutPricingResponse rewritten — TS2339 fix.
//
//       Previous implementation narrowed v to GuestCheckoutPricingResponse
//       via isGuestPricingShape(), then attempted to access v.promoDiscountCents
//       on that narrowed type. GuestCheckoutPricingResponse does not declare
//       promoDiscountCents, so TypeScript correctly raised TS2339.
//
//       Fix: two independent type predicates, each operating on unknown.
//
//       isAuthPricingShape(v: unknown): v is AuthCheckoutPricingResponse
//         Validates ALL fields including auth-extended fields on the raw
//         Record<string, unknown> before any narrowing occurs. No property
//         access on a type that does not declare it.
//
//       isGuestPricingShape(v: unknown): v is GuestCheckoutPricingResponse
//         Validates only the guest baseline fields.
//
//       parseCheckoutPricingResponse checks auth (more specific) first, then
//       guest. No `as` cast anywhere. All narrowing is via type predicates.
//
//   [2] Both helper predicates are now module-private (no export).
//       isAuthPricingResponse() is the exported discriminator for callers.
//
// All other types and exports are unchanged.
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
//
// Both predicates take `unknown` as input so they operate on the raw
// Record<string, unknown> before any narrowing. This avoids TS2339 — the
// previous implementation narrowed to GuestCheckoutPricingResponse first,
// then tried to access promoDiscountCents on that narrowed type.
//
// isAuthPricingShape: checks all guest baseline fields PLUS both auth-only
//   fields in one pass. v['currency'] is unknown after isRecord; TypeScript
//   narrows it to string within the && chain after the typeof check.
//
// isGuestPricingShape: checks guest baseline fields only.
//
// parseCheckoutPricingResponse: auth check runs first (more specific superset).
//   If both predicates fail, the value is untrusted and undefined is returned.
//   No `as` cast anywhere in this chain.
//
// Returning undefined on failure means a malformed pricing payload degrades
// to "no pricing preview" rather than a checkout failure.

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
  // Auth check first: AuthCheckoutPricingResponse is a strict superset of
  // GuestCheckoutPricingResponse. If auth shape matches, return it directly —
  // TypeScript knows v is AuthCheckoutPricingResponse at this point with no cast.
  if (isAuthPricingShape(v)) return v;
  // Guest fallback: all auth-specific fields absent or non-numeric.
  if (isGuestPricingShape(v)) return v;
  return undefined;
}

// =============================================================================
// CHECKOUT RESULT — discriminated union
// =============================================================================
//
// WHY TYPE GUARDS INSTEAD OF DIRECT STRUCTURAL NARROWING:
//
// CheckoutResultFailure.code is string | null | undefined for backward compat
// with callers that return { ok: false, error } without a code. Because string
// is a supertype of all literals, result.code === 'otp_required' does not
// exclusively narrow to CheckoutResultOtpRequired — TypeScript intersects it
// with CheckoutResultFailure, leaving result.nonce inaccessible.
//
// The exported type guard functions narrow exactly once, in a tested location:
//   if (isOtpRequired(result)) { result.nonce; result.expiresAt; }  // ✓

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

/**
 * All other failures — network, server, validation, config errors.
 * code is string | null | undefined for backward compat with callers
 * that omit it. Use result.error for display; add a named variant for
 * any code that requires specific branching behavior.
 */
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