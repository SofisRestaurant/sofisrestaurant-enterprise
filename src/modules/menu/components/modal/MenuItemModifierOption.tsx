// =============================================================================
// Single modifier option row — radio or checkbox visual by group type.
// =============================================================================

import { memo } from 'react';
import { Check } from 'lucide-react';
import type { Modifier } from '@/domain/menu/menu.types';
import { fmtUsdFromCents } from '../../utils/menuItemGuards';
import { deriveModifierPriceLabel } from '../../utils/modal/modalLabels';
import { cx } from '../../utils/uiHelpers';

interface MenuItemModifierOptionProps {
  modifier: Modifier;
  isSelected: boolean;
  isBlocked: boolean;
  selectionType: 'radio' | 'checkbox';
  onSelect: () => void;
}

const optionBaseClass = cx(
  'group flex min-h-14 w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left',
  'transition-[background-color,color,box-shadow,transform,border-color,opacity] duration-200 ease-out',
  'touch-manipulation select-none',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c79a3b]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
  'dark:focus-visible:ring-offset-[#0f0d0c]',
);

const optionIdleClass = cx(
  'border border-[rgba(61,42,32,0.08)] bg-[rgba(255,255,255,0.58)]',
  'text-[#4d382e] shadow-[0_8px_18px_rgba(46,24,12,0.045)]',
  'hover:border-[rgba(61,42,32,0.12)] hover:bg-white/82 hover:text-[#2f1f18]',
  'active:scale-[0.99]',
  'dark:border-white/10 dark:bg-white/[0.065] dark:text-white/72',
  'dark:hover:bg-white/10 dark:hover:text-white',
);

const optionSelectedClass = cx(
  'border border-[rgba(63,36,24,0.14)] bg-[#3f2418] text-[#fff8ee]',
  'shadow-[0_12px_26px_rgba(63,36,24,0.20),inset_0_1px_0_rgba(255,255,255,0.16)]',
  'active:scale-[0.99]',
  'dark:border-white/10 dark:bg-[#f4dec0] dark:text-[#21130d]',
  'dark:shadow-[0_12px_28px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.48)]',
);

const optionBlockedClass = cx(
  'border-[#8a3a24]/28 ring-1 ring-[#8a3a24]/16',
  'dark:border-[#f4dec0]/22 dark:ring-[#f4dec0]/10',
);

const optionDisabledClass = cx(
  'cursor-not-allowed opacity-45',
  'hover:bg-[rgba(255,255,255,0.58)] hover:text-[#4d382e] active:scale-100',
  'dark:hover:bg-white/[0.065] dark:hover:text-white/72',
);

export const MenuItemModifierOption = memo<MenuItemModifierOptionProps>(function MenuItemModifierOption({
  modifier: m,
  isSelected,
  isBlocked,
  selectionType,
  onSelect,
}) {
  const disabled = !m.available;
  const priceAdjustment = m.price_adjustment ?? 0;
  const priceLabel = deriveModifierPriceLabel(priceAdjustment);
  const hasPriceAdjustment = priceAdjustment !== 0;

  const optionName = m.name?.trim() || 'Option';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cx(
        optionBaseClass,
        isSelected ? optionSelectedClass : optionIdleClass,
        isBlocked && !disabled && optionBlockedClass,
        disabled && optionDisabledClass,
      )}
      aria-pressed={isSelected}
      aria-label={`${optionName}${disabled ? ', unavailable' : ''}${
        hasPriceAdjustment
          ? `, ${priceAdjustment > 0 ? 'add' : 'subtract'} ${fmtUsdFromCents(
              Math.abs(priceAdjustment),
            )}`
          : ''
      }`}
    >
      <span
        className={cx(
          'flex h-5.5 w-5.5 shrink-0 items-center justify-center transition-[background-color,color,box-shadow,border-color] duration-200',
          selectionType === 'radio' ? 'rounded-full' : 'rounded-lg',
          isSelected
            ? [
                'bg-[#fff8ee] text-[#3f2418]',
                'shadow-[inset_0_0_0_1px_rgba(255,255,255,0.46),0_3px_8px_rgba(0,0,0,0.12)]',
                'dark:bg-[#21130d] dark:text-[#f4dec0]',
              ].join(' ')
            : [
                'bg-[rgba(255,250,244,0.78)] text-transparent',
                'ring-1 ring-[rgba(61,42,32,0.16)]',
                'group-hover:ring-[rgba(61,42,32,0.24)]',
                'dark:bg-white/[0.075] dark:ring-white/14',
                'dark:group-hover:ring-white/24',
              ].join(' '),
        )}
        aria-hidden="true"
      >
        {isSelected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cx(
            'block font-sans text-[0.95rem] font-semibold leading-snug tracking-[-0.015em]',
            isSelected ? 'text-current' : 'text-[#2f1f18] dark:text-white/88',
          )}
        >
          {optionName}
        </span>

        {(priceLabel !== 'No extra cost' || disabled) && (
          <span
            className={cx(
              'mt-0.5 block text-xs font-medium leading-relaxed',
              isSelected
                ? 'text-[#fff8ee]/72 dark:text-[#21130d]/62'
                : 'text-[#7c6559] dark:text-white/52',
            )}
          >
            {priceLabel}
            {disabled ? ' · Unavailable' : ''}
          </span>
        )}
      </span>

      {hasPriceAdjustment && (
        <span
          className={cx(
            'shrink-0 rounded-full px-2 py-1 text-sm font-semibold tabular-nums',
            isSelected
              ? 'bg-white/12 text-[#fff8ee] dark:bg-[#21130d]/10 dark:text-[#21130d]'
              : 'bg-[rgba(63,36,24,0.06)] text-[#3f2418] dark:bg-white/[0.075] dark:text-[#f4dec0]',
          )}
        >
          {priceAdjustment > 0 ? '+' : ''}
          {fmtUsdFromCents(priceAdjustment)}
        </span>
      )}
    </button>
  );
});