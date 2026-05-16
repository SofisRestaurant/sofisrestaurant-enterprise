// src/modules/checkout/types/checkout-wire.types.ts
// =============================================================================
// CHECKOUT WIRE PAYLOAD TYPES
// =============================================================================
// Canonical DTOs for checkout-related Edge Function requests and responses.
//
// Rules:
// - No `any`.
// - No generated Supabase DB types.
// - No property access on unvalidated unknown.
// - Runtime parsing should narrow unknown → records before reading fields.
// - Wire keys stay explicit and stable.
// =============================================================================

// ─── Unknown narrowing helpers ────────────────────────────────────────────────

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function readString(value: Record<string, unknown>, key: string): string | undefined {
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

export function readNumber(value: Record<string, unknown>, key: string): number | undefined {
  const candidate = value[key];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined;
}

export function readBoolean(value: Record<string, unknown>, key: string): boolean | undefined {
  const candidate = value[key];
  return typeof candidate === 'boolean' ? candidate : undefined;
}

// ─── Stripe Checkout UI mode ─────────────────────────────────────────────────
//
// Mirrors server union in:
// supabase/functions/_shared/checkout-ui-mode.ts

export type CheckoutUiMode = 'hosted' | 'embedded';

export const DEFAULT_CHECKOUT_UI_MODE: CheckoutUiMode = 'hosted';

export function isCheckoutUiMode(value: unknown): value is CheckoutUiMode {
  return value === 'hosted' || value === 'embedded';
}

export function readCheckoutUiModeFromEnv(): CheckoutUiMode {
  const raw = import.meta.env.VITE_CHECKOUT_UI_MODE;
  return raw === 'embedded' ? 'embedded' : DEFAULT_CHECKOUT_UI_MODE;
}

// ─── E.164 US phone — branded type ────────────────────────────────────────────
//
// The brand symbol is module-private, so outside files cannot construct this
// type directly. They must use toE164UsPhone().

declare const e164UsPhoneBrand: unique symbol;

export type E164UsPhone = string & {
  readonly [e164UsPhoneBrand]: true;
};

export function toE164UsPhone(value: unknown): E164UsPhone | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim();

  // +1, area code first digit 2–9, followed by 9 digits.
  return /^\+1[2-9]\d{9}$/.test(normalized) ? (normalized as E164UsPhone) : null;
}

// ─── Money / pricing primitives ───────────────────────────────────────────────

export type CurrencyCode = 'usd' | 'USD' | string;

export interface CheckoutPricingResponse {
  readonly currency?: CurrencyCode;
  readonly subtotalCents?: number;
  readonly taxCents?: number;
  readonly totalCents?: number;
  readonly promoDiscountCents?: number;
  readonly campaignDiscountCents?: number;
  readonly creditCents?: number;
  readonly loyaltyDiscountCents?: number;
  readonly appliedCampaignIds?: readonly string[];
}

export function parseCheckoutPricingResponse(value: unknown): CheckoutPricingResponse | undefined {
  if (!isRecord(value)) return undefined;

  const appliedCampaignIdsRaw = value.appliedCampaignIds;

  return {
    currency: readString(value, 'currency'),
    subtotalCents: readNumber(value, 'subtotalCents'),
    taxCents: readNumber(value, 'taxCents'),
    totalCents: readNumber(value, 'totalCents'),
    promoDiscountCents: readNumber(value, 'promoDiscountCents'),
    campaignDiscountCents: readNumber(value, 'campaignDiscountCents'),
    creditCents: readNumber(value, 'creditCents'),
    loyaltyDiscountCents: readNumber(value, 'loyaltyDiscountCents'),
    appliedCampaignIds: Array.isArray(appliedCampaignIdsRaw)
      ? appliedCampaignIdsRaw.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

// ─── Outbound: cart items sent to checkout functions ──────────────────────────

export interface CheckoutModifierWirePayload {
  readonly id: string;
  readonly group_id: string;
}

export interface CheckoutItemWirePayload {
  readonly id: string;
  readonly quantity: number;
  readonly notes?: string;
  readonly modifiers: readonly CheckoutModifierWirePayload[];
}

// ─── Outbound: auth checkout request body fragment ────────────────────────────

export interface AuthCheckoutWirePayload {
  readonly order_type?: string;
  readonly notes?: string | null;
  readonly pickup_time?: string | null;
  readonly promo_code?: string;
  readonly promo_id?: string;
  readonly credit_id?: string;
  readonly success_url?: string;
  readonly cancel_url?: string;
  readonly client_integrity_hash?: string;
  readonly loyalty_redeem_points?: number;
  readonly loyalty_reward_id?: string;
  readonly loyalty_redemption_id?: string;
  readonly loyalty_account_id?: string;
  readonly sms_phone_e164?: E164UsPhone;
  readonly sms_opt_in?: boolean;
  readonly ui_mode?: CheckoutUiMode;
}

// ─── Outbound: guest checkout request body fragment ───────────────────────────

export interface GuestCheckoutWirePayload {
  readonly guest_email: string;
  readonly order_type?: string;
  readonly notes?: string | null;
  readonly pickup_time?: string | null;
  readonly guest_phone_e164?: E164UsPhone;
  readonly guest_sms_opt_in?: boolean;
  readonly ui_mode?: CheckoutUiMode;
}

// ─── Inbound: create-checkout / create-checkout-guest success ─────────────────

export interface CheckoutSessionResponse {
  readonly ok: true;
  readonly sessionId?: string;
  readonly pricingHash?: string;
  readonly pricing?: CheckoutPricingResponse;
  readonly uiMode?: CheckoutUiMode;

  // Hosted Checkout only.
  readonly url?: string;

  // Embedded Checkout only.
  readonly clientSecret?: string;
}

export function parseCheckoutSessionResponse(value: unknown): CheckoutSessionResponse | null {
  const envelope = isRecord(value) && isRecord(value.data) ? value.data : value;

  if (!isRecord(envelope)) return null;

  const ok = envelope.ok;
  const code = readString(envelope, 'code');

  // Your Edge helper may return either:
  // 1. { ok: true, data: {...} }
  // 2. { code: "checkout_session_created", data: {...} }
  // 3. direct {...}
  //
  // This parser accepts the successful session payload shape, not only one
  // envelope style.
  const hasSuccessCode =
    code === 'checkout_session_created' || code === 'checkout_session_reused';

  const hasTransport =
    typeof envelope.url === 'string' || typeof envelope.clientSecret === 'string';

  if (ok !== true && !hasSuccessCode && !hasTransport) {
    return null;
  }

  const rawUiMode = envelope.uiMode;
  const uiMode = isCheckoutUiMode(rawUiMode) ? rawUiMode : undefined;

  return {
    ok: true,
    sessionId: readString(envelope, 'sessionId'),
    pricingHash: readString(envelope, 'pricingHash'),
    pricing: parseCheckoutPricingResponse(envelope.pricing),
    uiMode,
    url: readString(envelope, 'url'),
    clientSecret: readString(envelope, 'clientSecret'),
  };
}

// ─── Inbound: checkout failure envelope ───────────────────────────────────────

export interface CheckoutErrorResponse {
  readonly ok: false;
  readonly code?: string | null;
  readonly error?: string;
  readonly message?: string;
  readonly requestId?: string;
  readonly retryAfter?: number;
}

export function parseCheckoutErrorResponse(value: unknown): CheckoutErrorResponse | null {
  if (!isRecord(value)) return null;

  const ok = value.ok;
  if (ok !== false && typeof value.code !== 'string' && typeof value.error !== 'string') {
    return null;
  }

  return {
    ok: false,
    code: readString(value, 'code') ?? null,
    error: readString(value, 'error'),
    message: readString(value, 'message'),
    requestId: readString(value, 'requestId'),
    retryAfter: readNumber(value, 'retryAfter'),
  };
}

// ─── Inbound: loyalty-account Edge Function response ─────────────────────────

export interface LoyaltyAccountPayload {
  readonly id: string;
  readonly balance: number;
  readonly last_redeem_at: string | null | undefined;
}

export interface LoyaltyAccountFunctionResponse {
  readonly ok: boolean;
  readonly account?: LoyaltyAccountPayload;
}

export function parseLoyaltyAccountFunctionResponse(
  value: unknown,
): LoyaltyAccountFunctionResponse | null {
  if (!isRecord(value)) return null;

  const ok = readBoolean(value, 'ok');
  if (ok === undefined) return null;

  const accountRaw = value.account;

  if (!isRecord(accountRaw)) {
    return { ok };
  }

  const id = readString(accountRaw, 'id');
  const balance = readNumber(accountRaw, 'balance');

  if (!id || balance === undefined) {
    return { ok };
  }

  const lastRedeemRaw = accountRaw.last_redeem_at;

  return {
    ok,
    account: {
      id,
      balance,
      last_redeem_at:
        typeof lastRedeemRaw === 'string' || lastRedeemRaw === null
          ? lastRedeemRaw
          : undefined,
    },
  };
}