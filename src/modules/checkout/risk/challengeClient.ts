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
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';
import type {
  SendOtpResponse,
  IssueChallengeTokenResponse,
} from '../types/otp.types';

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
    const { data, error } = await supabase.functions.invoke<SendOtpResponse>(
      'verify-phone',
      { body: { action: 'send', phone } },
    );

    if (error || !data?.ok) {
      return { ok: false, error: data?.error ?? error?.message ?? 'Failed to send code.' };
    }

    return {
      ok:             true,
      normalizedPhone: data.normalizedPhone ?? phone,
    };
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
    const { data, error } = await supabase.functions.invoke<IssueChallengeTokenResponse>(
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
      return { ok: false, error: error.message ?? 'Verification failed.' };
    }

    if (!data) {
      return { ok: false, error: 'No response from verification service.' };
    }

    if (!data.ok) {
      // Type narrowing: if valid === false the code was wrong; otherwise it's
      // a service-level error.
      if ('valid' in data && data.valid === false) {
        return { ok: false, valid: false, error: data.error ?? 'Incorrect code.' };
      }
      return { ok: false, error: data.error ?? 'Unable to verify code.' };
    }

    return { ok: true, challengeToken: data.challenge_token };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error.' };
  }
}