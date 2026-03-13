// =============================================================================
// src/lib/dashboard/health.ts
// Business Health Score computation engine.
//
// Scoring philosophy:
//   • Four independent signals, each normalized to 0–100
//   • Weighted composite with documented rationale
//   • Pure function — deterministic, unit-testable, no side-effects
// =============================================================================

import type {
  DashboardPayload,
  HealthGrade,
  HealthScore,
  HealthBreakdown,
  HealthSignal,
} from '@/types/dashboard.types';

// ── Weight Configuration ──────────────────────────────────────────────────────
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const safeNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const safeScore = (v: unknown): number => clamp(safeNum(v, 0), 0, 100);

const safeDelta = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const WEIGHTS: Record<HealthSignal, number> = {
  growth: 0.3, // 30% — revenue momentum is the heartbeat
  retention: 0.25, // 25% — loyalty engagement = long-term defensibility
  profit: 0.25, // 25% — margin health (AOV proxy)
  safety: 0.2, // 20% — disputes/failures destroy trust fast
};

const AOV_BASELINE_CENTS = 2_000;

const SIGNAL_LABELS: Record<HealthSignal, string> = {
  growth: 'Growth',
  retention: 'Retention',
  profit: 'Profit',
  safety: 'Safety',
};

const SIGNAL_DETAILS: Record<HealthSignal, string> = {
  growth: 'Revenue trend vs prior period (last 3 days vs previous 4)',
  retention: 'Redeemed / issued points ratio (engagement)',
  profit: 'Average order value vs baseline',
  safety: 'Disputes + failed payments + cancellations penalty',
};

// ── Signal Computers ──────────────────────────────────────────────────────────

function computeGrowthSignal(revenueRows: DashboardPayload['revenue']['data']): {
  score: number;
  delta: number | null;
} {
  if (!revenueRows || revenueRows.length < 2) return { score: 50, delta: null };

  const recent = revenueRows.slice(-3).reduce((sum, r) => sum + r.total_revenue_cents, 0);
  const older = revenueRows.slice(-7, -3).reduce((sum, r) => sum + r.total_revenue_cents, 0);

  if (older === 0) return { score: recent > 0 ? 65 : 40, delta: null };

  const ratio = (recent - older) / older;
  const score = Math.min(100, Math.max(0, 50 + ratio * 100));
  return { score, delta: ratio };
}

function computeRetentionSignal(loyaltyData: DashboardPayload['loyalty']['data']): {
  score: number;
  delta: number | null;
} {
  if (!loyaltyData?.total_issued || loyaltyData.total_issued === 0) {
    return { score: 50, delta: null };
  }

  const issued = loyaltyData.total_issued;
  const redeemed = loyaltyData.total_redeemed ?? 0;
  const ratio = redeemed / issued;

  const score = Math.min(100, Math.max(0, ratio * 200));
  const delta = ratio - 0.5;
  return { score, delta };
}

function computeProfitSignal(execData: DashboardPayload['executive']['data']): {
  score: number;
  delta: number | null;
} {
  if (!execData?.avg_order_value_cents) return { score: 40, delta: null };

  const aov = execData.avg_order_value_cents;
  const score = Math.min(100, (aov / AOV_BASELINE_CENTS) * 80);
  const delta = (aov - AOV_BASELINE_CENTS) / AOV_BASELINE_CENTS;
  return { score, delta };
}

function computeSafetySignal(riskData: DashboardPayload['risk']['data']): {
  score: number;
  delta: number | null;
} {
  if (!riskData) return { score: 100, delta: null };

  const penalty =
    (riskData.disputes ?? 0) * 15 +
    (riskData.failed_payments ?? 0) * 5 +
    (riskData.cancelled_orders ?? 0) * 1;

  const score = Math.max(0, 100 - penalty);
  return { score, delta: penalty > 0 ? -(penalty / 100) : null };
}

// ── Grade Mapping ─────────────────────────────────────────────────────────────

function scoreToGrade(score: number): HealthGrade {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Needs Attention';
}

function scoreToColor(score: number): { colorClass: string; colorHex: string } {
  if (score >= 80) return { colorClass: 'text-emerald-400', colorHex: '#34d399' };
  if (score >= 60) return { colorClass: 'text-amber-400', colorHex: '#fbbf24' };
  if (score >= 40) return { colorClass: 'text-orange-400', colorHex: '#fb923c' };
  return { colorClass: 'text-red-400', colorHex: '#f87171' };
}

// ── Core ─────────────────────────────────────────────────────────────────────

export function computeHealthScore(payload: DashboardPayload): HealthScore {
  const growth = computeGrowthSignal(payload.revenue.data);
  const retention = computeRetentionSignal(payload.loyalty.data);
  const profit = computeProfitSignal(payload.executive.data);
  const safety = computeSafetySignal(payload.risk.data);

  const signals: Record<HealthSignal, { score: number; delta: number | null }> = {
    growth: { score: safeScore(growth.score), delta: safeDelta(growth.delta) },
    retention: { score: safeScore(retention.score), delta: safeDelta(retention.delta) },
    profit: { score: safeScore(profit.score), delta: safeDelta(profit.delta) },
    safety: { score: safeScore(safety.score), delta: safeDelta(safety.delta) },
  };

  // Normalize weights (prevents weirdness if they don't sum to 1)
  const keys = Object.keys(WEIGHTS) as HealthSignal[];
  const weightSum = keys.reduce((sum, k) => sum + safeNum(WEIGHTS[k], 0), 0) || 1;

  const compositeRaw = keys.reduce((sum, key) => {
    const w = safeNum(WEIGHTS[key], 0) / weightSum;
    return sum + signals[key].score * w;
  }, 0);

  const score = clamp(Math.round(safeNum(compositeRaw, 0)), 0, 100);

  const grade = scoreToGrade(score);
  const { colorClass, colorHex } = scoreToColor(score);

  const breakdown: HealthBreakdown[] = keys.map((key) => ({
    signal: key,
    label: SIGNAL_LABELS[key],
    score: clamp(Math.round(signals[key].score), 0, 100),
    weight: safeNum(WEIGHTS[key], 0),
    delta: signals[key].delta,
    detail: SIGNAL_DETAILS[key],
  }));

  return {
    score,
    grade,
    colorClass,
    colorHex,
    breakdown,
  };
}

// ── UI helpers ───────────────────────────────────────────────────────────────

export function healthGradient(score: number): string {
  const s = safeNum(score, 0);
  if (s >= 80) return 'linear-gradient(90deg, #10b981, #34d399)';
  if (s >= 60) return 'linear-gradient(90deg, #f59e0b, #fbbf24)';
  if (s >= 40) return 'linear-gradient(90deg, #f97316, #fb923c)';
  return 'linear-gradient(90deg, #dc2626, #f87171)';
}

export function heatmapBarColor(value: number, max: number): string {
  const m = safeNum(max, 0);
  const v = safeNum(value, 0);
  if (m <= 0) return '#3f3f46';
  const ratio = v / m;
  if (!Number.isFinite(ratio)) return '#3f3f46';
  if (ratio >= 0.7) return '#f59e0b';
  if (ratio >= 0.4) return '#78716c';
  return '#3f3f46';
}
