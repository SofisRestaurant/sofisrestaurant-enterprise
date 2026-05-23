// src/domain/loyalty/rewards.ts
// =============================================================================
// SOFI'S LOYALTY REWARDS
// =============================================================================
// Single source of truth for customer-facing reward milestones.
// Earning stays: 1 point per $1 spent.
// Redemption enforcement should happen server-side later.
// =============================================================================

export type LoyaltyRewardMilestone = {
  points: number;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  exclusions?: string;
};

export const LOYALTY_REWARD_MILESTONES = [
  {
    points: 150,
    label: 'Free fountain drink',
    shortLabel: 'Drink',
    description: 'A refreshing drink on us.',
    icon: '🥤',
  },
  {
    points: 300,
    label: 'Free coffee or agua fresca',
    shortLabel: 'Coffee / Agua',
    description: 'Choose a coffee or agua fresca reward.',
    icon: '☕',
  },
  {
    points: 500,
    label: 'Free rolled tacos',
    shortLabel: 'Rolled tacos',
    description: 'A Sofi’s favorite reward for your next visit.',
    icon: '🌮',
  },
  {
    points: 750,
    label: 'Choose 1 Classic Plate',
    shortLabel: 'Classic Plate',
    description: 'Choose from selected Sofi’s favorites.',
    icon: '🍽',
    exclusions:
      'Premium items, upgrades, seafood, birria, limited specials, delivery orders, and third-party app orders may be excluded.',
  },
  {
    points: 1200,
    label: 'Family Breakfast Reward',
    shortLabel: 'Breakfast Reward',
    description: 'A bigger reward for loyal Sofi’s guests.',
    icon: '🔥',
    exclusions:
      'Final eligible reward options may vary by availability and restaurant approval.',
  },
] as const satisfies readonly LoyaltyRewardMilestone[];

export type LoyaltyReward = (typeof LOYALTY_REWARD_MILESTONES)[number];

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