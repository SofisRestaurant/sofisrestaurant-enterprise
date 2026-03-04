// src/pages/OrderCanceled.tsx
// =============================================================================
// ORDER CANCELED — Production (2026) — Recovery-first + Safe + Deterministic
// =============================================================================
// Reality check (Stripe Checkout):
// - Card declines typically happen INSIDE Stripe Checkout (user stays on Stripe page).
// - Users land here mainly when they:
//   - click "Cancel" / go back
//   - the session expires
//   - they close the tab and return later
//
// What this page does:
// - Reads session_id safely (no logging tokens)
// - Calls Edge Function `get-checkout-session` to understand status
// - Shows the right message + best next action
// - Provides support-friendly copy (session prefix only)
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, Clock, RefreshCw, ShieldCheck, XCircle, Copy, Mail, ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { invokeEdge } from '@/lib/supabase/invoke'

type StripeSessionStatus = 'open' | 'complete' | 'expired' | null
type StripePaymentStatus = 'paid' | 'unpaid' | 'no_payment_required' | null

type GetCheckoutSessionResp = {
  id: string
  status: StripeSessionStatus
  payment_status: StripePaymentStatus
  amount_total: number | null
  currency: string | null
  customer_email: string | null
  created: number | null
  expires_at: number | null
}

type ViewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; session: GetCheckoutSessionResp | null }
  | { kind: 'error'; message: string }

const STRIPE_SESSION_RE = /^cs_(test|live)_[a-zA-Z0-9]+$/

function prefix(id: string | null | undefined, n = 8): string | null {
  if (!id) return null
  return id.slice(0, n)
}

function safeSessionId(raw: string | null): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  if (s.length > 200) return null
  if (!STRIPE_SESSION_RE.test(s)) return null
  return s
}

function formatMoney(cents: number | null, currency: string | null): string {
  if (cents == null || !Number.isFinite(cents)) return ''
  const cur = (currency ?? 'usd').toUpperCase()
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: cur,
  }).format(cents / 100)
}

function formatWhen(unixSeconds: number | null): string {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) return ''
  return new Date(unixSeconds * 1000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function OrderCanceled() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const rawSessionId = useMemo(() => searchParams.get('session_id'), [searchParams])
  const sessionId = useMemo(() => safeSessionId(rawSessionId), [rawSessionId])

  const [view, setView] = useState<ViewState>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)

  // Avoid state updates after unmount
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const loadSession = useCallback(async () => {
    if (!sessionId) {
      setView({ kind: 'ready', session: null })
      return
    }

    setView({ kind: 'loading' })
    try {
      // Your edge function already enforces ownership + rate limiting.
      const data = await invokeEdge<GetCheckoutSessionResp>('get-checkout-session', { session_id: sessionId })
      if (!aliveRef.current) return
      setView({ kind: 'ready', session: data ?? null })
    } catch {
      if (!aliveRef.current) return
      setView({ kind: 'error', message: 'Unable to check the payment session. Please try again.' })
    }
  }, [sessionId])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  const retry = useCallback(() => {
    // Best recovery path: return to checkout (cart is still local)
    navigate('/checkout')
  }, [navigate])

  const goMenu = useCallback(() => navigate('/menu'), [navigate])

  const copySupportId = useCallback(async () => {
    const id = sessionId ? `checkout_session:${sessionId}` : 'checkout_session:missing'
    try {
      await navigator.clipboard.writeText(id)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // ignore
    }
  }, [sessionId])

  const derived = useMemo(() => {
    if (view.kind !== 'ready') return null

    const s = view.session
    if (!sessionId) {
      return {
        title: 'Checkout canceled',
        subtitle: 'We couldn’t verify the payment session.',
        detail: 'Return to checkout to try again.',
        icon: 'warn' as const,
        badge: null as string | null,
      }
    }

    if (!s) {
      return {
        title: 'Checkout canceled',
        subtitle: 'We couldn’t load your Stripe session details.',
        detail: 'Return to checkout to try again.',
        icon: 'warn' as const,
        badge: `Session ${prefix(sessionId)?.toUpperCase() ?? ''}`,
      }
    }

    // Paid + complete usually means user should be on success page,
    // but sometimes the client navigates weirdly or finalize is still running.
    const isPaid = s.payment_status === 'paid'
    const isExpired = s.status === 'expired'
    const isOpen = s.status === 'open'
    const isComplete = s.status === 'complete'

    if (isPaid && isComplete) {
      return {
        title: 'Payment received',
        subtitle: 'Your payment went through — we’re finalizing your order.',
        detail: 'If you don’t see it in Order History within a minute, refresh or contact support.',
        icon: 'ok' as const,
        badge: `Paid ${formatMoney(s.amount_total, s.currency)}`,
      }
    }

    if (isExpired) {
      return {
        title: 'Checkout expired',
        subtitle: 'Your payment session expired before completion.',
        detail: 'No charge was made. Please try again.',
        icon: 'time' as const,
        badge: s.expires_at ? `Expired ${formatWhen(s.expires_at)}` : 'Expired',
      }
    }

    if (isOpen && !isPaid) {
      return {
        title: 'Checkout canceled',
        subtitle: 'Your payment wasn’t completed.',
        detail: 'You can try again — your cart is still here.',
        icon: 'cancel' as const,
        badge: s.amount_total ? `Attempted ${formatMoney(s.amount_total, s.currency)}` : null,
      }
    }

    // Fallback
    return {
      title: 'Checkout canceled',
      subtitle: 'Your payment wasn’t completed.',
      detail: 'You can return to checkout to try again.',
      icon: 'cancel' as const,
      badge: s.amount_total ? `Attempted ${formatMoney(s.amount_total, s.currency)}` : null,
    }
  }, [view, sessionId])

  const Icon = useMemo(() => {
    const k = derived?.icon
    if (k === 'ok') return ShieldCheck
    if (k === 'time') return Clock
    if (k === 'warn') return AlertCircle
    return XCircle
  }, [derived?.icon])

  const iconColor = useMemo(() => {
    const k = derived?.icon
    if (k === 'ok') return 'text-emerald-600'
    if (k === 'time') return 'text-amber-600'
    if (k === 'warn') return 'text-amber-600'
    return 'text-red-600'
  }, [derived?.icon])

  return (
    <main
      className="min-h-screen bg-neutral-50 flex items-center justify-center px-4 py-16"
      role="main"
      aria-labelledby="order-canceled-title"
    >
      <section className="w-full max-w-xl rounded-2xl bg-white shadow-lg border border-neutral-200 p-10 text-center">
        {/* Header */}
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 ring-1 ring-neutral-200">
            <Icon className={`h-9 w-9 ${iconColor}`} aria-hidden="true" />
          </div>
        </div>

        <h1 id="order-canceled-title" className="text-3xl font-bold text-neutral-900 mb-3">
          {view.kind === 'loading' ? 'Checking your payment…' : derived?.title ?? 'Checkout canceled'}
        </h1>

        {view.kind === 'error' ? (
          <p className="text-neutral-600 mb-6">{view.message}</p>
        ) : view.kind === 'loading' ? (
          <p className="text-neutral-600 mb-6">Hang tight — verifying the Stripe session.</p>
        ) : (
          <>
            <p className="text-neutral-700 font-semibold">{derived?.subtitle}</p>
            <p className="text-neutral-600 mt-2 mb-6">{derived?.detail}</p>
          </>
        )}

        {/* Session badge */}
        {sessionId ? (
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700 ring-1 ring-neutral-200">
            <span className="font-mono">cs_…{prefix(sessionId)?.toUpperCase()}</span>
            {derived?.badge ? <span className="text-neutral-500">• {derived.badge}</span> : null}
          </div>
        ) : null}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="secondary" onClick={retry}>
            <span className="inline-flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Return to Checkout
            </span>
          </Button>

          <Button variant="primary" onClick={goMenu}>
            <span className="inline-flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              Back to Menu
            </span>
          </Button>
        </div>

        {/* Secondary row */}
        <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => void copySupportId()}
            className="inline-flex items-center gap-2 text-neutral-600 hover:text-neutral-900"
          >
            <Copy className="h-4 w-4" />
            {copied ? 'Copied' : 'Copy support ID'}
          </button>

          <a
            href="mailto:sofisrestaurante@gmail.com"
            className="inline-flex items-center gap-2 text-neutral-600 hover:text-neutral-900"
          >
            <Mail className="h-4 w-4" />
            Email support
          </a>

          <Link to="/account/orders" className="text-neutral-600 hover:text-neutral-900">
            View order history
          </Link>
        </div>

        {/* Trust copy */}
        <p className="mt-6 text-xs text-neutral-500">
          🔒 Secure checkout by Stripe. If your card was declined, Stripe lets you update payment details on the checkout
          screen. If you canceled or the session expired, no charge was made.
        </p>

        {/* Debug-only safe retry */}
        {view.kind === 'ready' && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => void loadSession()}
              className="text-[11px] text-neutral-400 underline underline-offset-2 hover:text-neutral-600"
            >
              Re-check session status
            </button>
          </div>
        )}
      </section>
    </main>
  )
}