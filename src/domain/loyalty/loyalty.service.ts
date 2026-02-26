// =============================================================================
// src/domain/loyalty/loyalty.service.ts
// =============================================================================
import { supabase } from '@/lib/supabase/supabaseClient';
import type { CustomerProfile, AwardResult, RedeemResult } from './loyalty.types';

async function getToken(): Promise<string> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error('Authentication expired. Please log in again.');
  }
  return session.access_token;
}

export async function verifyLoyaltyQR(loyaltyPublicId: string): Promise<CustomerProfile> {
  const token = await getToken();
  const { data, error } = await supabase.functions.invoke('verify-loyalty-qr', {
    body: { loyalty_public_id: loyaltyPublicId },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object') throw new Error('Invalid response from server.');

  return {
    account_id:      String(data.account_id),
    full_name:       data.full_name ?? null,
    tier:            data.tier ?? 'bronze',
    balance:         Number(data.balance ?? 0),
    lifetime_earned: Number(data.lifetime_earned ?? 0),
    streak:          Number(data.streak ?? 0),
    last_activity:   data.last_activity ?? null,
  };
}

export async function awardLoyaltyPoints(
  accountId: string,
  amountCents: number,
): Promise<AwardResult> {
  const token = await getToken();
  const { data, error } = await supabase.functions.invoke('award-loyalty-qr', {
    body: { account_id: accountId, amount_cents: amountCents },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error || !data) throw new Error(error?.message ?? 'Award failed');
  return Array.isArray(data) ? data[0] : data;
}

export async function redeemLoyaltyPoints(
  accountId: string,
  pointsToRedeem: number,
): Promise<RedeemResult> {
  const token = await getToken();
  const { data, error } = await supabase.functions.invoke('redeem-loyalty', {
    body: { account_id: accountId, points_to_redeem: pointsToRedeem, mode: 'dine_in' },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) throw new Error(error.message);
  if (!data)  throw new Error('No response from server');

  const result = Array.isArray(data) ? data[0] : data;
  if (result.was_duplicate) throw new Error('DUPLICATE');

  return result;
}