// =============================================================================
// PATH: src/modules/menu/hooks/modal/useMenuItemModalValidation.ts
// =============================================================================
// Derives availability flags and validation rules from preflight + modifier
// state. Memoizes all derived values so components never recompute.
// =============================================================================

import { useMemo } from 'react';
import type {
  PreflightResult,
  SelectionMap,
  CartPhase,
  ModalAvailability,
  ModalValidation,
} from '@/domain/menu/menu-modal.types';
import type { ModifierGroup } from '@/domain/menu/menu.types';
import {
  deriveModalAvailability,
  deriveModalValidation,
} from '../../utils/modal/modalAvailability';

interface UseMenuItemModalValidationParams {
  preflight: PreflightResult | null;
  preflightLoading: boolean;
  modifierGroups: ModifierGroup[];
  selected: SelectionMap;
  phase: CartPhase;
  unitPriceCents: number;
}

export interface UseMenuItemModalValidationReturn {
  availability: ModalAvailability;
  validation: ModalValidation;
}

export function useMenuItemModalValidation({
  preflight,
  preflightLoading,
  modifierGroups,
  selected,
  phase,
  unitPriceCents,
}: UseMenuItemModalValidationParams): UseMenuItemModalValidationReturn {
  const availability = useMemo(
    () => deriveModalAvailability(preflight, modifierGroups, selected),
    [preflight, modifierGroups, selected],
  );

  const validation = useMemo(
    () =>
      deriveModalValidation(
        preflight,
        modifierGroups,
        selected,
        availability,
        phase,
        unitPriceCents,
        preflightLoading,
      ),
    [preflight, modifierGroups, selected, availability, phase, unitPriceCents, preflightLoading],
  );

  return { availability, validation };
}