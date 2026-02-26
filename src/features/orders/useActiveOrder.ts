// src/features/orders/useActiveOrder.ts

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/supabaseClient'
import { OrderStatus } from '@/domain/orders/order.types'

const TRACKABLE_STATUSES = [
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.SHIPPED,
] as const

export function useActiveOrder(userId: string | null): string | null {
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // ─────────────────────────────────────────────
  // Fetch active order
  // ─────────────────────────────────────────────
  useEffect(() => {
   if (!userId) return
    const safeUserId: string = userId
    const controller = new AbortController()

    async function fetchActiveOrder() {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('id')
          .eq('customer_uid', safeUserId)
          .eq('payment_status', 'paid')
          .in('status', TRACKABLE_STATUSES)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (controller.signal.aborted) return
        if (error) return

        setActiveOrderId(data?.id ?? null)
      } catch {
        if (!controller.signal.aborted) {
          setActiveOrderId(null)
        }
      }
    }

    fetchActiveOrder()

    return () => {
      controller.abort()
    }
  }, [userId])

  // ─────────────────────────────────────────────
  // Realtime updates
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!activeOrderId) return

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channel = supabase.channel(`active-order-${activeOrderId}`)
    channelRef.current = channel

    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${activeOrderId}`,
      },
      payload => {
        if (!payload?.new) return

        const status = payload.new.status as OrderStatus | undefined
        const payment = payload.new.payment_status as string | null

        const orderEnded =
          status === OrderStatus.CANCELLED ||
          status === OrderStatus.DELIVERED ||
          payment !== 'paid'

        if (orderEnded) {
          setActiveOrderId(null)
        }
      }
    )

    channel.subscribe()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [activeOrderId])

  return activeOrderId
}