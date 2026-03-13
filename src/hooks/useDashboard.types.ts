// src/hooks/useDashboard.types.ts
// =============================================================================
// Dashboard types — keep hook stable even if backend payload evolves
// =============================================================================

export type LiveMetrics = {
  todayRevenueCents: number;
  todayOrders: number;
  unreadNotifs: number;
  abandonedCarts: number;
  pendingOrders: number;
  fraudEvents: number;
};

export type DashboardState = {
  isLoading: boolean;
  error: string | null;
  lastUpdatedAt: string | null;
  metrics: LiveMetrics | null;
};

export const DEFAULT_METRICS: LiveMetrics = {
  todayRevenueCents: 0,
  todayOrders: 0,
  unreadNotifs: 0,
  abandonedCarts: 0,
  pendingOrders: 0,
  fraudEvents: 0,
};
