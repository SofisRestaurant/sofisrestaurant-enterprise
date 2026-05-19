// Checkout footer strip — compact premium mobile checkout dock.
// Mobile-first: keeps checkout visible while giving item list more space.

import { ArrowRight, Clock3, Lock, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';

import type { useCartSummary } from '@/domain/cart/use-cart-summary';
import type { KitchenStatus } from '@/features/restaurant/hours';
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
  kitchenStatus: KitchenStatus;
}

export function CartFooter({
  totals,
  pts,
  confirmClear,
  setConfirmClear,
  clearFn,
  onCheckout,
  kitchenStatus,
}: CartFooterProps) {
  const totalLabel = formatCents(totals.totalCents);
  const hasRewards = pts > 0;
  const checkoutDisabled = !kitchenStatus.isOpen;

  return (
    <footer
      className={[
        'relative shrink-0 overflow-hidden border-t border-cream-200/70',
        'bg-white/96 px-3 pt-2 shadow-[0_-14px_34px_rgba(15,23,42,0.09)] backdrop-blur-2xl',
        'dark:border-white/10 dark:bg-ink-950/96 dark:shadow-[0_-16px_38px_rgba(0,0,0,0.32)]',
        'sm:px-4 sm:pt-2.5',
      ].join(' ')}
      style={{ paddingBottom: 'max(0.55rem, env(safe-area-inset-bottom))' }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-300/65 to-transparent dark:via-ember-400/30"
        aria-hidden="true"
      />

      <div className="mx-auto w-full max-w-xl">
        {!confirmClear ? (
          <>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-[9px] font-black uppercase leading-none tracking-[0.14em] text-ink-400 dark:text-white/45">
                    Estimated total
                  </p>

                  {hasRewards ? (
                    <span className="hidden items-center gap-1 rounded-full bg-ember-50 px-1.5 py-0.5 text-[9px] font-black text-ember-700 dark:bg-ember-400/10 dark:text-ember-300 xs:inline-flex">
                      <Sparkles className="h-2.5 w-2.5" strokeWidth={2.3} aria-hidden="true" />+
                      {pts}
                    </span>
                  ) : null}
                </div>

                <p className="mt-0.5 text-xl font-black leading-none tabular-nums tracking-tight text-ink-950 dark:text-white sm:text-[1.45rem]">
                  {totalLabel}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-cream-200 bg-cream-50 px-2.5 py-1 text-[10px] font-black text-ink-600 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-white/70">
                {checkoutDisabled ? (
                  <Clock3
                    className="h-3.5 w-3.5 text-ember-600 dark:text-ember-300"
                    strokeWidth={2.4}
                    aria-hidden="true"
                  />
                ) : (
                  <ShieldCheck
                    className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                    strokeWidth={2.4}
                    aria-hidden="true"
                  />
                )}
                {checkoutDisabled ? 'Closed' : 'Secure'}
              </div>
            </div>

            <button
              type="button"
              disabled={checkoutDisabled}
              onClick={(event) => {
                event.stopPropagation();

                if (checkoutDisabled) {
                  return;
                }

                onCheckout();
              }}
              className={[
                cartPrimaryCta,
                'group min-h-11 py-2.5 text-sm shadow-[0_12px_28px_rgba(168,69,32,0.24)]',
                'active:scale-[0.985] motion-safe:transition-transform sm:min-h-12 sm:py-3',
                checkoutDisabled
                  ? [
                      'cursor-not-allowed opacity-65 shadow-none',
                      'hover:translate-y-0 hover:shadow-none active:scale-100',
                    ].join(' ')
                  : '',
              ].join(' ')}
              aria-disabled={checkoutDisabled}
              aria-label={
                checkoutDisabled
                  ? `${kitchenStatus.checkoutLabel}. ${kitchenStatus.closedMessage}`
                  : `Checkout — ${totalLabel}`
              }
            >
              <span className="relative flex items-center justify-center gap-2">
                {checkoutDisabled ? (
                  <Clock3 className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
                ) : (
                  <Lock className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
                )}

                <span>{checkoutDisabled ? kitchenStatus.checkoutLabel : 'Checkout'}</span>

                {!checkoutDisabled ? (
                  <>
                    <span className="font-black tabular-nums">{totalLabel}</span>
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                  </>
                ) : null}
              </span>
            </button>

            <div className="mt-1.5 flex min-h-4 items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-1 text-[9.5px] font-medium leading-tight text-ink-500 dark:text-white/50">
                {checkoutDisabled ? (
                  <Clock3
                    className="h-2.5 w-2.5 shrink-0 text-ember-600 dark:text-ember-300"
                    strokeWidth={2.25}
                    aria-hidden="true"
                  />
                ) : (
                  <Lock
                    className="h-2.5 w-2.5 shrink-0 text-ember-600 dark:text-ember-300"
                    strokeWidth={2.25}
                    aria-hidden="true"
                  />
                )}

                <span className="truncate">
                  {checkoutDisabled
                    ? kitchenStatus.closedMessage
                    : 'Final total confirmed by Stripe.'}
                </span>
              </p>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setConfirmClear(true);
                }}
                className={[
                  cartGhostButton,
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none',
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
