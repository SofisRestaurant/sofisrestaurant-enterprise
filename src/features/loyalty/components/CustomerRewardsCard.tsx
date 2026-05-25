// =============================================================================
// src/features/loyalty/components/CustomerRewardsCard.tsx
// =============================================================================
// Phase 5G: Customer-facing reward redemption.
//
// Shows the reward catalog from src/domain/loyalty/rewards.ts. Customers can
// redeem self-service rewards (food_item, choice_reward). Staff-only rewards
// are shown as locked with a note.
//
// Security: only sends reward_id via redeemLoyaltyReward(). Never sends
// points, discount, label, or any monetary value.
// =============================================================================

import { useCallback, useRef, useState } from 'react';

import {
  LOYALTY_REWARD_MILESTONES,
  type LoyaltyRewardId,
  type LoyaltyRewardMilestone,
} from '@/domain/loyalty/rewards';
import { redeemLoyaltyReward } from '@/domain/loyalty/loyalty.service';
import type { RewardRedemptionResult } from '@/domain/loyalty/loyalty.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cx(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(' ');
}

function fmt(n: number): string {
  return n.toLocaleString();
}

// Staff-only rewards: customers see them but can't redeem
const STAFF_ONLY_IDS: ReadonlySet<string> = new Set([
  'family_breakfast',
  'merch_reward',
]);

function isStaffOnly(id: string): boolean {
  return STAFF_ONLY_IDS.has(id);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type RedeemState =
  | { phase: 'idle' }
  | { phase: 'confirm'; rewardId: LoyaltyRewardId }
  | { phase: 'loading'; rewardId: LoyaltyRewardId }
  | { phase: 'success'; result: RewardRedemptionResult }
  | { phase: 'error'; message: string };

type Props = {
  balance: number;
  onBalanceChange?: (newBalance: number) => void;
};

// ─── Shared card surface (matches AccountHome.tsx) ───────────────────────────

const CARD = cx(
  'rounded-[1.25rem] border border-white/60',
  'bg-white/72 shadow-[0_2px_20px_rgba(80,40,20,0.05)]',
  'backdrop-blur-2xl',
  'dark:border-white/10 dark:bg-white/[0.06] dark:shadow-[0_2px_28px_rgba(0,0,0,0.3)]',
);

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomerRewardsCard({ balance, onBalanceChange }: Props) {
  const [state, setState] = useState<RedeemState>({ phase: 'idle' });
  const mutationRef = useRef(0);

  const handleSelect = useCallback((rewardId: LoyaltyRewardId) => {
    setState((prev) => {
      // Toggle off if already selected
      if (prev.phase === 'confirm' && prev.rewardId === rewardId) {
        return { phase: 'idle' };
      }
      return { phase: 'confirm', rewardId };
    });
  }, []);

  const handleCancel = useCallback(() => {
    setState({ phase: 'idle' });
  }, []);

  const handleRedeem = useCallback(async () => {
    if (state.phase !== 'confirm') return;

    const { rewardId } = state;
    const requestId = ++mutationRef.current;

    setState({ phase: 'loading', rewardId });

    try {
      // Only sends reward_id. Never points, discount, or label.
      const result = await redeemLoyaltyReward({ rewardId });

      if (mutationRef.current !== requestId) return;

      setState({ phase: 'success', result });
      onBalanceChange?.(result.new_balance);
    } catch (error) {
      if (mutationRef.current !== requestId) return;

      const msg =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Unable to redeem this reward. Please try again.';

      setState({ phase: 'error', message: msg });
    }
  }, [state, onBalanceChange]);

  const handleDismissSuccess = useCallback(() => {
    setState({ phase: 'idle' });
  }, []);

  const handleDismissError = useCallback(() => {
    setState({ phase: 'idle' });
  }, []);

  const isBusy = state.phase === 'loading';
  const confirming = state.phase === 'confirm' ? state.rewardId : null;

  // ── Success state ─────────────────────────────────────────────────────────

  if (state.phase === 'success') {
    const { result } = state;
    return (
      <section className={cx(CARD, 'overflow-hidden')}>
        <div className="flex flex-col items-center gap-3 bg-emerald-50 px-6 py-8 dark:bg-emerald-900/10">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-1 ring-emerald-200 dark:bg-emerald-800/20 dark:ring-emerald-700/30">
            <span className="text-2xl">🎉</span>
          </div>
          <div className="text-center">
            <p
              className="text-sm font-semibold"
              style={{ color: 'var(--color-ember-600)' }}
            >
              Reward Redeemed
            </p>
            <p
              className="mt-1 text-lg font-bold"
              style={{ color: 'var(--color-ink-900)' }}
            >
              {result.reward_label}
            </p>
            {result.was_duplicate && (
              <p className="mt-1 text-xs text-amber-600 font-medium">
                This reward was already recorded.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--color-ink-500)' }}>Points used</span>
            <span className="font-semibold" style={{ color: 'var(--color-ink-900)' }}>
              {fmt(result.points_spent)} pts
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: 'var(--color-ink-500)' }}>Remaining balance</span>
            <span
              className="font-mono font-bold"
              style={{ color: 'var(--color-ember-600)' }}
            >
              {fmt(result.new_balance)} pts
            </span>
          </div>

          <div
            className="rounded-xl border px-4 py-3 text-center"
            style={{
              borderColor: 'var(--color-ember-200)',
              background: 'var(--color-ember-50)',
            }}
          >
            <p
              className="text-xs font-semibold"
              style={{ color: 'var(--color-ember-700)' }}
            >
              Show this screen to your server to apply your reward.
            </p>
          </div>
        </div>

        <div className="border-t px-5 py-4" style={{ borderColor: 'rgba(0,0,0,0.04)' }}>
          <button
            type="button"
            onClick={handleDismissSuccess}
            className={cx(
              'w-full rounded-xl py-3 text-sm font-semibold transition-all',
              'bg-[var(--color-ink-900)] text-white hover:bg-black',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]',
              'active:scale-[0.98]',
            )}
          >
            Done
          </button>
        </div>
      </section>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (state.phase === 'error') {
    return (
      <section className={cx(CARD, 'px-5 py-6')}>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 ring-1 ring-red-200 dark:bg-red-900/10">
            <span className="text-xl">⚠</span>
          </div>
          <div>
            <p className="text-sm font-bold text-red-800">Redemption failed</p>
            <p className="mt-1 text-xs text-red-600">{state.message}</p>
          </div>
          <button
            type="button"
            onClick={handleDismissError}
            className={cx(
              'mt-2 rounded-xl px-6 py-2.5 text-sm font-semibold transition-all',
              'bg-[var(--color-ink-900)] text-white hover:bg-black',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]',
              'active:scale-[0.98]',
            )}
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  // ── Normal state: reward catalog ──────────────────────────────────────────

  return (
    <section className={cx(CARD, 'overflow-hidden')}>
      <div
        className="flex items-center justify-between border-b px-5 py-4 sm:px-6"
        style={{ borderColor: 'rgba(0,0,0,0.04)' }}
      >
        <div>
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: 'var(--color-ink-400)' }}
          >
            Your Rewards
          </p>
          <h2
            className="mt-1 text-[15px] font-bold tracking-tight"
            style={{
              color: 'var(--color-ink-900)',
              fontFamily: 'var(--font-display)',
            }}
          >
            Redeem your points
          </h2>
        </div>
        <div className="shrink-0 text-right">
          <p
            className="font-mono text-lg font-bold tabular-nums"
            style={{ color: 'var(--color-ember-600)' }}
          >
            {fmt(balance)}
          </p>
          <p
            className="text-[10px] font-semibold uppercase"
            style={{ color: 'var(--color-ink-400)' }}
          >
            pts
          </p>
        </div>
      </div>

      <div className="divide-y" style={{ divideColor: 'rgba(0,0,0,0.03)' } as React.CSSProperties}>
        {LOYALTY_REWARD_MILESTONES.map((reward: LoyaltyRewardMilestone) => {
          const staffOnly = isStaffOnly(reward.id);
          const affordable = balance >= reward.points;
          const isConfirming = confirming === reward.id;
          const disabled = !affordable || staffOnly || isBusy;

          return (
            <div key={reward.id} className="px-5 py-3.5 sm:px-6">
              <div className="flex items-center gap-3.5">
                {/* Icon */}
                <div
                  className={cx(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg transition-all',
                    affordable && !staffOnly
                      ? 'bg-[var(--color-ember-50)] shadow-[0_2px_8px_rgba(180,80,30,0.1)]'
                      : 'bg-[var(--color-cream-100)]',
                  )}
                >
                  {staffOnly ? '🔒' : reward.icon}
                </div>

                {/* Label + points */}
                <div className="min-w-0 flex-1">
                  <p
                    className={cx(
                      'text-[13.5px] font-semibold',
                      affordable && !staffOnly
                        ? 'text-[var(--color-ink-900)]'
                        : 'text-[var(--color-ink-400)]',
                    )}
                  >
                    {reward.label}
                  </p>
                  <p className="mt-0.5 text-[11.5px]" style={{ color: 'var(--color-ink-400)' }}>
                    {fmt(reward.points)} pts
                    {staffOnly && ' · In-store only'}
                    {reward.exclusions && !staffOnly && ' · Conditions apply'}
                  </p>
                </div>

                {/* Action */}
                <div className="shrink-0">
                  {staffOnly ? (
                    <span
                      className="rounded-full border px-3 py-1.5 text-[11px] font-semibold"
                      style={{
                        borderColor: 'var(--color-cream-300)',
                        color: 'var(--color-ink-400)',
                        background: 'var(--color-cream-100)',
                      }}
                    >
                      Ask staff
                    </span>
                  ) : !affordable ? (
                    <span
                      className="text-[11px] font-medium tabular-nums"
                      style={{ color: 'var(--color-ink-400)' }}
                    >
                      {fmt(reward.points - balance)} pts away
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSelect(reward.id)}
                      disabled={isBusy}
                      className={cx(
                        'rounded-full border px-3.5 py-1.5 text-[11.5px] font-bold transition-all',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]',
                        'active:scale-[0.96]',
                        'disabled:pointer-events-none disabled:opacity-50',
                        isConfirming
                          ? 'border-[var(--color-ember-400)] bg-[var(--color-ember-500)] text-white shadow-[0_2px_8px_rgba(180,80,30,0.2)]'
                          : 'border-[var(--color-ember-200)] bg-[var(--color-ember-50)] text-[var(--color-ember-700)] hover:bg-[var(--color-ember-100)]',
                      )}
                    >
                      {isConfirming ? 'Selected' : 'Redeem'}
                    </button>
                  )}
                </div>
              </div>

              {/* Confirm bar */}
              {isConfirming && (
                <div
                  className="mt-3 flex items-center gap-2 rounded-xl border px-4 py-3"
                  style={{
                    borderColor: 'var(--color-ember-200)',
                    background: 'var(--color-ember-50)',
                  }}
                >
                  <span className="text-sm" aria-hidden>✦</span>
                  <p
                    className="flex-1 text-[12.5px] font-medium"
                    style={{ color: 'var(--color-ember-800)' }}
                  >
                    Redeem <span className="font-bold">{reward.label}</span> for{' '}
                    <span className="font-bold tabular-nums">{fmt(reward.points)} pts</span>?
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={isBusy}
                      className={cx(
                        'rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all',
                        'border-[var(--color-ember-200)] text-[var(--color-ember-700)]',
                        'hover:bg-white active:scale-[0.96]',
                        'disabled:opacity-50',
                      )}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => { void handleRedeem(); }}
                      disabled={isBusy}
                      className={cx(
                        'rounded-lg px-3 py-1.5 text-[11px] font-bold text-white transition-all',
                        'bg-[var(--color-ember-500)] hover:bg-[var(--color-ember-600)]',
                        'active:scale-[0.96]',
                        'disabled:opacity-50',
                      )}
                    >
                      {isBusy ? 'Processing…' : 'Confirm'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}