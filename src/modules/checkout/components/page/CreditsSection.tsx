// src/modules/checkout/components/page/CreditsSection.tsx

import type { UserCredit } from '@/modules/checkout/api/checkout.api';
import { formatCents } from '@/modules/cart/utils/cart.utils';
import {
  safeMoneyCents,
  safeText,
} from '@/modules/checkout/utils/checkoutPageFormatters';

export function CreditsSection({
  credits,
  creditsLoading,
  creditsError,
  creditsAvailableCents,
  selectedCredit,
  onSelectCredit,
  onRemoveCredit,
  onRetry,
}: {
  credits: UserCredit[];
  creditsLoading: boolean;
  creditsError: string | null;
  creditsAvailableCents: number;
  selectedCredit: string | null;
  onSelectCredit: (id: string) => void;
  onRemoveCredit: () => void;
  onRetry: () => void;
}) {
  if (creditsLoading) {
    return (
      <div className="rounded-xl border border-(--color-cream-200) bg-(--color-cream-50) px-4 py-3 text-sm text-(--color-ink-400)">
        Loading credits…
      </div>
    );
  }

  if (creditsError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-sm font-semibold text-red-800">{creditsError}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-red-800 ring-1 ring-red-200 hover:bg-red-50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (credits.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-(--color-ink-600)">Store Credits</p>
        <span className="text-xs font-semibold text-(--color-gold-600) tabular-nums">
          {formatCents(creditsAvailableCents)} available
        </span>
      </div>
      <div className="divide-y divide-(--color-cream-200) rounded-xl border border-(--color-cream-300) overflow-hidden">
        {credits.map((credit) => {
          const amt = safeMoneyCents(credit.amount_cents);
          const exp = safeText(credit.expires_at, 64);
          return (
            <label
              key={credit.id}
              className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-(--color-cream-50) transition-colors"
            >
              <input
                type="radio"
                name="credit"
                value={credit.id}
                checked={selectedCredit === credit.id}
                onChange={() => onSelectCredit(credit.id)}
                className="h-4 w-4 text-(--color-gold-500) focus:ring-(--color-gold-400)"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-(--color-ink-800) tabular-nums">
                  {formatCents(amt)} credit
                </p>
                <p className="text-xs text-(--color-ink-400)">
                  {String(credit.source ?? '').replace(/_/g, ' ') || 'credit'}
                  {exp
                    ? ` · Expires ${new Date(exp).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}`
                    : ''}
                </p>
              </div>
              {selectedCredit === credit.id && (
                <span className="text-xs font-bold text-(--color-gold-600)">Selected</span>
              )}
            </label>
          );
        })}
      </div>
      {selectedCredit && (
        <button
          type="button"
          onClick={onRemoveCredit}
          className="mt-2 text-xs text-(--color-ink-300) underline hover:text-(--color-ink-600)"
        >
          Remove credit
        </button>
      )}
    </div>
  );
}