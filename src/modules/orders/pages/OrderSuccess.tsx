// src/modules/orders/pages/OrderSuccess.tsx
// ============================================================================
// ORDER SUCCESS — Enterprise (2026) — Loyal + Sticky + Secure (V2-aligned)
// ============================================================================
// Goals:
// - Confirm order reliably (finalize + poll + realtime)
// - Show loyalty securely via Edge Function (no direct table reads for loyalty)
// - Reduce retry storms + avoid 401 loops
// - Restaurant-grade “stickiness”: next-visit nudge, save receipt, share, help
//
// Security:
// - Never logs token/session_id
// - Loyalty reads ONLY through `loyalty-for-order` Edge Function (server enforces ownership)
// - finalize-order is called with JWT (server enforces ownership)
//
// V2 Alignment:
// - Loyalty per-order is derived from loyalty_ledger (reference_id / metadata.order_id / heuristic)
// - Account snapshot is from loyalty_accounts (authoritative balance/tier/streak)
//
// Fixes / upgrades:
// ✅ Strict runtime guards (no `any`)
// ✅ Proper timer cleanup + no runaway timers
// ✅ Uses auth JWT for finalize-order + loyalty-for-order
// ✅ Backoff + bounded retries
// ✅ Realtime subscription best-effort + safe payload parsing
// ✅ UI does not assume V1 fields (tier_multiplier, base_points, etc.)
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase/supabaseClient'
import { invokeEdge } from '@/lib/supabase/invoke'
import { useCartStore } from '@/modules/cart/store/cart.store'
import { mapOrderRowToDomain } from '@/domain/orders/order.mapper'
import type { Order } from '@/domain/orders/order.types'
import type { OrderStatus } from '@/domain/orders/order.types'
import { LOYALTY_TIERS, asTier } from '@/domain/loyalty/tiers'
import type { Database } from '@/types/supabase'

type DbOrder = Database['public']['Tables']['orders']['Row']
type OrderMetadata = Database['public']['Tables']['orders']['Row']['metadata']

type PageState = 'loading' | 'found' | 'timeout' | 'error'
type OrderServiceType = 'pickup' | 'delivery' | 'dine_in'

// V2 loyalty row returned by loyalty-for-order (ledger-derived)
type LoyaltyTxV2 = {
  entry_type: 'earn' | 'redeem' | 'bonus' | 'expired' | 'adjustment'
  amount: number // signed; earn positive, redeem negative
  balance_after: number
  tier_at_time: string
  streak_at_time: number
  created_at: string
  source: string
  reference_id: string | null
  metadata: unknown | null
}

type LoyaltyAccountSnap = {
  balance: number
  lifetime_earned: number
  tier: string
  streak: number
  updated_at: string
}

type LoyaltyForOrderMeta = {
  requestId?: string
  ts?: string
  v2Found?: boolean
  usedHeuristic?: boolean
  matchMethod?: 'reference_id' | 'metadata.order_id' | 'idempotency_key' | 'heuristic' | 'none'
  legacy?: {
    v1Found: boolean
    points_delta?: number
    points_balance?: number
    created_at?: string
  }
}

type LoyaltyForOrderResp = {
  ok?: boolean
  loyalty?: LoyaltyTxV2 | null
  account?: LoyaltyAccountSnap | null
  meta?: LoyaltyForOrderMeta
  error?: unknown
  code?: unknown
}

type FinalizeResp = {
  ok?: boolean
  order_id?: string | null
  already_finalized?: boolean
  payment_status?: string | null
  status?: string | null
  message?: string
  requestId?: string
}

const POLL_INTERVAL_MS = 2_000
const POLL_MAX_ATTEMPTS = 25

const LOYALTY_RETRY_BASE_MS = 1_800
const LOYALTY_MAX_ATTEMPTS = 10

// Stripe checkout session id patterns
const STRIPE_SESSION_RE = /^cs_(test|live)_[a-zA-Z0-9]+$/

type UnknownRecord = Record<string, unknown>

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function safeServiceTypeFromOrder(order: Order | null): OrderServiceType | null {
  const md = order?.metadata
  if (!isRecord(md)) return null
  const v = md['order_service_type']
  return v === 'pickup' || v === 'delivery' || v === 'dine_in' ? v : null
}

function cents(n: number): string {
  return (n / 100).toFixed(2)
}

function fmt(n: number): string {
  return n.toLocaleString()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

function nextTierNudge(points: number, tier: string): { label: string; ptsLeft: number } | null {
  const t = asTier(tier)
  const cfg = LOYALTY_TIERS[t]
  const anyCfg = cfg as unknown as { nextThreshold?: number }
  const next = typeof anyCfg?.nextThreshold === 'number' ? anyCfg.nextThreshold : null
  if (!next) return null

  const left = Math.max(0, Math.ceil(next - points))
  if (left <= 0) return null
  return { label: `Only ${fmt(left)} points to the next tier`, ptsLeft: left }
}

function safeOrderNumber(n: unknown): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return String(Math.trunc(n)).padStart(4, '0')
}

function safeMetaOrderServiceType(md: OrderMetadata | null | undefined): OrderServiceType | null {
  if (!isRecord(md)) return null
  const v = md['order_service_type']
  return v === 'pickup' || v === 'delivery' || v === 'dine_in' ? v : null
}

// --- UI helpers ---

function LoadingState({ attempt }: { attempt: number }) {
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 animate-ping rounded-full bg-amber-500/20" />
        <div className="absolute inset-2 animate-pulse rounded-full bg-amber-500/10" />
        <span className="relative text-3xl">🧾</span>
      </div>
      <div>
        <p className="text-lg font-semibold text-white">{attempt > 5 ? 'Almost there…' : 'Confirming your order'}</p>
        <p className="mt-1 text-sm text-neutral-500">
          {attempt > 5 ? 'Payment received — finalizing details.' : 'Verifying payment with Stripe.'}
        </p>
      </div>
    </div>
  )
}

function ErrorState() {
  return (
    <div className="space-y-4 text-center">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
          <span className="text-2xl">⚠</span>
        </div>
      </div>
      <div>
        <h2 className="text-lg font-bold text-white">Something went wrong</h2>
        <p className="mt-1 text-sm text-neutral-500">Your payment may still have been processed.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Link
          to="/account/orders"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/8 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/12"
        >
          Check My Orders
        </Link>
        <Link to="/menu" className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-400">
          Return to menu
        </Link>
      </div>
    </div>
  )
}

function TimeoutState() {
  return (
    <div className="space-y-4 text-center">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-yellow-500/10 ring-1 ring-yellow-500/20">
          <span className="text-2xl">⏱</span>
        </div>
      </div>
      <div>
        <h2 className="text-lg font-bold text-white">Taking longer than usual</h2>
        <p className="mt-1 text-sm text-neutral-500">Your payment was received. The order is being finalized.</p>
      </div>
      <Link
        to="/account/orders"
        className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-2.5 text-sm font-semibold text-amber-400 transition hover:bg-amber-500/15"
      >
        View My Orders
      </Link>
    </div>
  )
}

function LoyaltyResultCard({
  loyalty,
  account,
  meta,
}: {
  loyalty: LoyaltyTxV2
  account: LoyaltyAccountSnap | null
  meta?: LoyaltyForOrderMeta
}) {
  const tier = asTier(account?.tier ?? loyalty.tier_at_time)
  const tierCfg = LOYALTY_TIERS[tier]

  const pointsDelta = typeof loyalty.amount === 'number' ? loyalty.amount : 0
  const earned = Math.max(0, Math.trunc(pointsDelta))
  const displayBalance =
    account && typeof account.balance === 'number' ? account.balance : loyalty.balance_after

  const matchLabel =
    meta?.matchMethod === 'reference_id'
      ? 'Linked by order id'
      : meta?.matchMethod === 'metadata.order_id'
        ? 'Linked by ledger metadata'
        : meta?.matchMethod === 'idempotency_key'
          ? 'Linked by idempotency key'
          : meta?.matchMethod === 'heuristic'
            ? 'Matched by time window'
            : null

  const isEarnLike = loyalty.entry_type === 'earn' || loyalty.entry_type === 'bonus' || loyalty.entry_type === 'adjustment'

  return (
    <div className="overflow-hidden rounded-xl border border-amber-500/20 bg-linear-to-br from-amber-950/40 via-neutral-900 to-neutral-900">
      <div className="flex items-center justify-between border-b border-amber-500/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">✨</span>
          <span className="text-sm font-semibold text-amber-300">
            {isEarnLike ? 'Loyalty Update' : 'Loyalty Update'}
          </span>
        </div>
        <span className="font-mono text-2xl font-bold text-amber-400">
          {pointsDelta >= 0 ? `+${fmt(earned)}` : `-${fmt(Math.abs(pointsDelta))}`} pts
        </span>
      </div>

      <div className="space-y-3 px-4 py-4 font-mono text-xs">
        <div className="flex items-center justify-between rounded-lg bg-white/3 px-3 py-2">
          <span className="text-neutral-400">Entry type</span>
          <span className="font-semibold text-neutral-200">{loyalty.entry_type}</span>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-white/3 px-3 py-2">
          <span className="text-neutral-400">Tier</span>
          <span className={`flex items-center gap-1 font-semibold ${tierCfg.dark.text}`}>
            {tierCfg.icon} {tierCfg.label}
          </span>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-white/3 px-3 py-2">
          <span className="text-neutral-400">Streak</span>
          <span className="font-semibold text-neutral-200">{fmt(loyalty.streak_at_time)} days</span>
        </div>

        <div className="flex justify-between border-t border-white/5 pt-2 text-neutral-400">
          <span>New balance</span>
          <span className="font-bold text-neutral-200">{fmt(displayBalance)} pts</span>
        </div>

        {matchLabel && (
          <div className="pt-1 text-[10px] text-neutral-500">
            {meta?.usedHeuristic ? `⚠ ${matchLabel}` : `✓ ${matchLabel}`}
          </div>
        )}
      </div>
    </div>
  )
}

function StickyNextSteps({
  order,
  loyalty,
  account,
}: {
  order: Order
  loyalty: LoyaltyTxV2 | null
  account: LoyaltyAccountSnap | null
}) {
  const tier = account?.tier ? asTier(account.tier) : loyalty ? asTier(loyalty.tier_at_time) : null
  const tierCfg = tier ? LOYALTY_TIERS[tier] : null

  const balancePoints =
    account && typeof account.balance === 'number' ? account.balance : loyalty ? loyalty.balance_after : 0

  const tierSource = account?.tier ?? (loyalty?.tier_at_time ?? 'bronze')
  const nudge = tierSource ? nextTierNudge(balancePoints, tierSource) : null

  const orderNo = safeOrderNumber(order.order_number)

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">Next visit perks</p>

      <div className="rounded-xl border border-white/8 bg-white/3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Save your receipt</p>
            <p className="mt-1 text-xs text-neutral-500">
              If anything looks off, we can help faster with your order ID.
            </p>
          </div>
          <span className="text-xl">🧾</span>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-white/8 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/12"
          >
            Print / Save PDF
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                const summary = `Sofi's Restaurant • Order ${orderNo ? `#${orderNo}` : ''} • Total $${cents(order.amount_total)} • Ref ${order.id.slice(0, 8).toUpperCase()}`
                await navigator.clipboard.writeText(summary)
              } catch {
                // ignore
              }
            }}
            className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:border-white/20"
          >
            Copy receipt summary
          </button>
        </div>
      </div>

      {(loyalty || account) && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-200">
                {tierCfg ? (
                  <>
                    {tierCfg.icon} {tierCfg.label} member perks
                  </>
                ) : (
                  <>Loyalty perks</>
                )}
              </p>
              <p className="mt-1 text-xs text-amber-200/70">
                Use points in your account anytime. Keep your streak alive to boost rewards.
              </p>
              {nudge && (
                <p className="mt-2 text-[11px] font-semibold text-amber-300">⚡ {nudge.label}</p>
              )}
            </div>
            <span className="text-xl">🎁</span>
          </div>
          <div className="mt-3 flex gap-2">
            <Link
              to="/account"
              className="flex-1 rounded-lg bg-amber-500/15 px-3 py-2 text-center text-xs font-semibold text-amber-200 transition hover:bg-amber-500/20"
            >
              View rewards
            </Link>
            <Link
              to="/menu"
              className="flex-1 rounded-lg bg-white/8 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-white/12"
            >
              Order again
            </Link>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/8 bg-white/3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Need help?</p>
            <p className="mt-1 text-xs text-neutral-500">We respond fast. Include your order ref for the quickest fix.</p>
          </div>
          <span className="text-xl">💬</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href="mailto:sofisrestaurante@gmail.com"
            className="rounded-lg bg-white/8 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-white/12"
          >
            Email us
          </a>
          <Link
            to="/contact"
            className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-center text-xs font-semibold text-neutral-200 transition hover:border-white/20"
          >
            Contact form
          </Link>
        </div>
      </div>
    </div>
  )
}

async function getJwt(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token ?? null
}

export default function OrderSuccess() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const clearCart = useCartStore((s) => s.clearCart)

  const rawSessionId = searchParams.get('session_id')

  const [pageState, setPageState] = useState<PageState>('loading')
  const [order, setOrder] = useState<Order | null>(null)
  const [liveStatus, setLiveStatus] = useState<OrderStatus | null>(null)
  const [attempt, setAttempt] = useState(0)

  const [loyalty, setLoyalty] = useState<LoyaltyTxV2 | null>(null)
  const [loyaltyAccount, setLoyaltyAccount] = useState<LoyaltyAccountSnap | null>(null)
  const [loyaltyMeta, setLoyaltyMeta] = useState<LoyaltyForOrderMeta | undefined>(undefined)
  const [loyaltyAttempt, setLoyaltyAttempt] = useState(0)

  const finalizedRef = useRef(false)
  const finalizedOrderIdRef = useRef<string | null>(null)

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loyaltyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sessionId = useMemo(() => (rawSessionId ? rawSessionId.trim() : ''), [rawSessionId])

  const isValidSessionId = useMemo(() => {
    return !!sessionId && sessionId.length <= 200 && STRIPE_SESSION_RE.test(sessionId)
  }, [sessionId])

  const stopTimer = useCallback((ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>) => {
    if (ref.current) clearTimeout(ref.current)
    ref.current = null
  }, [])

  const fetchLoyaltyWithRetry = useCallback(
    async (orderId: string) => {
      let n = 0
      stopTimer(loyaltyTimerRef)
      setLoyaltyAttempt(0)

      const schedule = (ms: number) => {
        stopTimer(loyaltyTimerRef)
        loyaltyTimerRef.current = setTimeout(() => void run(), ms)
      }

      const run = async () => {
        if (!orderId) return
        n += 1
        setLoyaltyAttempt(n)

        try {
          const token = await getJwt()

          // If not authenticated yet, retry (prevents hammering 401)
          if (!token) {
            if (n < LOYALTY_MAX_ATTEMPTS) schedule(clampInt(LOYALTY_RETRY_BASE_MS + (n - 1) * 250, 1200, 4200))
            return
          }

          const resp = await invokeEdge<LoyaltyForOrderResp>(
            'loyalty-for-order',
            { order_id: orderId },
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'x-request-id': crypto.randomUUID(),
              },
            },
          )

          if (resp?.account && typeof resp.account.balance === 'number') setLoyaltyAccount(resp.account)
          if (resp?.meta && isRecord(resp.meta)) setLoyaltyMeta(resp.meta as LoyaltyForOrderMeta)

          const tx = resp?.loyalty ?? null
          if (tx && typeof tx.amount === 'number' && typeof tx.created_at === 'string') {
            setLoyalty(tx)
            stopTimer(loyaltyTimerRef)
            return
          }

          if (n < LOYALTY_MAX_ATTEMPTS) schedule(clampInt(LOYALTY_RETRY_BASE_MS + (n - 1) * 350, 1200, 4800))
        } catch {
          if (n < LOYALTY_MAX_ATTEMPTS) schedule(clampInt(LOYALTY_RETRY_BASE_MS + (n - 1) * 450, 1400, 5200))
        }
      }

      await run()
    },
    [stopTimer],
  )

  useEffect(() => {
    if (!sessionId || !isValidSessionId) {
      setPageState('error')
      return
    }

    let cancelled = false
    let attempts = 0

    const stopPoll = () => stopTimer(pollTimerRef)
    const schedulePoll = () => {
      stopPoll()
      pollTimerRef.current = setTimeout(() => void run(), POLL_INTERVAL_MS)
    }

    async function run() {
      if (cancelled) return

      attempts += 1
      setAttempt(attempts)

      try {
        // 1) finalize-order (once, idempotent)
        if (!finalizedRef.current && attempts >= 2) {
          finalizedRef.current = true

          const token = await getJwt()
          if (token) {
            const resp = await invokeEdge<FinalizeResp>(
              'finalize-order',
              { session_id: sessionId },
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  'x-request-id': crypto.randomUUID(),
                  // idempotency header is safe (no PII)
                  'x-idempotency-key': crypto.randomUUID(),
                },
              },
            )

            if (!cancelled && resp?.order_id && typeof resp.order_id === 'string') {
              finalizedOrderIdRef.current = resp.order_id
            }
          } else {
            // If token not ready yet, allow polling to continue; finalize will happen next run
            finalizedRef.current = false
          }
        }

        // 2) load order (prefer order id if available)
        const q = supabase.from('orders').select('*')
        const { data, error } = finalizedOrderIdRef.current
          ? await q.eq('id', finalizedOrderIdRef.current).maybeSingle()
          : await q.eq('stripe_session_id', sessionId).maybeSingle()

        if (cancelled) return

        if (error) {
          if (attempts >= POLL_MAX_ATTEMPTS) {
            setPageState('error')
            stopPoll()
          } else schedulePoll()
          return
        }

        if (!data) {
          if (attempts >= POLL_MAX_ATTEMPTS) {
            setPageState('timeout')
            stopPoll()
          } else schedulePoll()
          return
        }

        // 3) Found order
        const mapped = mapOrderRowToDomain(data as DbOrder)
        setOrder(mapped)
        setLiveStatus(mapped.status)
        setPageState('found')

        // Clear cart once (idempotent store op)
        clearCart()

        // Loyalty retrieval (non-blocking)
        void fetchLoyaltyWithRetry(mapped.id)

        stopPoll()
      } catch {
        if (cancelled) return
        if (attempts >= POLL_MAX_ATTEMPTS) {
          setPageState('error')
          stopPoll()
        } else schedulePoll()
      }
    }

    void run()

    return () => {
      cancelled = true
      stopPoll()
      stopTimer(loyaltyTimerRef)
    }
  }, [sessionId, isValidSessionId, clearCart, fetchLoyaltyWithRetry, stopTimer])

  // Real-time order status subscription (best-effort)
  useEffect(() => {
    if (!order?.id) return

    const channel = supabase
      .channel(`order-success-${order.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` },
        (payload) => {
          const rec = isRecord(payload) && isRecord(payload.new) ? payload.new : null
          const next = rec?.status
          if (typeof next === 'string') setLiveStatus(next as OrderStatus)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [order?.id])

  const serviceType = useMemo(() => {
    if (order) return safeServiceTypeFromOrder(order)
    return null
  }, [order])

  const loyaltyStatusText = useMemo(() => {
    if (loyalty) return null
    if (pageState !== 'found') return null
    if (loyaltyAttempt <= 0) return 'Updating your points… (this can take a few seconds)'
    if (loyaltyAttempt < LOYALTY_MAX_ATTEMPTS) return '✨ Updating your points…'
    return '✨ Your points are still updating — check your account in a moment.'
  }, [loyalty, loyaltyAttempt, pageState])

  return (
    <div className="min-h-svh bg-neutral-950 text-neutral-200 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-2xl border border-white/8 bg-neutral-950 shadow-2xl shadow-black/60">
          <div className="h-0.5 w-full bg-linear-to-r from-transparent via-amber-500/60 to-transparent" />
          <div className="p-6 sm:p-8">
            {pageState === 'loading' && <LoadingState attempt={attempt} />}
            {pageState === 'timeout' && <TimeoutState />}
            {pageState === 'error' && <ErrorState />}

            {pageState === 'found' && order && liveStatus && (
              <div className="space-y-5">
                {/* Header */}
                <div className="text-center">
                  <div className="mb-4 flex justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/30">
                      <span className="text-3xl">✓</span>
                    </div>
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-white">Order Confirmed</h1>

                  {order.order_number ? (
                    <p className="mt-1 font-mono text-sm text-neutral-400">#{String(order.order_number).padStart(4, '0')}</p>
                  ) : (
                    <p className="mt-1 font-mono text-sm text-neutral-500">{order.id.slice(0, 8).toUpperCase()}</p>
                  )}

                  <p className="mt-1 text-xs text-neutral-600">{formatDate(order.created_at)}</p>

                  {serviceType && (
                    <p className="mt-2 text-[11px] text-neutral-500">
                      Service:{' '}
                      <span className="text-amber-300 font-semibold">
                        {serviceType === 'dine_in' ? 'dine-in' : serviceType}
                      </span>
                    </p>
                  )}
                </div>

                {/* Totals */}
                <div className="rounded-xl border border-white/8 bg-white/3 p-4">
                  <div className="space-y-2 font-mono text-sm">
                    <div className="flex justify-between text-neutral-500">
                      <span>Subtotal</span>
                      <span>${cents(order.amount_subtotal)}</span>
                    </div>
                    {order.amount_tax > 0 && (
                      <div className="flex justify-between text-neutral-500">
                        <span>Tax</span>
                        <span>${cents(order.amount_tax)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-white/10 pt-2 font-bold text-white">
                      <span>Total Paid</span>
                      <span className="text-amber-400">${cents(order.amount_total)}</span>
                    </div>
                  </div>
                </div>

                {/* Loyalty */}
                {loyalty ? (
                  <div>
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
                      Loyalty Rewards
                    </p>
                    <LoyaltyResultCard loyalty={loyalty} account={loyaltyAccount} meta={loyaltyMeta} />
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    {loyaltyStatusText ?? '✨ Updating your points…'}
                  </div>
                )}

                {/* Primary CTAs */}
                <div className="space-y-2">
                  <Link
                    to="/account/orders"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/8 py-3 text-sm font-semibold text-white transition hover:bg-white/12 active:scale-95"
                  >
                    View Order History
                  </Link>

                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      to="/account"
                      className="flex items-center justify-center rounded-xl border border-white/8 py-2.5 text-xs font-medium text-neutral-400 transition hover:border-white/15 hover:text-neutral-200"
                    >
                      My Account
                    </Link>
                    <Link
                      to="/menu"
                      className="flex items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 py-2.5 text-xs font-semibold text-amber-400 transition hover:bg-amber-500/15"
                    >
                      Order Again
                    </Link>
                  </div>

                  <button
                    onClick={() => navigate('/menu')}
                    className="w-full text-[10px] text-neutral-600 underline underline-offset-2 hover:text-neutral-400"
                    type="button"
                  >
                    Continue browsing
                  </button>
                </div>

                {/* Sticky / restaurant-grade add-ons */}
                <StickyNextSteps order={order} loyalty={loyalty} account={loyaltyAccount} />

                {/* Footer micro (no email / no PII) */}
                <p className="text-center font-mono text-[10px] text-neutral-700">
                  Ref {order.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
            )}
          </div>
        </div>

        {pageState === 'found' && (
          <p className="mt-4 text-center text-xs text-neutral-700">A confirmation has been sent to your email.</p>
        )}
      </div>
    </div>
  )
}