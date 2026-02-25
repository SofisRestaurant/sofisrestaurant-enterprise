// src/pages/OrderStatus.tsx
// ============================================================================
// ORDER STATUS TRACKING — CUSTOMER-FACING (PRODUCTION TAILWIND)
// ============================================================================

import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Package,
  Clock,
  CheckCircle2,
  ChefHat,
  AlertCircle,
  Loader2,
} from 'lucide-react'

import { supabase } from '@/lib/supabase/supabaseClient'
import { useAuth } from '@/features/auth/useAuth'
import { OrderStatus as OrderStatusEnum, PaymentStatus } from '@/domain/orders/order.types'
import type { Order, OrderCartItem } from '@/domain/orders/order.types'

// ============================================================================
// TYPES
// ============================================================================

type LoadState = 'loading' | 'found' | 'not-found' | 'unauthorized' | 'error'

interface StatusStep {
  key: OrderStatusEnum
  label: string
  icon: React.ReactNode
  color: string
  bgColor: string
  borderColor: string
}

// ============================================================================
// CONFIG
// ============================================================================

const STATUS_STEPS: StatusStep[] = [
  {
    key: OrderStatusEnum.CONFIRMED,
    label: 'Confirmed',
    icon: <CheckCircle2 className="h-5 w-5" />,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
  {
    key: OrderStatusEnum.PREPARING,
    label: 'Preparing',
    icon: <ChefHat className="h-5 w-5" />,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
  },
  {
    key: OrderStatusEnum.READY,
    label: 'Ready',
    icon: <Package className="h-5 w-5" />,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  {
   key: OrderStatusEnum.DELIVERED,
    label: 'Completed',
    icon: <CheckCircle2 className="h-5 w-5" />,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
  },
]

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDate(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function OrderStatusPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [order, setOrder] = useState<Order | null>(null)

  // ========================================
  // LOAD ORDER
  // ========================================
  const loadOrder = useCallback(async () => {
    if (!orderId) {
      setLoadState('not-found')
      return
    }

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('payment_status', 'paid')
        .maybeSingle()

      if (error) {
        console.error('Order fetch error:', error)
        setLoadState('error')
        return
      }

      if (!data) {
        setLoadState('not-found')
        return
      }

      const orderData = data as unknown as Order

      // Authorization check
      if (user && orderData.customer_uid !== user.id) {
        setLoadState('unauthorized')
        return
      }

      setOrder(orderData)
      setLoadState('found')
    } catch (err) {
      console.error('Failed to load order:', err)
      setLoadState('error')
    }
  }, [orderId, user])

 useEffect(() => {
  let mounted = true

  const run = async () => {
    if (!mounted) return
    await loadOrder()
  }

  run()

  return () => {
    mounted = false
  }
}, [loadOrder])
  // ========================================
  // REALTIME
  // ========================================
  useEffect(() => {
    if (!order?.id) return

    const channel = supabase
      .channel(`order-status-${order.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${order.id}`,
        },
        (payload: { new: Partial<Order> }) => {
          setOrder((prev) => {
            if (!prev) return prev
            return { ...prev, ...payload.new } as Order
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [order?.id])

  // ========================================
  // HELPERS
  // ========================================
  const getCurrentStepIndex = useCallback(() => {
    if (!order) return 0
    const index = STATUS_STEPS.findIndex((step) => step.key === order.status)
    return index === -1 ? 0 : index
  }, [order])

  const isStepComplete = useCallback(
    (stepIndex: number) => {
      return stepIndex <= getCurrentStepIndex()
    },
    [getCurrentStepIndex]
  )

  const currentStep = order ? STATUS_STEPS[getCurrentStepIndex()] : STATUS_STEPS[0]

  const estimatedReadyTime = order?.estimated_ready_time
    ? formatTime(order.estimated_ready_time)
    : null

  // ========================================
  // LOADING STATE
  // ========================================
  if (loadState === 'loading') {
    return (
      <div className="min-h-screen bg-neutral-50 px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-neutral-200 bg-white p-12 shadow-sm">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-orange-600" />
              <p className="text-sm text-neutral-600">Loading order...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ========================================
  // ERROR STATES
  // ========================================
  if (loadState === 'not-found') {
    return (
      <ErrorState
        icon={<AlertCircle className="h-12 w-12 text-red-500" />}
        title="Order not found"
        message="We couldn't find an order with this ID. Please check the link or visit your order history."
        actionLabel="View Order History"
        actionPath="/account/orders"
      />
    )
  }

  if (loadState === 'unauthorized') {
    return (
      <ErrorState
        icon={<AlertCircle className="h-12 w-12 text-red-500" />}
        title="Access denied"
        message="You don't have permission to view this order."
        actionLabel="View Your Orders"
        actionPath="/account/orders"
      />
    )
  }

  if (loadState === 'error') {
    return (
      <ErrorState
        icon={<AlertCircle className="h-12 w-12 text-red-500" />}
        title="Something went wrong"
        message="We couldn't load your order. Please try again."
        actionLabel="Retry"
        onClick={loadOrder}
      />
    )
  }

  // ========================================
  // ORDER FOUND
  // ========================================
  if (!order) return null

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {/* Header */}
          <div className="border-b border-neutral-100 p-6 sm:p-8">
            <button
              onClick={() => navigate(-1)}
              className="mb-4 inline-flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-neutral-900">Order Status</h1>
                <p className="mt-1 text-sm text-neutral-600">
                  Placed {formatDate(order.created_at)}
                </p>
              </div>

              {estimatedReadyTime && order.status !== OrderStatusEnum.DELIVERED && (
                <div className="flex items-center gap-2 rounded-lg bg-yellow-50 px-3 py-2 text-sm font-medium text-yellow-800">
                  <Clock className="h-4 w-4" />
                  Ready by {estimatedReadyTime}
                </div>
              )}
            </div>

            {/* Current status badge */}
            <div
              className={`mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${currentStep.color} ${currentStep.bgColor} ${currentStep.borderColor}`}
            >
              {currentStep.icon}
              {currentStep.label}
            </div>
          </div>

          {/* Progress tracker */}
          <div className="border-b border-neutral-100 p-6 sm:p-8">
            <div className="relative flex items-start justify-between">
              {STATUS_STEPS.map((step, index) => {
                const complete = isStepComplete(index)
                const active = getCurrentStepIndex() === index
                const isLast = index === STATUS_STEPS.length - 1

                return (
                  <div key={step.key} className="relative flex flex-1 flex-col items-center">
                    {/* Dot */}
                    <div
                      className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                        complete
                          ? `${step.borderColor} ${step.bgColor}`
                          : 'border-neutral-300 bg-white'
                      } ${active ? 'ring-4 ring-orange-100' : ''}`}
                    >
                      {complete ? (
                        <CheckCircle2 className={`h-5 w-5 ${step.color}`} />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-neutral-300" />
                      )}
                    </div>

                    {/* Label */}
                    <p
                      className={`mt-2 text-center text-xs font-medium ${
                        complete || active ? 'text-neutral-900' : 'text-neutral-500'
                      }`}
                    >
                      {step.label}
                    </p>

                    {/* Connector line */}
                    {!isLast && (
                      <div
                        className={`absolute left-1/2 top-5 h-0.5 w-full ${
                          isStepComplete(index + 1) ? 'bg-green-500' : 'bg-neutral-200'
                        }`}
                        style={{ transform: 'translateY(-50%)' }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Order details */}
          <div className="border-b border-neutral-100 p-6 sm:p-8">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Order Details
            </h3>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-neutral-500">Order ID</p>
                <p className="mt-1 font-mono text-sm font-semibold text-neutral-900">
                  {order.id.slice(0, 8)}
                </p>
              </div>

              <div>
                <p className="text-xs text-neutral-500">Total</p>
                <p className="mt-1 text-sm font-semibold text-neutral-900">
                  ${formatCents(order.amount_total)}
                </p>
              </div>

              {order.customer_name && (
                <div>
                  <p className="text-xs text-neutral-500">Name</p>
                  <p className="mt-1 text-sm font-semibold text-neutral-900">
                    {order.customer_name}
                  </p>
                </div>
              )}

              {order.payment_status && (
                <div>
                  <p className="text-xs text-neutral-500">Payment</p>
                  <span
                    className={`mt-1 inline-block rounded-md px-2 py-1 text-xs font-semibold uppercase ${
                      order.payment_status === PaymentStatus.PAID
                        ? 'bg-green-100 text-green-800'
                        : 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    {order.payment_status}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Items */}
          {order.cart_items && order.cart_items.length > 0 && (
            <div className="border-b border-neutral-100 p-6 sm:p-8">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Items
              </h3>

              <ul className="space-y-3">
                {order.cart_items.map((item: OrderCartItem, i: number) => (
                  <li key={item.id ?? i} className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <span className="font-semibold text-orange-600">{item.quantity}×</span>
                      <div>
                        <p className="font-medium text-neutral-900">{item.name}</p>
                        {item.notes && (
                          <p className="mt-1 text-sm text-neutral-600">{item.notes}</p>
                        )}
                      </div>
                    </div>
                    {item.price != null && (
                      <span className="whitespace-nowrap text-sm text-neutral-700">
                        ${formatCents(item.price * item.quantity)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {/* Totals */}
              <div className="mt-6 space-y-2 rounded-xl bg-neutral-50 p-4">
                {order.amount_subtotal > 0 && (
                  <div className="flex justify-between text-sm text-neutral-700">
                    <span>Subtotal</span>
                    <span>${formatCents(order.amount_subtotal)}</span>
                  </div>
                )}
                {order.amount_tax > 0 && (
                  <div className="flex justify-between text-sm text-neutral-700">
                    <span>Tax</span>
                    <span>${formatCents(order.amount_tax)}</span>
                  </div>
                )}
                {order.amount_shipping > 0 && (
                  <div className="flex justify-between text-sm text-neutral-700">
                    <span>Delivery</span>
                    <span>${formatCents(order.amount_shipping)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold text-neutral-900">
                  <span>Total</span>
                  <span>${formatCents(order.amount_total)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="p-6 sm:p-8">
            <div className="space-y-3">
              <Link
                to="/menu"
                className="block w-full rounded-lg bg-orange-600 px-4 py-3 text-center font-semibold text-white transition-colors hover:bg-orange-700"
              >
                Order Again
              </Link>
              {user && (
                <Link
                  to="/account/orders"
                  className="block w-full rounded-lg bg-neutral-100 px-4 py-3 text-center font-semibold text-neutral-700 transition-colors hover:bg-neutral-200"
                >
                  View All Orders
                </Link>
              )}
            </div>

            {/* Live indicator */}
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-neutral-500">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
              </span>
              Updates automatically
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ERROR STATE COMPONENT
// ============================================================================

function ErrorState({
  icon,
  title,
  message,
  actionLabel,
  actionPath,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  message: string
  actionLabel: string
  actionPath?: string
  onClick?: () => void
}) {
  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-12">
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-neutral-200 bg-white p-12 text-center shadow-sm">
          <div className="mb-4 flex justify-center">{icon}</div>
          <h2 className="mb-2 text-xl font-bold text-neutral-900">{title}</h2>
          <p className="mb-6 text-sm text-neutral-600">{message}</p>
          {actionPath ? (
            <Link
              to={actionPath}
              className="inline-block rounded-lg bg-orange-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-orange-700"
            >
              {actionLabel}
            </Link>
          ) : (
            <button
              onClick={onClick}
              className="inline-block rounded-lg bg-orange-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-orange-700"
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}