// src/modules/checkout/hooks/useGuestCheckout.ts
// =============================================================================
// Guest checkout hook — calls `create-checkout-guest` with the `apikey` header
// and no Authorization header. Server owns Stripe session creation.
//
// CHANGES (2026-05 embedded checkout migration):
//   • Success response now supports BOTH hosted and embedded checkout:
//       - hosted:   url
//       - embedded: clientSecret
//   • RawCheckoutResponse carries url/clientSecret/uiMode.
//   • handleRawResponse returns clientSecret to CheckoutPage, allowing
//     <EmbeddedStripePayment /> to render.
//   • Missing-URL guard replaced with missing-transport guard.
//   • OTP challenge preservation kept.
//   • Guest token continuity kept.
//   • No `any`.
// =============================================================================

import { useReducer, useCallback, useRef } from 'react';
import { env } from '@/lib/config/env';
import { useCartStore } from '@/modules/cart/store/cart.store';
import { mapCheckoutError } from '@/modules/checkout/errors/mapCheckoutError';
import type { CartItem } from '@/modules/cart/types/cart.types';
import type {
  CheckoutItemWirePayload,
  CheckoutUiMode,
} from '../types/checkout-wire.types';
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
    case 'INITIATE':
      return { tag: 'initiating' };

    case 'OTP_REQUIRED':
      return {
        tag: 'otp_required',
        nonce: action.nonce,
        expiresAt: action.expiresAt,
      };

    case 'RETRY':
      return { tag: 'retrying' };

    case 'BLOCKED':
      return { tag: 'blocked' };

    case 'ERROR':
      return {
        tag: 'error',
        message: action.message,
        code: action.code,
        recoverable: action.recoverable,
      };

    case 'RESET':
      return IDLE;
  }
}

// ─── Internal API response type ───────────────────────────────────────────────

type RawCheckoutResponse =
  | {
      readonly kind: 'success';
      readonly url?: string;
      readonly clientSecret?: string;
      readonly uiMode?: CheckoutUiMode;
      readonly sessionId?: string;
      readonly pricingHash?: string;
      readonly pricing?: CheckoutPricingResponse;
      readonly guestToken?: string;
    }
  | {
      readonly kind: 'otp_required';
      readonly nonce: string;
      readonly expiresAt: string;
      readonly message: string;
    }
  | {
      readonly kind: 'blocked';
      readonly message: string;
    }
  | {
      readonly kind: 'error';
      readonly message: string;
      readonly code: string | null;
    };

// ─── Return type ──────────────────────────────────────────────────────────────

export type UseGuestCheckoutReturn = {
  phase: GuestCheckoutPhase;
  otpChallenge: { nonce: string; expiresAt: string } | null;
  isLoading: boolean;
  error: string | null;
  sessionUrl: string | null;
  initiateGuestCheckout: (input: GuestCheckoutInput) => Promise<CheckoutResult>;
  retryWithChallengeToken: (challengeToken: string) => Promise<CheckoutResult>;
  clearError: () => void;
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

function getStoredGuestToken(): string | null {
  try {
    return sessionStorage.getItem(GUEST_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeGuestToken(token: string): void {
  try {
    sessionStorage.setItem(GUEST_TOKEN_STORAGE_KEY, token);
  } catch {
    // Private browsing safe.
  }
}

// ─── Small parsers ────────────────────────────────────────────────────────────

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readUiMode(record: Record<string, unknown>): CheckoutUiMode | undefined {
  const value = record['uiMode'];
  return value === 'hosted' || value === 'embedded' ? value : undefined;
}

/**
 * Accepts both response shapes:
 *
 * 1. successResponse helper shape:
 *    { ok: true, code, requestId, url/clientSecret, ... }
 *
 * 2. nested shape:
 *    { ok: true, data: { url/clientSecret, ... } }
 */
function unwrapSuccessPayload(json: unknown): Record<string, unknown> | null {
  if (!isRecord(json)) return null;

  if (isRecord(json['data'])) {
    return json['data'];
  }

  return json;
}

/**
 * Some older guest endpoints may return flat error shapes while newer helpers
 * return nested error objects. This keeps OTP/block parsing compatible with both.
 */
function unwrapErrorPayload(json: unknown): Record<string, unknown> | null {
  if (!isRecord(json)) return null;

  if (isRecord(json['error'])) {
    return json['error'];
  }

  return json;
}

// ─── Request body builder ─────────────────────────────────────────────────────

function buildGuestRequestBody(
  cartItems: CartItem[],
  input: GuestCheckoutInput,
  storedToken: string | null,
  challengeToken?: string,
): Record<string, unknown> {
  const itemsPayload: CheckoutItemWirePayload[] = cartItems.map(
    (item): CheckoutItemWirePayload => ({
      id: item.menuItemId,
      quantity: item.quantity,
      notes: item.notes ?? undefined,
      modifiers: item.modifiers.map((modifier) => ({
        id: modifier.id,
        group_id: modifier.groupId,
      })),
    }),
  );

  return {
    items: itemsPayload,
    ...serialiseGuestCheckoutInput(input),
    ...(storedToken ? { guest_token: storedToken } : {}),
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
  const errorPayload = unwrapErrorPayload(json);

  // ── otp_required: intercept before mapCheckoutError discards nonce ────────
  if (
    response.status === 403 &&
    errorPayload !== null &&
    errorPayload['code'] === 'otp_required' &&
    typeof errorPayload['nonce'] === 'string' &&
    errorPayload['nonce'].length > 0 &&
    typeof errorPayload['expiresAt'] === 'string' &&
    errorPayload['expiresAt'].length > 0
  ) {
    return {
      kind: 'otp_required',
      nonce: errorPayload['nonce'],
      expiresAt: errorPayload['expiresAt'],
      message:
        typeof errorPayload['message'] === 'string'
          ? errorPayload['message']
          : 'Phone verification is required to complete this order.',
    };
  }

  // ── checkout_blocked: terminal ────────────────────────────────────────────
  if (
    response.status === 403 &&
    errorPayload !== null &&
    errorPayload['code'] === 'checkout_blocked'
  ) {
    return {
      kind: 'blocked',
      message:
        typeof errorPayload['message'] === 'string'
          ? errorPayload['message']
          : 'This order could not be processed. Please contact support.',
    };
  }

  // ── All other errors ──────────────────────────────────────────────────────
  if (!response.ok) {
    const mapped = mapCheckoutError(isRecord(json) ? json : null, response);
    return {
      kind: 'error',
      message: mapped.message,
      code: mapped.code ?? null,
    };
  }

  // ── Success: hosted OR embedded ───────────────────────────────────────────
  const data = unwrapSuccessPayload(json);

  if (data === null) {
    return {
      kind: 'error',
      message: 'Invalid checkout response.',
      code: 'invalid_response',
    };
  }

  const url = readString(data, 'url');
  const clientSecret = readString(data, 'clientSecret');

  if (!url && !clientSecret) {
    return {
      kind: 'error',
      message: 'Invalid checkout response: missing URL or client secret.',
      code: 'invalid_response',
    };
  }

  return {
    kind: 'success',
    url,
    clientSecret,
    uiMode: readUiMode(data),
    sessionId: readString(data, 'sessionId'),
    pricingHash: readString(data, 'pricingHash'),
    pricing: parseCheckoutPricingResponse(data['pricing']),
    guestToken: readString(data, 'guest_token'),
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGuestCheckout(): UseGuestCheckoutReturn {
  const [phase, dispatch] = useReducer(phaseReducer, IDLE);

  const pendingInputRef = useRef<GuestCheckoutInput | null>(null);
  const cartItems = useCartStore((state) => state.items);

  const lastOtpChallengeRef = useRef<{ nonce: string; expiresAt: string } | null>(null);

  const handleRawResponse = useCallback((raw: RawCheckoutResponse): CheckoutResult => {
    switch (raw.kind) {
      case 'success': {
        if (raw.guestToken) storeGuestToken(raw.guestToken);

        lastOtpChallengeRef.current = null;
        dispatch({ type: 'RESET' });

        const result: CheckoutResultSuccess = {
          ok: true,
          url: raw.url,
          clientSecret: raw.clientSecret,
          uiMode: raw.uiMode,
          sessionId: raw.sessionId,
          pricingHash: raw.pricingHash,
          pricing: raw.pricing,
        };

        return result;
      }

      case 'otp_required': {
        lastOtpChallengeRef.current = {
          nonce: raw.nonce,
          expiresAt: raw.expiresAt,
        };

        dispatch({
          type: 'OTP_REQUIRED',
          nonce: raw.nonce,
          expiresAt: raw.expiresAt,
        });

        const result: CheckoutResultOtpRequired = {
          ok: false,
          code: 'otp_required',
          error: raw.message,
          nonce: raw.nonce,
          expiresAt: raw.expiresAt,
        };

        return result;
      }

      case 'blocked': {
        dispatch({ type: 'BLOCKED' });

        const result: CheckoutResultBlocked = {
          ok: false,
          code: 'checkout_blocked',
          error: raw.message,
        };

        return result;
      }

      case 'error': {
        dispatch({
          type: 'ERROR',
          message: raw.message,
          code: raw.code,
          recoverable: raw.code !== 'config_error' && raw.code !== 'forbidden_field',
        });

        const result: CheckoutResultFailure = {
          ok: false,
          error: raw.message,
          code: raw.code,
        };

        return result;
      }
    }
  }, []);

  const initiateGuestCheckout = useCallback(
    async (input: GuestCheckoutInput): Promise<CheckoutResult> => {
      dispatch({ type: 'INITIATE' });
      pendingInputRef.current = input;

      const body = buildGuestRequestBody(cartItems, input, getStoredGuestToken());

      for (const field of FORBIDDEN_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          const message = `BUG: forbidden field '${field}' in guest checkout request`;

          dispatch({
            type: 'ERROR',
            message,
            code: 'forbidden_field',
            recoverable: false,
          });

          const result: CheckoutResultFailure = {
            ok: false,
            error: message,
            code: 'forbidden_field',
          };

          return result;
        }
      }

      try {
        return handleRawResponse(await fetchGuestCheckout(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Network error. Please try again.';

        dispatch({
          type: 'ERROR',
          message,
          code: null,
          recoverable: true,
        });

        const result: CheckoutResultFailure = {
          ok: false,
          error: message,
          code: null,
        };

        return result;
      }
    },
    [cartItems, handleRawResponse],
  );

  const retryWithChallengeToken = useCallback(
    async (challengeToken: string): Promise<CheckoutResult> => {
      const input = pendingInputRef.current;

      if (!input) {
        const message = 'Your session has expired. Please restart checkout.';

        dispatch({
          type: 'ERROR',
          message,
          code: 'session_expired',
          recoverable: false,
        });

        const result: CheckoutResultFailure = {
          ok: false,
          error: message,
          code: 'session_expired',
        };

        return result;
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
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Network error. Please try again.';

        dispatch({
          type: 'ERROR',
          message,
          code: null,
          recoverable: true,
        });

        const result: CheckoutResultFailure = {
          ok: false,
          error: message,
          code: null,
        };

        return result;
      }
    },
    [cartItems, handleRawResponse],
  );

  const clearError = useCallback(() => {
    lastOtpChallengeRef.current = null;
    dispatch({ type: 'RESET' });
  }, []);

  const isLoading = phase.tag === 'initiating' || phase.tag === 'retrying';
  const error = phase.tag === 'error' ? phase.message : null;

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