// =============================================================================
// Item title, category, price, description, and badges below the hero image.
// =============================================================================

import { memo } from 'react';
import { Star } from 'lucide-react';
import { cx } from '../../utils/uiHelpers';
import { MODAL_ANIM } from './menuItemModalAnimations';

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
    <header
      className="pt-5"
      style={{ animation: MODAL_ANIM.stagger(40) }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">
        {categoryLabel}
      </p>

      <div className="mt-2 flex flex-wrap items-start gap-2.5">
        <h2
          id={titleId}
          className="font-sans text-2xl font-semibold leading-tight tracking-[-0.03em] text-ink-900 sm:text-[1.75rem]"
        >
          {name}
        </h2>
        {isPopular ? (
          <span
            className={cx(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1',
              'text-[10px] font-bold uppercase tracking-wider',
              'bg-gold-100 text-ember-700 ring-1 ring-gold-200',
            )}
          >
            <Star className="h-3 w-3 fill-current" aria-hidden="true" />
            Popular
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xl font-semibold tabular-nums text-ember-700">{basePriceLabel}</span>
        {preflightOk ? (
          <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-700 ring-1 ring-emerald-200/80">
            Verified
          </span>
        ) : preflightLoading ? (
          <span className="inline-block h-3.5 w-14 animate-pulse rounded-md bg-cream-200" />
        ) : null}
        {extrasLabel ? (
          <span className="text-sm font-medium text-ink-500">{extrasLabel}</span>
        ) : null}
      </div>

      {description ? (
        <p className="mt-4 text-sm leading-relaxed text-ink-600">{description}</p>
      ) : null}
    </header>
  );
});
