// src/features/checkout/checkout.api.ts
// =============================================================================
// CHECKOUT API — ENTERPRISE GRADE (PRODUCTION READY, 2026)
// =============================================================================
// Contract:
// - Frontend NEVER calculates discounts, promo values, tax, or totals.
// - Frontend ONLY sends: item IDs + quantities + notes/modifiers + pricing_hash
//   plus optional promo_code + credit_id.
// - Server (Edge Function create-checkout) returns Stripe session { id, url }.
// =============================================================================
import { invokeEdge } from '@/lib/supabase/invoke'
import { supabase } from '@/lib/supabase/supabaseClient'
import { LOYALTY_TIERS, TIER_ORDER } from '@/domain/loyalty/tiers'
import type { LoyaltyTier } from '@/domain/loyalty/tiers'
import type { CheckoutData, CheckoutSession } from '@/modules/checkout/types/checkout.types'

export { LOYALTY_TIERS }
export type { LoyaltyTier }

// =============================================================================
// CONFIG
// =============================================================================

const CHECKOUT_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1_000,
  TIMEOUT_MS: 30_000,
  MAX_ITEMS: 100,
  MAX_QTY_PER_ITEM: 100,
  MAX_NAME_LEN: 200,
  MAX_PHONE_LEN: 50,
  MAX_NOTES_LEN: 500,
  LOG_BODY_MAX_CHARS: 2_000,
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
  points: number
  lifetimePoints: number
  tier: LoyaltyTier
  streak: number
  lastOrderDate: string | null
}

export interface LoyaltyPreview {
  pointsToEarn: number
  basePoints: number
  tierMultiplier: number
  streakMultiplier: number
  tier: LoyaltyTier
  streak: number
  currentBalance: number
  balanceAfter: number
  willExtendStreak: boolean
  pointsToNextTier: number | null
  willLevelUp: boolean
}

/** What the server returns about applied discounts — used only for display */
export interface ServerDiscount {
  promo_code?: string
  promo_cents?: number
  credit_cents?: number
  total_discount?: number
  subtotal_cents: number
  tax_cents: number
  grand_total: number
}

export interface UserCredit {
  id: string
  amount_cents: number
  source: string
  expires_at: string | null
  created_at: string
}

// =============================================================================
// UTILITIES (safe helpers)
// =============================================================================

type UnknownRecord = Record<string, unknown>

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

function toErrorMessage(err: unknown, fallback = 'Request failed'): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (isRecord(err) && typeof err.message === 'string') return err.message
  return fallback
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function sanitizePromo(code: string): string {
  // Keep it simple and strict; server will be authoritative anyway.
  return code.trim().toUpperCase()
}

function looksLikeUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout')), timeoutMs),
  )
  return Promise.race([promise, timeout])
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function isRetryableMessage(msg: string): boolean {
  // Only retry transient/network-ish cases.
  // DO NOT retry validation 4xx that will never succeed.
  return /(timeout|network|fetch|ECONN|ENOTFOUND|503|502|504|temporarily|try again)/i.test(msg)
}

// Edge function response parser (NO unsafe member access)
function parseCheckoutSessionResponse(payload: unknown): { id: string; url: string } {
  if (!isRecord(payload)) throw new Error('Invalid checkout response')
  const id = asString(payload.id).trim()
  const url = asString(payload.url).trim()
  if (!id || !url) throw new Error('Invalid checkout response: missing id/url')
  return { id, url }
}

// Extract item id robustly from multiple possible cart shapes
function extractCartItemId(item: unknown): string {
  if (!isRecord(item)) return ''
  const raw =
    item.item_id ??
    item.id ??
    item.menu_item_id ??
    item.menuItemId ??
    item.menuItemID ??
    ''
  const id = asString(raw).trim()
  return id
}

// =============================================================================
// VALIDATION (client-side: catch obvious errors before hitting network)
// =============================================================================

function validateCheckoutData(payload: CheckoutData): void {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new CheckoutValidationError('Cart is empty', 'items')
  }
  if (payload.items.length > CHECKOUT_CONFIG.MAX_ITEMS) {
    throw new CheckoutValidationError('Too many items', 'items')
  }

  const email = payload.customer?.email ?? ''
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
    const sessionRes = await supabase.auth.getSession()
    const userId = sessionRes.data.session?.user?.id
    if (!userId) return null

    const { data, error } = await supabase
      .from('profiles')
      .select('loyalty_points, lifetime_points, loyalty_tier, loyalty_streak, last_order_date')
      .eq('id', userId)
      .single()

    if (error || !data) return null

    return {
      points: asNumber(data.loyalty_points, 0),
      lifetimePoints: asNumber(data.lifetime_points, 0),
      tier: (data.loyalty_tier ?? 'bronze') as LoyaltyTier,
      streak: asNumber(data.loyalty_streak, 0),
      lastOrderDate: asString(data.last_order_date, '') || null,
    }
  } catch {
    return null
  }
}

// =============================================================================
// LOYALTY: getAvailableCredits
// =============================================================================

export async function getAvailableCredits(): Promise<UserCredit[]> {
  try {
    const sessionRes = await supabase.auth.getSession()
    const userId = sessionRes.data.session?.user?.id
    if (!userId) return []

    const { data, error } = await supabase
      .from('user_credits')
      .select('id, amount_cents, source, expires_at, created_at')
      .eq('user_id', userId)
      .eq('used', false)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
      .order('created_at', { ascending: true })

    if (error || !data) return []

    return data.map((r) => ({
      id: asString((r as any).id),
      amount_cents: asNumber((r as any).amount_cents, 0),
      source: asString((r as any).source),
      expires_at: (asString((r as any).expires_at).trim() || null) as string | null,
      created_at: asString((r as any).created_at),
    }))
  } catch {
    return []
  }
}

// =============================================================================
// LOYALTY: calculatePointsPreview (pure — mirrors server math)
// =============================================================================

export function calculatePointsPreview(amountCents: number, profile: LoyaltyProfile | null): LoyaltyPreview {
  const tier: LoyaltyTier = profile?.tier ?? 'bronze'
  const streak: number = profile?.streak ?? 0
  const balance: number = profile?.points ?? 0
  const lifetime: number = profile?.lifetimePoints ?? 0

  const tierConfig = LOYALTY_TIERS[tier]
  const basePoints = Math.max(Math.floor(amountCents / 100), 0)
  const tierMultiplier = tierConfig.multiplier

  const nextStreak = streak + 1
  const streakMultiplier =
    nextStreak >= 30 ? 1.5 :
    nextStreak >= 7  ? 1.25 :
    nextStreak >= 3  ? 1.1 :
                       1.0

  const pointsToEarn = Math.max(Math.floor(basePoints * tierMultiplier * streakMultiplier), 0)
  const balanceAfter = balance + pointsToEarn

  const currentIndex = TIER_ORDER.indexOf(tier)
  const nextTier = currentIndex < TIER_ORDER.length - 1 ? TIER_ORDER[currentIndex + 1] : null
  const nextTierThreshold = nextTier ? LOYALTY_TIERS[nextTier].threshold : null
  const pointsToNextTier = nextTierThreshold !== null ? Math.max(nextTierThreshold - lifetime, 0) : null
  const willLevelUp = nextTierThreshold !== null && lifetime + pointsToEarn >= nextTierThreshold

  const today = new Date().toISOString().slice(0, 10)
  const willExtendStreak = profile?.lastOrderDate !== today

  return {
    pointsToEarn,
    basePoints,
    tierMultiplier,
    streakMultiplier,
    tier,
    streak,
    currentBalance: balance,
    balanceAfter,
    willExtendStreak,
    pointsToNextTier,
    willLevelUp,
  }
}

// =============================================================================
// CORE: createCheckoutSession (HARDENED + IDP SAFE, 2026)
// =============================================================================
// Key upgrades:
// - Single idempotency key reused across retries (prevents duplicate Stripe sessions)
// - No “double invoke” before retry loop
// - Strict request body: supports success_url/cancel_url (snake) while server can accept both
// - Robust item id extraction + strict quantity/notes limits
// - Credit UUID validation + promo normalization
// - Better logging (safe preview only)
// =============================================================================
type CheckoutModifierSelection = { id: string; notes?: string }

function normalizeModifiersForCheckout(input: unknown): CheckoutModifierSelection[] {
  const out: CheckoutModifierSelection[] = []
  if (!Array.isArray(input)) return out

  for (const m of input) {
    if (!m || typeof m !== 'object') continue
    const rec = m as Record<string, unknown>

    // Case A: CartModifier style { id, groupId, name, priceAdjustment }
    const directId = typeof rec.id === 'string' ? rec.id.trim() : ''
    if (directId) {
      out.push({ id: directId })
      continue
    }

    // Case B: Server-group style { group_id, selections: [id, id] }
    const selections = rec.selections
    if (Array.isArray(selections)) {
      for (const s of selections) {
        const selId = typeof s === 'string' ? s.trim() : ''
        if (selId) out.push({ id: selId })
      }
      continue
    }

    // Case C: { modifier_id: "..." }
    const modifierId = typeof rec.modifier_id === 'string' ? rec.modifier_id.trim() : ''
    if (modifierId) {
      out.push({ id: modifierId })
      continue
    }
  }

  // Dedup (important if UI accidentally repeats)
  const seen = new Set<string>()
  return out.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
}
export async function createCheckoutSession(
  payload: CheckoutData & { promoCode?: string; creditId?: string },
): Promise<CheckoutSession> {
  const start = Date.now()
  const requestId = crypto.randomUUID()

  console.group(`🛒 CHECKOUT SESSION [${requestId}]`)

  try {
    validateCheckoutData(payload)

    // ── Email ───────────────────────────────────────────────────────────────
    const emailRaw = asString(payload.customer?.email).trim()
    if (!emailRaw) throw new CheckoutValidationError('Missing customer email', 'email')
    const email = normalizeEmail(emailRaw)

    // ── Build secure items (IDs + qty + notes + modifiers + pricing_hash only) ──
    const secureItems = payload.items.map((item) => {
      const rec = item as unknown as Record<string, unknown>

      const id = asString(
        rec['item_id'] ??
          rec['menuItemId'] ??
          rec['menu_item_id'] ??
          rec['id'] ??
          '',
      ).trim()

      const pricingHash = asString(
        rec['pricing_hash'] ??
          rec['pricingHash'] ??
          '',
      ).trim()

      const quantity = Math.max(
        1,
        Math.min(CHECKOUT_CONFIG.MAX_QTY_PER_ITEM, Math.round(item.quantity)),
      )

      const notes =
        item.special_instructions?.slice(0, CHECKOUT_CONFIG.MAX_NOTES_LEN) || undefined

      return {
  id,
  quantity,
  notes,
  modifiers: normalizeModifiersForCheckout((item as any).modifiers),
  pricing_hash: pricingHash || undefined,
}
    })
    const badMods = secureItems.some((i) =>
  Array.isArray(i.modifiers) && i.modifiers.some((m: any) => !m?.id),
)
if (badMods) {
  console.error('❌ Invalid modifier payload (missing id)', { requestId, secureItems })
  throw new CheckoutValidationError('Invalid modifier payload', 'items')
}

    // Must have ids
    if (secureItems.some((i) => !i.id)) {
      console.error('❌ Missing item id(s) in cart', {
        requestId,
        secureItemsPreview: secureItems.map((i) => ({ id: i.id, quantity: i.quantity })),
      })
      throw new CheckoutValidationError('Invalid cart item payload (missing item id)', 'items')
    }

    // ── Build request body (snake_case URLs for server, which can accept both) ──
    const requestBody: Record<string, unknown> = {
      request_id: requestId,
      items: secureItems,
      email,
      name: asString(payload.customer?.name).slice(0, CHECKOUT_CONFIG.MAX_NAME_LEN) || '',
      phone: asString(payload.customer?.phone).slice(0, CHECKOUT_CONFIG.MAX_PHONE_LEN) || '',
      success_url: payload.successUrl,
      cancel_url: payload.cancelUrl,
    }

    // Promo (optional)
    if (payload.promoCode?.trim()) {
      requestBody.promo_code = sanitizePromo(payload.promoCode)
    }

    // Credit (optional)
    if (payload.creditId?.trim()) {
      const cid = payload.creditId.trim()
      if (!looksLikeUuid(cid)) {
        throw new CheckoutValidationError('Invalid credit id format', 'creditId')
      }
      requestBody.credit_id = cid
    }

    // ── Idempotency key: one per “user intent to checkout”, reused across retries ──
    const idempotencyKey = crypto.randomUUID()

    console.log('📨 create-checkout payload preview', {
      requestId,
      email,
      idempotencyKey,
      items: secureItems.map((i) => ({ id: i.id, quantity: i.quantity, hasHash: !!i.pricing_hash })),
      promo_code: requestBody.promo_code ?? null,
      credit_id: requestBody.credit_id ?? null,
    })

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= CHECKOUT_CONFIG.MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt}/${CHECKOUT_CONFIG.MAX_RETRIES}`)

        const raw = await withTimeout(
          invokeEdge<unknown>('create-checkout', requestBody, {
            headers: { 'x-idempotency-key': idempotencyKey },
          }),
          CHECKOUT_CONFIG.TIMEOUT_MS,
        )

        const { id, url } = parseCheckoutSessionResponse(raw)

        console.log('✅ Session created:', id)
        console.log('⏱️', Date.now() - start, 'ms')
        console.groupEnd()

        return { id, url, status: 'open' }
      } catch (err) {
        const msg = toErrorMessage(err, 'Checkout failed')
        lastError = err instanceof Error ? err : new Error(msg)

        // Typed mapping (no unsafe property access)
        if (/too many|rate limit|429/i.test(msg)) {
          throw new CheckoutRateLimitError('Too many checkout attempts', 15_000)
        }
        if (/promo|code|coupon/i.test(msg)) {
          throw new CheckoutPromoError(msg)
        }
        if (/credit/i.test(msg)) {
          throw new CheckoutCreditError(msg)
        }
        if (err instanceof CheckoutValidationError) throw err

        const retryable = isRetryableMessage(msg)

        // Don’t retry non-transient failures (most 400s/422s)
        if (!retryable) {
          console.error('❌ Non-retryable checkout failure', { requestId, msg })
          throw new CheckoutNetworkError(msg, false)
        }

        if (attempt < CHECKOUT_CONFIG.MAX_RETRIES) {
          const delay = CHECKOUT_CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt - 1)
          console.warn(`⚠️ Retry in ${delay}ms`)
          await sleep(delay)
        }
      }
    }

    throw lastError ?? new Error('Checkout failed')
  } catch (err) {
    console.error('❌ Checkout failed:', err)
    console.groupEnd()

    if (
      err instanceof CheckoutValidationError ||
      err instanceof CheckoutNetworkError ||
      err instanceof CheckoutRateLimitError ||
      err instanceof CheckoutPromoError ||
      err instanceof CheckoutCreditError
    ) {
      throw err
    }

    throw new CheckoutNetworkError(toErrorMessage(err, 'Checkout failed'), true)
  }
}
// =============================================================================
// REDIRECT
// =============================================================================

export function redirectToCheckout(session: CheckoutSession): void {
  window.location.assign(session.url)
}
