// ============================================================================
// KITCHEN SCREEN — ENTERPRISE REALTIME + FAILSAFE VERSION
// ============================================================================

import { useEffect, useState, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"
import {
  Order,
  OrderStatus,
  PaymentStatus,
  KitchenOrder,
} from "@/domain/orders/order.types"
import { mapOrderRowToDomain } from "@/domain/orders/order.mapper"
import { useOrdersRealtime } from "@/features/orders/useOrdersRealtime"
import { updateOrderStatus } from "@/features/orders/orders.api"
import type { Database } from "@/lib/supabase/database.types"

// ============================================================================
// TYPES
// ============================================================================

type OrderRow = Database["public"]["Tables"]["orders"]["Row"]

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG = {
  AUTO_REFRESH_INTERVAL: 20_000,
  DEFAULT_SOUND_ENABLED: true,
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function KitchenScreen() {
  const [orders, setOrders] = useState<KitchenOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(
    CONFIG.DEFAULT_SOUND_ENABLED
  )

  const audioRef = useRef<HTMLAudioElement | null>(null)

  // ============================================================================
  // LOAD ORDERS
  // ============================================================================

 const loadOrders = useCallback(async () => {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("id,created_at,customer_name,customer_phone,amount_total,status,cart_items,assigned_to,payment_status")
      .eq("payment_status", PaymentStatus.PAID)
      .in("status", [
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.READY,
      ])
      .order("created_at", { ascending: false })

    if (error) throw error

    const kitchenOrders =
      (data ?? [])
        .map(row => mapOrderRowToDomain(row as unknown as OrderRow))
        .map(mapToKitchenOrder)

    setOrders(kitchenOrders)

  } catch (err) {
    console.error("❌ Load orders failed:", err)
  } finally {
    setLoading(false)
  }
}, [])
  // ============================================================================
  // REALTIME (CLEAN — SINGLE SOURCE)
  // ============================================================================

  const handleRealtime = (row: OrderRow) => {
    const order = mapOrderRowToDomain(row)

    if (order.payment_status !== PaymentStatus.PAID) return

    setOrders(prev => {
      if (
        order.status === OrderStatus.DELIVERED ||
        order.status === OrderStatus.CANCELLED
      ) {
        return prev.filter(o => o.id !== order.id)
      }

      const mapped = mapToKitchenOrder(order)
      const exists = prev.some(o => o.id === order.id)

      if (!exists) {
        if (soundEnabled && audioRef.current) {
          audioRef.current.play().catch(() => {})
        }
        return [mapped, ...prev]
      }

      return prev.map(o =>
        o.id === order.id ? mapped : o
      )
    })
  }

  useOrdersRealtime({
    channelName: "admin-kitchen",
    onInsert: handleRealtime,
    onUpdate: handleRealtime,
  })

  // ============================================================================
  // FAILSAFE REFRESH
  // ============================================================================

  useEffect(() => {
    const interval = setInterval(() => {
      loadOrders()
    }, CONFIG.AUTO_REFRESH_INTERVAL)

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadOrders()
      }
    }

    const onReconnect = () => {
      loadOrders()
    }

    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("online", onReconnect)

    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("online", onReconnect)
    }
  }, [loadOrders])

  // ============================================================================
  // UPDATE STATUS
  // ============================================================================

 const updateStatus = async (id: string, status: OrderStatus) => {
  try {
    const updated = await updateOrderStatus(id, status)

    setOrders(prev =>
      prev.map(o =>
        o.id === id ? { ...o, status: updated.status } : o
      )
    )

  } catch (err) {
    console.error("❌ Update failed:", err)
  }
}
  // ============================================================================
  // HELPERS
  // ============================================================================

  const group = (status: OrderStatus) =>
    orders.filter(o => o.status === status)

  const getTimeSince = (timestamp: string) => {
    const minutes = Math.floor(
      (Date.now() - new Date(timestamp).getTime()) / 60000
    )
    if (minutes < 1) return "Just now"
    if (minutes === 1) return "1 min ago"
    return `${minutes} mins ago`
  }

  // ============================================================================
  // LOADING
  // ============================================================================

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 text-white">
        Loading kitchen...
      </div>
    )
  }

  // ============================================================================
  // UI
  // ============================================================================

  return (
    <div className="min-h-screen bg-neutral-950 p-6 text-white">
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Kitchen</h1>
          <p className="text-sm text-neutral-400">
            {orders.length} active orders
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setSoundEnabled(s => !s)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              soundEnabled
                ? "bg-green-600 hover:bg-green-700"
                : "bg-neutral-800 hover:bg-neutral-700"
            }`}
          >
            {soundEnabled ? "🔔 Sound On" : "🔕 Sound Off"}
          </button>

          <button
            onClick={loadOrders}
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium hover:bg-neutral-700"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Column
          title="NEW"
          color="bg-red-600"
          orders={group(OrderStatus.CONFIRMED)}
          onAction={(id: string) =>
            updateStatus(id, OrderStatus.PREPARING)
          }
          actionLabel="Start"
          actionColor="bg-yellow-500 hover:bg-yellow-400 text-black"
          getTimeSince={getTimeSince}
        />

        <Column
          title="PREPARING"
          color="bg-yellow-500"
          orders={group(OrderStatus.PREPARING)}
          onAction={(id: string) =>
            updateStatus(id, OrderStatus.READY)
          }
          actionLabel="Ready"
          actionColor="bg-green-600 hover:bg-green-500"
          getTimeSince={getTimeSince}
        />

        <Column
          title="READY"
          color="bg-green-600"
          orders={group(OrderStatus.READY)}
          onAction={(id: string) =>
            updateStatus(id, OrderStatus.DELIVERED)
          }
          actionLabel="Complete"
          actionColor="bg-neutral-700 hover:bg-neutral-600"
          getTimeSince={getTimeSince}
        />
      </div>
    </div>
  )
}

// ============================================================================
// MAPPER
// ============================================================================

function mapToKitchenOrder(o: Order): KitchenOrder {
  return {
    id: o.id,
    created_at: o.created_at,
    customer_name: o.customer_name,
    customer_phone: o.customer_phone,
    amount_total: o.amount_total,
    status: o.status,
    cart_items: o.cart_items ?? [],
    assigned_to: o.assigned_to ?? null,
  }
}

// ============================================================================
// COLUMN
// ============================================================================

interface ColumnProps {
  title: string
  color: string
  orders: KitchenOrder[]
  onAction?: (id: string) => void
  actionLabel?: string
  actionColor?: string
  getTimeSince: (timestamp: string) => string
}

function Column({
  title,
  color,
  orders,
  onAction,
  actionLabel,
  actionColor,
  getTimeSince,
}: ColumnProps) {
  return (
    <div>
      <div className={`${color} mb-4 rounded-lg p-3 font-bold`}>
        {title} ({orders.length})
      </div>

      <div className="space-y-4">
        {orders.length === 0 && (
          <div className="rounded-lg border-2 border-dashed border-neutral-800 p-8 text-center text-neutral-600">
            No orders
          </div>
        )}

        {orders.map(o => (
          <div
            key={o.id}
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"
          >
            <div className="mb-2 flex items-start justify-between">
              <div>
                <div className="font-semibold">
                  {o.customer_name || "Guest"}
                </div>
                {o.customer_phone && (
                  <div className="text-xs text-neutral-500">
                    {o.customer_phone}
                  </div>
                )}
              </div>

              <div className="text-right">
                <div className="text-sm font-semibold text-green-400">
                  ${(o.amount_total / 100).toFixed(2)}
                </div>
                <div className="text-xs text-neutral-500">
                  {getTimeSince(o.created_at)}
                </div>
              </div>
            </div>

            {o.cart_items.map((item, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium text-orange-400">
                  {item.quantity} ×
                </span>{" "}
                {item.name}
              </div>
            ))}

            {onAction && actionLabel && (
              <button
                onClick={() => onAction(o.id)}
                className={`mt-3 w-full rounded py-2 font-bold ${actionColor}`}
              >
                {actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}