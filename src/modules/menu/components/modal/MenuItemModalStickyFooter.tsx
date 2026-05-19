// =============================================================================
// Sticky add-to-cart bar with quantity stepper and primary CTA.
// =============================================================================

import { memo } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import type { CartPhase } from '@/domain/menu/menu-modal.types';
import { cx } from '../../utils/uiHelpers';
import { clampInt } from '../../utils/menuItemGuards';

export interface MenuItemModalStickyFooterProps {
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

export const MenuItemModalStickyFooter = memo<MenuItemModalStickyFooterProps>(
  function MenuItemModalStickyFooter({
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
          'shrink-0 border-t border-(--menu-modal-border)',
          'bg-(--menu-modal-footer-bg) backdrop-blur-xl',
          'px-4 pt-3 sm:px-5',
        )}
        style={{
          boxShadow: 'var(--menu-modal-footer-shadow)',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 14px)',
        }}
      >
        <div className="flex items-stretch gap-3">
          <div
            className={cx(
              'flex shrink-0 items-center rounded-2xl',
              'border border-(--menu-modal-border) bg-(--menu-modal-control-bg)',
            )}
          >
            <button
              type="button"
              onClick={() => onSetQty((q) => clampInt(q - 1, 1, maxQty))}
              disabled={safeQty <= 1 || preflightLoading}
              className={cx(
                'flex h-12 w-12 items-center justify-center text-ink-600',
                'transition-colors hover:text-ink-900 active:scale-95',
                'disabled:opacity-30 disabled:active:scale-100',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--menu-modal-focus-ring)',
              )}
              aria-label="Decrease quantity"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>

            <span
              className={cx(
                'flex h-12 min-w-10 items-center justify-center',
                'border-x border-(--menu-modal-border)',
                'text-base font-bold tabular-nums text-ink-900',
              )}
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
                'flex h-12 w-12 items-center justify-center text-ink-600',
                'transition-colors hover:text-ink-900 active:scale-95',
                'disabled:opacity-30 disabled:active:scale-100',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--menu-modal-focus-ring)',
              )}
              aria-label="Increase quantity"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

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
                    ? `Add to cart, ${stickyTotalLabel}`
                    : ctaLabel
            }
            className={cx(
              'relative flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3',
              'rounded-2xl px-5 text-sm font-semibold tracking-[-0.01em]',
              'transition-all duration-200',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--menu-modal-focus-ring)',
              isSuccess &&
                'bg-emerald-600 text-white shadow-[0_4px_20px_rgb(5_150_105/0.35)]',
              canAdd &&
                isIdle &&
                'bg-ember-600 text-white shadow-[0_6px_24px_rgb(180_83_9/0.28)] hover:bg-ember-700 active:scale-[0.98]',
              !canAdd && isIdle && 'cursor-not-allowed bg-cream-200 text-ink-500',
              isAdding && 'cursor-wait bg-ember-600/85 text-white',
            )}
          >
            <span className="truncate">
              {isSuccess ? (
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Added!
                </span>
              ) : isAdding ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Adding…
                </span>
              ) : canAdd ? (
                'Add to cart'
              ) : (
                ctaLabel
              )}
            </span>

            {canAdd && isIdle ? (
              <span className="shrink-0 rounded-lg bg-white/20 px-2.5 py-1 text-xs font-bold tabular-nums">
                {preflightLoading ? (
                  <span className="inline-block h-3.5 w-12 animate-pulse rounded bg-white/25" />
                ) : (
                  stickyTotalLabel
                )}
              </span>
            ) : null}

            {!modifierRulesOk && isIdle && !canAdd ? (
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink-500">
                Required ↑
              </span>
            ) : null}
          </button>
        </div>
      </div>
    );
  },
);
