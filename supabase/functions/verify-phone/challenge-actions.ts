// supabase/functions/verify-phone/challenge-actions.ts
// =============================================================================
// Challenge token issuance for the pre-checkout OTP gate.
//
// CHANGE IN THIS VERSION:
//
//   [FIX] IssueChallengeResult success branch now uses snake_case key
//         `challenge_token` (was camelCase `challengeToken`).
//
//         The frontend contract in challengeClient.ts reads:
//           return { ok: true, challengeToken: data.challenge_token };
//         The backend was returning:
//           return { ok: true, challengeToken }
//         causing data.challenge_token to be undefined. The retry body then
//         omitted the challenge_token field entirely, producing an infinite
//         challenge loop with no user-visible error.
//
//         Fix: change both the IssueChallengeResult type and the return
//         statement to use `challenge_token`. This is the only change.
//
// All other logic — OTP verification, HMAC signing, DB insertion, TTL,
// identity key validation — is unchanged.
//
// Flow:
//   1. Verify OTP code via Twilio Verify
//   2. Sign nonce:identityKey with CHECKOUT_CHALLENGE_SECRET
//   3. Insert checkout_challenges row (nonce + identity binding + TTL)
//   4. Return challenge_token to client
//
// ENV VARIABLES REQUIRED:
//   CHECKOUT_CHALLENGE_SECRET — must match create-checkout/challenge-token.ts
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { signHmac }            from '../_shared/crypto.ts';
import {
  checkVerifyOtp,
  normalizePhone,
  type TwilioEnv,
} from '../_shared/twilio.ts';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface IssueChallengeTokenArgs {
  body:      Record<string, unknown>;
  db:        SupabaseClient;
  twilioEnv: TwilioEnv;
  log:       (outcome: string, action: string, detail: Record<string, unknown>) => void;
}

// [FIX] snake_case `challenge_token` matches the frontend wire contract.
// challengeClient.ts reads: data.challenge_token
// index.ts serialises: { ok: true, challenge_token: result.challenge_token }
export type IssueChallengeResult =
  | { ok: true;  challenge_token: string }
  | { ok: false; httpStatus: number; error: string; valid?: boolean };

const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function issueChallengeToken(
  args: IssueChallengeTokenArgs,
): Promise<IssueChallengeResult> {
  const { body, db, twilioEnv, log } = args;

  // ── Validate inputs ────────────────────────────────────────────────────────

  const rawPhone   = typeof body.phone === 'string' ? body.phone : '';
  const normalized = normalizePhone(rawPhone);
  if (!normalized) {
    return { ok: false, httpStatus: 400, error: 'Invalid phone number.' };
  }

  const code = typeof body.code === 'string'
    ? body.code.replace(/\D/g, '').slice(0, 8)
    : '';
  if (!code) {
    return { ok: false, httpStatus: 400, error: 'Verification code is required.' };
  }

  const nonce = typeof body.nonce === 'string' && body.nonce.trim().length >= 8
    ? body.nonce.trim()
    : null;
  if (!nonce) {
    return { ok: false, httpStatus: 400, error: 'nonce is required (min 8 characters).' };
  }

  // identity_key is SHA-256(userId) or SHA-256(guestEmail), pre-computed client-side
  // by buildCheckoutIdentityKey() in challengeClient.ts. The raw value is never sent
  // to the server. The hash is re-derived server-side during challenge verification
  // in create-checkout/challenge-token.ts and compared for identity binding.
  const identityKey = typeof body.identity_key === 'string'
    ? body.identity_key.trim()
    : '';
  if (!identityKey || identityKey.length < 64) {
    return {
      ok:         false,
      httpStatus: 400,
      error:      'identity_key is required (SHA-256 hex, 64 chars).',
    };
  }

  // ── Verify OTP via Twilio ──────────────────────────────────────────────────

  const otpResult = await checkVerifyOtp({ env: twilioEnv, to: normalized, code });

  if (!otpResult.ok) {
    log('failed', 'issue_challenge_token', {
      error:        otpResult.error,
      phone_suffix: normalized.slice(-4),
    });
    return { ok: false, httpStatus: 502, error: otpResult.error ?? 'OTP verification failed.' };
  }

  if (!otpResult.valid) {
    log('invalid_otp', 'issue_challenge_token', {
      phone_suffix: normalized.slice(-4),
    });
    return {
      ok:         false,
      valid:      false,
      httpStatus: 200,
      error:      'Incorrect code. Please try again.',
    };
  }

  // ── Sign and persist challenge token ───────────────────────────────────────

  const secret = Deno.env.get('CHECKOUT_CHALLENGE_SECRET');
  if (!secret || secret.length < 32) {
    log('error', 'issue_challenge_token', { detail: 'CHECKOUT_CHALLENGE_SECRET not set' });
    return { ok: false, httpStatus: 503, error: 'Service misconfigured. Please try again.' };
  }

  const signature      = await signHmac(`${nonce}:${identityKey}`, secret);
  const challengeToken = `${nonce}:${signature}`;
  const expiresAt      = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();

  const { error: insertError } = await db
    .from('checkout_challenges')
    .insert({
      nonce,
      phone_e164:   otpResult.normalizedPhone ?? normalized,
      identity_key: identityKey,
      expires_at:   expiresAt,
    });

  if (insertError) {
    // Most likely: duplicate nonce (client double-submitted). The client should
    // restart the challenge flow to obtain a fresh nonce.
    log('db_error', 'issue_challenge_token', {
      detail:       'checkout_challenges insert failed',
      error:        insertError.message,
      phone_suffix: normalized.slice(-4),
    });
    return {
      ok:         false,
      httpStatus: 500,
      error:      'Unable to issue checkout token. Please try again.',
    };
  }

  log('issued', 'issue_challenge_token', {
    nonce:        nonce.slice(0, 8),
    phone_suffix: normalized.slice(-4),
    expires_at:   expiresAt,
  });

  // [FIX] Use snake_case key to match the frontend wire contract.
  // challengeClient.ts: return { ok: true, challengeToken: data.challenge_token }
  return { ok: true, challenge_token: challengeToken };
}