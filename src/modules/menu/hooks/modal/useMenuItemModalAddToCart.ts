// =============================================================================
// PATH: src/modules/menu/hooks/modal/useMenuItemModalAddToCart.ts
// =============================================================================
// Encapsulates the add-to-cart side-effect:
//   - guards (canAdd, phase)
//   - timer-delayed addItem() call
//   - phase transitions: idle → adding → success → (close)
//   - pricingHash composition
//
// Contract preserved exactly from original MenuItemModal.tsx:
//   - 180 ms delay before addItem fires
//   - 900 ms success hold before modal closes
//   - pricingHash format: v2:preflight:{id}:{price}:mods:{hash}:qty:{qty}
// =============================================================================

import { useCallback } from 'react';
import type { CartPhase, PreflightResult, SelectionMap } from '@/domain/menu/menu-modal.types';
import type { ModifierGroup } from '@/domain/menu/menu.types';
import { useCart } from '@/modules/cart/hooks/useCart';
import { safeStr } from '../../utils/menuItemGuards';
import { flattenSelectionsForCart } from '../../utils/modal/modalSelection';
import { composePricingHash } from '../../utils/modal/modalPricing';
import {
  MODAL_ADD_DEBOUNCE_MS,
  MODAL_SUCCESS_CLOSE_DELAY_MS,
  MODAL_MAX_NOTES_LENGTH,
} from '../../constants/menuItemModal.constants';
import { normalizeMenuCategory } from "@/modules/menu/utils/menuCategory";

interface UseMenuItemModalAddToCartParams {
  id: string;
  name: string;
  imageUrl: string | null;
  category: string;
  preflight: PreflightResult | null;
  modifierGroups: ModifierGroup[];
  selected: SelectionMap;
  safeQty: number;
  notes: string;
  phase: CartPhase;
  canAdd: boolean;
  modifierRulesOk: boolean;
  addTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  successTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setPhase: React.Dispatch<React.SetStateAction<CartPhase>>;
  setLiveStatus: React.Dispatch<React.SetStateAction<string>>;
  close: () => void;
}

export function useMenuItemModalAddToCart({
  id,
  name,
  imageUrl,
  category,
  preflight,
  modifierGroups,
  selected,
  safeQty,
  notes,
  phase,
  canAdd,
  modifierRulesOk,
  addTimer,
  successTimer,
  setPhase,
  setLiveStatus,
  close,
}: UseMenuItemModalAddToCartParams) {
  const { addItem } = useCart();

  const handleAddToCart = useCallback(() => {
    if (!canAdd) {
      if (!modifierRulesOk) setLiveStatus('Choose required options before adding.');
      return;
    }
    if (preflight?.ok !== true) return;
    if (phase !== 'idle') return;

    setPhase('adding');
    setLiveStatus('Adding to cart…');

    if (addTimer.current) clearTimeout(addTimer.current);
    addTimer.current = setTimeout(() => {
      const modifiers = flattenSelectionsForCart(modifierGroups, selected);

      const note = safeStr(notes, '', MODAL_MAX_NOTES_LENGTH);
      const notesOrNull = note.length ? note : null;

      // IMPORTANT: pricingHash composition must remain intact — server validates this.
      const pricingHash = composePricingHash(id, preflight.unit_price_cents, selected, safeQty);

      addItem({
        menuItemId: id,
        name,
        unitPriceCents: preflight.unit_price_cents, // server-confirmed
        imageUrl: imageUrl ?? null,
        category: normalizeMenuCategory(category),
        modifiers,
        quantity: safeQty,
        notes: notesOrNull,
        pricingHash,
      });

      setPhase('success');
      setLiveStatus('Added!');

      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => close(), MODAL_SUCCESS_CLOSE_DELAY_MS);
    }, MODAL_ADD_DEBOUNCE_MS);
  }, [
    canAdd,
    modifierRulesOk,
    preflight,
    phase,
    addItem,
    id,
    name,
    imageUrl,
    category,
    safeQty,
    notes,
    modifierGroups,
    selected,
    close,
    addTimer,
    successTimer,
    setPhase,
    setLiveStatus,
  ]);

  return { handleAddToCart };
}