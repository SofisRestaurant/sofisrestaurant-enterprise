// src/features/checkout/checkout.api.ts
// =============================================================================
// CHECKOUT API — ENTERPRISE GRADE
// =============================================================================
// Frontend NEVER calculates:
//   - discount amounts
//   - promo value
//   - loyalty deduction
//   - tax on discounted total
//
// Frontend ONLY sends:
//   - item IDs + quantities
//   - optional promo_code (string)
//   - optional credit_id (UUID of a user_credit row)
//
// Server returns the computed session. Frontend displays what server confirms.
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient'
import type { CheckoutData, CheckoutSession } from './checkout.types'
import { LOYALTY_TIERS, TIER_ORDER, type LoyaltyTier } from '@/domain/loyalty/tiers'

export { LOYALTY_TIERS, type LoyaltyTier } from '@/domain/loyalty/tiers'

// =============================================================================
// CONFIG
// =============================================================================

const CHECKOUT_CONFIG = {
  MAX_RETRIES:    3,
  RETRY_DELAY_MS: 1000,
  TIMEOUT_MS:     30_000,
  MAX_ITEMS:      100,
} as const

// =============================================================================
// ERRORS
// =============================================================================

export class CheckoutValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message)
    this.name = 'CheckoutValidationError'
  }
}

export class CheckoutNetworkError extends Error {
  constructor(message: string, public retryable = true) {
    super(message)
    this.name = 'CheckoutNetworkError'
  }
}

export class CheckoutRateLimitError extends Error {
  constructor(message: string, public retryAfterMs?: number) {
    super(message)
    this.name = 'CheckoutRateLimitError'
  }
}

export class CheckoutPromoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CheckoutPromoError'
  }
}

export class CheckoutCreditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CheckoutCreditError'
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface LoyaltyProfile {
  points:         number
  lifetimePoints: number
  tier:           LoyaltyTier
  streak:         number
  lastOrderDate:  string | null
}

export interface LoyaltyPreview {
  pointsToEarn:     number
  basePoints:       number
  tierMultiplier:   number
  streakMultiplier: number
  tier:             LoyaltyTier
  streak:           number
  currentBalance:   number
  balanceAfter:     number
  willExtendStreak: boolean
  pointsToNextTier: number | null
  willLevelUp:      boolean
}

// What the server returns about applied discounts — used only for display
export interface ServerDiscount {
  promo_code?:     string
  promo_cents?:    number
  credit_cents?:   number
  total_discount?: number
  // Server-confirmed totals for display
  subtotal_cents:  number
  tax_cents:       number
  grand_total:     number
}

export interface UserCredit {
  id:           string
  amount_cents: number
  source:       string
  expires_at:   string | null
  created_at:   string
}

// =============================================================================
// UTILITIES
// =============================================================================

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
  )
  return Promise.race([promise, timeout])
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// =============================================================================
// VALIDATION (client-side: catch obvious errors before hitting network)
// =============================================================================

function validateCheckoutData(payload: CheckoutData) {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new CheckoutValidationError('Cart is empty', 'items')
  }
  if (payload.items.length > CHECKOUT_CONFIG.MAX_ITEMS) {
    throw new CheckoutValidationError('Too many items', 'items')
  }
  if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    throw new CheckoutValidationError('Invalid email', 'email')
  }
  if (!payload.successUrl || !payload.cancelUrl) {
    throw new CheckoutValidationError('Missing redirect URLs')
  }
}

// =============================================================================
// LOYALTY: getLoyaltyProfile
// =============================================================================

export async function getLoyaltyProfile(): Promise<LoyaltyProfile | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) return null

    const { data, error } = await supabase
      .from('profiles')
      .select('loyalty_points, lifetime_points, loyalty_tier, loyalty_streak, last_order_date')
      .eq('id', session.user.id)
      .single()

    if (error || !data) return null

    return {
      points:         data.loyalty_points  ?? 0,
      lifetimePoints: data.lifetime_points ?? 0,
      tier:           (data.loyalty_tier   ?? 'bronze') as LoyaltyTier,
      streak:         data.loyalty_streak  ?? 0,
      lastOrderDate:  data.last_order_date ?? null,
    }
  } catch {
    return null
  }
}

// =============================================================================
// LOYALTY: getAvailableCredits
// Returns unused, non-expired credits for the authenticated user.
// =============================================================================

export async function getAvailableCredits(): Promise<UserCredit[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user?.id) return []

    const { data, error } = await supabase
      .from('user_credits')
      .select('id, amount_cents, source, expires_at, created_at')
      .eq('user_id', session.user.id)
      .eq('used', false)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('created_at', { ascending: true })

    if (error || !data) return []
    return data as UserCredit[]
  } catch {
    return []
  }
}

// =============================================================================
// LOYALTY: calculatePointsPreview (pure, no DB — mirrors server math exactly)
// =============================================================================

export function calculatePointsPreview(
  amountCents: number,
  profile:     LoyaltyProfile | null
): LoyaltyPreview {
  const tier:     LoyaltyTier = profile?.tier           ?? 'bronze'
  const streak:   number      = profile?.streak         ?? 0
  const balance:  number      = profile?.points         ?? 0
  const lifetime: number      = profile?.lifetimePoints ?? 0

  const tierConfig     = LOYALTY_TIERS[tier]
  const basePoints     = Math.max(Math.floor(amountCents / 100), 0)
  const tierMultiplier = tierConfig.multiplier

  const nextStreak = streak + 1
  const streakMultiplier =
    nextStreak >= 30 ? 1.50 :
    nextStreak >= 7  ? 1.25 :
    nextStreak >= 3  ? 1.10 :
                       1.00

  const pointsToEarn = Math.max(Math.floor(basePoints * tierMultiplier * streakMultiplier), 0)
  const balanceAfter = balance + pointsToEarn

  const currentIndex     = TIER_ORDER.indexOf(tier)
  const nextTier         = currentIndex < TIER_ORDER.length - 1 ? TIER_ORDER[currentIndex + 1] : null
  const nextTierThreshold = nextTier ? LOYALTY_TIERS[nextTier].threshold : null
  const pointsToNextTier = nextTierThreshold !== null ? Math.max(nextTierThreshold - lifetime, 0) : null
  const willLevelUp      = nextTierThreshold !== null && lifetime + pointsToEarn >= nextTierThreshold

  const today            = new Date().toISOString().slice(0, 10)
  const willExtendStreak = profile?.lastOrderDate !== today

  return {
    pointsToEarn, basePoints, tierMultiplier, streakMultiplier,
    tier, streak, currentBalance: balance, balanceAfter,
    willExtendStreak, pointsToNextTier, willLevelUp,
  }
}

// =============================================================================
// CORE: createCheckoutSession
// =============================================================================
// Sends item IDs + optional promo/credit to the Edge Function.
// Server computes all totals. Frontend never does discount math.
// =============================================================================

export async function createCheckoutSession(
  payload: CheckoutData & { promoCode?: string; creditId?: string }
): Promise<CheckoutSession> {
  const start     = Date.now()
  const requestId = crypto.randomUUID()

  console.group(`🛒 CHECKOUT SESSION [${requestId}]`)

  try {
    validateCheckoutData(payload)

    // 🔒 SEND ONLY: item ID + quantity + notes (NO prices, NO totals)
    const secureItems = payload.items.map((item) => ({
      id:       item.menuItemId,
      quantity: Math.max(1, Math.min(100, Math.round(item.quantity))),
      notes:    item.specialInstructions?.slice(0, 500) || undefined,
    }))

    const requestBody: Record<string, unknown> = {
      items:      secureItems,
      email:      payload.email.toLowerCase().trim(),
      name:       payload.name?.slice(0, 200)  || '',
      phone:      payload.phone?.slice(0, 50)  || '',
      successUrl: payload.successUrl,
      cancelUrl:  payload.cancelUrl,
    }

    // Attach promo code if provided (server validates — never trust client amount)
    if (payload.promoCode?.trim()) {
      requestBody.promo_code = payload.promoCode.trim().toUpperCase()
    }

    // Attach credit ID if provided (server validates ownership + balance)
    if (payload.creditId?.trim()) {
      requestBody.credit_id = payload.creditId.trim()
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      throw new CheckoutNetworkError('User not authenticated', false)
    }

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= CHECKOUT_CONFIG.MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt}/${CHECKOUT_CONFIG.MAX_RETRIES}`)

        const { data, error } = await withTimeout(
          supabase.functions.invoke('create-checkout', {
            body:    requestBody,
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
          CHECKOUT_CONFIG.TIMEOUT_MS
        )

        if (error) {
          if (error.context?.status === 429) {
            const retryAfter = Number(error.context?.headers?.['retry-after']) * 1000 || 15_000
            throw new CheckoutRateLimitError('Too many checkout attempts', retryAfter)
          }
          // Surface promo / credit errors directly (HTTP 422)
          if (error.context?.status === 422) {
            const body = await error.context.json?.() ?? {}
            const msg  = body?.error ?? error.message
            if (/promo|code|coupon/i.test(msg)) throw new CheckoutPromoError(msg)
            if (/credit/i.test(msg))            throw new CheckoutCreditError(msg)
          }
          throw error
        }

        console.log('✅ Session created:', data.id)
        console.log('⏱️', Date.now() - start, 'ms')
        console.groupEnd()

        return { id: data.id, url: data.url, status: 'open' }

      } catch (err) {
        lastError = err as Error
        // Don't retry validation / promo / credit / rate-limit errors
        if (
          err instanceof CheckoutRateLimitError ||
          err instanceof CheckoutPromoError     ||
          err instanceof CheckoutCreditError    ||
          err instanceof CheckoutValidationError
        ) throw err

        if (attempt < CHECKOUT_CONFIG.MAX_RETRIES) {
          const delay = CHECKOUT_CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt - 1)
          console.warn(`⚠️ Retry in ${delay}ms`)
          await sleep(delay)
        }
      }
    }

    throw lastError || new Error('Checkout failed')

  } catch (err) {
    console.error('❌ Checkout failed:', err)
    console.groupEnd()

    if (
      err instanceof CheckoutValidationError ||
      err instanceof CheckoutNetworkError    ||
      err instanceof CheckoutRateLimitError  ||
      err instanceof CheckoutPromoError      ||
      err instanceof CheckoutCreditError
    ) throw err

    throw new CheckoutNetworkError(
      err instanceof Error ? err.message : 'Checkout failed',
      true
    )
  }
}

// =============================================================================
// REDIRECT
// =============================================================================

export function redirectToCheckout(session: CheckoutSession) {
  console.log('🔀 Redirecting to Stripe...')
  window.location.assign(session.url)
}