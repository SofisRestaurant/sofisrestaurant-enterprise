// =============================================================================
// PATH: src/features/admin/dashboard/Dashboard.tsx
// =============================================================================
// Lean Operations Dashboard — Production Ready (2026)
// Focus:
// - Show the few metrics that actually help run the restaurant
// - Avoid noisy / low-confidence analytics
// - Render safely even when sections are missing or partially failing
// - Use only supported AdminPrimitives props
// =============================================================================

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
} from 'recharts';

import { useDashboard } from '@/hooks/useDashboard';
import { SkeletonBlock, SkeletonGrid } from '@/features/admin/ui';
import {
  Panel,
  KPICard,
  HealthBar,
  Badge,
  EmptyChart,
  EmptyState,
  TOOLTIP_STYLE,
} from '@/features/admin/ui/AdminPrimitives';

import { computeHealthScore, healthGradient, heatmapBarColor } from '@/lib/dashboard/health';
import {
  formatDollars,
  formatCompact,
  formatTime,
  computeTrend,
  buildRevenueChartData,
  buildHeatmapChartData,
  getPeakHour,
} from '@/lib/dashboard/formatters';

import type { RevenueRow, HeatmapRow } from '@/types/dashboard.types';

// =============================================================================
// Local safe types
// =============================================================================

type UnknownRecord = Record<string, unknown>;

type DashboardSection<T> = {
  data?: T;
  error?: unknown;
};

type ExecutiveData = {
  avg_order_value_cents?: unknown;
  total_orders?: unknown;
  lifetime_revenue_cents?: unknown;
  fraud_events_7d?: unknown;
};

type RevenueApiRow = {
  day?: unknown;
  date?: unknown;
  total_revenue_cents?: unknown;
  total_orders?: unknown;
  avg_order_value_cents?: unknown;
};

type TopItemRow = {
  item_name?: unknown;
  revenue_impact_cents?: unknown;
};

type RiskData = {
  disputes?: unknown;
  failed_payments?: unknown;
  cancelled_orders?: unknown;
};

type DashboardPayload = {
  executive?: DashboardSection<ExecutiveData>;
  revenue?: DashboardSection<RevenueApiRow[]>;
  topItems?: DashboardSection<TopItemRow[]>;
  risk?: DashboardSection<RiskData>;
  heatmap?: DashboardSection<HeatmapRow[]>;
  fraud?: DashboardSection<unknown>;
  meta?: {
    error_count?: unknown;
  };
};

type HealthModel = {
  score: number;
  grade: string;
  colorHex: string;
  breakdown: Array<{
    signal: string;
    label: string;
    score: number;
    detail?: string;
  }>;
};

type KPITrend = 'up' | 'down' | 'flat';

// =============================================================================
// Safe helpers
// =============================================================================

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asInt(value: unknown, fallback = 0): number {
  return Math.trunc(asNumber(value, fallback));
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function safeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function safeSumCents(rows: ReadonlyArray<{ total_revenue_cents?: unknown }>): number {
  return rows.reduce((sum, row) => sum + asNumber(row.total_revenue_cents, 0), 0);
}

function toTrend(value: unknown): KPITrend {
  if (value === 'up' || value === 'down' || value === 'flat') {
    return value;
  }

  if (isRecord(value) && typeof value.up === 'boolean') {
    return value.up ? 'up' : 'down';
  }

  return 'flat';
}

function normalizeHealth(raw: unknown): HealthModel | null {
  if (!isRecord(raw)) return null;

  const breakdown = Array.isArray(raw.breakdown)
    ? raw.breakdown.filter(isRecord).map((item) => ({
        signal: asString(item.signal, 'unknown'),
        label: asString(item.label, 'Signal'),
        score: asInt(item.score, 0),
        detail: asString(item.detail, '') || undefined,
      }))
    : [];

  return {
    score: asInt(raw.score, 0),
    grade: asString(raw.grade, 'N/A'),
    colorHex: asString(raw.colorHex, '#f59e0b'),
    breakdown,
  };
}

function formatRevenueDayLabel(row: RevenueApiRow, fallbackNumber: number): string {
  const raw = asString(row.day).trim() || asString(row.date).trim();
  if (!raw) return `D${fallbackNumber}`;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw.slice(0, 10);
  }

  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function topItemColor(name: string): string {
  const palette = ['#f59e0b', '#fb923c', '#a78bfa', '#60a5fa', '#34d399', '#f472b6'];
  const hash = Array.from(name).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return palette[hash % palette.length] ?? '#f59e0b';
}

// =============================================================================
// Main dashboard
// =============================================================================

export default function Dashboard() {
  const { data, loading, refreshing, lastRefresh, countdown, error, manualRefresh } =
    useDashboard();

  const payload = (data ?? {}) as DashboardPayload;

  const executive = payload.executive?.data;
  const revenueRows = safeArray(payload.revenue?.data);
  const topItems = safeArray(payload.topItems?.data);
  const risk = payload.risk?.data;
  const heatmapRows = safeArray(payload.heatmap?.data);
  const partialErrorCount = asInt(payload.meta?.error_count, 0);

  const health = useMemo(() => {
    if (!data) return null;
    return normalizeHealth(computeHealthScore(data));
  }, [data]);

  const today = revenueRows[revenueRows.length - 1];
  const yesterday = revenueRows[revenueRows.length - 2];

  const trailing7Revenue = safeSumCents(revenueRows.slice(-7));
  const previous7Revenue = safeSumCents(revenueRows.slice(-14, -7));

  const revenueChartInput: RevenueRow[] = revenueRows.map((row, idx) => ({
    day: formatRevenueDayLabel(row, idx + 1),
    total_revenue_cents: asNumber(row.total_revenue_cents, 0),
    total_orders: asNumber(row.total_orders, 0),
    avg_order_value_cents: asNumber(row.avg_order_value_cents, 0),
  }));

  const revenueChart = buildRevenueChartData(revenueChartInput, 14);
  const heatmapChart = buildHeatmapChartData(heatmapRows);
  const peakHour = getPeakHour(heatmapRows);
  const maxHeatmapRevenue = Math.max(...heatmapChart.map((row) => asNumber(row.revenue, 0)), 1);

  const topItemsNormalized = topItems
    .map((item) => ({
      name: asString(item.item_name, '').trim() || 'Unknown Item',
      revenueCents: asNumber(item.revenue_impact_cents, 0),
    }))
    .filter((item) => item.name.length > 0)
    .slice(0, 6);

  const topItemMax = Math.max(...topItemsNormalized.map((item) => item.revenueCents), 1);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error && !data) {
    return <DashboardError message={error} onRetry={manualRefresh} />;
  }

  return (
    <div className="space-y-5">
      <DashboardHeader
        refreshing={refreshing}
        countdown={countdown}
        lastRefresh={lastRefresh}
        onRefresh={manualRefresh}
      />

      {health ? (
        <section className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#0d0d10] p-6">
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-10"
            style={{
              background: `radial-gradient(circle, ${health.colorHex}, transparent 70%)`,
            }}
          />

          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-600">
                Restaurant Health
              </p>

              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-black tracking-tighter text-white tabular-nums">
                  {health.score}
                </span>
                <span className="text-sm text-zinc-600">/100</span>
                <Badge
                  tone={health.score >= 80 ? 'success' : health.score >= 60 ? 'warning' : 'danger'}
                >
                  {health.grade}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-420px">
              {health.breakdown.slice(0, 4).map((item) => {
                const tone =
                  item.score >= 80
                    ? 'success'
                    : item.score >= 60
                      ? 'warning'
                      : item.score >= 40
                        ? 'primary'
                        : 'danger';

                return (
                  <div
                    key={`${item.signal}:${item.label}`}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3"
                  >
                    <HealthBar label={item.label} value={item.score} tone={tone} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative mt-5 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              className="absolute left-0 top-0 h-full rounded-full transition-all duration-1000"
              style={{
                width: `${Math.max(0, Math.min(100, health.score))}%`,
                background: healthGradient(health.score),
              }}
            />
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard
          label="Today Revenue"
          value={formatDollars(asNumber(today?.total_revenue_cents, 0))}
          trend={toTrend(
            computeTrend(
              asNumber(today?.total_revenue_cents, 0),
              asNumber(yesterday?.total_revenue_cents, 0),
            ),
          )}
          accent="amber"
        />

        <KPICard
          label="Today Orders"
          value={formatCompact(asNumber(today?.total_orders, 0))}
          trend={toTrend(
            computeTrend(asNumber(today?.total_orders, 0), asNumber(yesterday?.total_orders, 0)),
          )}
          accent="sky"
        />

        <KPICard
          label="7-Day Revenue"
          value={formatDollars(trailing7Revenue)}
          trend={toTrend(computeTrend(trailing7Revenue, previous7Revenue))}
          accent="emerald"
        />

        <KPICard
          label="Avg Order Value"
          value={formatDollars(asNumber(executive?.avg_order_value_cents, 0))}
          sub={`${formatCompact(asNumber(executive?.total_orders, 0))} lifetime orders`}
          accent="slate"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel
          className="lg:col-span-2"
          title="Revenue Trend"
          subtitle="Last 14 revenue points"
          error={payload.revenue?.error != null}
        >
          {revenueChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={revenueChart} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="leanRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <XAxis
                  dataKey="day"
                  tick={{
                    fill: '#3f3f46',
                    fontSize: 9,
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{
                    fill: '#3f3f46',
                    fontSize: 9,
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: '#71717a' }}
                  formatter={(value: number | undefined) => [
                    `$${((value ?? 0) / 100).toLocaleString()}`,
                    'Revenue',
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#f59e0b"
                  strokeWidth={1.75}
                  fill="url(#leanRevenueGradient)"
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
            <EmptyChart
              title="No revenue data yet"
              description="Revenue history will show here once orders are flowing through the dashboard feed."
              height={220}
            />
          )}
        </Panel>

        <Panel
          title="Top Selling Items"
          subtitle="Best current earners"
          error={payload.topItems?.error != null}
        >
          <div className="space-y-3">
            {topItemsNormalized.length > 0 ? (
              topItemsNormalized.map((item) => {
                const pct = Math.max(0, Math.min(100, (item.revenueCents / topItemMax) * 100));

                return (
                  <div key={item.name}>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="truncate text-xs text-zinc-300">{item.name}</span>
                      <span className="font-mono text-[10px] font-bold text-amber-400 tabular-nums">
                        {formatDollars(item.revenueCents)}
                      </span>
                    </div>

                    <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: topItemColor(item.name),
                        }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState
                title="No item performance yet"
                description="Top items will appear here once sales analytics are available."
                icon="🍽"
              />
            )}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Hourly Revenue"
          subtitle="Useful for staffing and prep"
          error={payload.heatmap?.error != null}
          actions={
            peakHour ? (
              <div className="text-right">
                <p className="font-mono text-[9px] text-zinc-600">Peak hour</p>
                <p className="font-black text-amber-400">{asString(peakHour.label, '—')}</p>
              </div>
            ) : undefined
          }
        >
          {heatmapChart.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={heatmapChart} margin={{ top: 6, right: 0, left: -32, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{
                      fill: '#3f3f46',
                      fontSize: 8,
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                    }}
                    axisLine={false}
                    tickLine={false}
                    interval={2}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: '#71717a' }}
                    formatter={(value: number | undefined) => [
                      `$${((value ?? 0) / 100).toLocaleString()}`,
                      'Revenue',
                    ]}
                  />
                  <Bar dataKey="revenue" radius={[2, 2, 0, 0]}>
                    {heatmapChart.map((entry) => (
                      <Cell
                        key={entry.label}
                        fill={heatmapBarColor(asNumber(entry.revenue, 0), maxHeatmapRevenue)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <p className="mt-2 font-mono text-[9px] text-zinc-700">
                Use this to spot busy windows and schedule staff smarter.
              </p>
            </>
          ) : (
            <EmptyChart
              title="No hourly pattern yet"
              description="Hourly revenue will appear once enough order data is available."
              height={180}
            />
          )}
        </Panel>

        <Panel
          title="Operational Risk"
          subtitle="Keep an eye on payment and order issues"
          error={payload.risk?.error != null}
        >
          <div className="space-y-3">
            {(
              [
                ['Disputes', asInt(risk?.disputes, 0), 1, '⚖'],
                ['Failed Payments', asInt(risk?.failed_payments, 0), 3, '✕'],
                ['Cancellations', asInt(risk?.cancelled_orders, 0), 5, '◌'],
              ] as Array<[string, number, number, string]>
            ).map(([label, value, threshold, icon]) => {
              const elevated = value >= threshold;

              return (
                <div
                  key={label}
                  className={`flex items-center justify-between rounded-xl border px-3 py-3 ${
                    elevated ? 'border-red-500/20 bg-red-500/5' : 'border-zinc-800 bg-zinc-900/40'
                  }`}
                >
                  <span className="flex items-center gap-2.5 text-sm text-zinc-300">
                    <span
                      className={`font-mono text-[11px] ${
                        elevated ? 'text-red-400' : 'text-zinc-600'
                      }`}
                    >
                      {icon}
                    </span>
                    {label}
                  </span>

                  <Badge tone={elevated ? 'danger' : 'success'}>{value}</Badge>
                </div>
              );
            })}

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
                Fraud events (7d)
              </p>
              <p className="mt-1 text-2xl font-black text-white tabular-nums">
                {asInt(executive?.fraud_events_7d, 0)}
              </p>
            </div>
          </div>
        </Panel>
      </div>

      {partialErrorCount > 0 ? (
        <div className="flex items-center justify-between rounded-xl border border-amber-500/15 bg-amber-500/5 px-4 py-3">
          <p className="font-mono text-[11px] text-amber-400/80">
            ⚠ {partialErrorCount} section{partialErrorCount !== 1 ? 's' : ''} failed — some data may
            be incomplete
          </p>
          <button
            type="button"
            onClick={manualRefresh}
            className="font-mono text-[10px] text-amber-400 underline decoration-dotted hover:no-underline"
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}

// =============================================================================
// Header
// =============================================================================

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
    <header className="flex items-start justify-between gap-4">
      <div>
        <p className="mb-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
          <span className="inline-block h-px w-6 bg-amber-500/60" />
          Operations Dashboard
        </p>
        <h1 className="text-2xl font-black tracking-tight text-white">Executive Overview</h1>
        {lastRefresh ? (
          <p className="mt-1 font-mono text-[10px] text-zinc-600">
            Last sync <span className="text-zinc-400">{formatTime(lastRefresh)}</span>
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3 pt-1">
        {refreshing ? (
          <span className="animate-pulse font-mono text-[9px] uppercase tracking-[0.2em] text-amber-500">
            syncing
          </span>
        ) : null}

        <span className="font-mono text-[10px] text-zinc-700 tabular-nums">
          T−{String(Math.max(0, countdown)).padStart(2, '0')}s
        </span>

        <button
          type="button"
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

// =============================================================================
// Loading
// =============================================================================

export function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <SkeletonGrid count={4} columns={4} itemHeight={96} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-gray-900 bg-black/40 p-4">
          <div className="mb-4 h-4 w-40 rounded bg-gray-800/80" />
          <SkeletonBlock className="h-56 rounded-xl bg-gray-900/60" />
        </div>

        <div className="rounded-2xl border border-gray-900 bg-black/40 p-4">
          <div className="mb-4 h-4 w-36 rounded bg-gray-800/80" />
          <div className="space-y-3">
            <SkeletonBlock className="h-10 rounded-xl bg-gray-900/60" />
            <SkeletonBlock className="h-10 rounded-xl bg-gray-900/60" />
            <SkeletonBlock className="h-10 rounded-xl bg-gray-900/60" />
            <SkeletonBlock className="h-10 rounded-xl bg-gray-900/60" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonBlock className="h-60 rounded-2xl bg-gray-900/60" />
        <SkeletonBlock className="h-60 rounded-2xl bg-gray-900/60" />
      </div>
    </div>
  );
}

// =============================================================================
// Error
// =============================================================================

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-red-500/20 bg-[#0d0d10] p-8 text-center">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
          Dashboard Error
        </p>
        <p className="mt-3 text-sm font-bold text-red-400">{message}</p>
        <p className="mt-1 font-mono text-[10px] text-zinc-700">
          Check network, auth, or data source health
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 w-full rounded-lg border border-red-500/20 bg-red-500/8 py-2.5 text-xs font-bold text-red-400 transition-colors hover:bg-red-500/15"
        >
          ↻ Retry
        </button>
      </div>
    </div>
  );
}