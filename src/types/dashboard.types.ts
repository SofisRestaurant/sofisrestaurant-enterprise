// =============================================================================
// dashboard.types.ts
// Single source of truth for all dashboard data contracts.
// Every interface maps 1:1 to a matview / function return in the DB.
// =============================================================================

// ── Primitive Section Wrapper ─────────────────────────────────────────────────

export interface Section<T> {
  data: T | null;
  error: string | null;
  duration_ms: number;
}

// ── Revenue ───────────────────────────────────────────────────────────────────

export interface RevenueRow {
  /** ISO date string: "2026-02-28" */
  day: string;
  total_revenue_cents: number;
  total_orders: number;
  avg_order_value_cents: number;
}

export interface RevenueChartPoint {
  /** Short weekday label: "Mon" */
  day: string;
  /** Raw dollars (cents / 100) */
  revenue: number;
  orders: number;
}

// ── Top Items ─────────────────────────────────────────────────────────────────

export interface TopItem {
  item_name: string;
  total_quantity: number;
  revenue_impact_cents: number;
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

export interface HeatmapRow {
  /** 0–23 */
  hour_of_day: number;
  orders: number;
  revenue_cents: number;
}

export interface HeatmapChartPoint {
  hour: number;
  /** "12a" | "3p" etc. */
  label: string;
  revenue: number;
  orders: number;
}

// ── Executive Snapshot ────────────────────────────────────────────────────────

export interface ExecutiveRow {
  avg_order_value_cents: number;
  fraud_events_7d: number;
  lifetime_revenue_cents: number;
  outstanding_loyalty_points: number;
  total_orders: number;
}

// ── Loyalty ───────────────────────────────────────────────────────────────────

export interface LoyaltyRow {
  total_issued: number;
  total_redeemed: number;
  total_issuances: number;
  total_redemptions: number;
}

export interface LiabilityRow {
  total_points_outstanding: number;
}

// ── Risk ──────────────────────────────────────────────────────────────────────

export interface RiskRow {
  cancelled_orders: number;
  disputes: number;
  failed_payments: number;
}

// ── Full Dashboard Payload ────────────────────────────────────────────────────

export interface DashboardMeta {
  request_id: string;
  duration_ms: number;
  error_count: number;
  generated_at: string;
}

export interface DashboardPayload {
  meta: DashboardMeta;
  revenue: Section<RevenueRow[]>;
  topItems: Section<TopItem[]>;
  loyalty: Section<LoyaltyRow>;
  liability: Section<LiabilityRow>;
  risk: Section<RiskRow>;
  /** admin_fraud_snapshot reuses ExecutiveRow shape */
  fraud: Section<ExecutiveRow>;
  heatmap: Section<HeatmapRow[]>;
  executive: Section<ExecutiveRow>;
}

// ── UI State ──────────────────────────────────────────────────────────────────

export interface DashboardState {
  data: DashboardPayload | null;
  loading: boolean;
  refreshing: boolean;
  lastRefresh: Date | null;
  countdown: number;
  error: string | null;
}

export interface UseDashboardReturn extends DashboardState {
  manualRefresh: () => void;
}

// ── Health Score ──────────────────────────────────────────────────────────────

export type HealthGrade = 'Excellent' | 'Good' | 'Fair' | 'Needs Attention';

export type HealthSignal = 'growth' | 'retention' | 'profit' | 'safety';

export interface HealthBreakdown {
  signal: HealthSignal;
  label: string;
  score: number;
  weight?: number;
  delta?: number | null;
  detail?: string | null;
  description?: string;
}

export interface HealthScore {
  score: number; // 0–100 composite
  grade: 'Excellent' | 'Good' | 'Fair' | 'Needs Attention';
  colorClass: string; // e.g. "text-emerald-400"
  colorHex: string; // e.g. "#34d399"
  breakdown: HealthBreakdown[]; // one entry per HealthSignal
}

// ── Trend ─────────────────────────────────────────────────────────────────────

export interface TrendMeta {
  pct: string;
  up: boolean;
  label: string;
  /** Tailwind text color class */
  colorClass: string;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

export type AccentColor = 'amber' | 'emerald' | 'blue' | 'violet' | 'rose';

// ── Chart Extras ──────────────────────────────────────────────────────────────

export interface PeakHour {
  hour: number;
  label: string;
  revenue_cents: number;
  orders: number;
}
