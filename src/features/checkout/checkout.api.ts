// src/features/checkout/checkout.api.ts
// ============================================================================
// SECURE CHECKOUT API — v2 WITH LOYALTY POINTS PREVIEW
// ============================================================================
//
// Tier config moved to @/domain/loyalty/tiers (single source of truth).
// All checkout logic, retry loop, and preview math unchanged.
// ============================================================================

import { supabase } from '@/lib/supabase/supabaseClient'
import type { CheckoutData, CheckoutSession } from './checkout.types'
import { LOYALTY_TIERS, TIER_ORDER, type LoyaltyTier } from '@/domain/loyalty/tiers'

// Re-export so existing imports from checkout.api still resolve during migration
export { LOYALTY_TIERS, type LoyaltyTier } from '@/domain/loyalty/tiers'

// ============================================================================
// CONFIG
// ============================================================================

const CHECKOUT_CONFIG = {
  MAX_RETRIES:    3,
  RETRY_DELAY_MS: 1000,
  TIMEOUT_MS:     30000,
  MAX_ITEMS:      100,
} as const

// ============================================================================
// ERRORS
// ============================================================================

export class CheckoutValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message)
    this.name = 'CheckoutValidationError'
  }
}

export class CheckoutNetworkError extends Error {
  constructor(message: string, public retryable: boolean = true) {
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

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// UTILITIES
// ============================================================================

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
  )
  return Promise.race([promise, timeoutPromise])
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ============================================================================
// VALIDATION
// ============================================================================

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

// ============================================================================
// LOYALTY: getLoyaltyProfile
// ============================================================================

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
      points:         data.loyalty_points   ?? 0,
      lifetimePoints: data.lifetime_points  ?? 0,
      tier:           (data.loyalty_tier    ?? 'bronze') as LoyaltyTier,
      streak:         data.loyalty_streak   ?? 0,
      lastOrderDate:  data.last_order_date  ?? null,
    }
  } catch {
    return null
  }
}

// ============================================================================
// LOYALTY: calculatePointsPreview
//
// Pure function — no DB calls, no side effects.
// Mirrors award_loyalty_points() Postgres function math exactly.
// ============================================================================

export function calculatePointsPreview(
  amountCents: number,
  profile: LoyaltyProfile | null
): LoyaltyPreview {
  const tier:     LoyaltyTier = profile?.tier           ?? 'bronze'
  const streak:   number      = profile?.streak         ?? 0
  const balance:  number      = profile?.points         ?? 0
  const lifetime: number      = profile?.lifetimePoints ?? 0

  const tierConfig = LOYALTY_TIERS[tier]

  // Base: 1 point per $1
  const basePoints     = Math.max(Math.floor(amountCents / 100), 0)
  const tierMultiplier = tierConfig.multiplier

  // Streak multiplier — mirrors Postgres CASE exactly
  const streakForPreview = streak + 1
  const streakMultiplier =
    streakForPreview >= 30 ? 1.50 :
    streakForPreview >= 7  ? 1.25 :
    streakForPreview >= 3  ? 1.10 :
                             1.0

  const pointsToEarn = Math.max(
    Math.floor(basePoints * tierMultiplier * streakMultiplier),
    0
  )

 const balanceAfter = balance + pointsToEarn

// ───────────────────────────────────────────────────────────
// Tier progression logic (hierarchy-driven using TIER_ORDER)
// ───────────────────────────────────────────────────────────

const currentIndex = TIER_ORDER.indexOf(tier)

const nextTier =
  currentIndex >= 0 && currentIndex < TIER_ORDER.length - 1
    ? TIER_ORDER[currentIndex + 1]
    : null

const nextTierThreshold =
  nextTier ? LOYALTY_TIERS[nextTier].threshold : null

const pointsToNextTier =
  nextTierThreshold !== null
    ? Math.max(nextTierThreshold - lifetime, 0)
    : null

const willLevelUp =
  nextTierThreshold !== null &&
  lifetime + pointsToEarn >= nextTierThreshold

// ───────────────────────────────────────────────────────────
// Streak extension logic
// ───────────────────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10)
const willExtendStreak = profile?.lastOrderDate !== today
  return {
    pointsToEarn,
    basePoints,
    tierMultiplier,
    streakMultiplier,
    tier,
    streak,
    currentBalance:   balance,
    balanceAfter,
    willExtendStreak,
    pointsToNextTier,
    willLevelUp,
  }
}

// ============================================================================
// CORE API (SECURE) — unchanged
// ============================================================================

export async function createCheckoutSession(
  payload: CheckoutData
): Promise<CheckoutSession> {
  const start     = Date.now()
  const requestId = crypto.randomUUID()

  console.group(`🛒 CHECKOUT SESSION [${requestId}]`)

  try {
    validateCheckoutData(payload)
    console.log('✅ Validation passed')

    // 🔒 SEND ONLY ID + QUANTITY + NOTES (NO PRICE, NO TOTALS)
    const secureItems = payload.items.map((item) => ({
      id:       item.menuItemId,
      quantity: Math.max(1, Math.min(100, Math.round(item.quantity))),
      notes:    item.specialInstructions?.slice(0, 500) || undefined,
    }))

    const requestBody = {
      items:      secureItems,
      email:      payload.email.toLowerCase().trim(),
      name:       payload.name?.slice(0, 200) || '',
      phone:      payload.phone?.slice(0, 50) || '',
      successUrl: payload.successUrl,
      cancelUrl:  payload.cancelUrl,
    }

    const { data: { session } } = await supabase.auth.getSession()
    const accessToken = session?.access_token

    if (!accessToken) {
      throw new CheckoutNetworkError('User not authenticated', false)
    }

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= CHECKOUT_CONFIG.MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt}/${CHECKOUT_CONFIG.MAX_RETRIES}`)

        const { data, error } = await withTimeout(
          supabase.functions.invoke('create-checkout', {
            body: requestBody,
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          CHECKOUT_CONFIG.TIMEOUT_MS
        )

        if (error) {
          if (error.context?.status === 429) {
            const retryAfter =
              Number(error.context?.headers?.['retry-after']) * 1000 || 15000
            throw new CheckoutRateLimitError('Too many checkout attempts', retryAfter)
          }
          throw error
        }

        console.log('✅ Session created:', data.id)
        console.log('⏱️', Date.now() - start, 'ms')
        console.groupEnd()

        return { id: data.id, url: data.url, status: 'open' }

      } catch (err) {
        lastError = err as Error
        if (err instanceof CheckoutRateLimitError) throw err
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
      err instanceof CheckoutNetworkError   ||
      err instanceof CheckoutRateLimitError
    ) {
      throw err
    }

    throw new CheckoutNetworkError(
      err instanceof Error ? err.message : 'Checkout failed',
      true
    )
  }
}

// ============================================================================
// REDIRECT
// ============================================================================

export function redirectToCheckout(session: CheckoutSession) {
  console.log('🔀 Redirecting to Stripe...')
  window.location.assign(session.url)
}