// ============================================================================
// ORDER EVENTS API — PRODUCTION SAFE (DB TRIGGER ARCHITECTURE)
// ============================================================================
// ⚠️ Frontend does NOT insert events.
// Database trigger handles event recording.
// These exports are preserved for backward compatibility.
// ============================================================================

import { supabase } from '@/lib/supabase/supabaseClient'
import type {
  OrderEvent,
  OrderTimeline,
  OrderPerformanceMetrics,
  RecordEventRequest,
} from '@/domain/orders/order-events.types'

// ============================================================================
// GET ORDER EVENTS
// ============================================================================

/**
 * Fetch all events for a specific order
 */
export async function getOrderEvents(
  orderId: string
): Promise<OrderEvent[]> {
  const { data, error } = await supabase
    .from('order_events')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('getOrderEvents failed:', error)
    throw error
  }

  return (data ?? []) as OrderEvent[]
}

// ============================================================================
// REALTIME SUBSCRIPTION
// ============================================================================

/**
 * Subscribe to new order events (INSERT only)
 */
export function subscribeToOrderEvents(
  orderId: string,
  callback: (event: OrderEvent) => void
): () => void {
  const channel = supabase
    .channel(`order-events-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'order_events',
        filter: `order_id=eq.${orderId}`,
      },
      (payload) => {
        if (payload.new) {
          callback(payload.new as OrderEvent)
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

// ============================================================================
// BACKWARD COMPATIBILITY EXPORTS
// ============================================================================

/**
 * ⚠️ Disabled — events are inserted by DB trigger.
 * Signature preserved so legacy hooks continue to compile.
 */
export async function recordOrderEvent(
  request: RecordEventRequest
): Promise<void> {
  void request
  console.warn(
    'recordOrderEvent disabled — database trigger handles events.'
  )
}
// ============================================================================
// TIMELINE (STUB)
// ============================================================================

/**
 * Stub kept for compatibility with existing hooks.
 * Replace later with a DB view or RPC.
 */
export async function getOrderTimeline(
  orderId: string
): Promise<OrderTimeline> {
  void orderId
  throw new Error(
    'getOrderTimeline not implemented — use DB view instead.'
  )
}
// ============================================================================
// PERFORMANCE (STUB)
// ============================================================================

/**
 * Stub kept for compatibility with existing hooks.
 * Replace later with analytics RPC or materialized view.
 */
export async function getOrderPerformance(
  orderId: string
): Promise<OrderPerformanceMetrics> {
  void orderId
  throw new Error(
    'getOrderPerformance not implemented — use analytics RPC.'
  )
}