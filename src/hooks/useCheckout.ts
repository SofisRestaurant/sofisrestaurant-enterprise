// src/hooks/useCheckout.ts
// ============================================================================
// USE CHECKOUT HOOK — PRODUCTION GRADE 2026
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react'
import { useCart } from './useCart'
import type { CheckoutData } from '@/features/checkout/checkout.types'
import {
  createCheckoutSession,
  CheckoutValidationError,
  CheckoutNetworkError,
  CheckoutRateLimitError,
} from '@/features/checkout/checkout.api'
// ============================================================================
// TYPES
// ============================================================================

export interface CheckoutCustomerData {
  email: string
  name?: string
  phone?: string
  address?: string
  customer_uid: string
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
// HOOK
// ============================================================================

export function useCheckout(): UseCheckoutReturn {
  const { items, total } = useCart()

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
            'customer_uid'
          )
        }

        if (!customer.email?.includes('@')) {
          throw new CheckoutValidationError(
            'Valid email is required',
            'email'
          )
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
        // BUILD PAYLOAD
        // ==================================
        const payload: CheckoutData = {
          items: items.map((item) => ({
            id: item.id,
            menuItemId: item.menuItem.id,
            name: item.menuItem.name,
            price: Math.round(item.menuItem.price * 100), // Convert to cents
            quantity: Math.max(1, item.quantity),
            customizations: item.customizations,
            specialInstructions: item.specialInstructions,
          })),
          total: Math.round(total * 100), // Convert to cents
          email: customer.email,
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          customer_uid: customer.customer_uid,
          successUrl: `${window.location.origin}/order-success`,
          cancelUrl: `${window.location.origin}/checkout`,
        }

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

        // ==================================
        // REDIRECT
        // ==================================
       

        // Note: Code below won't execute due to redirect,
        // but keeping for completeness

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
    [items, total]
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