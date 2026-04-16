// src/modules/cart/store/cartUi.store.ts
// Single source of truth for cart drawer open/close.
// All trigger points (TopBar, BottomNav, FloatingCartPill) read from here.

import { create } from 'zustand';

interface CartUiStore {
  isOpen: boolean;
  open:   () => void;
  close:  () => void;
  toggle: () => void;
}

export const useCartUiStore = create<CartUiStore>()((set) => ({
  isOpen: false,
  open:   () => set({ isOpen: true }),
  close:  () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));