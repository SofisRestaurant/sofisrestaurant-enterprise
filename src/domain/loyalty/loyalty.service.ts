// =============================================================================
// src/domain/loyalty/loyalty.service.ts
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { invokeFn } from '@/lib/supabase/invoke'
import type { CustomerProfile, AwardResult, RedeemResult } from './loyalty.types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function asNullableString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

// ─── Response parsers ─────────────────────────────────────────────────────────

function parseCustomerProfile(payload: unknown): CustomerProfile {
  if (!isRecord(payload)) throw new Error('Invalid response from server.')
  const accountId = asString(payload.account_id).trim()
  if (!accountId) throw new Error('Invalid response from server: missing account_id')
  return {
    account_id: accountId,
    full_name: asNullableString(payload.full_name),
    tier: asString(payload.tier, 'bronze'),
    balance: asNumber(payload.balance, 0),
    lifetime_earned: asNumber(payload.lifetime_earned, 0),
    streak: asNumber(payload.streak, 0),
    last_activity: asNullableString(payload.last_activity),
  }
}

function parseAwardResult(payload: unknown): AwardResult {
  if (!isRecord(payload)) throw new Error('Invalid response from server.')
  return payload as unknown as AwardResult
}

function parseRedeemResult(payload: unknown): RedeemResult {
  if (!isRecord(payload)) throw new Error('Invalid response from server.')
  if (payload.was_duplicate === true) throw new Error('DUPLICATE')
  if (!('new_balance' in payload)) throw new Error('Invalid redeem response: missing new_balance')
  return payload as unknown as RedeemResult
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Optional `sb` override lets callers inject a test client. */
export async function verifyLoyaltyQR(
  loyaltyPublicId: string,
  sb?: SupabaseClient,
): Promise<CustomerProfile> {
  const id = loyaltyPublicId.trim()
  if (!id) throw new Error('Missing loyalty QR code.')
  const raw = await invokeFn<unknown>('verify-loyalty-qr', { loyalty_public_id: id }, sb as never)
  return parseCustomerProfile(raw)
}

export async function awardLoyaltyPoints(
  accountId: string,
  amountCents: number,
  sb?: SupabaseClient,
): Promise<AwardResult> {
  const id = accountId.trim()
  if (!id) throw new Error('Missing account id.')
  if (!Number.isFinite(amountCents) || amountCents <= 0)
    throw new Error('Amount must be a positive number of cents.')
  const raw = await invokeFn<unknown>(
    'award-loyalty-qr',
    { account_id: id, amount_cents: Math.floor(amountCents) },
    sb as never,
  )
  return parseAwardResult(raw)
}

export async function redeemLoyaltyPoints(
  accountId: string,
  pointsToRedeem: number,
  sb?: SupabaseClient,
): Promise<RedeemResult> {
  const id = accountId.trim()
  if (!id) throw new Error('Missing account id.')
  if (!Number.isFinite(pointsToRedeem) || pointsToRedeem <= 0)
    throw new Error('Points to redeem must be a positive number.')
  const raw = await invokeFn<unknown>(
    'redeem-loyalty',
    { account_id: id, points_to_redeem: Math.floor(pointsToRedeem), mode: 'dine_in' },
    sb as never,
  )
  return parseRedeemResult(raw)
}