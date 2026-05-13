// src/modules/checkout/hooks/useGuestCheckout.ts
// =============================================================================
// Guest checkout hook — calls `create-checkout-guest` with the `apikey` header
// and no Authorization header. Server owns the Stripe redirect URLs.
//
// CHANGES IN THIS VERSION:
//
//   [1] lastOtpChallengeRef preserves { nonce, expiresAt } during retrying.
//
//       otpChallenge was derived as:
//         phase.tag === 'otp_required' ? { nonce, expiresAt } : null
//
//       When onToken fires, retryWithChallengeToken dispatches RETRY, moving
//       phase to 'retrying'. otpChallenge became null. In CheckoutPage, the
//       modal mount condition is `showChallenge && otpChallenge`. During
//       'retrying', showChallenge is true (button stays unmounted) but
//       otpChallenge is null — the modal unmounts. The section goes blank for
//       the duration of the retry network call.
//
//       Fix: store the last issued challenge in lastOtpChallengeRef. Derive
//       otpChallenge as non-null for both 'otp_required' and 'retrying'.
//       Clear the ref on RESET (successful checkout) so it doesn't leak into
//       a subsequent unrelated checkout attempt.
//
//   [2] TS2531 fix — data null narrowing in fetchGuestCheckout.
//       Extended the URL guard: `if (!url || data === null)` so TypeScript
//       narrows data to non-null for subsequent property accesses.
//
// All other logic, security boundaries, and phase machine behavior
// are unchanged.
// =============================================================================

import { useReducer, useCallback, useRef } from 'react';
import { env } from '@/lib/config/env';
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

async function fetchGuestCheckout(
  body: Record<string, unknown>,
): Promise<RawCheckoutResponse> {
  const response = await fetch(
    `${env.supabase.url.replace(/\/+$/u, '')}/functions/v1/${GUEST_CHECKOUT_ENDPOINT}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.supabase.publishableKey,
        'x-application-name': env.app.name,
      },
      body: JSON.stringify(body),
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
  const envelope = isRecord(json) ? json : null;
  const data: Record<string, unknown> | null = envelope !== null
    ? (isRecord(envelope['data']) ? envelope['data'] : envelope)
    : null;

  const url = typeof data?.['url'] === 'string' ? data['url'] : null;

  // `|| data === null` added: TypeScript does not bridge the null correlation
  // between `data` and `url` across separate variable bindings. This guard
  // narrows data to Record<string, unknown> for all accesses below.
  if (!url || data === null) {
    return { kind: 'error', message: 'Invalid checkout response: missing URL.', code: 'invalid_response' };
  }

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

  const pendingInputRef     = useRef<GuestCheckoutInput | null>(null);
  const cartItems           = useCartStore((s) => s.items);

  // [FIX 1] lastOtpChallengeRef: retains the last { nonce, expiresAt } so
  // otpChallenge remains non-null during the 'retrying' phase. Without this,
  // phase → 'retrying' sets otpChallenge to null and the modal unmounts
  // mid-flight, leaving the section blank until the network call resolves.
  const lastOtpChallengeRef = useRef<{ nonce: string; expiresAt: string } | null>(null);

  const handleRawResponse = useCallback(
    (raw: RawCheckoutResponse): CheckoutResult => {
      switch (raw.kind) {
        case 'success': {
          if (raw.guestToken) storeGuestToken(raw.guestToken);
          lastOtpChallengeRef.current = null;  // [FIX 1] clear on successful checkout
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
          // [FIX 1] Persist before dispatch so the ref is populated when
          // the 'retrying' phase renders and needs otpChallenge non-null.
          lastOtpChallengeRef.current = { nonce: raw.nonce, expiresAt: raw.expiresAt };
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
      // lastOtpChallengeRef.current is still set from the prior OTP_REQUIRED
      // dispatch, so otpChallenge remains non-null during this network call.

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

  const clearError = useCallback(() => {
    lastOtpChallengeRef.current = null;
    dispatch({ type: 'RESET' });
  }, []);

  const isLoading = phase.tag === 'initiating' || phase.tag === 'retrying';
  const error     = phase.tag === 'error' ? phase.message : null;

  // [FIX 1] Preserve otpChallenge across the 'retrying' transition.
  // During 'retrying', the ref holds the challenge from the prior 'otp_required'
  // phase, keeping the modal mounted and visible while the retry is in flight.
  // Returns null for all other phases (idle, initiating, blocked, error).
  const otpChallenge: { nonce: string; expiresAt: string } | null =
    phase.tag === 'otp_required'
      ? { nonce: phase.nonce, expiresAt: phase.expiresAt }
      : phase.tag === 'retrying'
        ? lastOtpChallengeRef.current
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