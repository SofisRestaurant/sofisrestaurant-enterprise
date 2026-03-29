// =============================================================================
// PATH: src/modules/menu/components/modal/MenuItemModalNotes.tsx
// =============================================================================
// Special instructions textarea + character counter.
// Pure renderer — no logic.
// =============================================================================

import type { ModalNotesProps } from '@/domain/menu/menu-modal.types';
import { cx } from '../../utils/uiHelpers';
import { deriveNotesCountLabel } from '../../utils/modal/modalLabels';
import { ModalSection } from './sections/ModalSection';

export function MenuItemModalNotes({ notes, maxLength, onChange }: ModalNotesProps) {
  return (
    <ModalSection>
      <p className="text-sm font-semibold text-white">Special instructions</p>
      <p className="mt-1 text-xs text-zinc-500">
        Allergy notes, "no onions", "extra crispy", etc.
      </p>
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={maxLength}
        className={cx(
          'mt-3 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white',
          'placeholder:text-zinc-500 outline-none',
          'focus-visible:ring-2 focus-visible:ring-amber-500/25 focus-visible:border-amber-500/30',
        )}
        placeholder="Add a note for the kitchen (optional)…"
        aria-label="Special instructions"
      />
      <p className="mt-1 text-[11px] text-zinc-500">
        {deriveNotesCountLabel(notes.length, maxLength)}
      </p>
    </ModalSection>
  );
}