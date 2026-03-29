// =============================================================================
// PATH: src/modules/menu/hooks/modal/useMenuItemModalPricing.ts
// =============================================================================
// Derives all price-related values from preflight + modifier selections.
// Returns both raw cents and display-ready label strings.
// =============================================================================

import { useMemo } from 'react';
import type { PreflightResult, SelectionMap, ModalPricingValues, ModalPriceLabels } from '@/domain/menu/menu-modal.types';
import { computeModalPricing, computeModalPriceLabels } from '../../utils/modal/modalPricing';

interface UseMenuItemModalPricingParams {
  preflight: PreflightResult | null;
  preflightLoading: boolean;
  selected: SelectionMap;
  safeQty: number;
}

export interface UseMenuItemModalPricingReturn {
  pricing: ModalPricingValues;
  labels: ModalPriceLabels;
}

export function useMenuItemModalPricing({
  preflight,
  preflightLoading,
  selected,
  safeQty,
}: UseMenuItemModalPricingParams): UseMenuItemModalPricingReturn {
  const pricing = useMemo(
    () => computeModalPricing(preflight, selected, safeQty),
    [preflight, selected, safeQty],
  );

  const labels = useMemo(
    () => computeModalPriceLabels(pricing, preflightLoading, preflight),
    [pricing, preflightLoading, preflight],
  );

  return { pricing, labels };
}