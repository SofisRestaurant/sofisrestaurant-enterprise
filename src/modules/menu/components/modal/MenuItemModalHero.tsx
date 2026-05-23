// =============================================================================
// Item title, category, price, description, and badges below the hero image.
// Mobile-first item detail screen layout, desktop dialog compatible.
// Hardens visibility against global h2 / p typography overrides.
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

const fontSansStyle = {
  fontFamily: 'var(--font-sans)',
};

const titleStyle = {
  fontFamily: 'var(--font-sans)',
  color: 'var(--menu-modal-text, #171312)',
};

const categoryStyle = {
  fontFamily: 'var(--font-sans)',
  color: 'var(--menu-modal-subtle, #5a4638)',
};

const priceStyle = {
  fontFamily: 'var(--font-sans)',
  color: 'var(--menu-modal-accent, #b45309)',
};

const mutedStyle = {
  fontFamily: 'var(--font-sans)',
  color: 'var(--menu-modal-muted, #4b403b)',
};

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
      className="relative z-30 px-5 pt-5 sm:px-6 sm:pt-5"
      data-ui-component
      style={{
        ...fontSansStyle,
        color: 'var(--menu-modal-text, #171312)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className="min-w-0 truncate text-[11px] font-black uppercase leading-none tracking-[0.16em]"
          style={categoryStyle}
        >
          {categoryLabel}
        </p>

        {isPopular ? (
          <span
            className={cx(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1',
              'border border-(--menu-modal-pill-popular-border)',
              'bg-(--menu-modal-pill-popular-bg)',
              'text-[10px] font-black uppercase leading-none tracking-[0.12em]',
            )}
            style={{
              ...fontSansStyle,
              color: 'var(--menu-modal-pill-popular-text, #92400e)',
            }}
          >
            <Star className="h-3 w-3 fill-current" aria-hidden="true" />
            Popular
          </span>
        ) : null}
      </div>

      <h2
        id={titleId}
        className={cx(
          'mt-2 block max-w-[14ch]',
          'text-[clamp(2rem,8vw,2.8rem)] font-black leading-[1.08] tracking-[-0.025em]',
          'sm:max-w-none sm:text-[2.25rem] sm:leading-[1.08]',
        )}
        style={titleStyle}
      >
        {name}
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className="text-2xl font-black leading-none tabular-nums tracking-[-0.02em] sm:text-xl"
          style={priceStyle}
        >
          {basePriceLabel}
        </span>

        {preflightOk ? (
          <span
            className={cx(
              'rounded-full px-2 py-1',
              'border border-(--menu-modal-pill-verified-bg)',
              'bg-(--menu-modal-pill-verified-bg)',
              'text-[9px] font-black uppercase leading-none tracking-[0.14em]',
            )}
            style={{
              ...fontSansStyle,
              color: 'var(--menu-modal-pill-verified-text, #047857)',
            }}
          >
            Verified
          </span>
        ) : preflightLoading ? (
          <span className="inline-block h-4 w-16 animate-pulse rounded-full bg-(--menu-modal-control-bg)" />
        ) : null}

        {extrasLabel ? (
          <span className="text-sm font-bold leading-none" style={mutedStyle}>
            {extrasLabel}
          </span>
        ) : null}
      </div>

      {description ? (
        <p
          className="mt-3 max-w-[48ch] text-[0.95rem] font-medium leading-6 sm:text-sm"
          style={mutedStyle}
        >
          {description}
        </p>
      ) : null}
    </header>
  );
});