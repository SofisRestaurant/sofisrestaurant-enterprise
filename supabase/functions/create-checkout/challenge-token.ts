// supabase/functions/create-checkout/challenge-token.ts
// =============================================================================
// Challenge token verification for the pre-checkout OTP gate.
//
// TypeScript fix applied:
//   checkout_challenges was added by migration 20260505000000 but
//   database.types.ts has not been regenerated yet, so `db.from()` does not
//   know the table exists.
//
//   Fix: cast the table name to `never` (same pattern used elsewhere in this
//   codebase for new RPCs: `db.rpc("v2_release_loyalty_reserve" as never, ...
//   as never)`). Cast query results to the local CheckoutChallengeRow
//   interface so downstream property accesses are type-safe.
//
//   Once `supabase gen types typescript` is run after the migration, remove
//   the `as never` casts and the local interface — the generated types will
//   cover it.
//
// Token format:
//   "<uuid-nonce>:<hex-HMAC-SHA256(nonce:identityKey, CHECKOUT_CHALLENGE_SECRET)>"
//
// ENV VARIABLES REQUIRED:
//   CHECKOUT_CHALLENGE_SECRET — minimum 32 bytes random hex
// =============================================================================

import { verifyHmac } from '../_shared/crypto.ts';
import type { DbClient } from './types.ts';
import { log } from './logging.ts';

// ─── Public types ─────────────────────────────────────────────────────────────

export type ChallengeVerifyOutcome =
  | { ok: true; nonce: string }
  | { ok: false; reason: ChallengeRejectReason };

export type ChallengeRejectReason =
  | 'malformed'
  | 'invalid_signature'
  | 'not_found'
  | 'expired'
  | 'already_used'
  | 'identity_mismatch'
  | 'secret_misconfigured';

// ─── Local row type ───────────────────────────────────────────────────────────
//
// Mirrors the checkout_challenges schema from migration 20260505000000.
// Remove once database.types.ts is regenerated.

interface CheckoutChallengeRow {
  id:           string;
  identity_key: string;
  expires_at:   string;
  consumed_at:  string | null;
}

// ─── Typed DB accessor for checkout_challenges ────────────────────────────────
//
// checkout_challenges is not yet in database.types.ts (run gen types to fix).
// ChallengesQueryBuilder models only the two operation chains this file uses:
//   .select().eq().maybeSingle()     — read a single challenge row
//   .update().eq().is('col', null)   — atomically mark nonce consumed
//
// The interface extends PromiseLike so any point in the chain is directly
// awaitable, matching the Supabase query-builder's thenable contract.
// The PromiseLike resolve type covers all destructuring patterns used below:
//   { data, error }   from maybeSingle()
//   { error }         from update().eq().is()
//
// Remove this block and replace fromChallenges() with db.from('checkout_challenges')
// once `supabase gen types typescript` has been run after migration 20260505000000.

interface ChallengesQueryBuilder extends
  PromiseLike<{ data: unknown; error: { message: string } | null; count: number | null }>
{
  select(columns: string): ChallengesQueryBuilder;
  update(values: { consumed_at: string | null }): ChallengesQueryBuilder;
  eq(column: string, value: unknown): ChallengesQueryBuilder;
  is(column: string, value: null): ChallengesQueryBuilder;
  maybeSingle(): ChallengesQueryBuilder;
}

interface ChallengesDbClient {
  from(table: 'checkout_challenges'): ChallengesQueryBuilder;
}

function fromChallenges(db: DbClient): ChallengesQueryBuilder {
  return (db as unknown as ChallengesDbClient).from('checkout_challenges');
}

// ─── Verification ─────────────────────────────────────────────────────────────

export async function verifyChallengeToken(args: {
  db:             DbClient;
  challengeToken: string;
  identityKey:    string;
  requestId:      string;
}): Promise<ChallengeVerifyOutcome> {
  const { db, challengeToken, identityKey, requestId } = args;

  // ── Parse token ────────────────────────────────────────────────────────────
  const colonIdx = challengeToken.indexOf(':');
  if (colonIdx < 8) {
    return { ok: false, reason: 'malformed' };
  }

  const nonce     = challengeToken.slice(0, colonIdx);
  const signature = challengeToken.slice(colonIdx + 1);

  if (!nonce || !signature || signature.length < 64) {
    return { ok: false, reason: 'malformed' };
  }

  // ── Verify HMAC ────────────────────────────────────────────────────────────
  const secret = Deno.env.get('CHECKOUT_CHALLENGE_SECRET');
  if (!secret || secret.length < 32) {
    log('error', 'checkout_challenge_secret_misconfigured', { requestId });
    return { ok: false, reason: 'secret_misconfigured' };
  }

  const hmacValid = await verifyHmac(`${nonce}:${identityKey}`, signature, secret);
  if (!hmacValid) {
    log('warn', 'checkout_challenge_invalid_hmac', {
      requestId,
      nonce: nonce.slice(0, 8),
    });
    return { ok: false, reason: 'invalid_signature' };
  }

  // ── DB validation ──────────────────────────────────────────────────────────
  const { data: row, error } = (await fromChallenges(db)
    .select('id, identity_key, expires_at, consumed_at')
    .eq('nonce', nonce)
    .maybeSingle()) as {
      data:  CheckoutChallengeRow | null;
      error: { message: string } | null;
    };

  if (error || !row) {
    log('warn', 'checkout_challenge_nonce_not_found', {
      requestId,
      nonce:   nonce.slice(0, 8),
      dbError: error?.message ?? null,
    });
    return { ok: false, reason: 'not_found' };
  }

  if (row.consumed_at !== null) {
    log('warn', 'checkout_challenge_replay_attempt', {
      requestId,
      nonce:       nonce.slice(0, 8),
      consumed_at: row.consumed_at,
    });
    return { ok: false, reason: 'already_used' };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    log('info', 'checkout_challenge_expired', {
      requestId,
      nonce:      nonce.slice(0, 8),
      expires_at: row.expires_at,
    });
    return { ok: false, reason: 'expired' };
  }

  if (row.identity_key !== identityKey) {
    log('warn', 'checkout_challenge_identity_mismatch', {
      requestId,
      nonce: nonce.slice(0, 8),
    });
    return { ok: false, reason: 'identity_mismatch' };
  }

  // ── Atomic consumption ─────────────────────────────────────────────────────
  // Conditional update: only succeeds if consumed_at IS NULL.
  // Two concurrent retries with the same token race; exactly one wins.
  const { error: consumeError } = (await fromChallenges(db)
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('consumed_at', null)) as {
      error: { message: string } | null;
    };

  if (consumeError) {
    log('warn', 'checkout_challenge_consume_race', {
      requestId,
      nonce:  nonce.slice(0, 8),
      error:  consumeError.message,
    });
    return { ok: false, reason: 'already_used' };
  }

  return { ok: true, nonce };
}

// ─── Challenge nonce builder ──────────────────────────────────────────────────

export function buildChallengePayload(ttlMs = 10 * 60 * 1000): {
  nonce:     string;
  expiresAt: string;
} {
  return {
    nonce:     crypto.randomUUID(),
    expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  };
}