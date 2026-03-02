// =============================================================================
// src/features/admin/dashboard/Dashboard.tsx
// =============================================================================
// Executive Intelligence Dashboard
// =============================================================================
import type { KPICardProps } from '@/features/admin/ui/AdminPrimitives'
import { SkeletonBlock, SkeletonGrid } from '@/features/admin/ui'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  Cell,
} from 'recharts';
import { useDashboard } from '@/hooks/useDashboard';

import {
  computeHealthScore,
  healthGradient,
  heatmapBarColor,
} from '@/lib/dashboard/health';

import {
  formatDollars,
  formatCompact,
  formatPoints,
  formatTime,
  computeTrend,
  buildRevenueChartData,
  buildHeatmapChartData,
  getPeakHour,
  redemptionRate,
  formatPct,
  pointsToDollars,
} from '@/lib/dashboard/formatters';

import {
  Panel,
  KPICard,
  HealthBar,
  Badge,
  EmptyChart,
  EmptyState,
  ACCENT,
  MONO,
  TOOLTIP_STYLE,
} from '@/features/admin/ui/AdminPrimitives';

import type { AccentColor } from '@/types/dashboard.types';
// Trend adapter (handles old TrendMeta objects or strings)
function toTrend(v: unknown): KPICardProps['trend'] {
  if (v === 'up' || v === 'down' || v === 'flat') return v
  if (v && typeof v === 'object' && 'up' in v) {
    return (v as { up: boolean }).up ? 'up' : 'down'
  }
  return 'flat'
}
// ──────────────────────────────────────────────────────────────────────────────
// Dashboard
// ──────────────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
])

function corsHeaders(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://sofislegacy.com"
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-application-name",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  }
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

type HasRevenueCents = { total_revenue_cents?: unknown }

const safeSumCents = (rows: HasRevenueCents[]): number =>
  rows.reduce((sum, r) => sum + num(r.total_revenue_cents, 0), 0)

const safeRatio = (a: unknown, b: unknown): number | null => {
  const denom = num(a, NaN)
  const numer = num(b, NaN)
  if (!Number.isFinite(denom) || !Number.isFinite(numer) || denom <= 0) return null
  const r = numer / denom
  return Number.isFinite(r) ? r : null
}

export default function Dashboard() {
  const {
    data,
    loading,
    refreshing,
    lastRefresh,
    countdown,
    error,
    manualRefresh,
  } = useDashboard();

  if (loading) return <DashboardSkeleton />;
  if (error && !data) {
    return <DashboardError message={error} onRetry={manualRefresh} />;
  }
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

const safeSumCents = (rows: Array<{ total_revenue_cents?: unknown }>): number =>
  rows.reduce((sum, r) => sum + num(r.total_revenue_cents, 0), 0)

const safeRatio = (a: unknown, b: unknown): number | null => {
  const denom = num(a, NaN)
  const numer = num(b, NaN)
  if (!Number.isFinite(denom) || !Number.isFinite(numer) || denom <= 0) return null
  const r = numer / denom
  return Number.isFinite(r) ? r : null
}
  const exec        = data?.executive.data;
  const revenue     = data?.revenue.data ?? [];
  const topItems    = data?.topItems.data ?? [];
  const loyalty     = data?.loyalty.data;
  const liability   = data?.liability.data;
  const risk        = data?.risk.data;
  const heatmapRows = data?.heatmap.data ?? [];

  const today     = revenue[revenue.length - 1];
  const yesterday = revenue[revenue.length - 2];

  const week7Rev = safeSumCents(revenue.slice(-7))


  const prev7Rev = safeSumCents(revenue.slice(-14, -7))

  const chartRevenue = buildRevenueChartData(revenue, 14);
  const chartHeatmap = buildHeatmapChartData(heatmapRows);
  const maxHeatmap   = Math.max(...chartHeatmap.map((r) => r.revenue), 1);
  const peakHour     = getPeakHour(heatmapRows);
  const health       = data ? computeHealthScore(data) : null;
const safeNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

const safeInt = (v: unknown, fallback = 0): number => {
  const n = safeNum(v, fallback)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}
  const redemptionRatio = loyalty
  ? safeRatio(loyalty.total_issued, loyalty.total_redeemed)
  : null
  const liabilityDollars =
    pointsToDollars(liability?.total_points_outstanding ?? 0);

  // 30-day sparkline
const sparkData = revenue.slice(-30).map((r, i) => ({
  i,
  v: safeNum((r as any)?.total_revenue_cents, 0) / 100,
}))

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <DashboardHeader
        refreshing={refreshing}
        countdown={countdown}
        lastRefresh={lastRefresh}
        onRefresh={manualRefresh}
      />

      {/* HEALTH SCORE */}
      {health && (
        <section className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#0d0d10] p-6">
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-10"
            style={{
              background: `radial-gradient(circle, ${health.colorHex}, transparent 70%)`,
            }}
          />
          <div className="flex items-center justify-between">
            <div>
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-600">
                Business Health Score
              </p>
              <div className="flex items-baseline gap-3">
                <span className="...">{safeInt(health.score, 0)}</span>
                <span className="text-sm text-zinc-600">/100</span>
                <Badge
                  tone={
                    health.score >= 80
                      ? 'success'
                      : health.score >= 60
                      ? 'warning'
                      : 'danger'
                  }
                >
                  {health.grade}
                </Badge>
              </div>
            </div>
            <div className="flex items-end gap-4 pr-2">
  {health.breakdown.map((b) => (
    <HealthBar
  key={b.signal}
  label={b.label ?? String(b.signal)}
  value={Number(b.score ?? 0)}
  variant={b.score >= 80 ? 'good' : b.score >= 50 ? 'warn' : 'bad'}
  helperText={b.detail ?? undefined}
/>
  ))}
</div>
          </div>

          {/* Score track */}
          <div className="relative mt-5 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="absolute left-0 top-0 h-full rounded-full transition-all duration-1000"
              style={{
                width: `${health.score}%`,
                background: healthGradient(health.score),
              }}
            />
            {[25, 50, 75].map((t) => (
              <div
                key={t}
                className="absolute top-0 h-full w-px bg-zinc-700"
                style={{ left: `${t}%` }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[9px] text-zinc-700">
            {[0, 25, 50, 75, 100].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </section>
      )}
{topItems.slice(0, 6).map((item, i) => {
  const max = topItems[0]?.revenue_impact_cents ?? 1
  const raw = (item?.revenue_impact_cents ?? 0) / max
  const pct = Number.isFinite(raw) ? raw * 100 : 0

  const COLORS = ['#f59e0b', '#fb923c', '#a78bfa', '#60a5fa', '#34d399', '#f472b6']
const healthRaw = data ? computeHealthScore(data) : null

const health = healthRaw
  ? {
      ...healthRaw,
      score: safeInt(healthRaw.score, 0),
      breakdown: (healthRaw.breakdown ?? []).map((b) => ({
        ...b,
        score: safeInt((b as any).score, 0),
      })),
    }
  : null
  return (
    <div key={item.item_name}>
      <div className="mb-1 flex items-center justify-between">
        <span className="max-w-[65%] truncate text-xs text-zinc-300">
          {item.item_name}
        </span>
        <span className="font-mono text-[10px] font-bold text-amber-400 tabular-nums">
          {formatDollars(item.revenue_impact_cents ?? 0)}
        </span>
      </div>

      <div className="h-0.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: COLORS[i] ?? '#3f3f46',
          }}
        />
      </div>
    </div>
  )
})}
      {/* KPI ROW */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard
          label="Today Revenue"
          value={formatDollars(today?.total_revenue_cents ?? 0)}
          trend={
            computeTrend(
              today?.total_revenue_cents ?? 0,
              yesterday?.total_revenue_cents ?? 0,
            ) ?? 'flat'
          }
          accent="amber"
        />

        <KPICard
          label="Today Orders"
          value={formatCompact(today?.total_orders ?? 0)}
          trend={
            computeTrend(
              today?.total_orders ?? 0,
              yesterday?.total_orders ?? 0,
            ) ?? 'flat'
          }
          accent="sky"
        />

        <KPICard
          label="7-Day Revenue"
          value={formatDollars(week7Rev)}
          trend={toTrend(computeTrend(week7Rev, prev7Rev))}
          accent="emerald"
        />

        <KPICard
          label="Avg Order Value"
          value={formatDollars(exec?.avg_order_value_cents ?? 0)}
          sub={`${formatCompact(exec?.total_orders ?? 0)} lifetime`}
          trend={
            computeTrend(
              exec?.avg_order_value_cents ?? 0,
              yesterday?.total_revenue_cents ?? 0,
            ) ?? 'flat'
          }
          accent="slate"
        />
      </div>

      {/* REVENUE CHART + TOP ITEMS */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="14-Day Revenue Trend"
          error={!!data?.revenue.error}
          actions={
            sparkData.length > 0 ? (
              <div className="hidden sm:block">
                <p className="mb-0.5 font-mono text-[8px] text-zinc-700">30d</p>
                <ResponsiveContainer width={72} height={22}>
                  <LineChart data={sparkData}>
                    <Line
                      type="monotone"
                      dataKey="v"
                      stroke="#f59e0b"
                      strokeWidth={1}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : undefined
          }
        >
          {chartRevenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={chartRevenue}
                margin={{ top: 8, right: 4, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="dashRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="#f59e0b"
                      stopOpacity={0.25}
                    />
                    <stop
                      offset="95%"
                      stopColor="#f59e0b"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="day"
                  tick={{
                    fill: '#3f3f46',
                    fontSize: 9,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{
                    fill: '#3f3f46',
                    fontSize: 9,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: '#71717a' }}
                  formatter={(value: number | undefined) => {
                    const safe = value ?? 0;
                    return [
                      `$${(safe / 100).toLocaleString()}`,
                      'Revenue',
                    ] as [string, string];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  fill="url(#dashRevGrad)"
                  dot={false}
                  activeDot={{
                    r: 3,
                    fill: '#f59e0b',
                    stroke: '#0d0d10',
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </Panel>

        <Panel title="Top Menu Items" error={!!data?.topItems.error}>
          <div className="mt-2 space-y-3">
            {topItems.slice(0, 6).map((item, i) => {
  const max = topItems[0]?.revenue_impact_cents ?? 1
  const raw = (item?.revenue_impact_cents ?? 0) / max
  const pct = Number.isFinite(raw) ? raw * 100 : 0

  const COLORS = [
    '#f59e0b',
    '#fb923c',
    '#a78bfa',
    '#60a5fa',
    '#34d399',
    '#f472b6',
  ]

  return (
    <div key={item.item_name}>
      <div className="mb-1 flex items-center justify-between">
        <span className="max-w-[65%] truncate text-xs text-zinc-300">
          {item.item_name}
        </span>
        <span className="font-mono text-[10px] font-bold text-amber-400 tabular-nums">
          {formatDollars(item.revenue_impact_cents)}
        </span>
      </div>

      <div className="h-0.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: COLORS[i] ?? '#3f3f46',
          }}
        />
      </div>
    </div>
  )
})}

            {topItems.length === 0 && (
              <EmptyState
                title="No item data"
                icon="🍽"
              />
            )}
          </div>
        </Panel>
      </div>

      {/* LOYALTY + HEATMAP */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Loyalty Intelligence"
          error={!!data?.loyalty.error}
        >
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(
              [
                [
                  'Points Issued',
                  formatCompact(loyalty?.total_issued ?? 0),
                  'amber',
                ],
                [
                  'Points Redeemed',
                  formatCompact(loyalty?.total_redeemed ?? 0),
                  'emerald',
                ],
                [
                  'Redemption Txns',
                  formatCompact(loyalty?.total_redemptions ?? 0),
                  'sky',
                ],
                [
                  'Liability Pts',
                  formatCompact(
                    liability?.total_points_outstanding ?? 0,
                  ),
                  'slate',
                ],
              ] as [string, string, AccentColor][]
            ).map(([label, value, accent]) => (
              <div
                key={label}
                className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5"
              >
                <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-zinc-600">
                  {label}
                </p>
                <p
                  className={`mt-1 text-lg font-black tabular-nums ${ACCENT[accent]}`}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Liability callout */}
          <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">
                  Loyalty Liability
                </p>
                <p className="mt-1 text-xl font-black text-white">
                  {formatPoints(
                    liability?.total_points_outstanding ?? 0,
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[9px] text-zinc-600">
                  est. value
                </p>
                <p className="mt-1 font-black text-amber-400">
                  ≈ {formatDollars(liabilityDollars)}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-1.5 flex justify-between font-mono text-[9px] text-zinc-600">
                <span>Redemption rate</span>
                <span className="text-zinc-400">
                  {redemptionRatio !== null
                    ? formatPct(redemptionRatio)
                    : '—'}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                  style={{
                    width: `${Math.min(
                      100,
                      (redemptionRatio ?? 0) * 100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          title="Hourly Revenue Heatmap"
          error={!!data?.heatmap.error}
          actions={
            peakHour ? (
              <div className="text-right">
                <p className="font-mono text-[9px] text-zinc-600">
                  Peak hour
                </p>
                <p className="font-black text-amber-400">
                  {peakHour.label}
                </p>
              </div>
            ) : undefined
          }
        >
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={chartHeatmap}
              margin={{ top: 6, right: 0, left: -32, bottom: 0 }}
            >
              <XAxis
                dataKey="label"
                tick={{
                  fill: '#3f3f46',
                  fontSize: 8,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: '#71717a' }}
                formatter={(value: number | undefined) => {
                  const safe = value ?? 0;
                  return [
                    `$${(safe / 100).toLocaleString()}`,
                    'Revenue',
                  ] as [string, string];
                }}
              />
              <Bar dataKey="revenue" radius={[2, 2, 0, 0]}>
                {chartHeatmap.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={heatmapBarColor(entry.revenue, maxHeatmap)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-2 font-mono text-[9px] text-zinc-700">
            Amber = peak revenue windows · schedule staff accordingly
          </p>
        </Panel>
      </div>

      {/* RISK + FRAUD + LIFETIME */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel
          title="Risk Signals"
          error={!!data?.risk.error}
        >
          <div className="mt-3 space-y-2">
            {(
              [
                ['Disputes', risk?.disputes ?? 0, 1, '⚖'],
                [
                  'Failed Payments',
                  risk?.failed_payments ?? 0,
                  3,
                  '✕',
                ],
                [
                  'Cancellations',
                  risk?.cancelled_orders ?? 0,
                  5,
                  '◌',
                ],
              ] as [string, number, number, string][]
            ).map(([label, value, threshold, icon]) => {
              const bad = value >= threshold;
              return (
                <div
                  key={label}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
                    bad
                      ? 'border-red-500/20 bg-red-500/5'
                      : 'border-zinc-800 bg-zinc-900/40'
                  }`}
                >
                  <span className="flex items-center gap-2.5 text-xs text-zinc-400">
                    <span
                      className={`font-mono text-[11px] ${
                        bad ? 'text-red-400' : 'text-zinc-600'
                      }`}
                    >
                      {icon}
                    </span>
                    {label}
                  </span>
                  <span
                    className={`font-mono text-sm font-black tabular-nums ${
                      bad ? 'text-red-400' : 'text-zinc-500'
                    }`}
                  >
                    {value}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="Fraud Detection"
          error={!!data?.fraud.error}
        >
          <div className="mt-2 flex flex-col items-center justify-center py-4">
            <span className="tabular-nums text-5xl font-black tracking-tighter text-white">
              {exec?.fraud_events_7d ?? 0}
            </span>
            <p className="mt-1 font-mono text-[10px] text-zinc-600">
              events / 7 days
            </p>
            <div className="mt-3">
              {(() => {
                const c = exec?.fraud_events_7d ?? 0;
                return (
                  <Badge
                    tone={
                      c === 0
                        ? 'success'
                        : c <= 3
                        ? 'warning'
                        : 'danger'
                    }
                  >
                    {c === 0
                      ? '✓ All Clear'
                      : c <= 3
                      ? '⚠ Monitor'
                      : '✕ Investigate'}
                  </Badge>
                );
              })()}
            </div>
          </div>
        </Panel>

        <Panel title="Lifetime Totals">
          <div className="mt-3 space-y-4">
            {(
              [
                [
                  'Lifetime Revenue',
                  formatDollars(
                    exec?.lifetime_revenue_cents ?? 0,
                  ),
                  'text-2xl text-white',
                ],
                [
                  'Orders Processed',
                  (exec?.total_orders ?? 0).toLocaleString(),
                  'text-xl text-zinc-300',
                ],
                [
                  'Outstanding Points',
                  formatPoints(
                    exec?.outstanding_loyalty_points ?? 0,
                  ),
                  'text-lg text-amber-400',
                ],
              ] as [string, string, string][]
            ).map(([label, value, cls]) => (
              <div key={label}>
                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
                  {label}
                </p>
                <p className={`mt-0.5 font-black tabular-nums ${cls}`}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* PARTIAL ERROR BANNER */}
      {(data?.meta.error_count ?? 0) > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-amber-500/15 bg-amber-500/5 px-4 py-3">
          <p className="font-mono text-[11px] text-amber-400/80">
            ⚠ {data!.meta.error_count} section
            {data!.meta.error_count !== 1 ? 's' : ''} failed — data may be
            incomplete
          </p>
          <button
            onClick={manualRefresh}
            className="font-mono text-[10px] text-amber-400 underline decoration-dotted hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Header
// ──────────────────────────────────────────────────────────────────────────────

function DashboardHeader({
  refreshing,
  countdown,
  lastRefresh,
  onRefresh,
}: {
  refreshing: boolean;
  countdown: number;
  lastRefresh: Date | null;
  onRefresh: () => void;
}) {
  return (
    <header className="flex items-start justify-between">
      <div>
        <p className="mb-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
          <span className="inline-block h-px w-6 bg-amber-500/60" />
          Command Intelligence
        </p>
        <h1 className="text-2xl font-black tracking-tight text-white">
          Executive Overview
        </h1>
        {lastRefresh && (
          <p className="mt-1 font-mono text-[10px] text-zinc-600">
            Last sync{' '}
            <span className="text-zinc-400">
              {formatTime(lastRefresh)}
            </span>
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 pt-1">
        {refreshing && (
          <span className="animate-pulse font-mono text-[9px] uppercase tracking-[0.2em] text-amber-500">
            syncing
          </span>
        )}
        <span className="font-mono text-[10px] text-zinc-700 tabular-nums">
          T−{String(countdown).padStart(2, '0')}s
        </span>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="group relative overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-900 px-4 py-2 text-[11px] font-semibold text-zinc-400 transition-all hover:border-amber-500/40 hover:text-white disabled:opacity-30"
        >
          <span className="absolute inset-0 -translate-x-full bg-amber-500/5 transition-transform group-hover:translate-x-0" />
          <span className="relative">↻ Sync</span>
        </button>
      </div>
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ──────────────────────────────────────────────────────────────────────────────

export function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Top KPI row */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SkeletonBlock className="h-24 rounded-2xl bg-gray-900/60" />
        <SkeletonBlock className="h-24 rounded-2xl bg-gray-900/60" />
        <SkeletonBlock className="h-24 rounded-2xl bg-gray-900/60" />
        <SkeletonBlock className="h-24 rounded-2xl bg-gray-900/60" />
      </div>

      {/* Revenue / Channels row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-gray-900 bg-black/40 p-4">
          <div className="mb-4 h-4 w-32 rounded bg-gray-800/80" />
          <SkeletonBlock className="h-56 rounded-xl bg-gray-900/60" />
        </div>

        <div className="rounded-2xl border border-gray-900 bg-black/40 p-4">
          <div className="mb-4 h-4 w-40 rounded bg-gray-800/80" />
          <SkeletonGrid rows={4} columns={1} />
        </div>
      </div>

      {/* Bottom grids (risk / fraud / lifetime, etc.) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <SkeletonBlock className="h-32 rounded-2xl bg-gray-900/60" />
          <SkeletonBlock className="h-32 rounded-2xl bg-gray-900/60" />
        </div>
        <SkeletonBlock className="h-40 rounded-2xl bg-gray-900/60" />
        <SkeletonBlock className="h-40 rounded-2xl bg-gray-900/60" />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Error panel
// ──────────────────────────────────────────────────────────────────────────────

function DashboardError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-red-500/20 bg-[#0d0d10] p-8 text-center">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
          Dashboard Error
        </p>
        <p className="mt-3 text-sm font-bold text-red-400">
          {message}
        </p>
        <p className="mt-1 font-mono text-[10px] text-zinc-700">
          Check network or authentication
        </p>
        <button
          onClick={onRetry}
          className="mt-6 w-full rounded-lg border border-red-500/20 bg-red-500/8 py-2.5 text-xs font-bold text-red-400 transition-colors hover:bg-red-500/15"
        >
          ↻ Retry
        </button>
      </div>
    </div>
  );
}