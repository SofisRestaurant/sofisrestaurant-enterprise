// src/features/orders/order-events.utils.ts
// ============================================================================
// ORDER EVENTS UTILITIES — PRODUCTION VERSION 2026 (ENTERPRISE HARDENED)
// ============================================================================
// ✅ Fully type-safe OrderPhase
// ✅ Deterministic event evaluation
// ✅ Hardened time calculations
// ✅ Chronology validation
// ✅ Performance-safe grouping
// ============================================================================

import {
  ORDER_EVENT_TYPES,
  type OrderEvent,
  type OrderEventType,
  type OrderPerformanceMetrics,
} from '@/domain/orders/order-events.types'

// ============================================================================
// ORDER PHASE (TYPE-SAFE)
// ============================================================================

export type OrderPhase =
  | 'created'
  | 'confirmed'
  | 'assigned'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'unknown'

// ============================================================================
// TIME CALCULATIONS (SAFE)
// ============================================================================

export function getTimeBetweenEvents(
  startEvent: OrderEvent,
  endEvent: OrderEvent
): number {
  const start = new Date(startEvent.created_at).getTime()
  const end = new Date(endEvent.created_at).getTime()

  if (isNaN(start) || isNaN(end)) return 0
  return Math.max((end - start) / 60000, 0)
}

export function getTimeSinceEvent(event: OrderEvent): number {
  const eventTime = new Date(event.created_at).getTime()
  if (isNaN(eventTime)) return 0
  return Math.max((Date.now() - eventTime) / 60000, 0)
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return 'less than a minute'
  if (minutes < 60) {
    const rounded = Math.round(minutes)
    return `${rounded} ${rounded === 1 ? 'min' : 'mins'}`
  }

  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)

  if (mins === 0) return `${hours}${hours === 1 ? 'hr' : 'hrs'}`
  return `${hours}h ${mins}m`
}

export function formatRelativeTime(timestamp: string): string {
  const minutes = Math.floor(
    (Date.now() - new Date(timestamp).getTime()) / 60000
  )

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'min' : 'mins'} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'hr' : 'hrs'} ago`

  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

// ============================================================================
// EVENT SEARCHING
// ============================================================================

export function findFirstEvent(
  events: OrderEvent[],
  eventType: OrderEventType | string
): OrderEvent | null {
  return events.find(e => e.event_type === eventType) || null
}

export function findLastEvent(
  events: OrderEvent[],
  eventType: OrderEventType | string
): OrderEvent | null {
  const filtered = events.filter(e => e.event_type === eventType)
  return filtered.length ? filtered[filtered.length - 1] : null
}

export function filterEventsByType(
  events: OrderEvent[],
  eventTypes: (OrderEventType | string)[]
): OrderEvent[] {
  return events.filter(e => eventTypes.includes(e.event_type))
}

export function groupEventsByType(
  events: OrderEvent[]
): Record<string, OrderEvent[]> {
  return events.reduce((acc, event) => {
    const type = event.event_type
    if (!acc[type]) acc[type] = []
    acc[type].push(event)
    return acc
  }, Object.create(null) as Record<string, OrderEvent[]>)
}

export function sortEventsByTime(
  events: OrderEvent[],
  ascending = true
): OrderEvent[] {
  return [...events].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime()
    const timeB = new Date(b.created_at).getTime()
    return ascending ? timeA - timeB : timeB - timeA
  })
}

// ============================================================================
// STATUS / PHASE DETECTION (OPTIMIZED)
// ============================================================================

export function hasReachedEvent(
  events: OrderEvent[],
  eventType: OrderEventType | string
): boolean {
  return events.some(e => e.event_type === eventType)
}

export function getCurrentPhase(events: OrderEvent[]): OrderPhase {
  if (!events.length) return 'unknown'

  const seen = new Set(events.map(e => e.event_type))

  if (seen.has(ORDER_EVENT_TYPES.COMPLETED)) return 'completed'
  if (seen.has(ORDER_EVENT_TYPES.DELIVERED)) return 'delivered'
  if (seen.has(ORDER_EVENT_TYPES.OUT_FOR_DELIVERY)) return 'out_for_delivery'
  if (seen.has(ORDER_EVENT_TYPES.PICKED_UP)) return 'picked_up'
  if (seen.has(ORDER_EVENT_TYPES.READY_FOR_PICKUP)) return 'ready'
  if (seen.has(ORDER_EVENT_TYPES.PREPARING_STARTED)) return 'preparing'
  if (seen.has(ORDER_EVENT_TYPES.COOK_ASSIGNED)) return 'assigned'
  if (seen.has(ORDER_EVENT_TYPES.ORDER_CONFIRMED)) return 'confirmed'
  if (seen.has(ORDER_EVENT_TYPES.ORDER_CREATED)) return 'created'

  return 'unknown'
}

// ============================================================================
// PERFORMANCE CALCULATIONS
// ============================================================================

export function calculatePrepTime(events: OrderEvent[]): number | null {
  const start = findFirstEvent(events, ORDER_EVENT_TYPES.PREPARING_STARTED)
  const ready = findFirstEvent(events, ORDER_EVENT_TYPES.READY_FOR_PICKUP)
  if (!start || !ready) return null
  return getTimeBetweenEvents(start, ready)
}

export function calculateTimeToAssign(events: OrderEvent[]): number | null {
  const created = findFirstEvent(events, ORDER_EVENT_TYPES.ORDER_CREATED)
  const assigned = findFirstEvent(events, ORDER_EVENT_TYPES.COOK_ASSIGNED)
  if (!created || !assigned) return null
  return getTimeBetweenEvents(created, assigned)
}

export function calculateTimeToStart(events: OrderEvent[]): number | null {
  const created = findFirstEvent(events, ORDER_EVENT_TYPES.ORDER_CREATED)
  const start = findFirstEvent(events, ORDER_EVENT_TYPES.PREPARING_STARTED)
  if (!created || !start) return null
  return getTimeBetweenEvents(created, start)
}

export function calculateTimeToReady(events: OrderEvent[]): number | null {
  const created = findFirstEvent(events, ORDER_EVENT_TYPES.ORDER_CREATED)
  const ready = findFirstEvent(events, ORDER_EVENT_TYPES.READY_FOR_PICKUP)
  if (!created || !ready) return null
  return getTimeBetweenEvents(created, ready)
}

export function calculateTotalTime(events: OrderEvent[]): number | null {
  const created = findFirstEvent(events, ORDER_EVENT_TYPES.ORDER_CREATED)
  const completed = findFirstEvent(events, ORDER_EVENT_TYPES.COMPLETED)
  if (!created || !completed) return null
  return getTimeBetweenEvents(created, completed)
}

export function metTargetTime(
  events: OrderEvent[],
  targetMinutes = 15
): boolean | undefined {
  const timeToReady = calculateTimeToReady(events)
  if (timeToReady == null) return undefined
  return timeToReady <= targetMinutes
}

// ============================================================================
// PERFORMANCE METRICS AGGREGATION
// ============================================================================

export function calculatePerformanceMetrics(
  orderId: string,
  orderNumber: string | null,
  events: OrderEvent[]
): Partial<OrderPerformanceMetrics> {
  if (!events.length) return {}

  const sorted = sortEventsByTime(events, true)

  return {
    order_id: orderId,
    order_number: orderNumber ?? undefined,
    status: getCurrentPhase(events),
    minutes_to_assign: calculateTimeToAssign(events),
    minutes_to_start: calculateTimeToStart(events),
    minutes_to_ready: calculateTimeToReady(events),
    minutes_prep_time: calculatePrepTime(events),
    total_time_minutes: calculateTotalTime(events),
    on_time: metTargetTime(events, 15),
    created_at: sorted[0]?.created_at ?? new Date().toISOString(),
    updated_at:
      sorted[sorted.length - 1]?.created_at ?? new Date().toISOString(),
  }
}

// ============================================================================
// PERFORMANCE GRADING
// ============================================================================

export function getPerformanceGrade(
  metrics: OrderPerformanceMetrics | Partial<OrderPerformanceMetrics>
): 'excellent' | 'good' | 'average' | 'poor' {
  const timeToReady = metrics.minutes_to_ready

  if (timeToReady === null || timeToReady === undefined)
    return 'average'

  if (timeToReady <= 15) return 'excellent'
  if (timeToReady <= 25) return 'good'
  if (timeToReady <= 35) return 'average'
  return 'poor'
}

export function getPerformanceColor(
  grade: 'excellent' | 'good' | 'average' | 'poor'
): string {
  return {
    excellent: 'text-green-600',
    good: 'text-blue-600',
    average: 'text-yellow-600',
    poor: 'text-red-600',
  }[grade]
}

export function getPerformanceEmoji(
  grade: 'excellent' | 'good' | 'average' | 'poor'
): string {
  return {
    excellent: '🌟',
    good: '👍',
    average: '😐',
    poor: '😞',
  }[grade]
}

// ============================================================================
// VALIDATION
// ============================================================================

export function validateEventOrder(events: OrderEvent[]): string[] {
  const warnings: string[] = []
  if (!events.length) return warnings

  const sorted = sortEventsByTime(events, true)

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].created_at).getTime()
    const curr = new Date(sorted[i].created_at).getTime()
    if (curr < prev) {
      warnings.push(
        `Event ${sorted[i].event_type} occurs before previous event`
      )
    }
  }

  if (!hasReachedEvent(events, ORDER_EVENT_TYPES.ORDER_CREATED)) {
    warnings.push('Missing ORDER_CREATED event')
  }

  return warnings
}