// =============================================================================
// PATH: src/modules/menu/components/modal/MenuItemModalHeader.tsx
// =============================================================================
// Sticky modal header: category eyebrow, item name, popular badge, price line.
// Pure renderer — all values pre-derived by the shell.
// =============================================================================

import { X, Star } from 'lucide-react';
import type { ModalHeaderProps } from '@/domain/menu/menu-modal.types';

export function MenuItemModalHeader({
  name,
  categoryLabel,
  isPopular,
  basePriceLabel,
  headerPriceLabel,
  extrasLabel,
  onClose,
  closeBtnRef,
}: ModalHeaderProps) {
  return (
    <div className="shrink-0 border-b border-white/10 bg-neutral-950/90 backdrop-blur supports-backdrop-filter:bg-neutral-950/70">
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-400">{categoryLabel}</p>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="truncate text-xl font-semibold">{name}</h2>
            {isPopular ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-200 ring-1 ring-amber-500/25">
                <Star className="h-3.5 w-3.5" aria-hidden="true" />
                Popular
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            <span className="font-semibold text-amber-300">{basePriceLabel}</span>{' '}
            <span className="text-[11px] text-zinc-500">• {headerPriceLabel}</span>
            {extrasLabel ? (
              <span className="ml-2 text-[11px] text-zinc-500">{extrasLabel}</span>
            ) : null}
          </p>
        </div>

        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
          aria-label="Close modal"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}