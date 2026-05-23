// src/modules/checkout/components/RewardsRedeem.tsx
// =============================================================================
// REWARDS REDEEM — Loyalty points redemption toggle
// =============================================================================
// PHASE 1: Cash-like point redemption is disabled. This component shows a
// read-only banner confirming points are safe and still earning. No redemption
// intent is ever emitted to the checkout flow.
// =============================================================================

import { memo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LoyaltyRedeemValue = {
  applyPoints: boolean;
  pointsToRedeem: number;
  loyaltyAccountId: string;
};

type Props = {
  balance: number;
  accountId: string;
  subtotalCents?: number;
  onChange: (value: LoyaltyRedeemValue) => void;
  isBusy?: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export const RewardsRedeem = memo(function RewardsRedeem({ balance }: Props) {
  if (balance <= 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-amber-500" aria-hidden="true">
          ✦
        </span>
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {balance.toLocaleString()} loyalty points
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Reward redemption is being upgraded. Your points are safe and still earning.
          </p>
        </div>
      </div>
    </div>
  );
});