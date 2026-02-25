// src/features/cart/cart.store.ts
// ============================================================================
// ENTERPRISE CART STORE WITH AUTO-RECOVERY
// ============================================================================
// ✅ Cart persistence
// ✅ Cart backup before checkout
// ✅ Cart restore on payment failure
// ✅ Smart clearing on success
// ============================================================================

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import type { CartStore, CartItem } from './cart.types'
import type { MenuItem } from '@/types/menu'

// ============================================================================
// Configuration
// ============================================================================

const TAX_RATE = 0.08

const STORAGE_KEYS = {
  CART: 'sofi-cart-storage',
  BACKUP: 'sofi-cart-backup',
  CHECKOUT_SESSION: 'sofi-checkout-session',
} as const
// ============================================================================
// Helpers
// ============================================================================

function generateId() {
  return crypto.randomUUID()
}

function normalizeString(value?: string) {
  return value?.trim() || undefined
}

function clampQuantity(qty: number) {
  if (!Number.isFinite(qty) || qty <= 0) return 1
  return Math.floor(qty)
}

function itemFingerprint(
  id: string,
  customizations?: string,
  notes?: string
) {
  return `${id}-${customizations ?? ''}-${notes ?? ''}`
}

function calculateTotals(items: CartItem[]) {
  const subtotal = items.reduce(
    (sum, item) => sum + item.menuItem.price * item.quantity,
    0
  )

  const tax = subtotal * TAX_RATE
  const total = subtotal + tax

  return {
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal,
    tax,
    deliveryFee: 0,
    total,
  }
}

function mergeDuplicates(items: CartItem[]) {
  const map = new Map<string, CartItem>()

  for (const item of items) {
    const key = itemFingerprint(
      item.menuItem.id,
      item.customizations,
      item.specialInstructions
    )

    if (map.has(key)) {
      const existing = map.get(key)!
      existing.quantity += item.quantity
    } else {
      map.set(key, { ...item })
    }
  }

  return Array.from(map.values())
}

// ============================================================================
// Backup/Restore Functions
// ============================================================================

/**
 * Save cart backup to localStorage
 * Call this BEFORE redirecting to Stripe
 */
function saveCartBackup(items: CartItem[]): void {
  try {
    const backup = {
      items,
      timestamp: Date.now(),
      sessionId: crypto.randomUUID(),
    }
    localStorage.setItem(STORAGE_KEYS.BACKUP, JSON.stringify(backup))
    console.log('💾 Cart backed up:', items.length, 'items')
  } catch (err) {
    console.error('Failed to backup cart:', err)
  }
}

/**
 * Load cart backup from localStorage
 * Call this when payment fails or user returns without completing
 */
function loadCartBackup(): CartItem[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BACKUP)
    if (!raw) return null

    const backup = JSON.parse(raw)
    
    // Check if backup is not too old (24 hours)
    const age = Date.now() - backup.timestamp
    const MAX_AGE = 24 * 60 * 60 * 1000
    
    if (age > MAX_AGE) {
      console.log('🗑️ Cart backup too old, discarding')
      clearCartBackup()
      return null
    }

    console.log('📦 Cart backup loaded:', backup.items.length, 'items')
    return backup.items as CartItem[]
  } catch (err) {
    console.error('Failed to load cart backup:', err)
    return null
  }
}

/**
 * Clear cart backup
 * Call this when order is confirmed
 */
function clearCartBackup(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.BACKUP)
    localStorage.removeItem(STORAGE_KEYS.CHECKOUT_SESSION)
    console.log('🧹 Cart backup cleared')
  } catch (err) {
    console.error('Failed to clear cart backup:', err)
  }
}

/**
 * Mark that checkout is in progress
 */
function markCheckoutInProgress(sessionId: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CHECKOUT_SESSION, sessionId)
  } catch (err) {
    console.error('Failed to mark checkout:', err)
  }
}

/**
 * Check if checkout is in progress
 */
function isCheckoutInProgress(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_KEYS.CHECKOUT_SESSION)
  } catch {
    return false
  }
}

/**
 * Clear checkout in progress flag
 */
function clearCheckoutInProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.CHECKOUT_SESSION)
  } catch (err) {
    console.error('Failed to clear checkout flag:', err)
  }
}

// ============================================================================
// Store
// ============================================================================

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => {
      const recalc = (items: CartItem[]) => ({
        items,
        ...calculateTotals(items),
      })

      return {
        items: [],
        itemCount: 0,
        subtotal: 0,
        tax: 0,
        deliveryFee: 0,
        total: 0,

        // ========================================
        // ADD ITEM
        // ========================================
        addItem: (menuItem: MenuItem, quantity = 1, specialInstructions) => {
          set((state) => {
            const qty = clampQuantity(quantity)
            const notes = normalizeString(specialInstructions)

            const incomingKey = itemFingerprint(menuItem.id, undefined, notes)

            const existingIndex = state.items.findIndex(
              (it) =>
                itemFingerprint(
                  it.menuItem.id,
                  it.customizations,
                  it.specialInstructions
                ) === incomingKey
            )

            let items: CartItem[]

            if (existingIndex >= 0) {
              items = state.items.map((it, idx) =>
                idx === existingIndex
                  ? { ...it, quantity: it.quantity + qty }
                  : it
              )
            } else {
              items = [
                ...state.items,
                {
                  id: generateId(),
                  menuItem,
                  quantity: qty,
                  specialInstructions: notes,
                  customizations: undefined,
                },
              ]
            }

            return recalc(items)
          })
        },

        // ========================================
        // REMOVE ITEM
        // ========================================
        removeItem: (id: string) => {
          set((state) => recalc(state.items.filter((i) => i.id !== id)))
        },

        // ========================================
        // UPDATE QUANTITY
        // ========================================
        updateQuantity: (id: string, quantity: number) => {
          set((state) => {
            if (!Number.isFinite(quantity) || quantity <= 0) {
              return recalc(state.items.filter((i) => i.id !== id))
            }

            const qty = Math.floor(quantity)
            const items = state.items.map((item) =>
              item.id === id ? { ...item, quantity: qty } : item
            )

            return recalc(items)
          })
        },

        // ========================================
        // CLEAR CART
        // ========================================
        clearCart: () => {
          console.log('🧹 Clearing cart')
          set(recalc([]))
        },

        // ========================================
        // GET ITEM
        // ========================================
        getItem: (id: string) => get().items.find((i) => i.id === id),

        // ========================================
        // UPDATE CUSTOMIZATIONS
        // ========================================
        updateCustomizations: (id: string, customizations: string) => {
          set((state) => {
            const updated = state.items.map((item) =>
              item.id === id
                ? { ...item, customizations: normalizeString(customizations) }
                : item
            )

            return recalc(mergeDuplicates(updated))
          })
        },

        // ========================================
        // UPDATE NOTES
        // ========================================
        updateNotes: (id: string, notes: string) => {
          set((state) => {
            const updated = state.items.map((item) =>
              item.id === id
                ? {
                    ...item,
                    specialInstructions: normalizeString(notes),
                  }
                : item
            )

            return recalc(mergeDuplicates(updated))
          })
        },

        // ========================================
        // 🔥 NEW: BACKUP CART (before checkout)
        // ========================================
        backupCart: () => {
          const items = get().items
          if (items.length > 0) {
            saveCartBackup(items)
            console.log('💾 Cart backed up before checkout')
          }
        },

        // ========================================
        // 🔥 NEW: RESTORE CART (payment failed)
        // ========================================
        restoreCart: () => {
          const backup = loadCartBackup()
          if (backup && backup.length > 0) {
            set(recalc(backup))
            console.log('📦 Cart restored from backup')
            return true
          }
          return false
        },

        // ========================================
        // 🔥 NEW: CLEAR BACKUP (order confirmed)
        // ========================================
        clearBackup: () => {
          clearCartBackup()
          console.log('🧹 Cart backup cleared')
        },

        // ========================================
        // 🔥 NEW: PREPARE FOR CHECKOUT
        // ========================================
        prepareForCheckout: (sessionId: string) => {
          const items = get().items
          saveCartBackup(items)
          markCheckoutInProgress(sessionId)
          console.log('🚀 Cart prepared for checkout')
        },

        // ========================================
        // 🔥 NEW: FINALIZE ORDER (success)
        // ========================================
        finalizeOrder: () => {
          set(recalc([]))
          clearCartBackup()
          clearCheckoutInProgress()
          console.log('✅ Order finalized, cart cleared')
        },

        // ========================================
        // 🔥 NEW: CANCEL CHECKOUT
        // ========================================
        cancelCheckout: () => {
          const restored = get().restoreCart()
          clearCheckoutInProgress()
          if (restored) {
            console.log('↩️ Checkout cancelled, cart restored')
          }
        },

        // ========================================
        // 🔥 NEW: CHECK IF CHECKOUT IN PROGRESS
        // ========================================
        isCheckoutInProgress: () => {
          return isCheckoutInProgress()
        },
      }
    },
    {
      name: STORAGE_KEYS.CART,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
    }
  )
)

// ============================================================================
// EXPORT UTILITIES
// ============================================================================

export {
  saveCartBackup,
  loadCartBackup,
  clearCartBackup,
  isCheckoutInProgress,
  clearCheckoutInProgress,
}