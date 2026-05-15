// src/modules/checkout/types/checkout-wire.types.ts
// =============================================================================
// CHECKOUT WIRE PAYLOAD TYPES
// =============================================================================
// Explicit DTO shapes for checkout Edge Function requests and responses.
// These are the canonical source of truth for what we send to and receive from
// the checkout, loyalty, and verification Edge Functions.
//
// Rules:
//   - No `any`.
//   - No generated Supabase DB types (`Database[...]`).
//   - No optional chains on unvalidated data.
//   - All consumer code must narrow `unknown` → these types via isRecord() guards
//     before property access.
//
// ADDITIONS IN THIS VERSION:
//
//   [1] E164UsPhone — opaque branded string for validated US E.164 phone numbers.
//
//       A branded type is used instead of a plain string so the compiler rejects
//       any raw form value that has not been passed through toE164UsPhone(). The
//       only way to obtain an E164UsPhone is to call toE164UsPhone(), which either
//       validates and returns the brand or returns null. There is no cast path
//       available to callers outside this file.
//
//   [2] toE164UsPhone() — the single phone-validation function for this module.
//
//       Previously useCheckoutRouter.ts contained a local isValidE164UsPhone()
//       predicate. That function is removed. All validation now goes through
//       toE164UsPhone() defined here, so the regex lives in exactly one place.
//
//       Accepted format: +1, area code first digit 2–9, nine more digits (12 chars).
//       Matches exactly what PhoneNumberInput stores when the entry is complete.
//
// All pre-existing types are unchanged.
// =============================================================================

// ─── E.164 US phone — branded type ───────────────────────────────────────────
//
// The unique symbol is module-private: it cannot be referenced outside this
// file, so `value as E164UsPhone` is a compile-time error for all callers.
// The only construction path is toE164UsPhone() below.

declare const _e164UsBrand: unique symbol;

/**
 * A validated E.164 US phone number string: `+1` followed by an area code
 * whose first digit is 2–9, then nine more digits (total 12 characters).
 *
 * Obtain one exclusively through `toE164UsPhone()`. Assign raw strings to
 * this type and TypeScript will reject the call site at compile time.
 */
export type E164UsPhone = string & { readonly [_e164UsBrand]: true };

/**
 * Validates `value` as a backend-ready E.164 US phone number.
 *
 * Returns the branded `E164UsPhone` type on success, or `null` if the value
 * is absent, non-string, or does not match the expected format.
 *
 * This is the **only** phone-validation function in the checkout module.
 * Do not add a second one; extend this if requirements change.
 *
 * @example
 *   const phone = toE164UsPhone(rawInput);
 *   if (phone === null) { // show error }
 *   // phone is E164UsPhone — safe to pass to GuestCheckoutInput
 */
export function toE164UsPhone(value: unknown): E164UsPhone | null {
  if (typeof value !== 'string') return null;
  // +1, area code 2–9, exactly 9 more digits → 12 characters total.
  return /^\+1[2-9]\d{9}$/.test(value) ? (value as E164UsPhone) : null;
}

// ─── Outbound: items sent to all checkout functions ───────────────────────────

export interface CheckoutModifierWirePayload {
  readonly id:       string;
  readonly group_id: string;
}

export interface CheckoutItemWirePayload {
  readonly id:        string;
  readonly quantity:  number;
  readonly notes?:    string;
  readonly modifiers: readonly CheckoutModifierWirePayload[];
}

// ─── Inbound: loyalty-account Edge Function response ─────────────────────────

export interface LoyaltyAccountPayload {
  readonly id:             string;
  readonly balance:        number;
  readonly last_redeem_at: string | null | undefined;
}

export interface LoyaltyAccountFunctionResponse {
  readonly ok:       boolean;
  readonly account?: LoyaltyAccountPayload;
}