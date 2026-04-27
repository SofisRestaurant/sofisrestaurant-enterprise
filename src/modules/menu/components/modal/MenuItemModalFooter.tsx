// =============================================================================
// §1.8  Sticky Footer — 2026 Compact Action Bar
// =============================================================================
//
// Design: Single-row action bar inspired by Uber Eats / Apple Pay sheets.
//
//   ┌─────────────────────────────────────────────────────────────┐
//   │  [–] 2 [+]          [ Add to Order · $24.98           ▸ ] │
//   └─────────────────────────────────────────────────────────────┘
//
// Key decisions:
//   • Price lives ONLY inside the CTA — eliminates the redundant "Total" block.
//   • Qty stepper is compact (40 px buttons, 36 px display) — smaller footprint.
//   • No stacked rows — entire footer is one horizontal flex line.
//   • Validation hint replaces CTA label inline ("Choose options") — no extra line.
//   • Legal text removed from footer (belongs in checkout, not conversion surface).
//   • ~64 px total height (vs ~140 px before) — massive vertical space recovery.
//   • Safe-area padding preserved for iOS home indicator.
//
// All business logic (canAdd, phase, modifierRulesOk, pricing) is UNCHANGED.
// =============================================================================

import { memo } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { cx } from '../../utils/uiHelpers';
import { clampInt } from '../../utils/menuItemGuards';

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
  const isIdle = phase === 'idle';
  const isSuccess = phase === 'success';
  const isAdding = phase === 'adding';
  const ctaDisabled = !canAdd || !isIdle;

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
      <div className="flex items-center gap-3">
        {/* ── Compact Qty Stepper ──────────────────────────────────────
            40 px buttons, 36 px readout — snug but still above 44 px
            effective touch target with padding.                       */}
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

        {/* ── CTA — dominant, price-embedded ──────────────────────────
            Takes all remaining width. Price is the right-aligned badge
            inside the button — single source of truth, no duplication.
            Height: 48 px (thumb-perfect, compact).                   */}
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
            canAdd &&
              isIdle &&
              'bg-linear-to-r from-amber-500 to-amber-400 text-neutral-950 shadow-[0_2px_16px_rgb(245_158_11/0.3)] hover:shadow-[0_4px_24px_rgb(245_158_11/0.45)] active:scale-[0.98]',
            // ── Disabled / validation needed
            !canAdd && isIdle && 'bg-white/6 text-zinc-500 cursor-not-allowed',
            // ── Adding spinner
            isAdding && 'bg-amber-500/80 text-neutral-950 cursor-wait',
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
            ) : canAdd ? (
              'Add to Order'
            ) : (
              ctaLabel
            )}
          </span>

          {/* Right price badge — only when actionable */}
          {canAdd && isIdle && (
            <span className="shrink-0 rounded-lg bg-neutral-950/15 px-2.5 py-1 text-xs font-bold tabular-nums">
              {preflightLoading ? (
                <span className="inline-block h-3.5 w-12 animate-pulse rounded bg-neutral-950/20" />
              ) : (
                stickyTotalLabel
              )}
            </span>
          )}

          {/* Inline validation hint — shown on disabled CTA when rules fail */}
          {!modifierRulesOk && isIdle && !canAdd && (
            <span className="shrink-0 text-2xs font-medium text-amber-400/70">required ↑</span>
          )}
        </button>
      </div>
    </div>
  );
});

export { StickyFooter };
export type { StickyFooterProps };