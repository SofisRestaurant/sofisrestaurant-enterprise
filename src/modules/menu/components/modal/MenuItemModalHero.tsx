// =============================================================================
// Item title, category, price, description, and badges below the hero image.
// Mobile-first item detail screen layout, desktop dialog compatible.
// Uses Sofi's project typography system with stronger readable colors.
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
    <header className="relative z-10 pt-4 sm:pt-5" data-ui-component>
      <div className="flex items-center justify-between gap-3">
        <p
          className={cx(
            'min-w-0 truncate uppercase',
            'text-[11px] font-black leading-none tracking-[0.16em]',
            'text-[#5a4638] dark:text-white/70',
          )}
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {categoryLabel}
        </p>

        {isPopular ? (
          <span
            className={cx(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1',
              'border border-amber-700/20 bg-amber-100 text-amber-900',
              'dark:border-amber-300/25 dark:bg-amber-300/12 dark:text-amber-200',
              'text-[10px] font-black uppercase leading-none tracking-[0.12em]',
            )}
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            <Star className="h-3 w-3 fill-current" aria-hidden="true" />
            Popular
          </span>
        ) : null}
      </div>

      <h2
        id={titleId}
        className={cx(
          'mt-2 max-w-[13ch]',
          'text-[clamp(1.85rem,7.8vw,2.7rem)] font-black leading-[1.08] tracking-[-0.025em]',
          'text-[#171312] dark:text-white',
          'sm:max-w-none sm:text-[2.15rem] sm:leading-[1.08]',
        )}
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {name}
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className={cx(
            'text-2xl font-black leading-none tabular-nums tracking-[-0.02em]',
            'text-[#b45309] dark:text-[#ecc84a]',
            'sm:text-xl',
          )}
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {basePriceLabel}
        </span>

        {preflightOk ? (
          <span
            className={cx(
              'rounded-full px-2 py-1',
              'border border-emerald-700/20 bg-emerald-100 text-emerald-800',
              'dark:border-emerald-300/25 dark:bg-emerald-300/12 dark:text-emerald-200',
              'text-[9px] font-black uppercase leading-none tracking-[0.14em]',
            )}
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Verified
          </span>
        ) : preflightLoading ? (
          <span className="inline-block h-4 w-16 animate-pulse rounded-full bg-(--menu-modal-control-bg)" />
        ) : null}

        {extrasLabel ? (
          <span
            className="text-sm font-bold leading-none text-[#4b403b] dark:text-white/70"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            {extrasLabel}
          </span>
        ) : null}
      </div>

      {description ? (
        <p
          className={cx(
            'mt-3 max-w-[48ch]',
            'text-[0.95rem] font-medium leading-6 text-[#3f3632] dark:text-white/70',
            'sm:text-sm sm:leading-6',
          )}
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {description}
        </p>
      ) : null}
    </header>
  );
});