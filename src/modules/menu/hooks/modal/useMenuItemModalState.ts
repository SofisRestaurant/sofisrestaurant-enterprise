// =============================================================================
// PATH: src/modules/menu/hooks/modal/useMenuItemModalState.ts
// =============================================================================
// Owns the three pieces of local modal state:
//   phase, notes, liveStatus
//
// Extracted from the inline useState calls in MenuItemModal.tsx so the shell
// has a single import for all local state.
// =============================================================================

import { useCallback, useState } from 'react';
import type { CartPhase } from '@/domain/menu/menu-modal.types';
import { MODAL_MAX_NOTES_LENGTH } from '../../constants/menuItemModal.constants';
import { safeStr } from '../../utils/menuItemGuards';

export interface UseMenuItemModalStateReturn {
  phase: CartPhase;
  setPhase: React.Dispatch<React.SetStateAction<CartPhase>>;
  notes: string;
  setNotes: (value: string) => void;
  liveStatus: string;
  setLiveStatus: React.Dispatch<React.SetStateAction<string>>;
  /** Stable callback passed to lower-level hooks that emit status strings. */
  onLiveStatus: (msg: string) => void;
}

export function useMenuItemModalState(): UseMenuItemModalStateReturn {
  const [phase, setPhase] = useState<CartPhase>('idle');
  const [notes, setNotesRaw] = useState<string>('');
  const [liveStatus, setLiveStatus] = useState<string>('');

  const onLiveStatus = useCallback((msg: string) => setLiveStatus(msg), []);

  /** Clamp and sanitize notes on every change. */
  const setNotes = useCallback((value: string) => {
    setNotesRaw(safeStr(value, '', MODAL_MAX_NOTES_LENGTH));
  }, []);

  return {
    phase,
    setPhase,
    notes,
    setNotes,
    liveStatus,
    setLiveStatus,
    onLiveStatus,
  };
}