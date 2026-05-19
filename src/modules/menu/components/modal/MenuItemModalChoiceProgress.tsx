// =============================================================================
// Selection progress for modifier groups (e.g. "1 of 3 · Choose up to 3").
// =============================================================================

import { Check } from 'lucide-react';
import { cx } from '../../utils/uiHelpers';

interface MenuItemModalChoiceProgressProps {
  valid: boolean;
  selectedCount: number;
  max: number | null;
  rangeLabel: string;
  className?: string;
}

export function MenuItemModalChoiceProgress({
  valid,
  selectedCount,
  max,
  rangeLabel,
  className,
}: MenuItemModalChoiceProgressProps) {
  const progressLabel =
    max != null && max > 1
      ? `${selectedCount} of ${max} selected`
      : selectedCount > 0
        ? 'Selected'
        : rangeLabel;

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 text-xs font-medium tabular-nums',
        valid ? 'text-ink-600' : 'text-ember-700',
        className,
      )}
    >
      {valid && selectedCount > 0 ? (
        <span
          className="flex h-4 w-4 items-center justify-center rounded-full bg-ember-600/15"
          aria-hidden="true"
        >
          <Check className="h-2.5 w-2.5 text-ember-700" strokeWidth={3} />
        </span>
      ) : null}
      <span>{progressLabel}</span>
    </span>
  );
}
