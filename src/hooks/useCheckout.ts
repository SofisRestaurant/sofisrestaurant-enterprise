// src/hooks/useCheckout.ts
// ============================================================================
// USE CHECKOUT HOOK — PRODUCTION GRADE 2026
// ============================================================================

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useCart } from './useCart'
import type { CheckoutData } from '@/domain/checkout/checkout.types'
import {
  createCheckoutSession,
  CheckoutValidationError,
  CheckoutNetworkError,
  CheckoutRateLimitError,
} from '@/features/checkout/checkout.api'
import type { CartItem, CartModifier } from '@/features/cart/cart.types'

// ============================================================================
// TYPES
// ============================================================================

interface CheckoutCustomerData {
  customer_uid: string
  email: string
  name?: string
  phone?: string

  // ✅ 2026 upgrade
  address?: string

  promo_code?: string
  credit_id?: string
}

export interface CheckoutState {
  isLoading: boolean
  error: string | null
  errorCode: string | null
  canRetry: boolean
  retryAfter: number | null
}

export interface UseCheckoutReturn extends CheckoutState {
  checkout: (customer: CheckoutCustomerData) => Promise<void>
  reset: () => void
  canCheckout: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

const INITIAL_STATE: CheckoutState = {
  isLoading: false,
  error: null,
  errorCode: null,
  canRetry: false,
  retryAfter: null,
}

// ============================================================================
// Helpers (pure)
// ============================================================================

type CheckoutModifierGroup = {
  group_id: string
  selections: string[]
}

function groupModifiersForCheckout(mods: CartModifier[]): CheckoutModifierGroup[] {
  const map = new Map<string, string[]>()

  for (const m of mods) {
    if (!m?.groupId || !m?.id) continue
    const list = map.get(m.groupId) ?? []
    list.push(m.id)
    map.set(m.groupId, list)
  }

  return Array.from(map.entries()).map(([group_id, selections]) => ({
    group_id,
    selections,
  }))
}

function buildCheckoutItems(items: CartItem[]): CheckoutData['items'] {
  return items.map((item) => ({
    item_id: item.menuItemId,
    quantity: Math.max(1, Math.round(item.quantity)),
    modifiers: groupModifiersForCheckout(item.modifiers),
    special_instructions: item.notes ?? undefined,
    pricing_hash: item.pricingHash,
  }))
}

// ============================================================================
// HOOK
// ============================================================================

export function useCheckout(): UseCheckoutReturn {
  const { items } = useCart()

  // Always compute derived totals once (no redeclare in callback)
  const total = useMemo(() => {
    return items.reduce((sum, i) => sum + (i.lineTotalCents ?? 0), 0)
  }, [items])

  const [state, setState] = useState<CheckoutState>(INITIAL_STATE)

  // Prevent double-clicks and race conditions
  const lockRef = useRef(false)

  // Track if component is mounted (prevent state updates after unmount)
  const mountedRef = useRef(true)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  // ======================================================
  // RESET STATE
  // ======================================================
  const reset = useCallback(() => {
    setState(INITIAL_STATE)
    lockRef.current = false
  }, [])

  // ======================================================
  // CHECKOUT
  // ======================================================
  const checkout = useCallback(
    async (customer: CheckoutCustomerData) => {
      // ====================================
      // LOCK GUARD
      // ====================================
      if (lockRef.current) {
        console.warn('⚠️ Checkout already in progress')
        return
      }

      lockRef.current = true

      try {
        // ==================================
        // PRE-FLIGHT VALIDATION
        // ==================================
        if (!items.length) {
          throw new CheckoutValidationError('Your cart is empty', 'items')
        }

        if (!customer.customer_uid) {
          throw new CheckoutValidationError(
            'User identity missing. Please log in again.',
            'customer_uid',
          )
        }

        if (!customer.email?.includes('@')) {
          throw new CheckoutValidationError('Valid email is required', 'email')
        }

        // ==================================
        // UPDATE STATE - LOADING
        // ==================================
        if (mountedRef.current) {
          setState({
            isLoading: true,
            error: null,
            errorCode: null,
            canRetry: false,
            retryAfter: null,
          })
        }

        console.group('🛒 CHECKOUT')
        console.log('📦 Items:', items.length)
        console.log('💰 Total:', `$${(total / 100).toFixed(2)}`)
        console.log('👤 Customer:', customer.email)

        // ==================================
        // BUILD PAYLOAD (FIXED)
        // - Do NOT call useCart() again
        // - Do NOT reference "checkout.email" (that's the function)
        // - Use the "customer" param
        // ==================================

        const email = customer.email
        const name = customer.name || undefined
        const phone = customer.phone || undefined

        const successUrl = `${window.location.origin}/order-success`
        const cancelUrl = `${window.location.origin}/checkout`

        const payload: CheckoutData = {
          items: buildCheckoutItems(items),
          customer: {
            email,
            name,
            phone,
            // address is optional; include only if your CheckoutData supports it
            ...(customer.address ? { address: customer.address } : {}),
            // if your API expects uid here, include only if it exists in CheckoutData.customer
            ...(customer.customer_uid ? { customer_uid: customer.customer_uid } : {}),
          } as CheckoutData['customer'],
          successUrl,
          cancelUrl,
          // If your CheckoutData supports these fields, keep them.
          ...(customer.promo_code ? { promo_code: customer.promo_code } : {}),
          ...(customer.credit_id ? { credit_id: customer.credit_id } : {}),
          // Optional fraud signal (if supported by your API contract)
          frontend_total: total / 100,
        } as CheckoutData

        // ==================================
        // CREATE SESSION
        // ==================================
        console.log('🔄 Creating checkout session...')
        const session = await createCheckoutSession(payload)

        if (!session?.url) {
          throw new Error('Invalid checkout session response')
        }

        console.log('✅ Session created:', session.id)
        console.groupEnd()

        // Redirect OUTSIDE React lifecycle
        setTimeout(() => {
          console.log('🔀 Redirecting to Stripe...')
          window.location.assign(session.url)
        }, 0)

        // stop further execution
        return
      } catch (err: unknown) {
        console.error('🔥 Checkout error:', err)
        console.groupEnd()

        // ==================================
        // ERROR HANDLING
        // ==================================
        let errorMessage = 'Checkout failed. Please try again.'
        let errorCode: string | null = null
        let canRetry = false
        let retryAfter: number | null = null

        if (err instanceof CheckoutValidationError) {
          errorMessage = err.message
          errorCode = 'VALIDATION_ERROR'
          canRetry = false
        } else if (err instanceof CheckoutRateLimitError) {
          errorMessage = 'Too many requests. Please wait a moment.'
          errorCode = 'RATE_LIMIT'
          canRetry = true
          retryAfter = err.retryAfterMs ?? null
        } else if (err instanceof CheckoutNetworkError) {
          errorMessage = err.message
          errorCode = 'NETWORK_ERROR'
          canRetry = err.retryable
        } else if (err instanceof Error) {
          errorMessage = err.message
          errorCode = 'UNKNOWN_ERROR'
          canRetry = true
        }

        // Update state if still mounted
        if (mountedRef.current) {
          setState({
            isLoading: false,
            error: errorMessage,
            errorCode,
            canRetry,
            retryAfter,
          })
        }

        // Release lock on error
        lockRef.current = false

        // Re-throw for caller to handle if needed
        throw err
      } finally {
        // Update loading state if still mounted
        if (mountedRef.current && lockRef.current) {
          setState((prev) => ({ ...prev, isLoading: false }))
        }
      }
    },
    [items, total],
  )

  // ======================================================
  // RETURN
  // ======================================================
  return {
    checkout,
    reset,
    isLoading: state.isLoading,
    error: state.error,
    errorCode: state.errorCode,
    canRetry: state.canRetry,
    retryAfter: state.retryAfter,
    canCheckout: items.length > 0 && !state.isLoading,
  }
}