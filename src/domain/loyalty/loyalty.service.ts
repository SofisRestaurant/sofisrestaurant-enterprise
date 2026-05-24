// =============================================================================
// src/domain/loyalty/loyalty.service.ts
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { invokeEdge } from '@/lib/supabase/invoke';
import type {
  CustomerProfile,
  AwardResult,
  RedeemResult,
  RewardRedemptionResult,
} from './loyalty.types';
import type { LoyaltyRewardId } from './rewards';

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

  const accountId = asString(raw.account_id).trim();
  if (!accountId) throw new Error('Invalid response from server: missing account_id');

  const profileId = asNullableString(raw.profile_id);

  return {
    account_id: accountId,
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

  if (!('new_balance' in raw) || !('points_earned' in raw)) {
    if (Array.isArray(raw) && raw.length > 0 && isRecord(raw[0])) {
      return raw[0] as unknown as AwardResult;
    }
    throw new Error('Invalid award response from server.');
  }

  return raw as unknown as AwardResult;
}


function parseRewardRedemptionResult(payload: unknown): RewardRedemptionResult {
  const raw = unwrapEdgeResult(payload);

  if (!isRecord(raw)) throw new Error('Invalid response from server.');

  const redemptionId = asString(raw.redemption_id).trim();
  if (!redemptionId) throw new Error('Invalid response: missing redemption_id');

  const rewardId = asString(raw.reward_id).trim();
  if (!rewardId) throw new Error('Invalid response: missing reward_id');

  return {
    redemption_id: redemptionId,
    ledger_id: asString(raw.ledger_id),
    reward_id: rewardId as LoyaltyRewardId,
    reward_label: asString(raw.reward_label),
    points_spent: asNumber(raw.points_spent, 0),
    discount_cents: asNumber(raw.discount_cents, 0),
    new_balance: asNumber(raw.new_balance, 0),
    status: raw.status === 'staff_required' ? 'staff_required' : 'applied',
    was_duplicate: raw.was_duplicate === true,
  };
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
 * - deterministic idempotency ("scan once")
 * - cleaner ledger metadata ("why this award happened")
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

// ─── Legacy: cash-like point redemption (Phase 1 disabled) ────────────────────

export async function redeemLoyaltyPoints(
  _accountId: string,
  _pointsToRedeem: number,
  _sb?: SupabaseClient,
): Promise<RedeemResult> {
  // PHASE 1: Cash-like point redemption disabled.
  // No edge function call is made. Callers receive a clear error.
  throw new Error(
    'Reward redemption is being upgraded. Your points are safe and still earning.',
  );
}

// ─── Reward-based redemption (Phase 5D) ───────────────────────────────────────
//
// Calls the redeem-loyalty-reward Edge Function, which validates the reward_id
// against the server catalog and calls v2_redeem_loyalty_reward RPC.
//
// The frontend ONLY sends:
//   - reward_id   (which catalog reward)
//   - idempotency_key (optional, for dedup)
//   - account_id  (admin/staff path only)
//
// The frontend NEVER sends:
//   points, pointsToRedeem, points_to_redeem, discountAmount, discount_cents,
//   maxDiscountCents, pointsCost, points_cost, rewardLabel, reward_label

export async function redeemLoyaltyReward(args: {
  rewardId: LoyaltyRewardId;
  idempotencyKey?: string;
  /** Required for admin/staff path (staff_required rewards). */
  accountId?: string;
}): Promise<RewardRedemptionResult> {
  const { rewardId, idempotencyKey, accountId } = args;

  if (!rewardId || typeof rewardId !== 'string' || !rewardId.trim()) {
    throw new Error('reward_id is required.');
  }

  // Build payload — only safe fields, never points/discount/label.
  const payload: Record<string, unknown> = {
    reward_id: rewardId.trim(),
  };

  if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
    payload.idempotency_key = idempotencyKey.trim();
  }

  if (accountId && typeof accountId === 'string' && accountId.trim()) {
    payload.account_id = accountId.trim();
  }

  const raw = await invokeEdge<unknown>('redeem-loyalty-reward', payload);

  return parseRewardRedemptionResult(raw);
}