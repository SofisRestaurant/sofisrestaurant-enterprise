// src/pages/OrderSuccess.tsx
// ============================================================================
// ORDER SUCCESS — ENTERPRISE GRADE v2
// ============================================================================
//
// Tier config sourced entirely from @/domain/loyalty/tiers.
// Local TIER_LABEL object removed.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase/supabaseClient'
import { useCartStore } from '@/features/cart/cart.store'
import {
  OrderStatus,
  PaymentStatus,
  OrderType,
} from '@/domain/orders/order.types'
import type {
  Order,
  OrderCartItem,
  ShippingAddress,
} from '@/domain/orders/order.types'
import type { Database } from '@/lib/supabase/database.types'
import { LOYALTY_TIERS, asTier } from '@/domain/loyalty/tiers'

// ============================================================================
// TYPES
// ============================================================================

type PageState = 'loading' | 'found' | 'timeout' | 'error'
type DbOrder   = Database['public']['Tables']['orders']['Row']

interface LoyaltyResult {
  points_delta:      number
  points_balance:    number
  lifetime_balance:  number
  tier_at_time:      string
  streak_at_time:    number
  tier_multiplier:   number
  streak_multiplier: number
  base_points:       number
  metadata:          Record<string, unknown> | null
}

// ============================================================================
// CONFIG
// ============================================================================

const POLL_INTERVAL_MS  = 2000
const POLL_MAX_ATTEMPTS = 25

// ============================================================================
// STATUS DISPLAY
// ============================================================================

const STATUS_LABEL: Record<OrderStatus, string> = {
  [OrderStatus.CONFIRMED]: 'Order Confirmed',
  [OrderStatus.PREPARING]: 'Being Prepared',
  [OrderStatus.READY]:     'Ready for Pickup',
  [OrderStatus.DELIVERED]: 'Delivered',
  [OrderStatus.CANCELLED]: 'Cancelled',
  [OrderStatus.SHIPPED]:   'Shipped',
}

const STATUS_CONFIG: Record<
  OrderStatus,
  { bg: string; border: string; text: string; dot: string }
> = {
  [OrderStatus.CONFIRMED]: { bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   text: 'text-amber-400',   dot: 'bg-amber-400'   },
  [OrderStatus.PREPARING]: { bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30',  text: 'text-yellow-400',  dot: 'bg-yellow-400'  },
  [OrderStatus.READY]:     { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  [OrderStatus.DELIVERED]: { bg: 'bg-green-500/10',   border: 'border-green-500/30',   text: 'text-green-400',   dot: 'bg-green-400'   },
  [OrderStatus.CANCELLED]: { bg: 'bg-red-500/10',     border: 'border-red-500/30',     text: 'text-red-400',     dot: 'bg-red-400'     },
  [OrderStatus.SHIPPED]:   { bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     text: 'text-sky-400',     dot: 'bg-sky-400'     },
}

// ============================================================================
// HELPERS
// ============================================================================

function cents(n: number): string {
  return (n / 100).toFixed(2)
}

function fmt(n: number): string {
  return n.toLocaleString()
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// ============================================================================
// DB → DOMAIN MAPPER
// ============================================================================

function mapDbOrderToDomain(db: DbOrder): Order {
  const parsedCart: OrderCartItem[] =
    Array.isArray(db.cart_items) ? (db.cart_items as unknown as OrderCartItem[]) : []

  const shipping: ShippingAddress | null =
    db.shipping_address && typeof db.shipping_address === 'object'
      ? (db.shipping_address as unknown as ShippingAddress)
      : null

  return {
    id:                       db.id,
    stripe_session_id:        db.stripe_session_id,
    stripe_payment_intent_id: db.stripe_payment_intent_id,
    customer_uid:             db.customer_uid,
    customer_email:           db.customer_email,
    customer_name:            db.customer_name,
    customer_phone:           db.customer_phone,
    amount_subtotal:          db.amount_subtotal,
    amount_tax:               db.amount_tax,
    amount_shipping:          db.amount_shipping,
    amount_total:             db.amount_total,
    assigned_to:              db.assigned_to,
    currency:                 db.currency,
    order_type:               db.order_type as OrderType,
    payment_status:           db.payment_status as PaymentStatus,
    status:                   db.status as OrderStatus,
    cart_items:               parsedCart,
    estimated_ready_time:     null,
    order_number:             db.order_number,
    shipping_name:            db.shipping_name,
    shipping_phone:           db.shipping_phone,
    shipping_address:         shipping,
    shipping_city:            shipping?.city        ?? null,
    shipping_state:           shipping?.state       ?? null,
    shipping_zip:             shipping?.postal_code ?? null,
    shipping_country:         shipping?.country     ?? null,
    metadata:                 db.metadata as Record<string, unknown> | null,
    notes:                    db.notes,
    created_at:               db.created_at,
    updated_at:               db.updated_at,
  }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function LoadingState({ attempt }: { attempt: number }) {
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 animate-ping rounded-full bg-amber-500/20" />
        <div className="absolute inset-2 animate-pulse rounded-full bg-amber-500/10" />
        <span className="relative text-3xl">🧾</span>
      </div>
      <div>
        <p className="text-lg font-semibold text-white">
          {attempt > 5 ? 'Almost there…' : 'Confirming your order'}
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          {attempt > 5 ? 'Payment received — finalizing details.' : 'Verifying payment with Stripe.'}
        </p>
      </div>
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-500/60"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  )
}

function Divider({ dashed = false }: { dashed?: boolean }) {
  return (
    <div className={`my-4 h-px w-full ${
      dashed ? 'border-0 border-t border-dashed border-white/10' : 'bg-white/8'
    }`} />
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
      {children}
    </p>
  )
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${cfg.bg} ${cfg.border} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${cfg.dot}`} />
      {STATUS_LABEL[status]}
    </span>
  )
}

function OrderHeader({ order, liveStatus }: { order: Order; liveStatus: OrderStatus }) {
  return (
    <div className="text-center">
      <div className="mb-4 flex justify-center">
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/30">
            <span className="text-3xl">✓</span>
          </div>
          <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px]">
            🎉
          </div>
        </div>
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-white">Order Confirmed</h1>
      {order.order_number && (
        <p className="mt-1 font-mono text-sm text-neutral-400">
          #{String(order.order_number).padStart(4, '0')}
        </p>
      )}
      <p className="mt-1 text-xs text-neutral-600">{formatDate(order.created_at)}</p>
      <div className="mt-3 flex justify-center">
        <StatusBadge status={liveStatus} />
      </div>
    </div>
  )
}

function CartItemsList({ items }: { items: OrderCartItem[] }) {
  if (!items?.length) return null
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-400">
              ×{item.quantity}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-200">{item.name ?? 'Item'}</p>
              {item.notes && (
                <p className="mt-0.5 truncate text-xs text-neutral-600 italic">{item.notes}</p>
              )}
            </div>
          </div>
          {item.price != null && (
            <span className="shrink-0 font-mono text-sm text-neutral-400">
              ${cents(item.price * item.quantity * 100)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function ReceiptTotals({ order }: { order: Order }) {
  return (
    <div className="space-y-2 font-mono text-sm">
      <div className="flex justify-between text-neutral-500">
        <span>Subtotal</span><span>${cents(order.amount_subtotal)}</span>
      </div>
      {order.amount_tax > 0 && (
        <div className="flex justify-between text-neutral-500">
          <span>Tax</span><span>${cents(order.amount_tax)}</span>
        </div>
      )}
      {order.amount_shipping > 0 && (
        <div className="flex justify-between text-neutral-500">
          <span>Shipping</span><span>${cents(order.amount_shipping)}</span>
        </div>
      )}
      <div className="flex justify-between border-t border-white/10 pt-2 font-bold text-white">
        <span>Total Paid</span>
        <span className="text-amber-400">${cents(order.amount_total)}</span>
      </div>
    </div>
  )
}

// ── LoyaltyResultCard ─────────────────────────────────────────────────────────
// All tier display (icon, name, dark text color) comes from LOYALTY_TIERS[tier]
// via the asTier() helper that safely resolves the string from the DB.

function LoyaltyResultCard({ loyalty }: { loyalty: LoyaltyResult }) {
  const tier      = asTier(loyalty.tier_at_time)   // ← domain helper, safe cast
  const tierCfg   = LOYALTY_TIERS[tier]
  const hasTierUp  = loyalty.metadata?.tier_changed === true
  const tierBefore = asTier(loyalty.metadata?.tier_before as string | undefined)

  const hasStreakBonus = loyalty.streak_multiplier > 1
  const hasTierBonus   = loyalty.tier_multiplier > 1

  return (
    <div className="overflow-hidden rounded-xl border border-amber-500/20 bg-linear-to-br from-amber-950/40 via-neutral-900 to-neutral-900">
      <div className="flex items-center justify-between border-b border-amber-500/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">✨</span>
          <span className="text-sm font-semibold text-amber-300">Points Earned</span>
        </div>
        <span className="font-mono text-2xl font-bold text-amber-400">
          +{fmt(loyalty.points_delta)}
        </span>
      </div>

      <div className="space-y-3 px-4 py-4 font-mono text-xs">

  {/* Base Points */}
  <div className="flex items-center justify-between rounded-lg bg-white/3 px-3 py-2">
    <span className="text-neutral-400">
      Base Points
    </span>
    <span className="font-semibold text-neutral-200">
      {loyalty.base_points.toLocaleString()} pts
    </span>
  </div>

  {/* Tier Bonus */}
  {hasTierBonus && (
    <div className="flex items-center justify-between rounded-lg bg-white/3 px-3 py-2">
      <span className={`flex items-center gap-1 ${tierCfg.dark.text}`}>
        {tierCfg.icon}
        {tierCfg.label} Bonus
      </span>
      <span className="font-semibold text-neutral-200">
        {loyalty.tier_multiplier}× Multiplier
      </span>
    </div>
  )}
        {hasStreakBonus && (
          <div className="flex justify-between">
            <span className="text-orange-400">
              🔥 {loyalty.streak_at_time}-day streak
            </span>
            <span className="text-neutral-400">{loyalty.streak_multiplier}×</span>
          </div>
        )}
        <div className="flex justify-between border-t border-white/5 pt-2 text-neutral-400">
          <span>New balance</span>
          <span className="font-bold text-neutral-200">{fmt(loyalty.points_balance)} pts</span>
        </div>
      </div>

      {hasTierUp && (
        <div className="border-t border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <p className="text-center text-xs font-semibold text-amber-300">
            🎊 Tier Upgrade! {LOYALTY_TIERS[tierBefore].label} →{' '}
            <span className={tierCfg.dark.text}>{tierCfg.icon} {tierCfg.label}</span>
          </p>
          <p className="mt-0.5 text-center text-[10px] text-amber-500/70">
            You now earn {tierCfg.multiplier}× points on every order
          </p>
        </div>
      )}
    </div>
  )
}

function CampaignBanner({ metadata }: { metadata: Record<string, unknown> | null }) {
  if (!metadata?.double_points) return null
  return (
    <div className="flex items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3">
      <span className="text-xl">🔥</span>
      <div>
        <p className="text-sm font-semibold text-orange-300">Double Points Applied!</p>
        <p className="text-xs text-orange-500/70">
          Today's promotion doubled your point earnings automatically.
        </p>
      </div>
    </div>
  )
}

function StreakNudge({ streak }: { streak: number }) {
  const next =
    streak < 3  ? { days: 3,  bonus: '+10%', left: 3 - streak  } :
    streak < 7  ? { days: 7,  bonus: '+25%', left: 7 - streak  } :
    streak < 30 ? { days: 30, bonus: '+50%', left: 30 - streak } :
    null

  if (!next) return null

  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/3 px-3 py-2.5">
      <span className="text-base">⚡</span>
      <p className="text-xs text-neutral-400">
        <span className="font-semibold text-neutral-300">
          {next.left} more day{next.left !== 1 ? 's' : ''}
        </span>{' '}
        for your {next.days}-day streak bonus —{' '}
        <span className="font-semibold text-amber-400">{next.bonus}</span> more points
      </p>
    </div>
  )
}

function CTASection() {
  return (
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
          className="flex items-center justify-center gap-1.5 rounded-xl border border-white/8 py-2.5 text-xs font-medium text-neutral-400 transition hover:border-white/15 hover:text-neutral-200"
        >
          My Account
        </Link>
        <Link
          to="/menu"
          className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 py-2.5 text-xs font-semibold text-amber-400 transition hover:bg-amber-500/15"
        >
          Order Again
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
        <Link
          to="/menu"
          className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-400"
        >
          Return to menu
        </Link>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function OrderSuccess() {
  const [searchParams] = useSearchParams()
  const navigate       = useNavigate()
  const finalizeOrder  = useCartStore((s) => s.finalizeOrder)
  const sessionId      = searchParams.get('session_id')

  const [pageState,     setPageState]     = useState<PageState>('loading')
  const [order,         setOrder]         = useState<Order | null>(null)
  const [liveStatus,    setLiveStatus]    = useState<OrderStatus | null>(null)
  const [attempt,       setAttempt]       = useState(0)
  const [loyalty,       setLoyalty]       = useState<LoyaltyResult | null>(null)
  const [loyaltyStreak, setLoyaltyStreak] = useState<number>(0)

  const cartFinalized = useRef(false)
  const pollTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!sessionId) navigate('/', { replace: true })
  }, [sessionId, navigate])

  useEffect(() => {
    if (!sessionId) return
    const safeId = sessionId
    let cancelled = false
    let attempts  = 0

    async function tryFetch() {
      if (cancelled) return
      attempts++
      setAttempt(attempts)

      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('stripe_session_id', safeId)
          .maybeSingle()

        if (cancelled) return
        if (error) { setPageState('error'); return }

        if (data && data.payment_status === PaymentStatus.PAID) {
          const normalized = mapDbOrderToDomain(data as DbOrder)
          setOrder(normalized)
          setLiveStatus(normalized.status)
          setPageState('found')

          if (!cartFinalized.current) {
            cartFinalized.current = true
            finalizeOrder()
          }

          if (normalized.customer_uid) {
            const [txRes, profileRes] = await Promise.all([
              supabase
                .from('loyalty_transactions')
                .select('*')
                .eq('order_id', normalized.id)
                .eq('transaction_type', 'earned')
                .maybeSingle(),
              supabase
                .from('profiles')
                .select('loyalty_streak')
                .eq('id', normalized.customer_uid)
                .single(),
            ])

            if (!cancelled) {
              if (txRes.data) setLoyalty(txRes.data as LoyaltyResult)
              if (profileRes.data) setLoyaltyStreak(profileRes.data.loyalty_streak ?? 0)
            }
          }

          return
        }

        if (attempts < POLL_MAX_ATTEMPTS) {
          pollTimer.current = setTimeout(tryFetch, POLL_INTERVAL_MS)
        } else {
          setPageState('timeout')
        }
      } catch {
        if (!cancelled) setPageState('error')
      }
    }

    tryFetch()

    return () => {
      cancelled = true
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
  }, [sessionId, finalizeOrder])

  useEffect(() => {
    if (!order?.id) return

    const channel = supabase
      .channel(`order-success-${order.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` },
        (payload) => {
          if (payload.new?.status) setLiveStatus(payload.new.status as OrderStatus)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [order?.id])

  const isDoublePoints = !!(order?.metadata?.double_points)
  const hasCartItems   = Array.isArray(order?.cart_items) && (order?.cart_items?.length ?? 0) > 0

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap');

        .success-page {
          font-family: 'Lora', Georgia, serif;
          background: #0a0a0a;
          background-image:
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(245,158,11,0.06) 0%, transparent 60%),
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
          min-height: 100svh;
        }

        .receipt-card {
          font-family: 'Lora', Georgia, serif;
          animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .mono { font-family: 'JetBrains Mono', 'Courier New', monospace; }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0);    }
        }

        .section-reveal { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .delay-1 { animation-delay: 0.08s; }
        .delay-2 { animation-delay: 0.16s; }
        .delay-3 { animation-delay: 0.24s; }
        .delay-4 { animation-delay: 0.32s; }
        .delay-5 { animation-delay: 0.40s; }
        .delay-6 { animation-delay: 0.48s; }
      `}</style>

      <div className="success-page flex min-h-svh items-start justify-center px-4 py-10 sm:items-center">
        <div className="receipt-card w-full max-w-md">

          <div className="overflow-hidden rounded-2xl border border-white/8 bg-neutral-950 shadow-2xl shadow-black/60">
            <div className="h-0.5 w-full bg-linear-to-r from-transparent via-amber-500/60 to-transparent" />

            <div className="p-6 sm:p-8">
              {pageState === 'loading' && <LoadingState attempt={attempt} />}
              {pageState === 'timeout' && <TimeoutState />}
              {pageState === 'error'   && <ErrorState />}

              {pageState === 'found' && order && liveStatus && (
                <div className="space-y-5">

                  <div className="section-reveal">
                    <OrderHeader order={order} liveStatus={liveStatus} />
                  </div>

                  {isDoublePoints && (
                    <div className="section-reveal delay-1">
                      <CampaignBanner metadata={order.metadata} />
                    </div>
                  )}

                  <Divider dashed />

                  {hasCartItems && (
                    <div className="section-reveal delay-1">
                      <SectionLabel>Your Order</SectionLabel>
                      <CartItemsList items={order.cart_items ?? []} />
                    </div>
                  )}

                  <div className="section-reveal delay-2">
                    <SectionLabel>Receipt</SectionLabel>
                    <ReceiptTotals order={order} />
                  </div>

                  <Divider dashed />

                  {loyalty && loyalty.points_delta > 0 && (
                    <div className="section-reveal delay-3">
                      <SectionLabel>Loyalty Rewards</SectionLabel>
                      <LoyaltyResultCard loyalty={loyalty} />
                      {loyaltyStreak > 0 && (
                        <div className="mt-2">
                          <StreakNudge streak={loyaltyStreak} />
                        </div>
                      )}
                    </div>
                  )}

                  {order.order_type === 'food' && (
                    <>
                      <Divider dashed />
                      <div className="section-reveal delay-4">
                        <SectionLabel>Pickup Details</SectionLabel>
                        <div className="text-sm text-neutral-400">
                          {order.customer_name && (
                            <p className="font-medium text-neutral-300">{order.customer_name}</p>
                          )}
                          <p>Please pick up at Sofi's Restaurant</p>
                        </div>
                      </div>
                    </>
                  )}

                  <Divider />

                  <div className="section-reveal delay-5">
                    <CTASection />
                  </div>

                  <div className="section-reveal delay-6 text-center">
                    <p className="mono text-[10px] text-neutral-700">
                      {order.id.slice(0, 8).toUpperCase()} · {order.customer_email ?? ''}
                    </p>
                  </div>

                </div>
              )}
            </div>
          </div>

          {pageState === 'found' && (
            <p className="mt-4 text-center text-xs text-neutral-700">
              A confirmation has been sent to your email.
            </p>
          )}

        </div>
      </div>
    </>
  )
}