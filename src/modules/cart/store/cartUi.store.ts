// src/modules/cart/store/cartUi.store.ts
// =============================================================================
// Lightweight cart UI store — safe for always-mounted shell components.
//
// Purpose:
// - Controls cart drawer open/close.
// - Stores display-only cart summary for shell UI.
// - Persists display-only itemCount/subtotalCents so FloatingCartPill does not
//   disappear on page reload before the real cart store finishes hydration.
//
// Important:
// - itemCount/subtotalCents are display-only.
// - Checkout/payment must never trust these values.
// - isOpen is intentionally NOT persisted.
// =============================================================================

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const CART_UI_STORAGE_KEY = 'sofis-cart-ui-display-v1';

interface CartUiStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;

  itemCount: number;
  subtotalCents: number;

  syncDisplayData: (itemCount: number, subtotalCents: number) => void;
  resetDisplayData: () => void;
}

function safeDisplayNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

export const useCartUiStore = create<CartUiStore>()(
  persist(
    (set) => ({
      isOpen: false,

      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),
      toggle: () => set((state) => ({ isOpen: !state.isOpen })),

      itemCount: 0,
      subtotalCents: 0,

      syncDisplayData: (itemCount, subtotalCents) =>
        set({
          itemCount: safeDisplayNumber(itemCount),
          subtotalCents: safeDisplayNumber(subtotalCents),
        }),

      resetDisplayData: () =>
        set({
          itemCount: 0,
          subtotalCents: 0,
        }),
    }),
    {
      name: CART_UI_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),

      // Persist only display data.
      // Do NOT persist drawer open state.
      partialize: (state) => ({
        itemCount: state.itemCount,
        subtotalCents: state.subtotalCents,
      }),

      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<CartUiStore> | undefined;

        return {
          ...currentState,
          itemCount: safeDisplayNumber(persisted?.itemCount),
          subtotalCents: safeDisplayNumber(persisted?.subtotalCents),
          isOpen: false,
        };
      },
    },
  ),
);