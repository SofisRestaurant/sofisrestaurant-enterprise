// =============================================================================
// src/features/admin/nav/nav.types.ts
// =============================================================================

export interface LiveMetrics {
  todayRevenueCents: number
  todayOrders:       number
  unreadNotifs:      number
  abandonedCarts:    number
  pendingOrders:     number
  fraudEvents:       number
}

export const EMPTY_METRICS: LiveMetrics = {
  todayRevenueCents: 0,
  todayOrders:       0,
  unreadNotifs:      0,
  abandonedCarts:    0,
  pendingOrders:     0,
  fraudEvents:       0,
}

// Subset of admin-metrics Edge Function response used for sidebar
export interface MetricsPayload {
  revenue?:   { data?: Array<{ total_revenue_cents?: number; total_orders?: number }> | null }
  executive?: { data?: { fraud_events_7d?: number } | null }
}