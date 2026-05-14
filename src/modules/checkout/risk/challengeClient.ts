// src/modules/checkout/risk/challengeClient.ts
// =============================================================================
// API transport for the OTP challenge flow.
//
// Responsibility:
//   • Sends OTP to a phone number via verify-phone/send
//   • Exchanges a valid OTP code for a challenge_token via
//     verify-phone/issue_challenge_token
//
// This module owns NO state and has NO React dependencies.
// It is consumed by CheckoutChallengeModal.tsx and useCheckoutRouter.ts.
//
// Identity key:
//   The identity_key is SHA-256(userId) for auth users or SHA-256(email)
//   for guests. It is derived here (browser SubtleCrypto) and sent to
//   the server so the challenge token can be identity-bound without the
//   server needing access to the raw userId/email at issuance time.
//
// CHANGES FROM PRIOR VERSION:
//
//   Removed invoke<SendOtpResponse> / invoke<IssueChallengeTokenResponse>
//   generic assertions and otp.types imports.
//
//   Supabase function responses must be treated as `unknown` at the boundary:
//   the generic parameter on invoke<T>() asserts a type without runtime
//   validation, so if the Edge Function changes its response shape, the
//   assertion silently lies. Additionally, in some @supabase/supabase-js
//   versions the error type is broad enough that `error?.message` triggers
//   @typescript-eslint/no-unsafe-member-access.
//
//   Fix: declare `data: unknown` and use the local isRecord() guard before
//   every property access. Error messages are extracted via `instanceof Error`
//   which is safe regardless of the Supabase client version.
//
//   The public function signatures and return types are unchanged.
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';

// ─── Internal: safe record narrowing ─────────────────────────────────────────
//
// Defined locally because challengeClient is in risk/ and must not pull in
// checkout domain types. isRecord is 3 lines — no shared dependency needed.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── Internal: safe string from invoke error ──────────────────────────────────
//
// supabase.functions.invoke() error is typed as FunctionsHttpError |
// FunctionsRelayError | FunctionsFetchError | null in current supabase-js,
// but in older versions or when the type widens, `error.message` can be typed
// as `any`. `instanceof Error` is the version-agnostic safe path.

function invokeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// ─── Identity key ─────────────────────────────────────────────────────────────

/**
 * Derives a stable identity key for challenge token binding.
 * Auth users: SHA-256(userId). Guests: SHA-256(lowercased email).
 *
 * Returns an empty string if neither input is available — the server will
 * reject the issuance request in that case (400 identity_key required).
 */
export async function buildCheckoutIdentityKey(
  userId: string | null,
  guestEmail: string | null,
): Promise<string> {
  const raw =
    (userId && userId !== 'guest' ? userId : null) ??
    guestEmail?.toLowerCase().trim() ??
    '';

  if (!raw) return '';

  const data = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── OTP send ─────────────────────────────────────────────────────────────────

/**
 * Sends an OTP to `phone` via the verify-phone edge function.
 * Returns the backend-normalised phone (E.164) on success.
 */
export async function sendChallengeOtp(phone: string): Promise<
  | { ok: true; normalizedPhone: string }
  | { ok: false; error: string }
> {
  try {
    // Treat the response as unknown — narrowed before every property access.
    const { data: rawData, error } = await supabase.functions.invoke(
      'verify-phone',
      { body: { action: 'send', phone } },
    );

    if (error) {
      return { ok: false, error: invokeErrorMessage(error, 'Failed to send code.') };
    }

    const data: unknown = rawData;

    if (!isRecord(data) || data['ok'] !== true) {
      const serverError = isRecord(data) && typeof data['error'] === 'string'
        ? data['error']
        : null;
      return { ok: false, error: serverError ?? 'Failed to send code.' };
    }

    const normalizedPhone = typeof data['normalizedPhone'] === 'string'
      ? data['normalizedPhone']
      : phone;

    return { ok: true, normalizedPhone };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error.' };
  }
}

// ─── Challenge token issuance ─────────────────────────────────────────────────

/**
 * Verifies the OTP code and exchanges it for a checkout challenge_token.
 * The challenge_token is sent as `challenge_token` in the checkout retry.
 */
export async function issueChallengeToken(args: {
  phone:        string;   // canonical E.164 from sendChallengeOtp
  code:         string;   // OTP digits
  nonce:        string;   // from OtpChallengePayload.nonce (returned by create-checkout)
  identityKey:  string;   // from buildCheckoutIdentityKey()
}): Promise<
  | { ok: true;  challengeToken: string }
  | { ok: false; valid: false; error: string }
  | { ok: false; error: string }
> {
  try {
    // Treat the response as unknown — narrowed before every property access.
    const { data: rawData, error } = await supabase.functions.invoke(
      'verify-phone',
      {
        body: {
          action:       'issue_challenge_token',
          phone:        args.phone,
          code:         args.code.replace(/\D/g, ''),
          nonce:        args.nonce,
          identity_key: args.identityKey,
        },
      },
    );

    if (error) {
      return { ok: false, error: invokeErrorMessage(error, 'Verification failed.') };
    }

    const data: unknown = rawData;

    if (!isRecord(data)) {
      return { ok: false, error: 'No response from verification service.' };
    }

    if (data['ok'] !== true) {
      // If valid === false, the OTP code itself was wrong.
      if (data['valid'] === false) {
        const errorMessage = typeof data['error'] === 'string'
          ? data['error']
          : 'Incorrect code.';
        return { ok: false, valid: false, error: errorMessage };
      }
      // Otherwise it is a service-level error.
      const errorMessage = typeof data['error'] === 'string'
        ? data['error']
        : 'Unable to verify code.';
      return { ok: false, error: errorMessage };
    }

    const challengeToken = typeof data['challenge_token'] === 'string'
      ? data['challenge_token']
      : null;

    if (!challengeToken) {
      return { ok: false, error: 'Verification service returned an invalid token.' };
    }

    return { ok: true, challengeToken };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error.' };
  }
}