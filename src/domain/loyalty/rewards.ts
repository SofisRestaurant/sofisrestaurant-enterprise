// src/domain/loyalty/rewards.ts
// =============================================================================
// SOFI'S LOYALTY REWARDS — display-only milestones
// =============================================================================
// Customer-facing progress labels and icons. Must stay aligned with reward IDs
// in supabase/functions/_shared/loyalty-rewards.ts (server catalog).
//
// Earning: 1 point per $1 spent (enforced server-side).
// Redemption: not implemented here — no discounts, dollar conversion, or
// checkout payloads.
// =============================================================================

export type LoyaltyRewardId =
  | 'fountain_drink'
  | 'coffee_or_agua'
  | 'rolled_tacos'
  | 'classic_plate'
  | 'family_breakfast'
  | 'merch_reward';

export type LoyaltyRewardMilestone = {
  id: LoyaltyRewardId;
  points: number;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  exclusions?: string;
};

export const LOYALTY_REWARD_IDS: readonly LoyaltyRewardId[] = [
  'fountain_drink',
  'coffee_or_agua',
  'rolled_tacos',
  'classic_plate',
  'family_breakfast',
  'merch_reward',
] as const;

const LOYALTY_REWARD_ID_SET: ReadonlySet<string> = new Set(LOYALTY_REWARD_IDS);

export const LOYALTY_REWARD_MILESTONES = [
  {
    id: 'fountain_drink',
    points: 150,
    label: 'Free Fountain Drink',
    shortLabel: 'Drink',
    description: 'A refreshing fountain drink on us.',
    icon: '🥤',
  },
  {
    id: 'coffee_or_agua',
    points: 300,
    label: 'Free Coffee or Agua Fresca',
    shortLabel: 'Coffee / Agua',
    description: 'Choose a coffee or agua fresca reward.',
    icon: '☕',
  },
  {
    id: 'rolled_tacos',
    points: 500,
    label: 'Free Rolled Tacos',
    shortLabel: 'Rolled tacos',
    description: "A Sofi's favorite reward for your next visit.",
    icon: '🌮',
  },
  {
    id: 'classic_plate',
    points: 750,
    label: 'Choose 1 Classic Plate',
    shortLabel: 'Classic Plate',
    description: "Choose from selected Sofi's favorites.",
    icon: '🍽',
    exclusions:
      'Premium items, upgrades, seafood, birria, limited specials, delivery orders, and third-party app orders may be excluded.',
  },
  {
    id: 'family_breakfast',
    points: 1200,
    label: 'Family Breakfast Reward',
    shortLabel: 'Breakfast Reward',
    description: 'A bigger reward for loyal guests — staff approval required.',
    icon: '🔥',
    exclusions:
      'Final eligible reward options may vary by availability and restaurant approval.',
  },
  {
    id: 'merch_reward',
    points: 1500,
    label: "Sofi's Merch Reward",
    shortLabel: 'Merch',
    description: 'Exclusive Sofi\'s merch — staff approval required.',
    icon: '👕',
    exclusions: 'Available merch may vary by stock and restaurant approval.',
  },
] as const satisfies readonly LoyaltyRewardMilestone[];

export type LoyaltyReward = (typeof LOYALTY_REWARD_MILESTONES)[number];

export function isLoyaltyRewardId(value: unknown): value is LoyaltyRewardId {
  return typeof value === 'string' && LOYALTY_REWARD_ID_SET.has(value);
}

export function getLoyaltyRewardMilestoneById(
  rewardId: string,
): LoyaltyRewardMilestone | null {
  if (!isLoyaltyRewardId(rewardId)) {
    return null;
  }
  return LOYALTY_REWARD_MILESTONES.find((reward) => reward.id === rewardId) ?? null;
}

export function getNextLoyaltyReward(
  balance: number,
): (LoyaltyReward & { remaining: number }) | null {
  const safeBalance = Number.isFinite(balance) ? Math.max(balance, 0) : 0;

  for (const reward of LOYALTY_REWARD_MILESTONES) {
    if (safeBalance < reward.points) {
      return {
        ...reward,
        remaining: reward.points - safeBalance,
      };
    }
  }

  return null;
}

export function getEarnedLoyaltyRewardsCount(balance: number): number {
  const safeBalance = Number.isFinite(balance) ? Math.max(balance, 0) : 0;

  return LOYALTY_REWARD_MILESTONES.reduce(
    (count, reward) => count + (safeBalance >= reward.points ? 1 : 0),
    0,
  );
}

export function getLoyaltyRewardProgress(balance: number): {
  currentFloor: number;
  nextReward: (LoyaltyReward & { remaining: number }) | null;
  percent: number;
  label: string;
} {
  const safeBalance = Number.isFinite(balance) ? Math.max(balance, 0) : 0;
  const nextReward = getNextLoyaltyReward(safeBalance);

  if (!nextReward) {
    return {
      currentFloor: LOYALTY_REWARD_MILESTONES.at(-1)?.points ?? 0,
      nextReward: null,
      percent: 100,
      label: 'All rewards unlocked',
    };
  }

  const nextIndex = LOYALTY_REWARD_MILESTONES.findIndex(
    (reward) => reward.points === nextReward.points,
  );

  const previousReward = nextIndex > 0 ? LOYALTY_REWARD_MILESTONES[nextIndex - 1] : null;
  const currentFloor = previousReward?.points ?? 0;
  const bandSize = Math.max(nextReward.points - currentFloor, 1);
  const earnedInBand = Math.max(safeBalance - currentFloor, 0);

  return {
    currentFloor,
    nextReward,
    percent: Math.min((earnedInBand / bandSize) * 100, 100),
    label: `${nextReward.remaining.toLocaleString()} pts to ${nextReward.label}`,
  };
}
