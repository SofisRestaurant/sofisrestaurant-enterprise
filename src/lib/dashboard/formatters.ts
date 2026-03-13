// =============================================================================
// src/lib/dashboard/formatters.ts
// Pure, deterministic display formatters — no side-effects, fully tree-shakeable.
// All monetary inputs are in cents. All outputs are locale-formatted strings.
// =============================================================================

import type {
  TrendMeta,
  HeatmapRow,
  HeatmapChartPoint,
  RevenueRow,
  RevenueChartPoint,
  PeakHour,
} from '@/types/dashboard.types';

// ── Money ─────────────────────────────────────────────────────────────────────

/**
 * Formats cents to a compact USD string.
 * 150000 → "$1,500"   |  5050 → "$51"
 */
export function formatDollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

/**
 * Formats cents to a full USD string with cents.
 * 150050 → "$1,500.50"
 */
export function formatDollarsFull(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Compact large numbers.
 * 1200 → "1.2k"   |  999 → "999"   |  1_500_000 → "1.5M"
 */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * Percentage with one decimal place.
 * 0.1234 → "12.3%"
 */
export function formatPct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/**
 * Points with locale separators.
 * 12500 → "12,500 pts"
 */
export function formatPoints(n: number): string {
  return `${n.toLocaleString('en-US')} pts`;
}

// ── Time ──────────────────────────────────────────────────────────────────────

/**
 * 24h integer to human-readable hour.
 * 0 → "12am"  |  13 → "1pm"  |  12 → "12pm"
 */
export function formatHour(h: number): string {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

/**
 * Short axis label for heatmap bars.
 * 0 → "12a"  |  15 → "3p"
 */
export function formatHourShort(h: number): string {
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}

/**
 * Date string to short weekday.
 * "2026-02-28" → "Fri"
 */
export function formatWeekday(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * Date to HH:MM am/pm display.
 */
export function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// ── Trend ─────────────────────────────────────────────────────────────────────

/**
 * Computes a trend indicator between two values.
 * Returns null when comparison is meaningless (no previous value).
 */
export function computeTrend(current: number, previous: number): TrendMeta | null {
  if (!previous || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return {
    pct: Math.abs(pct).toFixed(1),
    up,
    label: `${up ? '+' : ''}${pct.toFixed(1)}%`,
    colorClass: up ? 'text-emerald-400' : 'text-red-400',
  };
}

// ── Chart Data Transformers ───────────────────────────────────────────────────

/**
 * Converts raw RevenueRow[] → recharts-ready points.
 * Trims to last N days (default 14).
 */
export function buildRevenueChartData(rows: RevenueRow[], days = 14): RevenueChartPoint[] {
  return rows.slice(-days).map((r) => ({
    day: formatWeekday(r.day),
    revenue: r.total_revenue_cents / 100,
    orders: r.total_orders,
  }));
}

/**
 * Converts raw HeatmapRow[] → full 24-slot recharts-ready array.
 * Missing hours get revenue: 0, orders: 0.
 */
export function buildHeatmapChartData(rows: HeatmapRow[]): HeatmapChartPoint[] {
  return Array.from({ length: 24 }, (_, h) => {
    const row = rows.find((r) => r.hour_of_day === h);
    return {
      hour: h,
      label: formatHourShort(h),
      revenue: (row?.revenue_cents ?? 0) / 100,
      orders: row?.orders ?? 0,
    };
  });
}

/**
 * Extracts the peak revenue hour from heatmap data.
 */
export function getPeakHour(rows: HeatmapRow[]): PeakHour | null {
  if (!rows.length) return null;
  const peak = [...rows].sort((a, b) => b.revenue_cents - a.revenue_cents)[0];
  return {
    hour: peak.hour_of_day,
    label: formatHour(peak.hour_of_day),
    revenue_cents: peak.revenue_cents,
    orders: peak.orders,
  };
}

// ── Loyalty ───────────────────────────────────────────────────────────────────

/**
 * Redemption rate as a ratio (0–1).
 * Returns null when total_issued is 0 to avoid division by zero.
 */
export function redemptionRate(issued: number, redeemed: number): number | null {
  if (!issued) return null;
  return Math.min(1, redeemed / issued);
}

/**
 * Converts loyalty points to an approximate dollar liability.
 * Convention: 1 point = $0.01.
 */
export function pointsToDollars(points: number): number {
  return points; // 100 points = $1 = 100 cents
}
