// =============================================================================
// src/hooks/useCart.ts
// useCart — ergonomic consumer hook over useCartStore
// =============================================================================

import { useCallback, useEffect, useRef } from 'react'
import {
  useCartStore,
  selectItems,
  selectTotals,
  selectPromotion,
  selectCredit,
  selectItemCount,
  selectIsEmpty,
} from '@/features/cart/cart.store'
import {
  cartItemKey,
  formatCartTotals,
  formatCents,
  formatLineItemBreakdown,
  modifierSummary,
  isItemInCart,
  itemQuantityInCart,
  findCartItem,
  groupCartItemsByCategory,
  buildCheckoutPayload,
  promoErrorMessage,
  promoSuccessMessage,
  shouldSyncCart,
  orderTypeLabel,
} from '@/features/cart/cart.utils'
import type {
  CartItem,
  CartModifier,
  CartPromotion,
  CartCredit,
  CheckoutPayload,
  PromoValidationResult,
} from '@/features/cart/cart.types'

// ─────────────────────────────────────────────────────────────────────────────
// Hook params
// ─────────────────────────────────────────────────────────────────────────────

interface UseCartOptions {
  userId?: string | null
  sessionId?: string | null
  taxRate?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook return type
// ─────────────────────────────────────────────────────────────────────────────

export interface UseCartReturn {
  items: CartItem[]
  promotion: CartPromotion | null
  credit: CartCredit | null
  itemCount: number
  isEmpty: boolean

  totalsDisplay: ReturnType<typeof formatCartTotals>
  subtotalFormatted: string
  totalFormatted: string

  addItem: (item: Omit<CartItem, 'lineTotalCents'>) => void
  removeItem: (menuItemId: string, modifierKey: string) => void
  updateQuantity: (menuItemId: string, modifierKey: string, qty: number) => void
  updateNotes: (menuItemId: string, modifierKey: string, notes: string) => void
  clearCart: () => void

  applyPromoCode: (code: string) => Promise<PromoValidationResult>
  removePromo: () => void
  promoMessage: string | null

  applyCredit: () => Promise<boolean>
  removeCredit: () => void

  getCheckoutPayload: (orderType: CheckoutPayload['orderType'], notes?: string) => CheckoutPayload

  findItem: (menuItemId: string, modifiers: Pick<CartModifier, 'id'>[]) => CartItem | undefined
  isInCart: (menuItemId: string) => boolean
  quantityInCart: (menuItemId: string) => number
  itemLineBreakdown: (item: CartItem) => string
  itemModifierSummary: (item: CartItem) => string
  itemsByCategory: ReturnType<typeof groupCartItemsByCategory>
  cartItemKey: typeof cartItemKey
  orderTypeLabel: typeof orderTypeLabel

  sync: () => void
  hydrateFromDB: () => Promise<void>
  clearFromDB: () => Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useCart(options: UseCartOptions = {}): UseCartReturn {
  const { userId = null, sessionId = null, taxRate = 0.0825 } = options

  // ── Store slices
  const items = useCartStore(selectItems)
  const rawTotals = useCartStore(selectTotals)
  const promotion = useCartStore(selectPromotion)
  const credit = useCartStore(selectCredit)
  const itemCount = useCartStore(selectItemCount)
  const isEmpty = useCartStore(selectIsEmpty)

  // ── Store actions
  const {
    addItem,
    removeItem,
    updateQuantity,
    updateNotes,
    clearCart,
    applyPromoCode: storeApplyPromo,
    removePromo,
    applyCredit: storeApplyCredit,
    removeCredit,
    syncToSupabase,
    hydrateFromSupabase,
    clearSupabaseCart,
  } = useCartStore()

  // ─────────────────────────────────────────────────────────────────────────
  // Supabase sync refs (✅ only updated in effects)
  // ─────────────────────────────────────────────────────────────────────────

  const userIdRef = useRef<string | null>(userId)
  const sessionIdRef = useRef<string | null>(sessionId)

  useEffect(() => {
    userIdRef.current = userId
    sessionIdRef.current = sessionId
  }, [userId, sessionId])

  // Auto-sync on changes
  useEffect(() => {
    if (!userId || !sessionId) return
    if (!shouldSyncCart(items, userId)) return
    syncToSupabase(userId, sessionId)
  }, [items, promotion, credit, userId, sessionId, syncToSupabase])

  // ─────────────────────────────────────────────────────────────────────────
  // Wrapped mutations
  // ─────────────────────────────────────────────────────────────────────────

  const applyPromoCode = useCallback(
    async (code: string): Promise<PromoValidationResult> => {
      if (!userId) return { valid: false, error: 'NOT_FOUND' }
      return storeApplyPromo(code, userId)
    },
    [userId, storeApplyPromo],
  )

  const applyCredit = useCallback(async (): Promise<boolean> => {
    if (!userId) return false
    return storeApplyCredit(userId)
  }, [userId, storeApplyCredit])

  const sync = useCallback(() => {
    const uid = userIdRef.current
    const sid = sessionIdRef.current
    if (!uid || !sid) return
    if (!shouldSyncCart(items, uid)) return
    syncToSupabase(uid, sid)
  }, [items, syncToSupabase])

  const hydrateFromDB = useCallback(async () => {
    if (!userId) return
    await hydrateFromSupabase(userId)
  }, [userId, hydrateFromSupabase])

  const clearFromDB = useCallback(async () => {
    if (!sessionId) return
    await clearSupabaseCart(sessionId)
  }, [sessionId, clearSupabaseCart])

  const getCheckoutPayload = useCallback(
    (orderType: CheckoutPayload['orderType'], notes?: string): CheckoutPayload =>
      buildCheckoutPayload(
        { items, promotion, credit, totals: rawTotals },
        orderType,
        notes ?? null,
        taxRate,
      ),
    [items, promotion, credit, rawTotals, taxRate],
  )

  // ── Derived / display values
  const totalsDisplay = formatCartTotals(rawTotals)
  const subtotalFormatted = formatCents(rawTotals.subtotalCents)
  const totalFormatted = formatCents(rawTotals.totalCents)
  const promoMessage = promotion ? promoSuccessMessage(promotion) : null
  const itemsByCategory = groupCartItemsByCategory(items)

  // ── Query helpers
  const findItem = useCallback(
    (menuItemId: string, mods: Pick<CartModifier, 'id'>[]) => findCartItem(items, menuItemId, mods),
    [items],
  )

  const isInCart = useCallback((menuItemId: string) => isItemInCart(items, menuItemId), [items])

  const quantityInCart = useCallback(
    (menuItemId: string) => itemQuantityInCart(items, menuItemId),
    [items],
  )

  const itemLineBreakdown = useCallback((item: CartItem) => formatLineItemBreakdown(item), [])

  const itemModifierSummary = useCallback((item: CartItem) => modifierSummary(item.modifiers), [])

  return {
    items,
    promotion,
    credit,
    itemCount,
    isEmpty,

    totalsDisplay,
    subtotalFormatted,
    totalFormatted,

    addItem,
    removeItem,
    updateQuantity,
    updateNotes,
    clearCart,

    applyPromoCode,
    removePromo,
    promoMessage,

    applyCredit,
    removeCredit,

    getCheckoutPayload,

    findItem,
    isInCart,
    quantityInCart,
    itemLineBreakdown,
    itemModifierSummary,
    itemsByCategory,
    cartItemKey,
    orderTypeLabel,

    sync,
    hydrateFromDB,
    clearFromDB,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience sub-hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useCartItemCount(): number {
  return useCartStore(selectItemCount)
}

export function useCartIsEmpty(): boolean {
  return useCartStore(selectIsEmpty)
}

export function useCartTotals() {
  const totals = useCartStore(selectTotals)
  return formatCartTotals(totals)
}

export { promoErrorMessage }