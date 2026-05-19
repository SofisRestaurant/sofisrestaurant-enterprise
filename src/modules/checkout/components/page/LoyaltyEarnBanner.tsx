// src/modules/checkout/components/page/LoyaltyEarnBanner.tsx

import { motion } from 'framer-motion';
import type { LoyaltyPreview } from '@/modules/checkout/api/checkout.api';

export function LoyaltyEarnBanner({
  preview,
  embedded = false,
}: {
  preview: LoyaltyPreview;
  embedded?: boolean;
}) {
  if (preview.pointsToEarn <= 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={
        embedded
          ? 'flex items-center justify-between rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3'
          : 'flex items-center justify-between border-b border-(--color-gold-200) bg-linear-to-r from-(--color-gold-50) to-(--color-cream-50) px-5 py-3'
      }
    >
      <div className="flex items-center gap-2.5">
        <span className="text-lg">✨</span>
        <div>
          <p className="text-sm font-semibold text-(--color-gold-800)">
            Earn <span className="tabular-nums">+{preview.pointsToEarn} pts</span> on this order
          </p>
          <p className="text-[11px] text-(--color-gold-600)">
            {preview.willLevelUp
              ? '🎉 You\'ll level up after this order!'
              : preview.pointsToNextTier !== null
                ? `${preview.pointsToNextTier} pts to next tier`
                : 'Maximum tier — best rewards active'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="rounded-full bg-(--color-gold-400) px-2.5 py-0.5 text-xs font-bold text-white tabular-nums">
          +{preview.pointsToEarn}
        </span>
        {preview.tierMultiplier > 1 && (
          <span className="rounded-full bg-(--color-gold-100) px-1.5 py-px text-[10px] font-semibold text-(--color-gold-700)">
            ×{preview.tierMultiplier}
          </span>
        )}
      </div>
    </motion.div>
  );
}