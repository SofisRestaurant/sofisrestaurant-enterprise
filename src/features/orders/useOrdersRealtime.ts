// ============================================================================
// SHARED ORDERS REALTIME LAYER — PRODUCTION SAFE
// ============================================================================

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/supabaseClient'
import type { Database } from '@/lib/supabase/database.types'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type OrderRow = Database['public']['Tables']['orders']['Row']

interface UseOrdersRealtimeOptions {
  channelName: string
  onInsert?: (row: OrderRow) => void
  onUpdate?: (row: OrderRow) => void
  onDelete?: (row: OrderRow) => void
}

export function useOrdersRealtime({
  channelName,
  onInsert,
  onUpdate,
  onDelete,
}: UseOrdersRealtimeOptions) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const handleChange = (
      payload: RealtimePostgresChangesPayload<OrderRow>
    ) => {
      const row = payload.new as OrderRow | null
      if (!row) return

      if (payload.eventType === 'INSERT' && onInsert) {
        onInsert(row)
      }

      if (payload.eventType === 'UPDATE' && onUpdate) {
        onUpdate(row)
      }

      if (payload.eventType === 'DELETE' && onDelete) {
        onDelete(row)
      }
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        handleChange
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`🟢 ${channelName} realtime connected`)
        }
      })

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [channelName, onInsert, onUpdate, onDelete])
}