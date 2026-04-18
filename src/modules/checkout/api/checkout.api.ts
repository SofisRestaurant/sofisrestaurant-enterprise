// src/modules/checkout/api/checkout.api.ts
// =============================================================================
// Loyalty & credits data helpers.
//
// This file used to contain a full Stripe checkout session pipeline
// (createCheckoutSession, validateCheckoutData, retry/timeout/error classes,
// URL builders, device fingerprint headers). All of that is gone — Stripe
// session creation now lives server-side in the create-checkout and
// create-checkout-guest Edge Functions, and is invoked via
// useAuthCheckout / useGuestCheckout through useCheckoutRouter.
//
// Surviving responsibilities:
//   - Load the logged-in user's loyalty profile from `profiles`
//   - Load the logged-in user's unused credits from `user_credits`
//   - Compute a client-side loyalty-earn preview (pure math, no network)
//
// Importers as of this trim:
//   - src/modules/checkout/pages/CheckoutPage.tsx
//   - src/pages/Account/AccountHome.tsx (LoyaltyProfile type only)
//
// If you're looking for checkout execution logic, see:
//   - src/modules/checkout/hooks/useCheckoutRouter.ts
//   - src/modules/checkout/hooks/useAuthCheckout.ts
//   - src/modules/checkout/hooks/useGuestCheckout.ts
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';
import { phoenixTodayString } from '@/lib/utils/businessTime';
import { LOYALTY_TIERS, TIER_ORDER } from '@/domain/loyalty/tiers';
import type { LoyaltyTier } from '@/domain/loyalty/tiers';

export { LOYALTY_TIERS };
export type { LoyaltyTier };

// =============================================================================
// TYPES
// =============================================================================

export interface LoyaltyProfile {
  points: number;
  lifetimePoints: number;
  tier: LoyaltyTier;
  streak: number;
  lastOrderDate: string | null;
}

export interface LoyaltyPreview {
  pointsToEarn: number;
  basePoints: number;
  tierMultiplier: number;
  streakMultiplier: number;
  tier: LoyaltyTier;
  streak: number;
  currentBalance: number;
  balanceAfter: number;
  willExtendStreak: boolean;
  pointsToNextTier: number | null;
  willLevelUp: boolean;
}

export interface UserCredit {
  id: string;
  amount_cents: number;
  source: string;
  expires_at: string | null;
  created_at: string;
}

// =============================================================================
// SMALL TYPE-SAFE COERCERS (local, no external deps)
// =============================================================================

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  const n =
    typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

// =============================================================================
// LOYALTY — profile fetch
// =============================================================================

export async function getLoyaltyProfile(): Promise<LoyaltyProfile | null> {
  try {
    const sessionRes = await supabase.auth.getSession();
    const userId = sessionRes.data.session?.user?.id;
    if (!userId) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select(
        'loyalty_points, lifetime_points, loyalty_tier, loyalty_streak, last_order_date',
      )
      .eq('id', userId)
      .single();

    if (error || !data) return null;

    return {
      points: asNumber(data.loyalty_points, 0),
      lifetimePoints: asNumber(data.lifetime_points, 0),
      tier: (data.loyalty_tier ?? 'bronze') as LoyaltyTier,
      streak: asNumber(data.loyalty_streak, 0),
      lastOrderDate: asString(data.last_order_date, '') || null,
    };
  } catch {
    return null;
  }
}

// =============================================================================
// CREDITS — available unused credits for the current user
// =============================================================================

export async function getAvailableCredits(): Promise<UserCredit[]> {
  try {
    const sessionRes = await supabase.auth.getSession();
    const userId = sessionRes.data.session?.user?.id;
    if (!userId) return [];

    const { data, error } = await supabase
      .from('user_credits')
      .select('id, amount_cents, source, expires_at, created_at')
      .eq('user_id', userId)
      .eq('used', false)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: true });

    if (error || !data) return [];

    return data.map((row) => ({
      id: asString(row.id),
      amount_cents: asNumber(row.amount_cents, 0),
      source: asString(row.source),
      expires_at: asString(row.expires_at).trim() || null,
      created_at: asString(row.created_at),
    }));
  } catch {
    return [];
  }
}

// =============================================================================
// LOYALTY — client-side earn preview (pure function, no network)
// =============================================================================

export function calculatePointsPreview(
  amountCents: number,
  profile: LoyaltyProfile | null,
): LoyaltyPreview {
  const tier: LoyaltyTier = profile?.tier ?? 'bronze';
  const streak = profile?.streak ?? 0;
  const balance = profile?.points ?? 0;
  const lifetime = profile?.lifetimePoints ?? 0;

  const tierConfig = LOYALTY_TIERS[tier];
  const basePoints = Math.max(Math.floor(amountCents / 100), 0);
  const tierMultiplier = tierConfig.multiplier;

  const nextStreak = streak + 1;
  const streakMultiplier =
    nextStreak >= 30 ? 1.5 : nextStreak >= 7 ? 1.25 : nextStreak >= 3 ? 1.1 : 1.0;

  const pointsToEarn = Math.max(
    Math.floor(basePoints * tierMultiplier * streakMultiplier),
    0,
  );
  const balanceAfter = balance + pointsToEarn;

  const currentIndex = TIER_ORDER.indexOf(tier);
  const nextTier =
    currentIndex < TIER_ORDER.length - 1 ? TIER_ORDER[currentIndex + 1] : null;
  const nextTierThreshold = nextTier ? LOYALTY_TIERS[nextTier].threshold : null;
  const pointsToNextTier =
    nextTierThreshold !== null ? Math.max(nextTierThreshold - lifetime, 0) : null;
  const willLevelUp =
    nextTierThreshold !== null && lifetime + pointsToEarn >= nextTierThreshold;

  // Phoenix local date — UTC slice(0,10) fires a day early for evening orders.
  const today = phoenixTodayString();
  const willExtendStreak = profile?.lastOrderDate !== today;

  return {
    pointsToEarn,
    basePoints,
    tierMultiplier,
    streakMultiplier,
    tier,
    streak,
    currentBalance: balance,
    balanceAfter,
    willExtendStreak,
    pointsToNextTier,
    willLevelUp,
  };
}