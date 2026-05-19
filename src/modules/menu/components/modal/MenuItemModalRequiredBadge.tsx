// =============================================================================
// Required / Optional pill for modifier group headers.
// =============================================================================

import { cx } from '../../utils/uiHelpers';

type BadgeVariant = 'required' | 'optional';

interface MenuItemModalRequiredBadgeProps {
  variant: BadgeVariant;
  className?: string;
}

export function MenuItemModalRequiredBadge({
  variant,
  className,
}: MenuItemModalRequiredBadgeProps) {
  const isRequired = variant === 'required';

  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5',
        'text-[10px] font-bold uppercase tracking-[0.14em]',
        isRequired
          ? 'bg-gold-100 text-ember-700 ring-1 ring-gold-200'
          : 'bg-cream-100 text-ink-500 ring-1 ring-cream-200',
        className,
      )}
    >
      {isRequired ? 'Required' : 'Optional'}
    </span>
  );
}
