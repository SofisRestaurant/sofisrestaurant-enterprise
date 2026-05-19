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

export const MenuItemModifierOption = memo<MenuItemModifierOptionProps>(
  function MenuItemModifierOption({
    modifier: m,
    isSelected,
    isBlocked,
    selectionType,
    onSelect,
  }) {
    const disabled = !m.available;
    const priceLabel = deriveModifierPriceLabel(m.price_adjustment ?? 0);

    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={cx(
          'group flex w-full min-h-12 items-center gap-3 rounded-xl px-3.5 py-3 text-left',
          'transition-colors duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--menu-modal-focus-ring)',
          isSelected
            ? 'bg-gold-50 ring-1 ring-gold-200'
            : 'bg-(--menu-modal-card-bg) ring-1 ring-(--menu-modal-border) hover:bg-(--menu-modal-card-hover)',
          isBlocked && 'ring-(--menu-modal-danger-border)',
          disabled && 'cursor-not-allowed opacity-45',
        )}
        aria-pressed={isSelected}
        aria-label={`${m.name ?? 'Option'}${disabled ? ', unavailable' : ''}${
          m.price_adjustment !== 0
            ? `, ${m.price_adjustment > 0 ? 'add' : 'subtract'} ${fmtUsdFromCents(Math.abs(m.price_adjustment))}`
            : ''
        }`}
      >
        <span
          className={cx(
            'flex h-5 w-5 shrink-0 items-center justify-center transition-colors',
            selectionType === 'radio' ? 'rounded-full' : 'rounded-md',
            isSelected
              ? 'bg-ember-600 text-white ring-2 ring-ember-600/25'
              : 'bg-cream-50 ring-1 ring-cream-300 group-hover:ring-cream-400',
          )}
          aria-hidden="true"
        >
          {isSelected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block font-sans text-[0.9375rem] font-semibold leading-snug text-ink-900">
            {m.name}
          </span>
          {(priceLabel !== 'No extra cost' || disabled) && (
            <span className="mt-0.5 block text-xs text-ink-500">
              {priceLabel}
              {disabled ? ' · Unavailable' : ''}
            </span>
          )}
        </span>

        {m.price_adjustment !== 0 && (
          <span
            className={cx(
              'shrink-0 text-sm font-semibold tabular-nums',
              isSelected ? 'text-ember-700' : 'text-ink-600',
            )}
          >
            {m.price_adjustment > 0 ? '+' : ''}
            {fmtUsdFromCents(m.price_adjustment)}
          </span>
        )}
      </button>
    );
  },
);
