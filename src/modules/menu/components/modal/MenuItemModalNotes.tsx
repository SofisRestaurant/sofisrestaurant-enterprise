// =============================================================================
// Special instructions textarea with character counter.
// =============================================================================

import { memo } from 'react';
import type { ModalNotesProps } from '@/domain/menu/menu-modal.types';
import { clampInt } from '../../utils/menuItemGuards';
import { cx } from '../../utils/uiHelpers';
import { ModalSection } from './sections/ModalSection';

export const MenuItemModalNotes = memo<ModalNotesProps>(function MenuItemModalNotes({
  notes,
  maxLength,
  onChange,
}) {
  const noteLen = clampInt(notes.length, 0, maxLength);
  const noteRatio = noteLen / maxLength;
  const counterNear = noteRatio >= 0.8;
  const counterFull = noteRatio >= 0.95;

  return (
    <ModalSection bordered>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink-900">Special instructions</h3>
          <p className="mt-0.5 text-xs text-ink-500">
            Allergies, preferences, or cooking requests
          </p>
        </div>
        <span
          className={cx(
            'text-xs font-medium tabular-nums',
            counterFull ? 'text-red-600' : counterNear ? 'text-ember-700' : 'text-ink-400',
          )}
          aria-hidden={!counterNear}
        >
          {noteLen}/{maxLength}
        </span>
      </div>

      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={maxLength}
        className={cx(
          'mt-3 w-full resize-none rounded-2xl border px-4 py-3.5',
          'font-sans text-base leading-relaxed',
          'border-(--menu-modal-border) bg-(--menu-modal-input-bg) text-ink-900',
          'placeholder:text-ink-400',
          'outline-none transition-colors duration-150',
          'focus:border-ember-600/35 focus:ring-2 focus:ring-(--menu-modal-focus-ring)',
        )}
        placeholder="Add a note for the kitchen (optional)…"
        aria-label="Special instructions"
        aria-describedby="menu-modal-notes-count"
      />
      <p id="menu-modal-notes-count" className="sr-only">
        {noteLen} of {maxLength} characters used
      </p>
    </ModalSection>
  );
});
