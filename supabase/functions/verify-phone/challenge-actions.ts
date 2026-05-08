// supabase/functions/verify-phone/challenge-actions.ts
// =============================================================================
// CHANGES IN THIS VERSION:
//
//   [FIX 1] TwilioEnv → VerifyEnv.
//
//         The arg type was TwilioEnv (which requires fromNumber). This module
//         only calls checkVerifyOtp(), which uses the Verify API and does not
//         need fromNumber. Changed to VerifyEnv so the function compiles with
//         the narrower env loaded by getVerifyEnv() in the parent handler.
//
//   [FIX 2] Idempotent insert — safe under retry and double-click.
//
//         The previous implementation did a blind INSERT INTO checkout_challenges.
//         If a network timeout caused the client to retry, the second insert hit
//         the UNIQUE constraint on (nonce), returning 500 "Unable to issue checkout
//         token." The client had no token even though one was already issued.
//
//         Fix: before inserting, check for an existing non-consumed, non-expired
//         row with the same nonce AND matching identity_key. If found, reconstruct
//         the challenge token (nonce + HMAC recomputed from stored data) and
//         return it. This makes token issuance safe under any retry pattern.
//
//         Security: the identity_key check prevents a different caller from
//         reclaiming a nonce that was issued to a different user. If nonce exists
//         but identity_key doesn't match, reject (400 nonce already in use).
//
//   [FIX 3] snake_case return key — preserved from prior session.
//
//         Returns { ok: true, challenge_token } (snake_case) to match the
//         frontend contract: data.challenge_token in challengeClient.ts.
//
// All other logic (OTP verification, HMAC signing, TTL) is unchanged.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { signHmac }            from '../_shared/crypto.ts';
import {
  checkVerifyOtp,
  normalizePhone,
  type VerifyEnv,          // [FIX 1] VerifyEnv, not TwilioEnv
} from '../_shared/twilio.ts';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface IssueChallengeTokenArgs {
  body:      Record<string, unknown>;
  db:        SupabaseClient;
  twilioEnv: VerifyEnv;    // [FIX 1]
  log:       (outcome: string, action: string, detail: Record<string, unknown>) => void;
}

export type IssueChallengeResult =
  | { ok: true;  challenge_token: string }
  | { ok: false; httpStatus: number; error: string; valid?: boolean };

// ─── Constants ────────────────────────────────────────────────────────────────

const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── Typed DB accessor (checkout_challenges not yet in generated types) ───────
//
// Remove this block and use db.from('checkout_challenges') directly once
// `supabase gen types typescript` is run after migration 20260505000000.

interface CheckoutChallengeRow {
  nonce:        string;
  identity_key: string;
  expires_at:   string;
  consumed_at:  string | null;
}

interface ChallengeQueryBuilder extends
  PromiseLike<{ data: unknown; error: { message: string } | null }>
{
  select(cols: string): ChallengeQueryBuilder;
  insert(values: Record<string, unknown>): ChallengeQueryBuilder;
  eq(col: string, val: unknown): ChallengeQueryBuilder;
  is(col: string, val: null): ChallengeQueryBuilder;
  gt(col: string, val: unknown): ChallengeQueryBuilder;
  maybeSingle(): ChallengeQueryBuilder;
}

function fromChallenges(db: SupabaseClient): ChallengeQueryBuilder {
  return (db as unknown as { from(t: string): ChallengeQueryBuilder }).from('checkout_challenges');
}

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

  // ── Secret — load before Twilio call so misconfigured deployments fail fast ─

  const secret = Deno.env.get('CHECKOUT_CHALLENGE_SECRET');
  if (!secret || secret.length < 32) {
    log('error', 'issue_challenge_token', { detail: 'CHECKOUT_CHALLENGE_SECRET not set or too short' });
    return { ok: false, httpStatus: 503, error: 'Service misconfigured. Please try again.' };
  }

  // ── [FIX 2] Idempotency check ──────────────────────────────────────────────
  //
  // Look for a non-consumed, non-expired row with this nonce. This covers:
  //   - Client retry after network timeout (first request succeeded, response lost)
  //   - Double-click / duplicate form submission
  //
  // If found and identity_key matches: reconstruct and return the same token.
  // If found and identity_key mismatches: reject (security — different caller).
  // If not found: proceed to OTP verification and insert.

  const now = new Date().toISOString();

  const { data: existingRaw, error: selectError } = (await fromChallenges(db)
    .select('nonce, identity_key, expires_at, consumed_at')
    .eq('nonce', nonce)
    .is('consumed_at', null)
    .gt('expires_at', now)
    .maybeSingle()) as {
      data:  CheckoutChallengeRow | null;
      error: { message: string } | null;
    };

  if (selectError) {
    log('db_warn', 'issue_challenge_token', {
      detail:       'idempotency_select_failed',
      error:        selectError.message,
      nonce:        nonce.slice(0, 8),
      phone_suffix: normalized.slice(-4),
    });
    // Treat select failure as "not found" — fall through to OTP + insert.
  }

  if (existingRaw !== null && !selectError) {
    if (existingRaw.identity_key !== identityKey) {
      log('warn', 'issue_challenge_token', {
        detail:       'nonce_identity_mismatch_on_replay',
        nonce:        nonce.slice(0, 8),
        phone_suffix: normalized.slice(-4),
      });
      return { ok: false, httpStatus: 400, error: 'nonce already in use.' };
    }

    // Same nonce + same identity = idempotent return.
    // OTP was already verified when this row was created; no need to re-verify.
    const sig = await signHmac(`${nonce}:${identityKey}`, secret);
    log('idempotent_return', 'issue_challenge_token', {
      nonce:        nonce.slice(0, 8),
      phone_suffix: normalized.slice(-4),
    });
    return { ok: true, challenge_token: `${nonce}:${sig}` };
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
    log('invalid_otp', 'issue_challenge_token', { phone_suffix: normalized.slice(-4) });
    return {
      ok:         false,
      valid:      false,
      httpStatus: 200,
      error:      'Incorrect code. Please try again.',
    };
  }

  // ── Sign and persist ───────────────────────────────────────────────────────

  const signature      = await signHmac(`${nonce}:${identityKey}`, secret);
  const challengeToken = `${nonce}:${signature}`;
  const expiresAt      = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();

  const { error: insertError } = await fromChallenges(db)
    .insert({
      nonce,
      phone_e164:   otpResult.normalizedPhone ?? normalized,
      identity_key: identityKey,
      expires_at:   expiresAt,
    }) as { error: { message: string } | null };

  if (insertError) {
    // Unique constraint on nonce fired between the SELECT and INSERT (race window).
    // Another concurrent request completed the insert. Reconstruct the token and
    // return it — the OTP was valid so the caller deserves the token.
    if (insertError.message?.includes('unique') || insertError.message?.includes('duplicate')) {
      log('race_idempotent', 'issue_challenge_token', {
        detail:       'concurrent_insert_won_reconstructing_token',
        nonce:        nonce.slice(0, 8),
        phone_suffix: normalized.slice(-4),
      });
      return { ok: true, challenge_token: challengeToken };
    }

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

  return { ok: true, challenge_token: challengeToken };
}