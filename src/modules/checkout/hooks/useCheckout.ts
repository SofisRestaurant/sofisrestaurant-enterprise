// =============================================================================
// src/hooks/useCheckout.ts
// CHECKOUT HOOK — Production (2026)
// =============================================================================
// - Single source of truth for checkout state
// - Abort + timeout hardening
// - Uses invokeEdge (attaches JWT)
// - Strict runtime validation of response
// - Option A anti-tamper: sends frontendTotals (informational only; server recomputes)
// - Sends BOTH promoCode + promoId (server decides)
// - Prepares optional loyalty intent fields (NOTE: final loyalty award should happen
//   on webhook/order success, not here)
// =============================================================================

import { useCallback, useMemo, useRef, useState } from 'react'
import { invokeEdge } from '@/lib/supabase/invoke'
import { useCart } from '@/modules/cart/hooks/useCart'
import type { CartTotals } from '@/modules/cart/types/cart.types'

type OrderType = 'pickup' | 'delivery' | 'dine_in'

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export type CheckoutArgs = {
  customer_uid: string
  email?: string | null
  name?: string | null
  phone?: string | null

  // Promo can be provided as code (common in UI) OR id (common in DB)
  promo_code?: string
  promo_id?: string

  credit_id?: string

  orderType?: OrderType
  notes?: string | null
  idempotencyKey?: string

  /**
   * Loyalty (optional):
   * You generally should NOT award points here (payment not confirmed yet).
   * This is for UX intent only (server can ignore or store intent on pending cart).
   */
  loyalty?: {
    applyPoints?: boolean
    pointsToRedeem?: number
    loyaltyAccountId?: string
  }
}

type CheckoutTotals = {
  subtotalCents: number
  discountCents: number
  creditCents: number
  taxCents: number
  totalCents: number
}

type CreateCheckoutOk = {
  ok: true
  session_id: string
  url: string | null
  totals: CheckoutTotals
  pending_cart_id: string
}

type CreateCheckoutErr = {
  ok: false
  error: string
  code?: string
}

type CreateCheckoutResponse = CreateCheckoutOk | CreateCheckoutErr

type CheckoutState = {
  isLoading: boolean
  error: string | null
  errorCode: string | null
  canRetry: boolean
  retryAfter: number // ms (rate limit / cooldown)
}

const DEFAULT_TIMEOUT_MS = 15_000

// ─────────────────────────────────────────────────────────────────────────────
// Runtime helpers (no unsafe member access)
// ─────────────────────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

function normalizePromoCode(code?: string): string | null {
  const v = (code ?? '').trim()
  return v ? v : null
}

function normalizeId(id?: string): string | null {
  const v = (id ?? '').trim()
  return v ? v : null
}

function normalizeNotes(notes?: string | null): string | null {
  if (notes == null) return null
  const v = String(notes).trim()
  if (!v) return null
  return v.length > 1200 ? v.slice(0, 1200) : v
}

function parseCheckoutResponse(raw: unknown): CreateCheckoutResponse {
  if (!isRecord(raw) || typeof raw.ok !== 'boolean') {
    return { ok: false, error: 'Invalid checkout response', code: 'BAD_RESPONSE' }
  }

  if (raw.ok !== true) {
    const msg = typeof raw.error === 'string' ? raw.error : 'Checkout failed'
    const code = typeof raw.code === 'string' ? raw.code : undefined
    return { ok: false, error: msg, code }
  }

  const session_id = typeof raw.session_id === 'string' ? raw.session_id : ''
  const url = raw.url === null || typeof raw.url === 'string' ? raw.url : null
  const pending_cart_id = typeof raw.pending_cart_id === 'string' ? raw.pending_cart_id : ''

  const totalsRaw = raw.totals
  const totals: CheckoutTotals = isRecord(totalsRaw)
    ? {
        subtotalCents: Math.max(0, Math.round(asNumber(totalsRaw.subtotalCents, 0))),
        discountCents: Math.max(0, Math.round(asNumber(totalsRaw.discountCents, 0))),
        creditCents: Math.max(0, Math.round(asNumber(totalsRaw.creditCents, 0))),
        taxCents: Math.max(0, Math.round(asNumber(totalsRaw.taxCents, 0))),
        totalCents: Math.max(0, Math.round(asNumber(totalsRaw.totalCents, 0))),
      }
    : { subtotalCents: 0, discountCents: 0, creditCents: 0, taxCents: 0, totalCents: 0 }

  if (!session_id) return { ok: false, error: 'Missing session_id', code: 'BAD_RESPONSE' }
  if (!pending_cart_id) return { ok: false, error: 'Missing pending_cart_id', code: 'BAD_RESPONSE' }

  return { ok: true, session_id, url, totals, pending_cart_id }
}

/**
 * Option A anti-tamper telemetry: derive “frontendTotals” safely from the cart hook outputs.
 * IMPORTANT:
 * - Informational only (server must recompute totals from DB truth).
 */
function deriveFrontendTotals(
  items: unknown,
  subtotalFormatted: string,
  totalFormatted: string,
): CartTotals {
  const moneyToCents = (s: string): number => {
    const cleaned = s.replace(/[^0-9.]/g, '')
    const n = Number(cleaned)
    if (!Number.isFinite(n) || n < 0) return 0
    return Math.round(n * 100)
  }

  const subtotalCentsFromUI = moneyToCents(subtotalFormatted)
  const totalCentsFromUI = moneyToCents(totalFormatted)

  const safe: CartTotals = {
    subtotalCents: subtotalCentsFromUI,
    discountCents: 0,
    creditCents: 0,
    taxCents: Math.max(0, totalCentsFromUI - subtotalCentsFromUI),
    totalCents: totalCentsFromUI,
  }

  // If we can sum lineTotalCents from items, prefer that as subtotal
  if (Array.isArray(items)) {
    let sum = 0
    for (const it of items) {
      if (!isRecord(it)) continue
      const line = asNumber(it.lineTotalCents, NaN)
      if (Number.isFinite(line)) sum += Math.max(0, Math.round(line))
    }
    if (sum > 0) {
      safe.subtotalCents = sum
      safe.taxCents = Math.max(0, safe.totalCents - safe.subtotalCents)
    }
  }

  return safe
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useCheckout() {
  // NOTE: useCart() in your project exposes display totals, not raw totals
  const { items, subtotalFormatted, totalFormatted } = useCart()

  const [state, setState] = useState<CheckoutState>({
    isLoading: false,
    error: null,
    errorCode: null,
    canRetry: false,
    retryAfter: 0,
  })

  const abortRef = useRef<AbortController | null>(null)

  const canCheckout = useMemo(() => Array.isArray(items) && items.length > 0, [items])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setState({ isLoading: false, error: null, errorCode: null, canRetry: false, retryAfter: 0 })
  }, [])

  const checkout = useCallback(
    async (args: CheckoutArgs) => {
      if (!canCheckout) {
        setState((s) => ({ ...s, error: 'Your cart is empty.', errorCode: 'EMPTY_CART' }))
        return
      }

      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac

      setState({ isLoading: true, error: null, errorCode: null, canRetry: false, retryAfter: 0 })

      const timeout = window.setTimeout(() => ac.abort(), DEFAULT_TIMEOUT_MS)

      try {
        const orderType: OrderType = args.orderType ?? 'pickup'

        // Option A telemetry (anti-tamper logging only)
        const frontendTotals = deriveFrontendTotals(items, subtotalFormatted, totalFormatted)

        const promoId = normalizeId(args.promo_id)
        const promoCode = normalizePromoCode(args.promo_code)
        const creditId = normalizeId(args.credit_id)

        // Loyalty intent (optional; server may ignore)
        const loyalty =
          args.loyalty && isRecord(args.loyalty)
            ? {
                applyPoints: Boolean((args.loyalty as { applyPoints?: unknown }).applyPoints),
                pointsToRedeem: clampInt(
                  (args.loyalty as { pointsToRedeem?: unknown }).pointsToRedeem,
                  0,
                  1_000_000,
                ),
                loyaltyAccountId: normalizeId(
                  (args.loyalty as { loyaltyAccountId?: unknown }).loyaltyAccountId as string | undefined,
                ),
              }
            : null

        /**
         * IMPORTANT payload contract:
         * - send promoCode field (server should support it)
         * - also send promoId for DB-driven flows
         * - server chooses: prefer promoId if present, else promoCode
         */
        const payload = {
          items, // untrusted, server rebuilds truth
          orderType,
          notes: normalizeNotes(args.notes),

          promoId,
          promoCode,

          creditId,
          idempotencyKey: normalizeId(args.idempotencyKey) ?? null,

          // telemetry only
          frontendTotals,

          // optional intent only
          loyalty,
        }

        const raw = await invokeEdge<unknown>('create-checkout', payload, { signal: ac.signal })
        const parsed = parseCheckoutResponse(raw)

        if (parsed.ok !== true) {
          setState((s) => ({
            ...s,
            isLoading: false,
            error: parsed.error,
            errorCode: parsed.code ?? null,
            canRetry: true,
          }))
          throw new Error(parsed.error)
        }

        if (!parsed.url) {
          setState((s) => ({
            ...s,
            isLoading: false,
            error: 'Stripe checkout URL missing.',
            errorCode: 'NO_URL',
            canRetry: true,
          }))
          throw new Error('Stripe checkout URL missing.')
        }

        // Success path: redirect (do not clear loading; page navigates)
        window.location.assign(parsed.url)
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          setState((s) => ({
            ...s,
            isLoading: false,
            error: 'Checkout timed out. Please try again.',
            errorCode: 'TIMEOUT',
            canRetry: true,
            retryAfter: 0,
          }))
          throw e
        }

        const msg =
          e instanceof Error
            ? e.message
            : isRecord(e) && typeof e.message === 'string'
              ? String(e.message)
              : 'Checkout failed'

        setState((s) => ({
          ...s,
          isLoading: false,
          error: msg,
          errorCode: s.errorCode ?? null,
          canRetry: true,
        }))

        throw e
      } finally {
        window.clearTimeout(timeout)
      }
    },
    [canCheckout, items, subtotalFormatted, totalFormatted],
  )

  return {
    checkout,
    reset,
    canCheckout,
    isLoading: state.isLoading,
    error: state.error,
    errorCode: state.errorCode,
    canRetry: state.canRetry,
    retryAfter: state.retryAfter,
  }
}