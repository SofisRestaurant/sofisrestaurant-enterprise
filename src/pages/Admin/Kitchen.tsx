// src/pages/Admin/Kitchen.tsx
// ============================================================================
// ADMIN KITCHEN — FULL MANAGEMENT VIEW (PRODUCTION 2026)
// ============================================================================

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase/supabaseClient'
import { mapOrderRowToDomain } from '@/domain/orders/order.mapper'
import { useOrdersRealtime } from '@/features/orders/useOrdersRealtime'
import { updateOrderStatus, assignOrderToStaff } from '@/features/orders/orders.api'
import {
  OrderStatus,
  PaymentStatus,
  type Order,
  type KitchenOrder,
  KITCHEN_STATUSES,
} from '@/domain/orders/order.types'
import type { Database } from '@/lib/supabase/database.types'
import {
  ChefHat,
  Bell,
  BellOff,
  RefreshCcw,
  Search,
  Users,
  Clock,
  TrendingUp,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

type OrderRow = Database['public']['Tables']['orders']['Row']
type PriorityLevel = 'urgent' | 'high' | 'normal'

interface KitchenCardOrder extends KitchenOrder {
  minutesWaiting: number
  priority: PriorityLevel
  estimatedRemaining: number
}

interface KitchenStats {
  total: number
  confirmed: number
  preparing: number
  ready: number
  avgWaitMinutes: number
}

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG = {
  AUTO_REFRESH_MS: 20_000,
  TIMER_TICK_MS: 60_000,
  URGENT_MINUTES: 20,
  HIGH_MINUTES: 12,
  ESTIMATED_PREP_MINUTES: 15,
  STAFF_OPTIONS: ['Juan', 'Maria', 'Carlos', 'Sofia', 'Diego'],
} as const

// ============================================================================
// HELPERS
// ============================================================================

function getMinutesWaiting(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000)
}

function getPriority(minutes: number): PriorityLevel {
  if (minutes >= CONFIG.URGENT_MINUTES) return 'urgent'
  if (minutes >= CONFIG.HIGH_MINUTES) return 'high'
  return 'normal'
}

function enrichOrder(order: Order): KitchenCardOrder {
  const minutesWaiting = getMinutesWaiting(order.created_at)

  return {
    id: order.id,
    created_at: order.created_at,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    amount_total: order.amount_total,
    status: order.status,
    cart_items: order.cart_items ?? [],
    assigned_to: order.assigned_to ?? null,
    minutesWaiting,
    priority: getPriority(minutesWaiting),
    estimatedRemaining: Math.max(CONFIG.ESTIMATED_PREP_MINUTES - minutesWaiting, 0),
  }
}

function calcStats(orders: KitchenCardOrder[]): KitchenStats {
  const confirmed = orders.filter(o => o.status === OrderStatus.CONFIRMED).length
  const preparing = orders.filter(o => o.status === OrderStatus.PREPARING).length
  const ready = orders.filter(o => o.status === OrderStatus.READY).length

  const avgWaitMinutes =
    orders.length > 0
      ? Math.round(orders.reduce((s, o) => s + o.minutesWaiting, 0) / orders.length)
      : 0

  return { total: orders.length, confirmed, preparing, ready, avgWaitMinutes }
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function Kitchen() {
  const [orders, setOrders] = useState<KitchenCardOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [search, setSearch] = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [stats, setStats] = useState<KitchenStats>({
    total: 0,
    confirmed: 0,
    preparing: 0,
    ready: 0,
    avgWaitMinutes: 0,
  })

  const audioRef = useRef<HTMLAudioElement | null>(null)

  // ============================================================================
  // LOAD ORDERS
  // ============================================================================

  const loadOrders = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('payment_status', PaymentStatus.PAID)
        .in('status', KITCHEN_STATUSES)
        .order('created_at', { ascending: true })

      if (error) throw error

      const enriched = (data ?? []).map(mapOrderRowToDomain).map(enrichOrder)

      setOrders(enriched)
      setStats(calcStats(enriched))
      setLastRefresh(new Date())
    } catch (err) {
      console.error('❌ Kitchen load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // ============================================================================
  // REALTIME — SINGLE SOURCE
  // ============================================================================

  const handleRealtime = (row: OrderRow) => {
    const order = mapOrderRowToDomain(row)
    if (order.payment_status !== PaymentStatus.PAID) return
    if (!KITCHEN_STATUSES.includes(order.status)) return

    setOrders(prev => {
      if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
        const next = prev.filter(o => o.id !== order.id)
        setStats(calcStats(next))
        return next
      }

      const exists = prev.some(o => o.id === order.id)

      if (!exists) {
        if (soundEnabled && audioRef.current) {
          audioRef.current.play().catch(() => {})
        }

        const next = [enrichOrder(order), ...prev]
        setStats(calcStats(next))
        return next
      }

      const next = prev.map(o => (o.id === order.id ? enrichOrder(order) : o))
      setStats(calcStats(next))
      return next
    })
  }

  useOrdersRealtime({
    channelName: 'admin-kitchen',
    onInsert: handleRealtime,
    onUpdate: handleRealtime,
  })

  // ============================================================================
  // AUTO REFRESH + TIMER TICK
  // ============================================================================

  useEffect(() => {
    const refresh = setInterval(loadOrders, CONFIG.AUTO_REFRESH_MS)

    const tick = setInterval(() => {
      setOrders(prev => {
        const next = prev.map(o => enrichOrder(o as unknown as Order))
        setStats(calcStats(next))
        return next
      })
    }, CONFIG.TIMER_TICK_MS)

    return () => {
      clearInterval(refresh)
      clearInterval(tick)
    }
  }, [loadOrders])

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const handleStatusChange = async (id: string, status: OrderStatus) => {
    await updateOrderStatus(id, status)
  }

  const handleAssign = async (id: string, staff: string) => {
    await assignOrderToStaff(id, staff)
  }

  // ============================================================================
  // FILTER
  // ============================================================================

  const filtered = orders.filter(o => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      o.customer_name?.toLowerCase().includes(q) ||
      o.customer_phone?.includes(q) ||
      o.assigned_to?.toLowerCase().includes(q)
    )
  })

  const group = (status: OrderStatus) =>
    [...filtered]
      .filter(o => o.status === status)
      .sort((a, b) => b.minutesWaiting - a.minutesWaiting)

  // ============================================================================
  // LOADING
  // ============================================================================

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <ChefHat className="h-10 w-10 animate-pulse text-orange-500" />
      </div>
    )
  }

  // ============================================================================
  // UI
  // ============================================================================

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      {/* HEADER */}
      <header className="border-b border-neutral-800 bg-neutral-900 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Title + subtitle */}
          <div className="flex items-center gap-3">
            <ChefHat className="h-8 w-8 text-orange-500" />
            <div>
              <h1 className="text-xl font-bold tracking-wide">Kitchen Management</h1>
              <p className="text-xs text-neutral-400">
                Admin · Real-time
                {lastRefresh && (
                  <span className="ml-2 text-neutral-600">
                    · Updated {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Stats (single clean row, no duplicates) */}
          <div className="flex flex-wrap items-center gap-5 text-sm">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-neutral-200" />
              <Stat label="Total" value={stats.total} />
            </div>

            <Stat label="New" value={stats.confirmed} />

            <Stat label="Cooking" value={stats.preparing} />

            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-green-400" />
              <Stat label="Ready" value={stats.ready} />
            </div>

            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-400" />
              <Stat label="Avg Wait" value={`${stats.avgWaitMinutes}m`} />
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="rounded bg-neutral-800 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <button onClick={loadOrders} className="rounded bg-neutral-800 p-2 hover:bg-neutral-700">
              <RefreshCcw className="h-4 w-4" />
            </button>

            <button
              onClick={() => setSoundEnabled(s => !s)}
              className="rounded bg-neutral-800 p-2 hover:bg-neutral-700"
            >
              {soundEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
        <KitchenColumn
          title="New Orders"
          orders={group(OrderStatus.CONFIRMED)}
          nextStatus={OrderStatus.PREPARING}
          onStatusChange={handleStatusChange}
          onAssign={handleAssign}
        />
        <KitchenColumn
          title="Preparing"
          orders={group(OrderStatus.PREPARING)}
          nextStatus={OrderStatus.READY}
          onStatusChange={handleStatusChange}
          onAssign={handleAssign}
        />
        <KitchenColumn
          title="Ready"
          orders={group(OrderStatus.READY)}
          nextStatus={OrderStatus.DELIVERED}
          onStatusChange={handleStatusChange}
          onAssign={handleAssign}
        />
      </main>
    </div>
  )
}

// ============================================================================
// STAT
// ============================================================================

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="leading-tight">
      <p className="text-neutral-400">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  )
}

// ============================================================================
// COLUMN
// ============================================================================

function KitchenColumn({
  title,
  orders,
  nextStatus,
  onStatusChange,
  onAssign,
}: {
  title: string
  orders: KitchenCardOrder[]
  nextStatus: OrderStatus
  onStatusChange: (id: string, status: OrderStatus) => void
  onAssign: (id: string, staff: string) => void
}) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>

      {orders.length === 0 && (
        <div className="rounded border border-neutral-800 p-6 text-neutral-500 text-center">
          No orders
        </div>
      )}

      {orders.map(order => (
        <div
          key={order.id}
          className="mb-4 rounded border border-neutral-800 bg-neutral-900 p-4"
        >
          <p className="font-bold">{order.customer_name || 'Guest'}</p>

          <select
            value={order.assigned_to ?? ''}
            onChange={e => onAssign(order.id, e.target.value)}
            className="mt-2 w-full rounded bg-neutral-800 px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="">— Assign staff —</option>
            <option value="Juan">👨‍🍳 Juan</option>
            <option value="Maria">👩‍🍳 Maria</option>
            <option value="Carlos">👨‍🍳 Carlos</option>
            <option value="Sofia">👩‍🍳 Sofia</option>
            <option value="Diego">👨‍🍳 Diego</option>
          </select>

          <button
            onClick={() => onStatusChange(order.id, nextStatus)}
            className="mt-3 w-full rounded bg-orange-600 py-2 font-bold hover:bg-orange-500 transition-colors"
          >
            Next
          </button>
        </div>
      ))}
    </div>
  )
}