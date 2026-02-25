// src/features/orders/ExpoCommandCenter.tsx
// ============================================================================
// EXPO COMMAND CENTER — 2026 PRODUCTION VERSION
// ============================================================================
// ✅ Type-safe mapper integration
// ✅ Real-time order updates
// ✅ Priority-based sorting
// ✅ Sound notifications
// ✅ Auto-refresh failsafe
// ✅ Event system integration
// ============================================================================

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase/supabaseClient'
import { mapOrderRowToDomain } from '@/domain/orders/order.mapper'
import type { Database } from '@/lib/supabase/database.types'
import {
  Order,
  OrderStatus,
  PaymentStatus,
  KitchenOrder,
} from '@/domain/orders/order.types'
import { Clock, Package, Bell, BellOff, RefreshCcw } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

type OrderRow = Database['public']['Tables']['orders']['Row']
type Priority = 'urgent' | 'high' | 'normal'

interface ExpoOrder extends KitchenOrder {
  minutes: number
  priority: Priority
}

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG = {
  AUTO_REFRESH_INTERVAL: 15000,
  URGENT_MINUTES: 15,
  HIGH_MINUTES: 8,
  SOUND_ENABLED_DEFAULT: true,
} as const

// ============================================================================
// COMPONENT
// ============================================================================

export default function ExpoCommandCenter() {
  const [orders, setOrders] = useState<ExpoOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(
    CONFIG.SOUND_ENABLED_DEFAULT
  )
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // ============================================================================
  // LOAD ORDERS
  // ============================================================================
  const loadOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('payment_status', PaymentStatus.PAID)
        .eq('status', OrderStatus.READY)
        .order('created_at', { ascending: true })

      if (error) throw error

      // 🔥 FIX: Map DB rows to domain objects first
      const enriched = (data ?? [])
        .map(mapOrderRowToDomain)
        .map(enrichOrder)
      
      setOrders(sortByPriority(enriched))
      setLastRefresh(new Date())
    } catch (err) {
      console.error('❌ Expo load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // ============================================================================
  // REALTIME SUBSCRIPTION
  // ============================================================================
  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const handleUpdate = (payload: { new: OrderRow }) => {
      const row = payload.new
      if (!row) return

      // Only show paid orders
      if (row.payment_status !== PaymentStatus.PAID) return

      // 🔥 FIX: Map DB row to domain object
      const order = mapOrderRowToDomain(row)

      setOrders((prev) => {
        // Remove completed orders
        if (order.status === OrderStatus.DELIVERED) {
          return prev.filter((p) => p.id !== order.id)
        }

        // Add/update READY orders
        if (order.status === OrderStatus.READY) {
          const exists = prev.some((p) => p.id === order.id)

          if (!exists) {
            // New order - play sound
            if (soundEnabled && audioRef.current) {
              audioRef.current.play().catch(() => {})
            }
            return sortByPriority([...prev, enrichOrder(order)])
          }

          // Update existing order
          return sortByPriority(
            prev.map((p) => (p.id === order.id ? enrichOrder(order) : p))
          )
        }

        return prev
      })
    }

    const channel = supabase
      .channel('expo-command-center')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        handleUpdate
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('🟢 Expo real-time connected')
        }
      })

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [soundEnabled])

  // ============================================================================
  // FAILSAFE AUTO-REFRESH
  // ============================================================================
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('🔄 Expo failsafe refresh')
      loadOrders()
    }, CONFIG.AUTO_REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [loadOrders])

  // ============================================================================
  // COMPLETE ORDER
  // ============================================================================
  const completeOrder = async (id: string) => {
  try {
    const { error } = await supabase
      .from('orders')
      .update({ 
        status: OrderStatus.DELIVERED, // 🔥 change here
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) throw error

    setOrders((prev) => prev.filter((o) => o.id !== id))

    console.log('✅ Order delivered:', id)
  } catch (err) {
    console.error('❌ Complete order failed:', err)
  }
}

  // ============================================================================
  // LOADING STATE
  // ============================================================================
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white">
        <div className="text-center">
          <Package className="mx-auto h-12 w-12 animate-pulse text-orange-500" />
          <p className="mt-4 text-lg">Loading Expo Command Center...</p>
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div className="min-h-screen bg-black text-white">
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      {/* HEADER */}
      <header className="border-b border-neutral-800 bg-neutral-900 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Package className="h-8 w-8 text-orange-500" />
            <div>
              <h1 className="text-2xl font-bold">Expo Command Center</h1>
              <p className="text-sm text-neutral-400">
                {orders.length} {orders.length === 1 ? 'order' : 'orders'} ready for
                pickup
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Last Refresh */}
            {lastRefresh && (
              <div className="text-xs text-neutral-500">
                <Clock className="inline h-3 w-3" /> Last refresh:{' '}
                {lastRefresh.toLocaleTimeString()}
              </div>
            )}

            {/* Manual Refresh */}
            <button
              onClick={loadOrders}
              className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold hover:bg-neutral-700 transition-colors"
              title="Refresh orders"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>

            {/* Sound Toggle */}
            <button
              onClick={() => setSoundEnabled((s) => !s)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                soundEnabled
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-neutral-700 hover:bg-neutral-600'
              }`}
              title={soundEnabled ? 'Sound enabled' : 'Sound disabled'}
            >
              {soundEnabled ? (
                <>
                  <Bell className="inline h-4 w-4" /> Sound On
                </>
              ) : (
                <>
                  <BellOff className="inline h-4 w-4" /> Sound Off
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="p-6">
        {/* EMPTY STATE */}
        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Package className="h-16 w-16 text-neutral-700" />
            <h2 className="mt-4 text-xl font-bold text-neutral-500">
              All clear!
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              No orders waiting for handoff
            </p>
          </div>
        )}

        {/* ORDER GRID */}
        {orders.length > 0 && (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                onComplete={completeOrder}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ============================================================================
// ORDER CARD COMPONENT
// ============================================================================
interface OrderCardProps {
  order: ExpoOrder
  onComplete: (id: string) => void
}

function OrderCard({ order, onComplete }: OrderCardProps) {
  const [isCompleting, setIsCompleting] = useState(false)

  const handleComplete = async () => {
    setIsCompleting(true)
    await onComplete(order.id)
    setIsCompleting(false)
  }

  // Priority styling
  const borderColor =
    order.priority === 'urgent'
      ? 'border-red-500 shadow-lg shadow-red-500/20 animate-pulse'
      : order.priority === 'high'
      ? 'border-yellow-500 shadow-lg shadow-yellow-500/20'
      : 'border-neutral-700'

  const timeColor =
    order.priority === 'urgent'
      ? 'text-red-400'
      : order.priority === 'high'
      ? 'text-yellow-400'
      : 'text-neutral-400'

  return (
    <div
      className={`rounded-lg border-2 ${borderColor} bg-neutral-900 p-5 transition-all hover:scale-105`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-xl font-bold">
            {order.customer_name || 'Guest Order'}
          </h3>
          {order.customer_phone && (
            <p className="mt-1 text-xs text-neutral-500">{order.customer_phone}</p>
          )}
        </div>

        <div className="text-right">
          <div className={`text-2xl font-bold ${timeColor}`}>
            {order.minutes}m
          </div>
          {order.priority === 'urgent' && (
            <div className="mt-1 text-xs font-semibold text-red-400">URGENT</div>
          )}
          {order.priority === 'high' && (
            <div className="mt-1 text-xs font-semibold text-yellow-400">
              HIGH PRIORITY
            </div>
          )}
        </div>
      </div>

      {/* Order Total */}
      <div className="mt-4 rounded-lg bg-neutral-950/50 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-400">Order Total</span>
          <span className="text-lg font-bold text-green-400">
            ${(order.amount_total / 100).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Items Preview */}
      {order.cart_items && order.cart_items.length > 0 && (
        <div className="mt-3 space-y-1">
          {order.cart_items.slice(0, 3).map((item, idx) => (
            <div key={idx} className="text-xs text-neutral-500">
              <span className="font-semibold text-orange-400">
                {item.quantity}×
              </span>{' '}
              {item.name}
            </div>
          ))}
          {order.cart_items.length > 3 && (
            <div className="text-xs text-neutral-600">
              +{order.cart_items.length - 3} more items
            </div>
          )}
        </div>
      )}

      {/* Complete Button */}
      <button
        onClick={handleComplete}
        disabled={isCompleting}
        className="mt-4 w-full rounded-lg bg-green-600 py-3 font-bold text-white hover:bg-green-500 disabled:bg-neutral-700 disabled:text-neutral-500 transition-colors"
      >
        {isCompleting ? 'Completing...' : '✓ Handed Out'}
      </button>
    </div>
  )
}

// ============================================================================
// ENRICH ORDER
// ============================================================================
function enrichOrder(order: Order): ExpoOrder {
  const minutes = Math.floor(
    (Date.now() - new Date(order.created_at).getTime()) / 60000
  )

  const priority: Priority =
    minutes >= CONFIG.URGENT_MINUTES
      ? 'urgent'
      : minutes >= CONFIG.HIGH_MINUTES
      ? 'high'
      : 'normal'

  return {
    id: order.id,
    assigned_to: order.assigned_to ?? null,
    created_at: order.created_at,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    amount_total: order.amount_total,
    status: order.status,
    cart_items: order.cart_items ?? [],
    minutes,
    priority,
  }
}

// ============================================================================
// SORT BY PRIORITY
// ============================================================================
function sortByPriority(list: ExpoOrder[]): ExpoOrder[] {
  const weight: Record<Priority, number> = { urgent: 0, high: 1, normal: 2 }
  return [...list].sort((a, b) => weight[a.priority] - weight[b.priority])
}