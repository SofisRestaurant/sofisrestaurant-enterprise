// =============================================================================
// Legacy modal header.
// Kept for import stability, but renders its own compact, readable header.
// Uses project font tokens for better visibility and consistency.
// =============================================================================

import { Star, X } from 'lucide-react';

import type { ModalHeaderProps } from '@/domain/menu/menu-modal.types';

export function MenuItemModalHeader({
  name,
  categoryLabel,
  isPopular,
  basePriceLabel,
  extrasLabel,
  onClose,
  closeBtnRef,
  headerPriceLabel,
}: ModalHeaderProps) {
  const priceLabel = headerPriceLabel || basePriceLabel;

  return (
    <header className="relative z-10 border-b border-(--menu-modal-border) bg-(--menu-modal-surface) px-4 py-3 sm:px-5 sm:py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 truncate font-body text-[10px] font-black uppercase tracking-[0.16em] text-(--menu-modal-subtle)">
              {categoryLabel}
            </p>

            {isPopular ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-(--menu-modal-pill-popular-border) bg-(--menu-modal-pill-popular-bg) px-2 py-0.5 font-body text-[9px] font-black uppercase tracking-[0.12em] text-(--menu-modal-pill-popular-text)">
                <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                Popular
              </span>
            ) : null}
          </div>

          <h2
            id="menu-item-modal-title"
            className="mt-1.5 line-clamp-2 font-display text-2xl font-black leading-[1.08] tracking-[-0.025em] text-(--menu-modal-text) sm:text-3xl"
          >
            {name}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-body text-lg font-black tabular-nums tracking-[-0.02em] text-(--menu-modal-accent)">
              {priceLabel}
            </span>

            {extrasLabel ? (
              <span className="font-body text-xs font-bold text-(--menu-modal-muted)">
                {extrasLabel}
              </span>
            ) : null}
          </div>
        </div>

        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-(--menu-modal-border) bg-(--menu-modal-control-bg) text-(--menu-modal-text) shadow-sm transition hover:bg-(--menu-modal-control-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--menu-modal-accent)"
          aria-label="Close item details"
        >
          <X className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}