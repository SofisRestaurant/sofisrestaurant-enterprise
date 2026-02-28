// src/features/cart/cart.store.ts
// ============================================================================
// ENTERPRISE CART STORE — Immutable snapshot ledger
// ============================================================================
// Key architecture decisions:
//   • addItem() takes AddToCartPayload — cart never holds a MenuItem reference
//   • Each item has a pricing_hash (locked at add-to-cart time)
//   • Deduplication by itemId + pricingHash — same item with different
//     modifiers = separate line items
//   • Cart totals = sum of locked item subtotals (never re-priced in store)
//   • Backup/restore for payment failure recovery
// ============================================================================

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { CartStore, AddToCartPayload } from './cart.types'
import type { CartItem } from '@/domain/menu/menu.types'
import { PricingEngine, computePricingHashSync } from '@/domain/pricing/pricing.engine'

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const TAX_RATE = 0.0875

const KEYS = {
  CART:     'sofi-cart-v2',
  BACKUP:   'sofi-cart-backup-v2',
  CHECKOUT: 'sofi-checkout-session-v2',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function round2(n: number) { return Math.round(n * 100) / 100 }

function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

/** Fingerprint: same item + same modifier config → same key → merge quantities */
function fingerprint(itemId: string, pricingHash: string): string {
  return `${itemId}::${pricingHash}`
}

function recalc(items: CartItem[]) {
  const subtotal  = round2(items.reduce((s, i) => s + i.subtotal, 0))
  const tax       = round2(subtotal * TAX_RATE)
  const total     = round2(subtotal + tax)
  const itemCount = items.reduce((s, i) => s + i.quantity, 0)
  return { items, subtotal, tax, total, itemCount, deliveryFee: 0 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Backup helpers
// ─────────────────────────────────────────────────────────────────────────────

function saveBackup(items: CartItem[]): void {
  try { localStorage.setItem(KEYS.BACKUP, JSON.stringify({ items, ts: Date.now() })) }
  catch { /* storage full */ }
}

function loadBackup(): CartItem[] | null {
  try {
    const raw = localStorage.getItem(KEYS.BACKUP)
    if (!raw) return null
    const { items, ts } = JSON.parse(raw)
    if (Date.now() - ts > 86_400_000) { clearBackupStorage(); return null }
    return items as CartItem[]
  } catch { return null }
}

function clearBackupStorage(): void {
  try {
    localStorage.removeItem(KEYS.BACKUP)
    localStorage.removeItem(KEYS.CHECKOUT)
  } catch { /* ignore */ }
}

function markCheckout(sessionId: string): void {
  try { localStorage.setItem(KEYS.CHECKOUT, sessionId) } catch { /* ignore */ }
}

function checkoutActive(): boolean {
  try { return !!localStorage.getItem(KEYS.CHECKOUT) } catch { return false }
}

function clearCheckout(): void {
  try { localStorage.removeItem(KEYS.CHECKOUT) } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [], itemCount: 0, subtotal: 0, tax: 0, deliveryFee: 0, total: 0,

      // ── addItem ─────────────────────────────────────────────────────────────
      // Receives AddToCartPayload (not MenuItem).
      // Computes PricingBreakdown → locks subtotal + hash into the cart item.
    addItem: (payload: AddToCartPayload) => {
  set((state) => {

    const qty = Math.max(1, Math.floor(payload.quantity))

    const pricing = PricingEngine.calculate(
      payload.item_id,
      payload.base_price,
      payload.modifiers,
      qty,
    )

    // Deterministic integrity hash
    const verifiedHash = computePricingHashSync(
      payload.item_id,
      payload.base_price,
      payload.modifiers,
      qty,
    )

    // Force overwrite with verified hash
    pricing.pricing_hash = verifiedHash

    const fp = fingerprint(payload.item_id, pricing.pricing_hash)

    const existIdx = state.items.findIndex(
      (i) => fingerprint(i.item_id, i.pricing_hash) === fp,
    )

    let items: CartItem[]

    if (existIdx >= 0) {
      items = state.items.map((item, idx) => {
        if (idx !== existIdx) return item

        const newQty = item.quantity + qty

        const newPricing = PricingEngine.calculate(
          item.item_id,
          item.base_price,
          item.modifiers,
          newQty,
        )

        const newHash = computePricingHashSync(
          item.item_id,
          item.base_price,
          item.modifiers,
          newQty,
        )

        return {
          ...item,
          quantity: newQty,
          subtotal: newPricing.subtotal,
          pricing_hash: newHash,
        }
      })
    } else {
      const newItem: CartItem = {
        id: uid(),
        item_id: payload.item_id,
        name: payload.name,
        image_url: payload.image_url,
        base_price: payload.base_price,
        modifiers: payload.modifiers,
        subtotal: pricing.subtotal,
        quantity: qty,
        special_instructions: payload.special_instructions,
        pricing_hash: pricing.pricing_hash,
      }

      items = [...state.items, newItem]
    }

    return recalc(items)
  })
},

      // ── removeItem ─────────────────────────────────────────────────────────
      removeItem: (id) =>
        set((state) => recalc(state.items.filter((i) => i.id !== id))),

      // ── updateQuantity ──────────────────────────────────────────────────────
      updateQuantity: (id, quantity) => {
        set((state) => {
          if (!Number.isFinite(quantity) || quantity <= 0) {
            return recalc(state.items.filter((i) => i.id !== id))
          }
          const qty   = Math.floor(quantity)
          const items = state.items.map((item) => {
            if (item.id !== id) return item
            const p = PricingEngine.calculate(item.item_id, item.base_price, item.modifiers, qty)
            return { ...item, quantity: qty, subtotal: p.subtotal, pricing_hash: p.pricing_hash }
          })
          return recalc(items)
        })
      },

      // ── clearCart ───────────────────────────────────────────────────────────
      clearCart: () => set(recalc([])),

      // ── getItem ─────────────────────────────────────────────────────────────
      getItem: (id) => get().items.find((i) => i.id === id),

      // ── updateNotes ─────────────────────────────────────────────────────────
      updateNotes: (id, notes) => {
        set((state) => {
          const items = state.items.map((item) =>
            item.id === id
              ? { ...item, special_instructions: notes.trim() || undefined }
              : item,
          )
          return recalc(items)
        })
      },

      // ── Checkout lifecycle ──────────────────────────────────────────────────
      backupCart:  () => saveBackup(get().items),
      clearBackup: () => clearBackupStorage(),

      restoreCart: () => {
        const backup = loadBackup()
        if (backup?.length) { set(recalc(backup)); return true }
        return false
      },

      prepareForCheckout: (sessionId) => {
        saveBackup(get().items)
        markCheckout(sessionId)
      },

      finalizeOrder: () => {
        set(recalc([]))
        clearBackupStorage()
        clearCheckout()
      },

      cancelCheckout: () => {
        const items = loadBackup()
        if (items?.length) set(recalc(items))
        clearCheckout()
      },

      isCheckoutInProgress: () => checkoutActive(),
    }),
    {
      name:       KEYS.CART,
      storage:    createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
    },
  ),
)

// Named exports for non-store consumers (checkout page, etc.)
export { saveBackup as saveCartBackup, loadBackup as loadCartBackup, clearBackupStorage as clearCartBackup }