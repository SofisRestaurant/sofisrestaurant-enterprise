// src/modules/orders/pages/order-success/OrderSuccessLoyalty.tsx
// Loyalty transaction display card for the OrderSuccess page.

import { LOYALTY_TIERS, asTier } from '@/domain/loyalty/tiers';
import { fmt } from './orderSuccess.helpers';
import type { LoyaltyTxV2, LoyaltyAccountSnap, LoyaltyForOrderMeta } from './orderSuccess.types';

// ---------------------------------------------------------------------------
// LoyaltyResultCard
// ---------------------------------------------------------------------------

export function LoyaltyResultCard({
  loyalty,
  account,
  meta,
}: {
  loyalty: LoyaltyTxV2;
  account: LoyaltyAccountSnap | null;
  meta?: LoyaltyForOrderMeta;
}) {
  const tier = asTier(account?.tier ?? loyalty.tier_at_time);
  const tierCfg = LOYALTY_TIERS[tier];
  const pointsDelta = typeof loyalty.amount === 'number' ? loyalty.amount : 0;
  const earned = Math.max(0, Math.trunc(pointsDelta));
  const displayBalance =
    account && typeof account.balance === 'number' ? account.balance : loyalty.balance_after;

  const matchLabel =
    meta?.matchMethod === 'reference_id'
      ? 'Linked by order id'
      : meta?.matchMethod === 'metadata.order_id'
        ? 'Linked by ledger metadata'
        : meta?.matchMethod === 'idempotency_key'
          ? 'Linked by idempotency key'
          : meta?.matchMethod === 'heuristic'
            ? 'Matched by time window'
            : null;

  return (
    <div className="overflow-hidden rounded-xl border border-amber-500/20 bg-linear-to-br from-amber-950/40 via-neutral-900 to-neutral-900">
      <div className="flex items-center justify-between border-b border-amber-500/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">✨</span>
          <span className="text-sm font-semibold text-amber-300">Loyalty Update</span>
        </div>
        <span className="font-mono text-2xl font-bold text-amber-400">
          {pointsDelta >= 0 ? `+${fmt(earned)}` : `-${fmt(Math.abs(pointsDelta))}`} pts
        </span>
      </div>

      <div className="space-y-3 px-4 py-4 font-mono text-xs">
        <div className="flex items-center justify-between rounded-lg bg-white/3 px-3 py-2">
          <span className="text-neutral-400">Entry type</span>
          <span className="font-semibold text-neutral-200">{loyalty.entry_type}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-white/3 px-3 py-2">
          <span className="text-neutral-400">Tier</span>
          <span className={`flex items-center gap-1 font-semibold ${tierCfg.dark.text}`}>
            {tierCfg.icon} {tierCfg.label}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-white/3 px-3 py-2">
          <span className="text-neutral-400">Streak</span>
          <span className="font-semibold text-neutral-200">{fmt(loyalty.streak_at_time)} days</span>
        </div>
        <div className="flex justify-between border-t border-white/5 pt-2 text-neutral-400">
          <span>New balance</span>
          <span className="font-bold text-neutral-200">{fmt(displayBalance)} pts</span>
        </div>
        {matchLabel ? (
          <div className="pt-1 text-10px text-neutral-500">
            {meta?.usedHeuristic ? `⚠ ${matchLabel}` : `✓ ${matchLabel}`}
          </div>
        ) : null}
      </div>
    </div>
  );
}