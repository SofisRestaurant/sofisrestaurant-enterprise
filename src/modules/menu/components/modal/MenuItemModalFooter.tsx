// =============================================================================
// PATH: src/modules/menu/components/modal/MenuItemModalFooter.tsx
// =============================================================================
// Sticky footer: qty stepper + running total + add-to-order CTA.
// Pure renderer — all label derivation delegated to modalLabels util.
// =============================================================================

import type { ModalFooterProps } from '@/domain/menu/menu-modal.types';
import { cx } from '../../utils/uiHelpers';
import { clampInt } from '../../utils/menuItemGuards';
import { deriveAddButtonLabel } from '../../utils/modal/modalLabels';
import { MenuItemModalQuantity } from './MenuItemModalQuantity';

export function MenuItemModalFooter({
  safeQty,
  maxQty,
  stickyTotalLabel,
  preflightLoading,
  phase,
  canAdd,
  invalidItem,
  modifierRulesOk,
  unavailable,
  onDecrement,
  onIncrement,
  onAddToCart,
}: ModalFooterProps) {
  const addLabel = deriveAddButtonLabel({
    invalidItem,
    preflightLoading,
    phase,
    unavailable,
    modifierRulesOk,
  });

  const ctaDisabled = !canAdd || phase !== 'idle' || invalidItem;

  return (
    <div className="shrink-0 border-t border-white/10 bg-neutral-950/90 backdrop-blur supports-backdrop-filter:bg-neutral-950/70">
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Left: qty + total */}
          <div className="flex items-center gap-3">
            <MenuItemModalQuantity
              safeQty={safeQty}
              maxQty={maxQty}
              preflightLoading={preflightLoading}
              invalidItem={invalidItem}
              onDecrement={onDecrement}
              onIncrement={onIncrement}
            />

            <div className="min-w-0">
              <p className="text-xs text-zinc-400">Total</p>
              <p className="text-lg font-bold text-white truncate">{stickyTotalLabel}</p>
              <p className="text-[11px] text-zinc-500">
                {preflightLoading ? 'Checking…' : ''}
              </p>
            </div>
          </div>

          {/* Right: CTA */}
          <button
            type="button"
            className={cx(
              'btn btn-primary h-12 rounded-2xl px-5 text-sm font-semibold transition',
              ctaDisabled && 'btn-ghost-dark cursor-not-allowed',
            )}
            onClick={onAddToCart}
            disabled={ctaDisabled}
            aria-disabled={ctaDisabled ? 'true' : 'false'}
            aria-label="Add to order"
          >
            {addLabel}
          </button>
        </div>

        {/* Inline modifier validation nudge */}
        {!modifierRulesOk && !invalidItem ? (
          <p className="mt-2 text-center text-[11px] font-semibold text-amber-200">
            Choose required options to continue.
          </p>
        ) : null}

        {/* Legal / trust copy */}
        <p className="mt-2 text-center text-[11px] text-zinc-500">
          Final totals (tax, promos, credits) are enforced again at checkout by server + Stripe.
        </p>
      </div>
    </div>
  );
}