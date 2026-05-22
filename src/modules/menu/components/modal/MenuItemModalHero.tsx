// =============================================================================
// Item title, category, price, description, and badges below the hero image.
// Mobile-first item detail screen layout, desktop dialog compatible.
// Token-driven light/dark typography.
// =============================================================================

import { memo } from 'react';
import { Star } from 'lucide-react';
import { cx } from '../../utils/uiHelpers';

interface MenuItemModalHeroProps {
  titleId: string;
  categoryLabel: string;
  name: string;
  description: string;
  isPopular: boolean;
  basePriceLabel: string;
  extrasLabel: string | null;
  preflightOk: boolean;
  preflightLoading: boolean;
}

export const MenuItemModalHero = memo<MenuItemModalHeroProps>(function MenuItemModalHero({
  titleId,
  categoryLabel,
  name,
  description,
  isPopular,
  basePriceLabel,
  extrasLabel,
  preflightOk,
  preflightLoading,
}) {
  return (
    <header className="relative z-10 pt-5 sm:pt-5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[11px] font-extrabold uppercase tracking-[0.18em] text-(--menu-modal-subtle)">
          {categoryLabel}
        </p>

        {isPopular ? (
          <span
            className={cx(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1',
              'text-[10px] font-extrabold uppercase tracking-wider',
              'border border-(--menu-modal-pill-popular-border)',
              'bg-(--menu-modal-pill-popular-bg) text-(--menu-modal-pill-popular-text)',
            )}
          >
            <Star className="h-3 w-3 fill-current" aria-hidden="true" />
            Popular
          </span>
        ) : null}
      </div>

      <h2
        id={titleId}
        className={cx(
          'mt-2 font-sans font-extrabold leading-[1.02] tracking-[-0.045em]',
          'text-[clamp(2rem,9vw,3.15rem)] text-(--menu-modal-text)',
          'sm:text-[1.85rem] sm:leading-tight sm:tracking-[-0.035em]',
        )}
      >
        {name}
      </h2>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-2xl font-extrabold tabular-nums tracking-[-0.03em] text-(--menu-modal-accent) sm:text-xl">
          {basePriceLabel}
        </span>

        {preflightOk ? (
          <span
            className={cx(
              'rounded-full px-2 py-1 text-[9px] font-extrabold uppercase tracking-widest',
              'border border-(--menu-modal-pill-verified-bg)',
              'bg-(--menu-modal-pill-verified-bg) text-(--menu-modal-pill-verified-text)',
            )}
          >
            Verified
          </span>
        ) : preflightLoading ? (
          <span className="inline-block h-4 w-16 animate-pulse rounded-full bg-(--menu-modal-control-bg)" />
        ) : null}

        {extrasLabel ? (
          <span className="text-sm font-bold text-(--menu-modal-muted)">{extrasLabel}</span>
        ) : null}
      </div>

      {description ? (
        <p className="mt-4 max-w-[46ch] text-[0.95rem] font-medium leading-7 text-(--menu-modal-muted) sm:text-sm sm:leading-relaxed">
          {description}
        </p>
      ) : null}
    </header>
  );
});