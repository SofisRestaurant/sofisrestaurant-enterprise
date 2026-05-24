// =============================================================================
// src/domain/loyalty/loyalty.types.ts
// =============================================================================

import type { LoyaltyRewardId } from './rewards';

export type ScanMode = 'award' | 'redeem';
export type ScanState = 'scanning' | 'loading' | 'found' | 'awarding' | 'success' | 'error';

export interface CustomerProfile {
  account_id: string;
  profile_id?: string | null;
  full_name: string | null;
  tier: string;
  balance: number;
  lifetime_earned: number;
  streak: number;
  last_activity: string | null;
}

export interface AwardResult {
  points_earned: number;
  new_balance: number;
  new_lifetime: number;
  new_tier: string;
  streak: number;
  tier_changed: boolean;
  was_duplicate: boolean;
  tier_before?: string;
}

export interface RedeemResult {
  new_balance: number;
  credit_id?: string;
}

// ─── Reward-based redemption (Phase 5D) ───────────────────────────────────────
//
// Response from the redeem-loyalty-reward Edge Function.
// All monetary/point values come from the server catalog — the frontend
// never sends points, discount, or label.

export type RewardRedemptionStatus = 'applied' | 'staff_required';

export interface RewardRedemptionResult {
  redemption_id: string;
  ledger_id: string;
  reward_id: LoyaltyRewardId;
  reward_label: string;
  points_spent: number;
  discount_cents: number;
  new_balance: number;
  status: RewardRedemptionStatus;
  was_duplicate: boolean;
}

// ─── Legacy presets (Phase 1 disabled — kept for type compat) ─────────────────

export interface RedeemPreset {
  points: number;
  label: string;
}

export const REDEEM_PRESETS: RedeemPreset[] = [
  { label: '$5 off', points: 500 },
  { label: '$10 off', points: 1000 },
  { label: '$25 off', points: 2500 },
];