// =============================================================================
// src/domain/loyalty/loyalty.types.ts
// =============================================================================

export type ScanMode  = 'award' | 'redeem';
export type ScanState = 'scanning' | 'loading' | 'found' | 'awarding' | 'success' | 'error';

export interface CustomerProfile {
  account_id:      string;
  full_name:       string | null;
  tier:            string;
  balance:         number;
  lifetime_earned: number;
  streak:          number;
  last_activity:   string | null;
}

export interface AwardResult {
  points_earned: number
  new_balance: number
  new_lifetime: number
  new_tier: string
  streak: number
  tier_changed: boolean
  was_duplicate: boolean
  tier_before?: string
}

export interface RedeemResult {
  new_balance:  number;
  credit_id?:   string;
}

export interface RedeemPreset {
  points: number;
  label:  string;
}

export const REDEEM_PRESETS: RedeemPreset[] = [
  { label: '$5 off',  points: 500  },
  { label: '$10 off', points: 1000 },
  { label: '$25 off', points: 2500 },
];