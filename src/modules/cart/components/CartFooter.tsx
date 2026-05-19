// Checkout footer strip — premium mobile checkout dock.
// Mobile-first: keeps checkout visible without stealing item-list height.

import { ArrowRight, Lock, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';

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
  const totalLabel = formatCents(totals.totalCents);
  const hasRewards = pts > 0;

  return (
    <footer
      className={[
        'relative shrink-0 overflow-hidden border-t border-cream-200/80',
        'bg-white/95 px-3 pt-2.5 shadow-[0_-18px_45px_rgba(15,23,42,0.10)] backdrop-blur-2xl',
        'dark:border-white/10 dark:bg-ink-950/95 dark:shadow-[0_-18px_45px_rgba(0,0,0,0.35)]',
        'sm:px-4 sm:pt-3',
      ].join(' ')}
      style={{ paddingBottom: 'max(0.7rem, env(safe-area-inset-bottom))' }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-300/80 to-transparent dark:via-ember-400/35"
        aria-hidden="true"
      />

      <div className="mx-auto w-full max-w-xl">
        {!confirmClear ? (
          <>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-0.5 flex items-center gap-1.5">
                  <p className="text-[9px] font-black uppercase tracking-[0.15em] text-ink-400 dark:text-white/45">
                    Estimated total
                  </p>

                  <span className="hidden rounded-full bg-cream-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.11em] text-ink-500 dark:bg-white/5 dark:text-white/50 xs:inline-flex">
                    Pickup
                  </span>
                </div>

                <p className="text-[1.35rem] font-black leading-none tabular-nums tracking-tight text-ink-950 dark:text-white sm:text-2xl">
                  {totalLabel}
                </p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-cream-200 bg-cream-50 px-2.5 py-1 text-[10px] font-black text-ink-600 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white/70">
                  <ShieldCheck
                    className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                    strokeWidth={2.4}
                    aria-hidden="true"
                  />
                  Secure
                </div>

                {hasRewards ? (
                  <p className="hidden items-center gap-1 text-[10px] font-bold text-ember-700 dark:text-ember-300 xs:flex">
                    <Sparkles className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />+{pts} pts
                  </p>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onCheckout();
              }}
              className={[
                cartPrimaryCta,
                'group min-h-12 py-3 text-sm shadow-[0_14px_34px_rgba(168,69,32,0.26)]',
                'active:scale-[0.985] motion-safe:transition-transform',
              ].join(' ')}
              aria-label={`Checkout — ${totalLabel}`}
            >
              <span className="relative flex items-center justify-center gap-2">
                <Lock className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
                <span>Checkout</span>
                <span className="font-black tabular-nums">{totalLabel}</span>
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
              </span>
            </button>

            <div className="mt-2 flex min-h-5 items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-1 text-[10px] font-medium text-ink-500 dark:text-white/50">
                <Lock
                  className="h-3 w-3 shrink-0 text-ember-600 dark:text-ember-300"
                  strokeWidth={2.25}
                  aria-hidden="true"
                />
                <span className="truncate">Final total confirmed by Stripe before payment.</span>
              </p>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setConfirmClear(true);
                }}
                className={[
                  cartGhostButton,
                  'shrink-0 rounded-full px-2 py-1 text-[10px] font-black',
                  'text-ink-400 hover:bg-cream-100 hover:text-ember-700',
                  'dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-ember-300',
                ].join(' ')}
                aria-label="Clear bag"
              >
                <span className="inline-flex items-center gap-1">
                  <Trash2 className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
                  Clear
                </span>
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-ember-200 bg-gradient-to-br from-ember-50 to-white p-2 shadow-sm dark:border-ember-400/20 dark:from-ember-400/10 dark:to-white/[0.03]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 pl-1">
                <p className="text-xs font-black text-ink-900 dark:text-white">Clear your bag?</p>
                <p className="mt-0.5 truncate text-[10px] font-medium text-ink-500 dark:text-white/50">
                  This removes every item from your order.
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    clearFn();
                    setConfirmClear(false);
                  }}
                  className="rounded-full bg-ember-600 px-3 py-1.5 text-[11px] font-black text-white shadow-sm transition hover:bg-ember-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-600/40"
                >
                  Clear
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setConfirmClear(false);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-cream-200 bg-white text-ink-500 shadow-sm transition hover:bg-cream-50 hover:text-ink-900 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-600/40 dark:border-white/10 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
                  aria-label="Cancel clear bag"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </footer>
  );
}
