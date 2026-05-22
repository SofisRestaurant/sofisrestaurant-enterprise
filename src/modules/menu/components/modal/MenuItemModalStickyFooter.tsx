// =============================================================================
// Sticky add-to-cart bar with quantity stepper and primary CTA.
// Mobile full-screen item sheet optimized, desktop dialog compatible.
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
          'bg-(--menu-modal-footer-bg)',
          'px-4 pt-3 sm:px-5',
        )}
        style={{
          boxShadow: 'var(--menu-modal-footer-shadow)',
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 14px)',
        }}
      >
        <div className="mx-auto flex w-full max-w-xl items-stretch gap-3 sm:max-w-none">
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
                'flex h-13 w-12 items-center justify-center text-(--menu-modal-muted)',
                'transition-colors hover:text-(--menu-modal-text) active:scale-95',
                'disabled:opacity-30 disabled:active:scale-100',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--menu-modal-focus-ring)',
                'sm:h-12',
              )}
              aria-label="Decrease quantity"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>

            <span
              className={cx(
                'flex h-13 min-w-10 items-center justify-center sm:h-12',
                'border-x border-(--menu-modal-border)',
                'text-base font-extrabold tabular-nums text-(--menu-modal-text)',
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
                'flex h-13 w-12 items-center justify-center text-(--menu-modal-muted)',
                'transition-colors hover:text-(--menu-modal-text) active:scale-95',
                'disabled:opacity-30 disabled:active:scale-100',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--menu-modal-focus-ring)',
                'sm:h-12',
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
              'relative flex min-h-13 min-w-0 flex-1 items-center justify-between gap-3 sm:min-h-12',
              'rounded-2xl px-5 text-sm font-extrabold tracking-[-0.01em]',
              'transition-transform duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--menu-modal-focus-ring)',
              isSuccess && 'bg-emerald-600 text-white',
              canAdd && isIdle && 'bg-ember-600 text-white active:scale-[0.985]',
              !canAdd &&
                isIdle &&
                'cursor-not-allowed bg-(--menu-modal-control-bg) text-(--menu-modal-subtle)',
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
              <span className="shrink-0 rounded-lg bg-white/20 px-2.5 py-1 text-xs font-extrabold tabular-nums">
                {preflightLoading ? (
                  <span className="inline-block h-3.5 w-12 animate-pulse rounded bg-white/25" />
                ) : (
                  stickyTotalLabel
                )}
              </span>
            ) : null}

            {!modifierRulesOk && isIdle && !canAdd ? (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-(--menu-modal-subtle)">
                Required ↑
              </span>
            ) : null}
          </button>
        </div>
      </div>
    );
  },
);