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
// =============================================================================

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