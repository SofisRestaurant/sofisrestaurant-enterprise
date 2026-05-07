// src/modules/checkout/hooks/useGuestCheckout.ts
// =============================================================================
// Guest checkout hook — calls `create-checkout-guest` with the `apikey` header
// and no Authorization header. Server owns the Stripe redirect URLs.
//
// CHANGES IN THIS VERSION:
//
//   [1] TS2531 fix — data null narrowing in fetchGuestCheckout.
//
//       data is typed Record<string, unknown> | null. After the previous
//       `if (!url) { return error; }` guard, TypeScript did not narrow data
//       to non-null. The correlation between url being falsy (null) and data
//       being null is expressed through separate variable derivations:
//
//         const url = typeof data?.['url'] === 'string' ? data['url'] : null;
//
//       TypeScript's control flow analysis does not bridge two separate
//       variables derived from a common null source. data remained
//       Record<string, unknown> | null after the url check, so every
//       subsequent data['sessionId'] access was TS2531.
//
//       Fix: extend the guard to explicitly include data:
//
//         if (!url || data === null) { return error; }
//
//       After this line, TypeScript knows both that url: string and that
//       data: Record<string, unknown>. All subsequent property accesses
//       on data are safe.
//
//       Why this is semantically correct: if data is null, url is null
//       (since url = data?.['url'] and ?. evaluates to undefined on null,
//       typeof undefined !== 'string', so url = null). Adding data === null
//       to the guard is therefore logically equivalent at runtime — it
//       surfaces the implicit correlation explicitly for the type checker.
//
// All other logic, security boundaries, and phase machine behavior
// are unchanged from the prior version.
// =============================================================================

import { useReducer, useCallback, useRef } from 'react';
import { useCartStore } from '@/modules/cart/store/cart.store';
import { mapCheckoutError } from '@/modules/checkout/errors/mapCheckoutError';
import {
  isRecord,
  parseCheckoutPricingResponse,
  serialiseGuestCheckoutInput,
  type CheckoutPricingResponse,
  type CheckoutResult,
  type CheckoutResultBlocked,
  type CheckoutResultFailure,
  type CheckoutResultOtpRequired,
  type CheckoutResultSuccess,
  type GuestCheckoutInput,
} from '../types/checkout.types';

// ─── Constants ────────────────────────────────────────────────────────────────

const GUEST_TOKEN_STORAGE_KEY = 'checkout_guest_token';
const GUEST_CHECKOUT_ENDPOINT = 'create-checkout-guest';

const FORBIDDEN_FIELDS = [
  'promo_code',
  'promo_id',
  'credit_id',
  'loyalty_redeem_points',
  'loyalty_reward_id',
  'loyalty_redemption_id',
  'loyalty_account_id',
  'client_integrity_hash',
] as const;

// ─── Phase machine ────────────────────────────────────────────────────────────

export type GuestCheckoutPhase =
  | { tag: 'idle' }
  | { tag: 'initiating' }
  | { tag: 'otp_required'; nonce: string; expiresAt: string }
  | { tag: 'retrying' }
  | { tag: 'blocked' }
  | { tag: 'error'; message: string; code: string | null; recoverable: boolean };

type PhaseAction =
  | { type: 'INITIATE' }
  | { type: 'OTP_REQUIRED'; nonce: string; expiresAt: string }
  | { type: 'RETRY' }
  | { type: 'BLOCKED' }
  | { type: 'ERROR'; message: string; code: string | null; recoverable: boolean }
  | { type: 'RESET' };

const IDLE: GuestCheckoutPhase = { tag: 'idle' };

function phaseReducer(state: GuestCheckoutPhase, action: PhaseAction): GuestCheckoutPhase {
  switch (action.type) {
    case 'INITIATE':     return { tag: 'initiating' };
    case 'OTP_REQUIRED': return { tag: 'otp_required', nonce: action.nonce, expiresAt: action.expiresAt };
    case 'RETRY':        return { tag: 'retrying' };
    case 'BLOCKED':      return { tag: 'blocked' };
    case 'ERROR':        return { tag: 'error', message: action.message, code: action.code, recoverable: action.recoverable };
    case 'RESET':        return IDLE;
  }
}

// ─── Internal API response type ───────────────────────────────────────────────

type RawCheckoutResponse =
  | {
      readonly kind:         'success';
      readonly url:          string;
      readonly sessionId?:   string;
      readonly pricingHash?: string;
      readonly pricing?:     CheckoutPricingResponse;
      readonly guestToken?:  string;
    }
  | {
      readonly kind:      'otp_required';
      readonly nonce:     string;
      readonly expiresAt: string;
      readonly message:   string;
    }
  | {
      readonly kind:    'blocked';
      readonly message: string;
    }
  | {
      readonly kind:    'error';
      readonly message: string;
      readonly code:    string | null;
    };

// ─── Return type ──────────────────────────────────────────────────────────────

export type UseGuestCheckoutReturn = {
  phase:        GuestCheckoutPhase;
  otpChallenge: { nonce: string; expiresAt: string } | null;
  isLoading:    boolean;
  error:        string | null;
  sessionUrl:   string | null;
  initiateGuestCheckout:   (input: GuestCheckoutInput) => Promise<CheckoutResult>;
  retryWithChallengeToken: (challengeToken: string)     => Promise<CheckoutResult>;
  clearError:              () => void;
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

function getStoredGuestToken(): string | null {
  try   { return sessionStorage.getItem(GUEST_TOKEN_STORAGE_KEY); }
  catch { return null; }
}

function storeGuestToken(token: string): void {
  try   { sessionStorage.setItem(GUEST_TOKEN_STORAGE_KEY, token); }
  catch { /* private browsing safe */ }
}

// ─── Request body builder ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildGuestRequestBody(
  cartItems:       unknown[],
  input:           GuestCheckoutInput,
  storedToken:     string | null,
  challengeToken?: string,
): Record<string, unknown> {
  const itemsPayload = cartItems.map((item: any) => ({
    id:       item.menuItemId ?? item.id,
    quantity: Number(item.quantity ?? 1),
    notes:    item.notes ?? undefined,
    modifiers: Array.isArray(item.modifiers)
      ? item.modifiers.map((m: any) => ({ id: String(m.id), group_id: String(m.groupId) }))
      : [],
  }));

  return {
    items: itemsPayload,
    ...serialiseGuestCheckoutInput(input),
    ...(storedToken    ? { guest_token:     storedToken    } : {}),
    ...(challengeToken ? { challenge_token: challengeToken } : {}),
  };
}

// ─── Endpoint invocation ──────────────────────────────────────────────────────
//
// FIX [1] — TS2531 is resolved by extending the URL guard to include data.
// See file-level comment for full explanation.

async function fetchGuestCheckout(
  body: Record<string, unknown>,
): Promise<RawCheckoutResponse> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!supabaseUrl || typeof supabaseUrl !== 'string' || supabaseUrl.length === 0) {
    console.error('[useGuestCheckout] VITE_SUPABASE_URL is missing');
    return { kind: 'error', message: 'Checkout is not configured. Please contact support.', code: 'config_error' };
  }

  if (!anonKey || typeof anonKey !== 'string' || anonKey.length === 0) {
    console.error('[useGuestCheckout] VITE_SUPABASE_ANON_KEY is missing');
    return { kind: 'error', message: 'Checkout is not configured. Please contact support.', code: 'config_error' };
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/${GUEST_CHECKOUT_ENDPOINT}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body:    JSON.stringify(body),
    },
  );

  const json: unknown = await response.json().catch(() => null);

  // ── otp_required: intercept before mapCheckoutError discards nonce ────────
  if (
    response.status === 403 &&
    isRecord(json) &&
    json['code'] === 'otp_required' &&
    typeof json['nonce']     === 'string' && json['nonce'].length > 0 &&
    typeof json['expiresAt'] === 'string' && json['expiresAt'].length > 0
  ) {
    return {
      kind:      'otp_required',
      nonce:     json['nonce'],
      expiresAt: json['expiresAt'],
      message:   typeof json['message'] === 'string'
        ? json['message']
        : 'Phone verification is required to complete this order.',
    };
  }

  // ── checkout_blocked: terminal ────────────────────────────────────────────
  if (
    response.status === 403 &&
    isRecord(json) &&
    json['code'] === 'checkout_blocked'
  ) {
    return {
      kind:    'blocked',
      message: typeof json['message'] === 'string'
        ? json['message']
        : 'This order could not be processed. Please contact support.',
    };
  }

  // ── All other errors ──────────────────────────────────────────────────────
  if (!response.ok) {
    const mapped = mapCheckoutError(isRecord(json) ? json : null, response);
    return { kind: 'error', message: mapped.message, code: mapped.code ?? null };
  }

  // ── Success ───────────────────────────────────────────────────────────────
  // Unwrap envelope: server sends { data: { url, ... } } or flat { url, ... }.
  const envelope = isRecord(json) ? json : null;
  const data: Record<string, unknown> | null = envelope !== null
    ? (isRecord(envelope['data']) ? envelope['data'] : envelope)
    : null;

  const url = typeof data?.['url'] === 'string' ? data['url'] : null;

  // FIX [1]: `|| data === null` added.
  //
  // Previous: `if (!url) { return error; }`
  // TypeScript did not narrow `data` to non-null after this guard because
  // the null state of `data` and the null state of `url` are expressed through
  // two separate variable bindings. Control flow analysis does not bridge them.
  //
  // After this extended guard, TypeScript narrows data from
  // `Record<string, unknown> | null` to `Record<string, unknown>`, making
  // all subsequent data[key] accesses TS2531-free.
  //
  // Runtime semantics are identical: if data is null, data?.['url'] is
  // undefined, url is null, and the guard fires regardless.
  if (!url || data === null) {
    return { kind: 'error', message: 'Invalid checkout response: missing URL.', code: 'invalid_response' };
  }

  // data: Record<string, unknown> — all accesses below are safe.
  return {
    kind:        'success',
    url,
    sessionId:   typeof data['sessionId']   === 'string' ? data['sessionId']   : undefined,
    pricingHash: typeof data['pricingHash'] === 'string' ? data['pricingHash'] : undefined,
    pricing:     parseCheckoutPricingResponse(data['pricing']),
    guestToken:  typeof data['guest_token'] === 'string' ? data['guest_token'] : undefined,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGuestCheckout(): UseGuestCheckoutReturn {
  const [phase, dispatch] = useReducer(phaseReducer, IDLE);

  const pendingInputRef = useRef<GuestCheckoutInput | null>(null);
  const cartItems       = useCartStore((s) => s.items);

  const handleRawResponse = useCallback(
    (raw: RawCheckoutResponse): CheckoutResult => {
      switch (raw.kind) {
        case 'success': {
          if (raw.guestToken) storeGuestToken(raw.guestToken);
          dispatch({ type: 'RESET' });
          const r: CheckoutResultSuccess = {
            ok:          true,
            url:         raw.url,
            sessionId:   raw.sessionId,
            pricingHash: raw.pricingHash,
            pricing:     raw.pricing,
          };
          return r;
        }

        case 'otp_required': {
          dispatch({ type: 'OTP_REQUIRED', nonce: raw.nonce, expiresAt: raw.expiresAt });
          const r: CheckoutResultOtpRequired = {
            ok:        false,
            code:      'otp_required',
            error:     raw.message,
            nonce:     raw.nonce,
            expiresAt: raw.expiresAt,
          };
          return r;
        }

        case 'blocked': {
          dispatch({ type: 'BLOCKED' });
          const r: CheckoutResultBlocked = {
            ok:    false,
            code:  'checkout_blocked',
            error: raw.message,
          };
          return r;
        }

        case 'error': {
          dispatch({
            type:        'ERROR',
            message:     raw.message,
            code:        raw.code,
            recoverable: raw.code !== 'config_error' && raw.code !== 'forbidden_field',
          });
          const r: CheckoutResultFailure = {
            ok:    false,
            error: raw.message,
            code:  raw.code,
          };
          return r;
        }
      }
    },
    [],
  );

  const initiateGuestCheckout = useCallback(
    async (input: GuestCheckoutInput): Promise<CheckoutResult> => {
      dispatch({ type: 'INITIATE' });
      pendingInputRef.current = input;

      const body = buildGuestRequestBody(cartItems, input, getStoredGuestToken());

      for (const field of FORBIDDEN_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          const msg = `BUG: forbidden field '${field}' in guest checkout request`;
          console.error(msg);
          dispatch({ type: 'ERROR', message: msg, code: 'forbidden_field', recoverable: false });
          const r: CheckoutResultFailure = { ok: false, error: msg, code: 'forbidden_field' };
          return r;
        }
      }

      try {
        return handleRawResponse(await fetchGuestCheckout(body));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Network error. Please try again.';
        dispatch({ type: 'ERROR', message, code: null, recoverable: true });
        const r: CheckoutResultFailure = { ok: false, error: message, code: null };
        return r;
      }
    },
    [cartItems, handleRawResponse],
  );

  const retryWithChallengeToken = useCallback(
    async (challengeToken: string): Promise<CheckoutResult> => {
      const input = pendingInputRef.current;

      if (!input) {
        const msg = 'Your session has expired. Please restart checkout.';
        dispatch({ type: 'ERROR', message: msg, code: 'session_expired', recoverable: false });
        const r: CheckoutResultFailure = { ok: false, error: msg, code: 'session_expired' };
        return r;
      }

      dispatch({ type: 'RETRY' });

      const body = buildGuestRequestBody(
        cartItems,
        input,
        getStoredGuestToken(),
        challengeToken,
      );

      try {
        return handleRawResponse(await fetchGuestCheckout(body));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Network error. Please try again.';
        dispatch({ type: 'ERROR', message, code: null, recoverable: true });
        const r: CheckoutResultFailure = { ok: false, error: message, code: null };
        return r;
      }
    },
    [cartItems, handleRawResponse],
  );

  const clearError = useCallback(() => dispatch({ type: 'RESET' }), []);

  const isLoading    = phase.tag === 'initiating' || phase.tag === 'retrying';
  const error        = phase.tag === 'error' ? phase.message : null;
  const otpChallenge = phase.tag === 'otp_required'
    ? { nonce: phase.nonce, expiresAt: phase.expiresAt }
    : null;

  return {
    phase,
    otpChallenge,
    isLoading,
    error,
    sessionUrl: null,
    initiateGuestCheckout,
    retryWithChallengeToken,
    clearError,
  };
}