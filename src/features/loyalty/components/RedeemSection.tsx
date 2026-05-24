// =============================================================================
// src/features/loyalty/components/RedeemSection.tsx
// =============================================================================

import type { LoyaltyRewardId } from '@/domain/loyalty/rewards';
import { LOYALTY_REWARD_MILESTONES, getLoyaltyRewardMilestoneById } from '@/domain/loyalty/rewards';

interface Props {
  balance: number;
  selectedRewardId: LoyaltyRewardId | null;
  errorMsg: string | null;
  onSelectReward: (rewardId: LoyaltyRewardId) => void;
  onRedeem: () => void;
  onCancel: () => void;
}

export function RedeemSection({
  balance,
  selectedRewardId,
  errorMsg,
  onSelectReward,
  onRedeem,
  onCancel,
}: Props) {
  const selectedReward = selectedRewardId ? getLoyaltyRewardMilestoneById(selectedRewardId) : null;

  const canRedeem = selectedReward !== null && selectedReward.points <= balance;

  return (
    <div className="space-y-4 rounded-2xl border border-white/8 bg-gray-900 p-5">
      <div>
        <p className="text-xs uppercase tracking-wider text-gray-500">Select Reward</p>
        <p className="mt-1 text-sm text-gray-400">
          Choose a reward from the catalog. Point values are controlled by the server.
        </p>
      </div>

      <div className="space-y-2">
        {LOYALTY_REWARD_MILESTONES.map((reward) => {
          const isSelected = selectedRewardId === reward.id;
          const isDisabled = reward.points > balance;

          return (
            <button
              key={reward.id}
              type="button"
              onClick={() => onSelectReward(reward.id)}
              disabled={isDisabled}
              className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                isSelected
                  ? 'border-amber-500 bg-amber-500/15 text-white'
                  : 'border-white/10 bg-white/4 text-gray-300 hover:bg-white/8'
              } ${isDisabled ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold">
                    <span className="mr-2">{reward.icon}</span>
                    {reward.label}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">{reward.description}</p>
                </div>

                <span className="shrink-0 rounded-full bg-black/30 px-2.5 py-1 text-xs font-bold text-amber-300">
                  {Number(reward.points).toLocaleString()} pts
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {selectedReward ? (
        <div className="rounded-xl border border-white/8 bg-black/20 px-4 py-3">
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-gray-500">Selected</span>
            <span className="text-right font-medium text-white">{selectedReward.label}</span>
          </div>

          <div className="mt-2 flex justify-between text-sm">
            <span className="text-gray-500">Points used</span>
            <span className="font-mono font-bold text-amber-400">
              {Number(selectedReward.points).toLocaleString()} pts
            </span>
          </div>

          {selectedReward.points > balance ? (
            <p className="mt-2 text-xs font-medium text-red-400">
              Customer does not have enough points for this reward.
            </p>
          ) : null}
        </div>
      ) : null}

      {errorMsg ? <p className="text-center text-xs font-medium text-red-400">{errorMsg}</p> : null}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-white/8 px-4 py-3 text-sm font-medium text-gray-400 transition hover:bg-white/4"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={onRedeem}
          disabled={!canRedeem}
          className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Redeem Reward
        </button>
      </div>
    </div>
  );
}