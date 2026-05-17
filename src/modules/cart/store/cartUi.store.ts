// src/modules/cart/store/cartUi.store.ts
// =============================================================================
// Lightweight cart UI store — safe for always-mounted shell components.
//
// This store holds:
//   1. Drawer open/close state (existing)
//   2. Display-only cart summary (itemCount, subtotalCents) — synced FROM
//      the real cart.store.ts via CartDisplaySync or useCart hook.
//
// This store must NOT import:
//   - Supabase client
//   - cart.store.ts
//   - auth/session helpers
//   - checkout modules
//   - any heavy domain logic
//
// Shell components (TopBar, Header, BottomNav, FloatingCartPill, MobileNav)
// read itemCount/subtotalCents from here instead of importing useCart.
// =============================================================================

import { create } from 'zustand';

interface CartUiStore {
  // ── Drawer open/close (existing) ──────────────────────────────────────────
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;

  // ── Display-only cart summary ─────────────────────────────────────────────
  // Synced from the real cart store. Shell components read these.
  // These values are DISPLAY-ONLY — never used for payment/pricing.
  itemCount: number;
  subtotalCents: number;

  // ── Sync bridge ───────────────────────────────────────────────────────────
  // Called by CartDisplaySync and/or useCart hook to push real cart data
  // into this lightweight store. Shell components never call this.
  syncDisplayData: (itemCount: number, subtotalCents: number) => void;
}

export const useCartUiStore = create<CartUiStore>()((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),

  itemCount: 0,
  subtotalCents: 0,
  syncDisplayData: (itemCount, subtotalCents) => set({ itemCount, subtotalCents }),
}));