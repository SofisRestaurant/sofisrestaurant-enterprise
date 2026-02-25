// src/hooks/useOrderEvents.ts
// ============================================================================
// USE ORDER EVENTS HOOK
// ============================================================================
// React hook for working with order events in components
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import {
  getOrderEvents,
  getOrderTimeline,
  getOrderPerformance,
  subscribeToOrderEvents,
  recordOrderEvent,
} from '@/features/orders/order-events.api'
import type {
  OrderEvent,
  OrderTimeline,
  OrderPerformanceMetrics,
  RecordEventRequest,
} from '@/domain/orders/order-events.types'

// ============================================================================
// HOOK: USE ORDER EVENTS
// ============================================================================

interface UseOrderEventsReturn {
  events: OrderEvent[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Hook to fetch and watch order events
 * 
 * @example
 * ```tsx
 * const { events, loading, refresh } = useOrderEvents(orderId)
 * ```
 */
export function useOrderEvents(orderId: string | null): UseOrderEventsReturn {
  const [events, setEvents] = useState<OrderEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadEvents = useCallback(async () => {
    if (!orderId) {
      setEvents([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await getOrderEvents(orderId)
      setEvents(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events')
      console.error('Error loading events:', err)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  return {
    events,
    loading,
    error,
    refresh: loadEvents,
  }
}

// ============================================================================
// HOOK: USE ORDER TIMELINE
// ============================================================================

interface UseOrderTimelineReturn {
  timeline: OrderTimeline | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Hook to fetch complete order timeline
 * 
 * @example
 * ```tsx
 * const { timeline, loading } = useOrderTimeline(orderId)
 * ```
 */
export function useOrderTimeline(orderId: string | null): UseOrderTimelineReturn {
  const [timeline, setTimeline] = useState<OrderTimeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadTimeline = useCallback(async () => {
    if (!orderId) {
      setTimeline(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await getOrderTimeline(orderId)
      setTimeline(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline')
      console.error('Error loading timeline:', err)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    loadTimeline()
  }, [loadTimeline])

  return {
    timeline,
    loading,
    error,
    refresh: loadTimeline,
  }
}

// ============================================================================
// HOOK: USE ORDER PERFORMANCE
// ============================================================================

interface UseOrderPerformanceReturn {
  metrics: OrderPerformanceMetrics | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Hook to fetch order performance metrics
 * 
 * @example
 * ```tsx
 * const { metrics, loading } = useOrderPerformance(orderId)
 * ```
 */
export function useOrderPerformance(orderId: string | null): UseOrderPerformanceReturn {
  const [metrics, setMetrics] = useState<OrderPerformanceMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadMetrics = useCallback(async () => {
    if (!orderId) {
      setMetrics(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await getOrderPerformance(orderId)
      setMetrics(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load metrics')
      console.error('Error loading metrics:', err)
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    loadMetrics()
  }, [loadMetrics])

  return {
    metrics,
    loading,
    error,
    refresh: loadMetrics,
  }
}

// ============================================================================
// HOOK: USE REALTIME ORDER EVENTS
// ============================================================================

interface UseRealtimeOrderEventsOptions {
  enabled?: boolean
  onNewEvent?: (event: OrderEvent) => void
}

/**
 * Hook to subscribe to real-time order events
 * 
 * @example
 * ```tsx
 * const { events } = useRealtimeOrderEvents(orderId, {
 *   onNewEvent: (event) => console.log('New event:', event)
 * })
 * ```
 */
export function useRealtimeOrderEvents(
  orderId: string | null,
  options: UseRealtimeOrderEventsOptions = {}
): UseOrderEventsReturn {
  const { enabled = true, onNewEvent } = options
  const { events, loading, error, refresh } = useOrderEvents(orderId)

  useEffect(() => {
    if (!orderId || !enabled) return

    console.log('📡 Subscribing to real-time events for order:', orderId)

    const unsubscribe = subscribeToOrderEvents(orderId, (event) => {
      console.log('📡 New event received:', event)
      
      // Call callback
      onNewEvent?.(event)
      
      // Refresh events
      refresh()
    })

    return () => {
      console.log('📡 Unsubscribing from order events')
      unsubscribe()
    }
  }, [orderId, enabled, onNewEvent, refresh])

  return {
    events,
    loading,
    error,
    refresh,
  }
}

// ============================================================================
// HOOK: USE RECORD EVENT (DB Trigger Architecture)
// ============================================================================

interface UseRecordEventReturn {
  recordEvent: (
    request: Omit<RecordEventRequest, 'order_id'>
  ) => Promise<boolean>
  recording: boolean
  error: string | null
}

/**
 * Hook to record events for an order.
 * In DB-trigger architecture, this function does NOT directly insert events.
 * It exists for backward compatibility.
 */
export function useRecordEvent(
  orderId: string | null
): UseRecordEventReturn {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const record = useCallback(
    async (
      request: Omit<RecordEventRequest, 'order_id'>
    ): Promise<boolean> => {
      if (!orderId) {
        setError('Order ID is required')
        return false
      }

      try {
        setRecording(true)
        setError(null)

        // In trigger-based system, this is a no-op.
         await recordOrderEvent({
         ...request,
        order_id: orderId,
       })
       return true
        // Always return true because we don't control DB insertion
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to record event'
        )
        console.error('Error recording event:', err)
        return false
      } finally {
        setRecording(false)
      }
    },
    [orderId]
  )

  return {
    recordEvent: record,
    recording,
    error,
  }
}