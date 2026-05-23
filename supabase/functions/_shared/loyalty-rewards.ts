// =============================================================================
// supabase/functions/_shared/loyalty-rewards.ts
// =============================================================================
// Immutable Sofi's Rewards catalog — server-side source of truth for Edge
// Functions. Display-only copy lives in src/domain/loyalty/rewards.ts.
//
// Phase 2: catalog + lookup helpers only. No redemption, checkout, Stripe, DB,
// or Supabase client usage.
// =============================================================================

export type LoyaltyRewardId =
  | 'fountain_drink'
  | 'coffee_or_agua'
  | 'rolled_tacos'
  | 'classic_plate'
  | 'family_breakfast'
  | 'merch_reward';

export type LoyaltyRewardType =
  | 'food_item'
  | 'choice_reward'
  | 'staff_reward'
  | 'merch';

export type LoyaltyReward = {
  readonly id: LoyaltyRewardId;
  readonly label: string;
  readonly pointsCost: number;
  readonly maxDiscountCents: number;
  readonly type: LoyaltyRewardType;
  readonly eligibleItemSlugs?: readonly string[];
  readonly excludedCategories?: readonly string[];
  readonly requiresStaffApproval?: boolean;
  readonly active: boolean;
};

export const LOYALTY_REWARDS = [
  {
    id: 'fountain_drink',
    label: 'Free Fountain Drink',
    pointsCost: 150,
    maxDiscountCents: 350,
    type: 'food_item',
    eligibleItemSlugs: ['fountain-drink'],
    active: true,
  },
  {
    id: 'coffee_or_agua',
    label: 'Free Coffee or Agua Fresca',
    pointsCost: 300,
    maxDiscountCents: 500,
    type: 'food_item',
    eligibleItemSlugs: ['coffee', 'agua-fresca'],
    active: true,
  },
  {
    id: 'rolled_tacos',
    label: 'Free Rolled Tacos',
    pointsCost: 500,
    maxDiscountCents: 899,
    type: 'food_item',
    eligibleItemSlugs: ['rolled-tacos'],
    active: true,
  },
  {
    id: 'classic_plate',
    label: 'Choose 1 Classic Plate',
    pointsCost: 750,
    maxDiscountCents: 1299,
    type: 'choice_reward',
    eligibleItemSlugs: [
      'two-tacos-rice-beans',
      'breakfast-burrito',
      'huevos-rancheros',
      'chilaquiles',
      'rolled-tacos-plate',
    ],
    excludedCategories: [
      'seafood',
      'birria',
      'premium',
      'specials',
      'upgrades',
      'delivery',
      'third-party',
    ],
    active: true,
  },
  {
    id: 'family_breakfast',
    label: 'Family Breakfast Reward',
    pointsCost: 1200,
    maxDiscountCents: 2000,
    type: 'staff_reward',
    requiresStaffApproval: true,
    active: true,
  },
  {
    id: 'merch_reward',
    label: "Sofi's Merch Reward",
    pointsCost: 1500,
    maxDiscountCents: 2000,
    type: 'merch',
    requiresStaffApproval: true,
    active: true,
  },
] as const satisfies readonly LoyaltyReward[];

export const LOYALTY_REWARD_IDS: readonly LoyaltyRewardId[] = LOYALTY_REWARDS.map(
  (reward) => reward.id,
);

const LOYALTY_REWARD_ID_SET: ReadonlySet<string> = new Set(LOYALTY_REWARD_IDS);

const LOYALTY_REWARD_BY_ID: Readonly<Record<LoyaltyRewardId, LoyaltyReward>> =
  Object.fromEntries(LOYALTY_REWARDS.map((reward) => [reward.id, reward])) as Readonly<
    Record<LoyaltyRewardId, LoyaltyReward>
  >;

export function isLoyaltyRewardId(value: unknown): value is LoyaltyRewardId {
  return typeof value === 'string' && LOYALTY_REWARD_ID_SET.has(value);
}

export function getLoyaltyRewardById(rewardId: string): LoyaltyReward | null {
  if (!isLoyaltyRewardId(rewardId)) {
    return null;
  }
  return LOYALTY_REWARD_BY_ID[rewardId] ?? null;
}
