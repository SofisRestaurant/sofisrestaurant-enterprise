// =============================================================================
// §1.8  Sticky Footer — 2026 Compact Action Bar
// =============================================================================
//
// Design: Single-row action bar inspired by Uber Eats / Apple Pay sheets.
//
// Business-hours enforcement:
//   • Users can browse/customize menu items while the kitchen is closed.
//   • Add-to-cart CTA is disabled while the kitchen is closed.
//   • Modifier validation/pricing behavior remains unchanged.
// =============================================================================

import { memo } from 'react';
import { Check, Clock3, Minus, Plus } from 'lucide-react';

import { useKitchenStatus } from '@/features/restaurant/useKitchenStatus';

import { clampInt } from '../../utils/menuItemGuards';
import { cx } from '../../utils/uiHelpers';

type CartPhase = 'idle' | 'adding' | 'success';

interface StickyFooterProps {
  safeQty: number;
  maxQty: number;
  preflightLoading: boolean;
  stickyTotalLabel: string;
  canAdd: boolean;
  phase: CartPhase;
  ctaLabel: string;
  modifierRulesOk: boolean;
  onSetQty: (updater: (q: number) => number) => void;
  onAddToCart: () => void;
}

const StickyFooter = memo<StickyFooterProps>(function StickyFooter({
  safeQty,
  maxQty,
  preflightLoading,
  stickyTotalLabel,
  canAdd,
  phase,
  ctaLabel,
  modifierRulesOk,
  onSetQty,
  onAddToCart,
}) {
  const kitchenStatus = useKitchenStatus();

  const isIdle = phase === 'idle';
  const isSuccess = phase === 'success';
  const isAdding = phase === 'adding';

  const orderingClosed = !kitchenStatus.isOpen;
  const effectiveCanAdd = canAdd && !orderingClosed;
  const ctaDisabled = !effectiveCanAdd || !isIdle;

  const effectiveCtaLabel = orderingClosed ? kitchenStatus.addToCartLabel : ctaLabel;

  return (
    <div
      className={cx(
        'shrink-0 border-t border-white/6',
        'bg-neutral-950/95 backdrop-blur-xl',
        'px-4 sm:px-5',
      )}
      style={{
        paddingTop: '12px',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
      }}
    >
      {orderingClosed ? (
        <p
          className="mb-2 flex items-center gap-1.5 text-[11px] font-medium leading-snug text-amber-300/85"
          role="status"
          aria-live="polite"
        >
          <Clock3 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.3} aria-hidden="true" />
          <span>{kitchenStatus.closedMessage}</span>
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        {/* ── Compact Qty Stepper ────────────────────────────────────── */}
        <div className="flex shrink-0 items-center rounded-xl border border-white/8 bg-white/3">
          <button
            type="button"
            onClick={() => onSetQty((q) => clampInt(q - 1, 1, maxQty))}
            disabled={safeQty <= 1 || preflightLoading}
            className={cx(
              'flex h-10 w-10 items-center justify-center',
              'text-zinc-400 transition-all duration-100',
              'hover:text-white active:scale-90',
              'disabled:opacity-25 disabled:active:scale-100',
            )}
            aria-label="Decrease quantity"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>

          <span
            className="flex h-10 w-9 items-center justify-center border-x border-white/6 text-sm font-bold tabular-nums text-white"
            aria-live="polite"
            aria-label={`Quantity: ${safeQty}`}
          >
            {safeQty}
          </span>

          <button
            type="button"
            onClick={() => onSetQty((q) => clampInt(q + 1, 1, maxQty))}
            disabled={safeQty >= maxQty || preflightLoading}
            className={cx(
              'flex h-10 w-10 items-center justify-center',
              'text-zinc-400 transition-all duration-100',
              'hover:text-white active:scale-90',
              'disabled:opacity-25 disabled:active:scale-100',
            )}
            aria-label="Increase quantity"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* ── CTA — dominant, price-embedded ────────────────────────── */}
        <button
          type="button"
          onClick={onAddToCart}
          disabled={ctaDisabled}
          aria-disabled={ctaDisabled}
          aria-label={
            isSuccess
              ? 'Added to cart'
              : isAdding
                ? 'Adding to cart'
                : orderingClosed
                  ? `${kitchenStatus.addToCartLabel}. ${kitchenStatus.closedMessage}`
                  : canAdd
                    ? `Add to order, ${stickyTotalLabel}`
                    : ctaLabel
          }
          className={cx(
            'relative flex h-12 min-w-0 flex-1 items-center justify-between gap-3',
            'rounded-xl px-5 text-sm font-semibold',
            'transition-all duration-200',
            // ── Success
            isSuccess && 'bg-emerald-500 text-white shadow-[0_2px_12px_rgb(16_185_129/0.4)]',
            // ── Enabled idle
            effectiveCanAdd &&
              isIdle &&
              'bg-linear-to-r from-amber-500 to-amber-400 text-neutral-950 shadow-[0_2px_16px_rgb(245_158_11/0.3)] hover:shadow-[0_4px_24px_rgb(245_158_11/0.45)] active:scale-[0.98]',
            // ── Disabled / validation needed / closed
            !effectiveCanAdd && isIdle && 'cursor-not-allowed bg-white/6 text-zinc-500',
            // ── Adding spinner
            isAdding && 'cursor-wait bg-amber-500/80 text-neutral-950',
          )}
        >
          {/* Left label */}
          <span className="truncate">
            {isSuccess ? (
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4" aria-hidden="true" />
                Added!
              </span>
            ) : isAdding ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
                Adding…
              </span>
            ) : orderingClosed ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-4 w-4" strokeWidth={2.3} aria-hidden="true" />
                {kitchenStatus.addToCartLabel}
              </span>
            ) : canAdd ? (
              'Add to Order'
            ) : (
              effectiveCtaLabel
            )}
          </span>

          {/* Right price badge — only when actionable */}
          {effectiveCanAdd && isIdle && (
            <span className="shrink-0 rounded-lg bg-neutral-950/15 px-2.5 py-1 text-xs font-bold tabular-nums">
              {preflightLoading ? (
                <span className="inline-block h-3.5 w-12 animate-pulse rounded bg-neutral-950/20" />
              ) : (
                stickyTotalLabel
              )}
            </span>
          )}

          {/* Inline validation hint — shown on disabled CTA when rules fail */}
          {!orderingClosed && !modifierRulesOk && isIdle && !canAdd && (
            <span className="shrink-0 text-2xs font-medium text-amber-400/70">required ↑</span>
          )}
        </button>
      </div>
    </div>
  );
});

export { StickyFooter };
export type { StickyFooterProps };