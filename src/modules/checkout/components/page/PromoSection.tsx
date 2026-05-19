// src/modules/checkout/components/page/PromoSection.tsx

import type { ChangeEvent, KeyboardEvent } from 'react';
import type { PromoState } from '@/modules/checkout/types/checkout-page.types';
import { CHECKOUT_LIMITS } from '@/modules/checkout/utils/checkoutPageStorage';

export function PromoSection({
  promo,
  onPromoChange,
  onPromoApply,
  onPromoClear,
  onPromoKeyDown,
  embedded = false,
}: {
  promo: PromoState;
  onPromoChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onPromoApply: () => void;
  onPromoClear: () => void;
  onPromoKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  embedded?: boolean;
}) {
  return (
    <div className={embedded ? '' : 'px-5 py-4'}>
      {promo.applied ? (
        <div className="flex items-center justify-between rounded-xl border border-(--color-success) bg-(--color-success-bg) px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-(--color-success)">✓ {promo.code}</span>
            <span className="text-xs text-(--color-success)">queued</span>
          </div>
          <button
            type="button"
            onClick={onPromoClear}
            className="text-xs text-(--color-ink-400) underline hover:text-(--color-ink-700)"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={promo.code}
            onChange={onPromoChange}
            onKeyDown={onPromoKeyDown}
            placeholder="PROMO CODE"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={CHECKOUT_LIMITS.PROMO_MAX}
            className="input flex-1 font-mono uppercase tracking-wider"
            aria-label="Promo code"
          />
          <button
            type="button"
            onClick={onPromoApply}
            disabled={!promo.code.trim()}
            className="btn btn-ghost px-4 text-sm disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      )}
      {promo.error && (
        <p className="mt-2 text-xs font-medium text-(--color-error)">{promo.error}</p>
      )}
    </div>
  );
}