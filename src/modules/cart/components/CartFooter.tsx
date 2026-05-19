// Checkout footer strip — presentational; props threaded from CartDrawer.

import { ArrowRight, Lock, Sparkles } from 'lucide-react';

import type { useCartSummary } from '@/domain/cart/use-cart-summary';
import { formatCents } from '@/modules/cart/utils/cart.utils';

import { cartGhostButton, cartPrimaryCta } from './cartStyles';

type SummaryTotals = ReturnType<typeof useCartSummary>['totals'];

export interface CartFooterProps {
  totals: SummaryTotals;
  pts: number;
  confirmClear: boolean;
  setConfirmClear: (v: boolean) => void;
  clearFn: () => void;
  onCheckout: () => void;
}

export function CartFooter({
  totals,
  pts,
  confirmClear,
  setConfirmClear,
  clearFn,
  onCheckout,
}: CartFooterProps) {
  return (
    <footer
      className="shrink-0 border-t border-cream-200 bg-white/95 px-4 pt-3 backdrop-blur-md"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-ink-400">
            Estimated total
          </p>
          <p className="text-2xl font-black tabular-nums tracking-tight text-ink-900">
            {formatCents(totals.totalCents)}
          </p>
        </div>
        <p className="flex items-center gap-1 text-[11px] font-medium text-ink-500">
          <Lock className="h-3.5 w-3.5 text-ember-600" strokeWidth={2.25} aria-hidden="true" />
          Secure checkout
        </p>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCheckout();
        }}
        className={cartPrimaryCta}
        aria-label={`Checkout — ${formatCents(totals.totalCents)}`}
      >
        <span className="relative flex items-center justify-center gap-2">
          Checkout
          <span className="font-black tabular-nums">{formatCents(totals.totalCents)}</span>
          <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
        </span>
      </button>

      <p className="mt-2 text-center text-[11px] leading-snug text-ink-500">
        Final total confirmed before payment via Stripe.
      </p>

      {pts > 0 ? (
        <p className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] font-medium text-ember-700">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
          Earn <strong className="font-black">+{pts}</strong> loyalty points
        </p>
      ) : null}

      <div className="mt-3 flex min-h-6 justify-center">
        {!confirmClear ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmClear(true);
            }}
            className={cartGhostButton}
          >
            Clear bag
          </button>
        ) : (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-ink-500">Remove all items?</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearFn();
                setConfirmClear(false);
              }}
              className="rounded-full px-2 py-1 text-xs font-bold text-ember-700 hover:bg-ember-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-600/40"
            >
              Yes, clear
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmClear(false);
              }}
              className={cartGhostButton}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </footer>
  );
}
