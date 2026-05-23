// =============================================================================
// src/domain/loyalty/loyalty.service.ts
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { invokeEdge } from '@/lib/supabase/invoke';
import type { CustomerProfile, AwardResult, RedeemResult } from './loyalty.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNullableString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Supports both:
 *  - raw result: { ... }
 *  - envelope: { ok:true, result:{...}, meta:{...} }
 */
function unwrapEdgeResult(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;

  // new envelope shape
  if ('ok' in payload && payload.ok === true && 'result' in payload) {
    return payload.result;
  }

  // some gateways wrap as { data, meta }
  if ('data' in payload && 'meta' in payload) {
    return payload.data;
  }

  return payload;
}

// ─── Response parsers ─────────────────────────────────────────────────────────

function parseCustomerProfile(payload: unknown): CustomerProfile {
  const raw = unwrapEdgeResult(payload);

  if (!isRecord(raw)) throw new Error('Invalid response from server.');

  // verify-loyalty-qr returns:
  // { account_id, profile_id, full_name, balance, lifetime_earned, tier, streak, ... }
  const accountId = asString(raw.account_id).trim();
  if (!accountId) throw new Error('Invalid response from server: missing account_id');

  // Optional but VERY useful for admin tooling & debugging
  const profileId = asNullableString(raw.profile_id);

  return {
    // required
    account_id: accountId,

    // optional / helpful
    profile_id: profileId,

    full_name: asNullableString(raw.full_name),
    tier: asString(raw.tier, 'bronze'),
    balance: asNumber(raw.balance, 0),
    lifetime_earned: asNumber(raw.lifetime_earned, 0),
    streak: asNumber(raw.streak, 0),
    last_activity: asNullableString(raw.last_activity),
  } as CustomerProfile;
}

function parseAwardResult(payload: unknown): AwardResult {
  const raw = unwrapEdgeResult(payload);

  if (!isRecord(raw)) throw new Error('Invalid response from server.');

  // Expected from v2_award_points:
  // { new_balance, new_lifetime, new_tier, points_earned, streak, tier_changed, was_duplicate }
  // If your RPC returns an array, unwrapEdgeResult() should already have fixed it,
  // but we still guard a bit:
  if (!('new_balance' in raw) || !('points_earned' in raw)) {
    // some RPCs can come back as array even after envelope
    if (Array.isArray(raw) && raw.length > 0 && isRecord(raw[0])) {
      return raw[0] as unknown as AwardResult;
    }
    throw new Error('Invalid award response from server.');
  }

  return raw as unknown as AwardResult;
}

function parseRedeemResult(payload: unknown): RedeemResult {
  const raw = unwrapEdgeResult(payload);

  if (!isRecord(raw)) throw new Error('Invalid response from server.');

  if (raw.was_duplicate === true) throw new Error('DUPLICATE');
  if (!('new_balance' in raw)) throw new Error('Invalid redeem response: missing new_balance');

  return raw as unknown as RedeemResult;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Optional `sb` override lets callers inject a test client. */
export async function verifyLoyaltyQR(
  loyaltyPublicId: string,
  sb?: SupabaseClient,
): Promise<CustomerProfile> {
  const id = loyaltyPublicId.trim();
  if (!id) throw new Error('Missing loyalty QR code.');

  const raw = await invokeEdge<unknown>(
    'verify-loyalty-qr',
    { loyalty_public_id: id },
    sb as never,
  );

  return parseCustomerProfile(raw);
}

/**
 * Award points from an admin scan.
 *
 * scanId is optional but strongly recommended:
 * - deterministic idempotency (“scan once”)
 * - cleaner ledger metadata (“why this award happened”)
 */
export async function awardLoyaltyPoints(
  accountId: string,
  amountCents: number,
  scanId?: string | null,
  sb?: SupabaseClient,
): Promise<AwardResult> {
  const id = accountId.trim();
  if (!id) throw new Error('Missing account id.');

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error('Amount must be a positive number of cents.');
  }

  const payload: Record<string, unknown> = {
    account_id: id,
    amount_cents: Math.floor(amountCents),
  };

  if (scanId && scanId.trim()) payload.scan_id = scanId.trim();

  const raw = await invokeEdge<unknown>('award-loyalty-qr', payload, sb as never);

  return parseAwardResult(raw);
}

export async function redeemLoyaltyPoints(
  _accountId: string,
  _pointsToRedeem: number,
  _sb?: SupabaseClient,
): Promise<RedeemResult> {
  throw new Error(
    'Reward redemption is being upgraded. Your points are safe and still earning.',
  );
}

