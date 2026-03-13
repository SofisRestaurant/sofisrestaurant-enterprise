import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';

import { supabase } from '@/lib/supabase/supabaseClient';
import type { Database } from '@/lib/supabase/database.types';
import { Alert, Badge, KPICard, LoadingSpinner, MONO, Panel, Table } from '../ui/AdminPrimitives';

type Db = Database;
type RevenueSummaryRow = Db['public']['Views']['admin_revenue_summary']['Row'];
type ProfitSnapshotRow = Db['public']['Tables']['admin_profit_snapshot']['Row'];

type WindowDays = 7 | 14 | 30 | 90;
type Trend = 'up' | 'down' | 'flat';

type RevenuePoint = {
  day: string;
  grossRevenueCents: number;
  netRevenueCents: number;
  paidOrdersCount: number;
  refundedCents: number;
  refundsCount: number;
};

type RevenueTotals = {
  grossRevenueCents: number;
  netRevenueCents: number;
  paidOrdersCount: number;
  refundedCents: number;
  refundsCount: number;
};

type RevenueInsight = {
  key: 'best-net' | 'best-gross' | 'refund-heavy';
  label: string;
  day: string | null;
  valueCents: number;
  helper: string;
  accent: 'emerald' | 'amber' | 'red' | 'sky' | 'slate';
};

type RevenueState = {
  rawRows: RevenuePoint[];
  profitSnapshot: ProfitSnapshotRow | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  fetchedAt: string | null;
};

export type AdminRevenuePanelProps = {
  className?: string;
  defaultWindowDays?: WindowDays;
  autoRefreshMs?: number;
  defaultAutoRefreshEnabled?: boolean;
};

const WINDOW_OPTIONS: readonly WindowDays[] = [7, 14, 30, 90];
const DEFAULT_WINDOW_DAYS: WindowDays = 30;
const DEFAULT_AUTO_REFRESH_MS = 60_000;
const MAX_WINDOW_DAYS = 90;
const MS_PER_DAY = 86_400_000;

const GRID_LINES = [
  { key: 'line-top', ratio: 0 },
  { key: 'line-upper', ratio: 0.33 },
  { key: 'line-lower', ratio: 0.66 },
  { key: 'line-bottom', ratio: 1 },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isWindowDays(value: number): value is WindowDays {
  return value === 7 || value === 14 || value === 30 || value === 90;
}

function toIsoDayUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDayUtc(day: string): Date | null {
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function centsToDollars(cents: number): number {
  return cents / 100;
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(centsToDollars(cents));
}

function formatExactMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(centsToDollars(cents));
}

function formatCompactMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(centsToDollars(cents));
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value / 100);
}

function formatSignedPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.0%';
  }

  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatDateLabel(day: string): string {
  const parsed = parseIsoDayUtc(day);
  if (!parsed) {
    return day;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function formatDateTimeLabel(iso: string | null): string {
  if (!iso) {
    return 'Never';
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(value);
}

function trendFromDelta(current: number, previous: number): Trend {
  if (current === previous) {
    return 'flat';
  }

  return current > previous ? 'up' : 'down';
}

function percentDelta(current: number, previous: number): number {
  if (previous === 0 && current === 0) {
    return 0;
  }

  if (previous === 0) {
    return 100;
  }

  return ((current - previous) / previous) * 100;
}

function aggregateRevenue(points: readonly RevenuePoint[]): RevenueTotals {
  return points.reduce<RevenueTotals>(
    (acc, point) => ({
      grossRevenueCents: acc.grossRevenueCents + point.grossRevenueCents,
      netRevenueCents: acc.netRevenueCents + point.netRevenueCents,
      paidOrdersCount: acc.paidOrdersCount + point.paidOrdersCount,
      refundedCents: acc.refundedCents + point.refundedCents,
      refundsCount: acc.refundsCount + point.refundsCount,
    }),
    {
      grossRevenueCents: 0,
      netRevenueCents: 0,
      paidOrdersCount: 0,
      refundedCents: 0,
      refundsCount: 0,
    },
  );
}

function averageOrderValueCents(totals: RevenueTotals): number {
  if (totals.paidOrdersCount <= 0) {
    return 0;
  }

  return Math.round(totals.netRevenueCents / totals.paidOrdersCount);
}

function refundRatePercent(totals: RevenueTotals): number {
  if (totals.grossRevenueCents <= 0) {
    return 0;
  }

  return (totals.refundedCents / totals.grossRevenueCents) * 100;
}

function netRetentionPercent(totals: RevenueTotals): number {
  if (totals.grossRevenueCents <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (totals.netRevenueCents / totals.grossRevenueCents) * 100));
}

function pointCountDelta(current: number, previous: number): string {
  const delta = current - previous;
  if (delta === 0) {
    return '0';
  }

  return delta > 0 ? `+${delta}` : `${delta}`;
}

function normalizeRevenueRow(row: RevenueSummaryRow): RevenuePoint | null {
  const day = normalizeNullableString(row.day);
  if (!day) {
    return null;
  }

  const parsed = parseIsoDayUtc(day);
  if (!parsed) {
    return null;
  }

  return {
    day,
    grossRevenueCents: normalizeNumber(row.gross_revenue_cents),
    netRevenueCents: normalizeNumber(row.net_revenue_cents),
    paidOrdersCount: normalizeNumber(row.paid_orders_count),
    refundedCents: normalizeNumber(row.refunded_cents),
    refundsCount: normalizeNumber(row.refunds_count),
  };
}

function fillRevenueSeries(rawRows: readonly RevenuePoint[], days: number): RevenuePoint[] {
  const utcToday = parseIsoDayUtc(toIsoDayUtc(new Date())) ?? new Date();
  const endDay = utcToday;
  const startDay = addUtcDays(endDay, -(days - 1));

  const rowMap = new Map<string, RevenuePoint>();
  for (const row of rawRows) {
    rowMap.set(row.day, row);
  }

  const filled: RevenuePoint[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = addUtcDays(startDay, index);
    const key = toIsoDayUtc(date);
    const existing = rowMap.get(key);

    filled.push(
      existing ?? {
        day: key,
        grossRevenueCents: 0,
        netRevenueCents: 0,
        paidOrdersCount: 0,
        refundedCents: 0,
        refundsCount: 0,
      },
    );
  }

  return filled;
}

function buildCsv(points: readonly RevenuePoint[]): string {
  const header = [
    'day',
    'gross_revenue_cents',
    'net_revenue_cents',
    'paid_orders_count',
    'refunded_cents',
    'refunds_count',
  ].join(',');

  const rows = points.map((point) =>
    [
      point.day,
      point.grossRevenueCents,
      point.netRevenueCents,
      point.paidOrdersCount,
      point.refundedCents,
      point.refundsCount,
    ].join(','),
  );

  return [header, ...rows].join('\n');
}

function findLargestByCents(
  points: readonly RevenuePoint[],
  selector: (point: RevenuePoint) => number,
): RevenuePoint | null {
  if (points.length === 0) {
    return null;
  }

  let best: RevenuePoint | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    const value = selector(point);
    if (value > bestValue) {
      best = point;
      bestValue = value;
    }
  }

  return best;
}

function describeError(error: unknown): string {
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (isRecord(error) && typeof error.message === 'string' && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unable to load revenue analytics right now.';
}

function buildInsights(points: readonly RevenuePoint[]): RevenueInsight[] {
  const bestNet = findLargestByCents(points, (point) => point.netRevenueCents);
  const bestGross = findLargestByCents(points, (point) => point.grossRevenueCents);
  const heaviestRefund = findLargestByCents(points, (point) => point.refundedCents);

  return [
    {
      key: 'best-net',
      label: 'Best net day',
      day: bestNet?.day ?? null,
      valueCents: bestNet?.netRevenueCents ?? 0,
      helper: 'Highest retained revenue day in the selected window.',
      accent: 'emerald',
    },
    {
      key: 'best-gross',
      label: 'Best gross day',
      day: bestGross?.day ?? null,
      valueCents: bestGross?.grossRevenueCents ?? 0,
      helper: 'Strongest top-line sales day before refunds.',
      accent: 'sky',
    },
    {
      key: 'refund-heavy',
      label: 'Refund-heavy day',
      day: heaviestRefund?.day ?? null,
      valueCents: heaviestRefund?.refundedCents ?? 0,
      helper: 'Highest refunded amount in the selected window.',
      accent: 'red',
    },
  ];
}

function nowIso(): string {
  return new Date().toISOString();
}

function qualityTone(
  value: number,
  thresholds: { good: number; warn: number },
): 'good' | 'warn' | 'bad' {
  if (value >= thresholds.good) {
    return 'good';
  }

  if (value >= thresholds.warn) {
    return 'warn';
  }

  return 'bad';
}

function inverseQualityTone(
  value: number,
  thresholds: { good: number; warn: number },
): 'good' | 'warn' | 'bad' {
  if (value <= thresholds.good) {
    return 'good';
  }

  if (value <= thresholds.warn) {
    return 'warn';
  }

  return 'bad';
}

function toneClasses(tone: 'good' | 'warn' | 'bad'): string {
  if (tone === 'good') {
    return 'bg-emerald-400';
  }

  if (tone === 'warn') {
    return 'bg-amber-400';
  }

  return 'bg-red-400';
}

function accentBadgeTone(
  accent: RevenueInsight['accent'],
): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (accent === 'red') {
    return 'danger';
  }

  if (accent === 'emerald') {
    return 'success';
  }

  if (accent === 'amber') {
    return 'warning';
  }

  if (accent === 'sky') {
    return 'info';
  }

  return 'neutral';
}

function MetricBar({
  label,
  value,
  helperText,
  tone,
}: {
  label: string;
  value: number;
  helperText: string;
  tone: 'good' | 'warn' | 'bad';
}) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
          {label}
        </span>
        <span className={clsx('text-sm text-zinc-100', MONO.value)}>
          {formatPercent(safeValue)}
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-zinc-900" aria-hidden="true">
        <div
          className={clsx('h-full rounded-full transition-[width]', toneClasses(tone))}
          style={{ width: `${safeValue}%` }}
        />
      </div>

      <p className="text-[11px] text-zinc-500">{helperText}</p>
    </div>
  );
}

function MetricSkeletonCard({ keyName }: { keyName: string }) {
  return (
    <div
      key={keyName}
      className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4"
      aria-hidden="true"
    >
      <div className="h-3 w-24 animate-pulse rounded bg-zinc-800" />
      <div className="mt-3 h-8 w-28 animate-pulse rounded bg-zinc-900" />
      <div className="mt-2 h-3 w-40 animate-pulse rounded bg-zinc-900" />
    </div>
  );
}

function ChartEmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-6 text-center">
      <p className="text-sm font-medium text-zinc-200">No revenue activity</p>
      <p className="mt-1 text-xs text-zinc-500">
        No gross, net, or refunded amounts were recorded in the selected window.
      </p>
    </div>
  );
}

function RevenueTimelineChart({ data, idBase }: { data: readonly RevenuePoint[]; idBase: string }) {
  const chartData = useMemo(() => data.filter((point) => point.day.length > 0), [data]);

  const chartMax = useMemo(() => {
    let maxValue = 0;
    for (const point of chartData) {
      maxValue = Math.max(
        maxValue,
        point.grossRevenueCents,
        point.netRevenueCents,
        point.refundedCents,
      );
    }
    return maxValue;
  }, [chartData]);

  const geometry = useMemo(() => {
    const width = 760;
    const height = 240;
    const left = 16;
    const top = 16;
    const bottom = 32;
    const innerWidth = width - left - 16;
    const innerHeight = height - top - bottom;

    return { width, height, left, top, bottom, innerWidth, innerHeight };
  }, []);

  const pointX = useCallback(
    (index: number, length: number): number => {
      if (length <= 1) {
        return geometry.left + geometry.innerWidth / 2;
      }

      return geometry.left + (index / (length - 1)) * geometry.innerWidth;
    },
    [geometry.innerWidth, geometry.left],
  );

  const pointY = useCallback(
    (value: number): number => {
      return geometry.top + geometry.innerHeight - (value / chartMax) * geometry.innerHeight;
    },
    [chartMax, geometry.innerHeight, geometry.top],
  );

  const grossLine = useMemo(() => {
    if (chartData.length === 0 || chartMax <= 0) {
      return '';
    }

    return chartData
      .map(
        (point, index) => `${pointX(index, chartData.length)},${pointY(point.grossRevenueCents)}`,
      )
      .join(' ');
  }, [chartData, chartMax, pointX, pointY]);

  const netLine = useMemo(() => {
    if (chartData.length === 0 || chartMax <= 0) {
      return '';
    }

    return chartData
      .map((point, index) => `${pointX(index, chartData.length)},${pointY(point.netRevenueCents)}`)
      .join(' ');
  }, [chartData, chartMax, pointX, pointY]);

  const bars = useMemo(() => {
    if (chartData.length === 0 || chartMax <= 0) {
      return [];
    }

    const barWidth = Math.max(6, geometry.innerWidth / Math.max(chartData.length * 2.5, 10));

    return chartData.map((point, index) => {
      const xCenter = pointX(index, chartData.length);
      const height = (point.refundedCents / chartMax) * geometry.innerHeight;
      const y = geometry.top + geometry.innerHeight - height;

      return {
        key: point.day,
        x: xCenter - barWidth / 2,
        y,
        width: barWidth,
        height,
        label: `${formatDateLabel(point.day)} refunded ${formatMoney(point.refundedCents)}`,
      };
    });
  }, [chartData, chartMax, geometry.innerHeight, geometry.innerWidth, geometry.top, pointX]);

  const xAxisLabels = useMemo(() => {
    if (chartData.length === 0) {
      return [];
    }

    const first = chartData[0];
    const middle = chartData[Math.floor(chartData.length / 2)];
    const last = chartData[chartData.length - 1];

    const labelCandidates = [first, middle, last].filter(
      (candidate, index, list) => list.findIndex((entry) => entry.day === candidate.day) === index,
    );

    return labelCandidates.map((point) => {
      const index = chartData.findIndex((entry) => entry.day === point.day);
      return {
        key: point.day,
        x: pointX(index, chartData.length),
        label: formatDateLabel(point.day),
      };
    });
  }, [chartData, pointX]);

  if (chartData.length === 0 || chartMax <= 0) {
    return <ChartEmptyState />;
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Revenue timeline</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Gross and net revenue with refunded amounts over the selected window.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
            Gross
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
            Net
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-red-400/50" aria-hidden="true" />
            Refunds
          </span>
        </div>
      </div>

      <div
        role="img"
        aria-label="Revenue chart showing gross revenue, net revenue, and refunded amounts by day."
        className="w-full overflow-x-auto"
      >
        <svg
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          className="h-240px min-w-680px w-full"
          aria-labelledby={`${idBase}-title ${idBase}-desc`}
        >
          <title id={`${idBase}-title`}>Revenue trend chart</title>
          <desc id={`${idBase}-desc`}>
            Line chart of gross and net revenue with refund bars for each day in the selected range.
          </desc>

          {GRID_LINES.map((line) => {
            const y = geometry.top + line.ratio * geometry.innerHeight;

            return (
              <line
                key={line.key}
                x1={geometry.left}
                y1={y}
                x2={geometry.left + geometry.innerWidth}
                y2={y}
                stroke="rgba(63,63,70,0.55)"
                strokeWidth="1"
              />
            );
          })}

          {bars.map((bar) => (
            <g key={bar.key}>
              <title>{bar.label}</title>
              <rect
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx={4}
                fill="rgba(248,113,113,0.35)"
              />
            </g>
          ))}

          <polyline
            fill="none"
            stroke="rgba(251,191,36,0.95)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={grossLine}
          />

          <polyline
            fill="none"
            stroke="rgba(52,211,153,0.95)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={netLine}
          />

          {xAxisLabels.map((label) => (
            <text
              key={label.key}
              x={label.x}
              y={geometry.height - 8}
              textAnchor="middle"
              fill="rgba(161,161,170,0.95)"
              fontSize="11"
            >
              {label.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

function AdminRevenuePanelComponent({
  className,
  defaultWindowDays = DEFAULT_WINDOW_DAYS,
  autoRefreshMs = DEFAULT_AUTO_REFRESH_MS,
  defaultAutoRefreshEnabled = true,
}: AdminRevenuePanelProps) {
  const panelId = useId();
  const requestSeqRef = useRef(0);

  const [windowDays, setWindowDays] = useState<WindowDays>(
    isWindowDays(defaultWindowDays) ? defaultWindowDays : DEFAULT_WINDOW_DAYS,
  );
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(defaultAutoRefreshEnabled);
  const [state, setState] = useState<RevenueState>({
    rawRows: [],
    profitSnapshot: null,
    loading: true,
    refreshing: false,
    error: null,
    fetchedAt: null,
  });

  const loadRevenue = useCallback(
    async (mode: 'initial' | 'manual' | 'poll'): Promise<void> => {
      const requestId = requestSeqRef.current + 1;
      requestSeqRef.current = requestId;

      setState((current) => ({
        ...current,
        loading: mode === 'initial' ? true : current.loading,
        refreshing: mode !== 'initial',
        error: mode === 'initial' ? null : current.error,
      }));

      try {
        const todayUtc = parseIsoDayUtc(toIsoDayUtc(new Date())) ?? new Date();
        const lookbackDays = Math.max(windowDays * 2, MAX_WINDOW_DAYS);
        const cutoff = addUtcDays(todayUtc, -(lookbackDays - 1));
        const cutoffDay = toIsoDayUtc(cutoff);

        const revenueQuery = supabase
          .from('admin_revenue_summary')
          .select(
            'day, gross_revenue_cents, net_revenue_cents, paid_orders_count, refunded_cents, refunds_count',
          )
          .gte('day', cutoffDay)
          .order('day', { ascending: true });

        const profitQuery = supabase
          .from('admin_profit_snapshot')
          .select('singleton_id, total_gross_profit_cents, updated_at')
          .eq('singleton_id', true)
          .maybeSingle();

        const [revenueResult, profitResult] = await Promise.all([revenueQuery, profitQuery]);

        if (requestSeqRef.current !== requestId) {
          return;
        }

        if (revenueResult.error) {
          setState((current) => ({
            ...current,
            loading: false,
            refreshing: false,
            error: describeError(revenueResult.error),
          }));
          return;
        }

        const normalizedRows = (revenueResult.data ?? [])
          .map((row) => normalizeRevenueRow(row))
          .filter((row): row is RevenuePoint => row !== null);

        const normalizedProfit: ProfitSnapshotRow | null =
          profitResult.error || !profitResult.data
            ? null
            : {
                singleton_id: Boolean(profitResult.data.singleton_id),
                total_gross_profit_cents: normalizeNumber(
                  profitResult.data.total_gross_profit_cents,
                ),
                updated_at: normalizeNullableString(profitResult.data.updated_at) ?? nowIso(),
              };

        setState({
          rawRows: normalizedRows,
          profitSnapshot: normalizedProfit,
          loading: false,
          refreshing: false,
          error: null,
          fetchedAt: nowIso(),
        });
      } catch (error: unknown) {
        if (requestSeqRef.current !== requestId) {
          return;
        }

        setState((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error: describeError(error),
        }));
      }
    },
    [windowDays],
  );

  useEffect(() => {
    void loadRevenue('initial');
  }, [loadRevenue]);

  useEffect(() => {
    if (!autoRefreshEnabled || autoRefreshMs <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void loadRevenue('poll');
    }, autoRefreshMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [autoRefreshEnabled, autoRefreshMs, loadRevenue]);

  const filledSeries = useMemo(
    () => fillRevenueSeries(state.rawRows, windowDays * 2),
    [state.rawRows, windowDays],
  );

  const previousSeries = useMemo(
    () => filledSeries.slice(0, windowDays),
    [filledSeries, windowDays],
  );

  const currentSeries = useMemo(() => filledSeries.slice(windowDays), [filledSeries, windowDays]);

  const currentTotals = useMemo(() => aggregateRevenue(currentSeries), [currentSeries]);
  const previousTotals = useMemo(() => aggregateRevenue(previousSeries), [previousSeries]);

  const deltaNet = useMemo(
    () => percentDelta(currentTotals.netRevenueCents, previousTotals.netRevenueCents),
    [currentTotals.netRevenueCents, previousTotals.netRevenueCents],
  );

  const deltaGross = useMemo(
    () => percentDelta(currentTotals.grossRevenueCents, previousTotals.grossRevenueCents),
    [currentTotals.grossRevenueCents, previousTotals.grossRevenueCents],
  );

  const deltaOrders = useMemo(
    () => percentDelta(currentTotals.paidOrdersCount, previousTotals.paidOrdersCount),
    [currentTotals.paidOrdersCount, previousTotals.paidOrdersCount],
  );

  const currentAovCents = useMemo(() => averageOrderValueCents(currentTotals), [currentTotals]);
  const previousAovCents = useMemo(() => averageOrderValueCents(previousTotals), [previousTotals]);

  const refundRate = useMemo(() => refundRatePercent(currentTotals), [currentTotals]);
  const previousRefundRate = useMemo(() => refundRatePercent(previousTotals), [previousTotals]);
  const retentionRate = useMemo(() => netRetentionPercent(currentTotals), [currentTotals]);

  const refundRateDelta = useMemo(
    () => percentDelta(refundRate, previousRefundRate),
    [refundRate, previousRefundRate],
  );

  const insights = useMemo(() => buildInsights(currentSeries), [currentSeries]);
  const csvContent = useMemo(() => buildCsv(currentSeries), [currentSeries]);

  const nonZeroDays = useMemo(
    () =>
      currentSeries.filter(
        (point) =>
          point.grossRevenueCents > 0 ||
          point.netRevenueCents > 0 ||
          point.refundedCents > 0 ||
          point.paidOrdersCount > 0,
      ).length,
    [currentSeries],
  );

  const statusMessage = useMemo(() => {
    if (state.loading) {
      return 'Loading revenue analytics.';
    }

    if (state.refreshing) {
      return 'Refreshing revenue analytics.';
    }

    if (state.error) {
      return `Revenue analytics error: ${state.error}`;
    }

    if (state.fetchedAt) {
      return `Revenue analytics updated ${formatDateTimeLabel(state.fetchedAt)}.`;
    }

    return 'Revenue analytics ready.';
  }, [state.error, state.fetchedAt, state.loading, state.refreshing]);

  const lastUpdatedLabel = useMemo(() => formatDateTimeLabel(state.fetchedAt), [state.fetchedAt]);

  const profitSnapshotLabel = useMemo(
    () => formatDateTimeLabel(state.profitSnapshot?.updated_at ?? null),
    [state.profitSnapshot?.updated_at],
  );

  const refreshNow = useCallback(() => {
    void loadRevenue('manual');
  }, [loadRevenue]);

  const handleDownloadCsv = useCallback(() => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = objectUrl;
    anchor.download = `admin-revenue-${windowDays}d.csv`;
    anchor.click();

    window.URL.revokeObjectURL(objectUrl);
  }, [csvContent, windowDays]);

  const retentionTone = useMemo(
    () => qualityTone(retentionRate, { good: 85, warn: 70 }),
    [retentionRate],
  );

  const refundTone = useMemo(
    () => inverseQualityTone(refundRate, { good: 5, warn: 12 }),
    [refundRate],
  );

  const panelStatusTone = state.error ? 'danger' : state.refreshing ? 'warning' : 'success';

  return (
    <Panel
      title="Revenue"
      subtitle={`Rolling ${windowDays}-day finance summary`}
      error={Boolean(state.error)}
      className={className}
      aria-busy={state.loading || state.refreshing}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={panelStatusTone}>
            {state.error ? 'Issue' : state.refreshing ? 'Refreshing' : 'Healthy'}
          </Badge>

          <button
            type="button"
            onClick={() => setAutoRefreshEnabled((current) => !current)}
            className={clsx(
              'rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]',
              autoRefreshEnabled
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-zinc-700 bg-zinc-900 text-zinc-300',
            )}
            aria-pressed={autoRefreshEnabled}
          >
            Auto refresh {autoRefreshEnabled ? 'on' : 'off'}
          </button>

          <button
            type="button"
            onClick={refreshNow}
            disabled={state.loading || state.refreshing}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-200 transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.refreshing ? <LoadingSpinner size="sm" /> : <span aria-hidden="true">↻</span>}
            Refresh
          </button>

          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={state.loading || currentSeries.length === 0}
            className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-200 transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      }
    >
      <div aria-live="polite" className="sr-only">
        {statusMessage}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {WINDOW_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setWindowDays(option)}
                aria-pressed={windowDays === option}
                className={clsx(
                  'rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition',
                  windowDays === option
                    ? 'bg-amber-400 text-black'
                    : 'border border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-500',
                )}
              >
                {option}d
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
            <span>
              Last updated <span className={MONO.value}>{lastUpdatedLabel}</span>
            </span>
            <span>
              Active days <span className={MONO.value}>{formatInteger(nonZeroDays)}</span>
            </span>
          </div>
        </div>

        {state.error ? (
          <Alert
            tone="danger"
            title="Revenue load failed"
            message={state.error}
            action={
              <button
                type="button"
                onClick={refreshNow}
                className="rounded-full border border-red-400/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-red-100 hover:bg-red-500/10"
              >
                Retry
              </button>
            }
          />
        ) : null}

        {state.loading ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricSkeletonCard keyName="skeleton-net" />
              <MetricSkeletonCard keyName="skeleton-gross" />
              <MetricSkeletonCard keyName="skeleton-refunds" />
              <MetricSkeletonCard keyName="skeleton-orders" />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <LoadingSpinner size="sm" />
                  <span className="text-sm text-zinc-400">Loading chart…</span>
                </div>
                <div className="h-240px animate-pulse rounded-xl bg-zinc-900/70" />
              </div>

              <div className="space-y-4">
                <MetricSkeletonCard keyName="skeleton-quality-1" />
                <MetricSkeletonCard keyName="skeleton-quality-2" />
                <MetricSkeletonCard keyName="skeleton-quality-3" />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KPICard
                label="Net revenue"
                value={formatCompactMoney(currentTotals.netRevenueCents)}
                sub={`${formatMoney(currentTotals.netRevenueCents)} • ${formatSignedPercent(deltaNet)} vs prior ${windowDays}d`}
                accent="emerald"
                trend={trendFromDelta(
                  currentTotals.netRevenueCents,
                  previousTotals.netRevenueCents,
                )}
              />

              <KPICard
                label="Gross revenue"
                value={formatCompactMoney(currentTotals.grossRevenueCents)}
                sub={`${formatMoney(currentTotals.grossRevenueCents)} • ${formatSignedPercent(deltaGross)} vs prior ${windowDays}d`}
                accent="sky"
                trend={trendFromDelta(
                  currentTotals.grossRevenueCents,
                  previousTotals.grossRevenueCents,
                )}
              />

              <KPICard
                label="Refunded"
                value={formatCompactMoney(currentTotals.refundedCents)}
                sub={`${formatInteger(currentTotals.refundsCount)} refunds • rate ${formatPercent(refundRate)}`}
                accent="red"
                trend={trendFromDelta(previousTotals.refundedCents, currentTotals.refundedCents)}
              />

              <KPICard
                label="Paid orders"
                value={formatInteger(currentTotals.paidOrdersCount)}
                sub={`AOV ${formatMoney(currentAovCents)} • ${formatSignedPercent(deltaOrders)} vs prior ${windowDays}d`}
                accent="amber"
                trend={trendFromDelta(
                  currentTotals.paidOrdersCount,
                  previousTotals.paidOrdersCount,
                )}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
              <RevenueTimelineChart data={currentSeries} idBase={panelId} />

              <div className="space-y-4">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <h3 className="text-sm font-semibold text-zinc-100">Revenue quality</h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Retention, refund pressure, and average order size.
                  </p>

                  <div className="mt-4 space-y-4">
                    <MetricBar
                      label="Net retention"
                      value={retentionRate}
                      tone={retentionTone}
                      helperText={`${formatMoney(currentTotals.netRevenueCents)} retained from ${formatMoney(currentTotals.grossRevenueCents)} gross`}
                    />

                    <MetricBar
                      label="Refund pressure"
                      value={Math.min(100, refundRate)}
                      tone={refundTone}
                      helperText={`Change vs previous window ${formatSignedPercent(refundRateDelta)}`}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                          Avg order value
                        </div>
                        <div
                          className={clsx('mt-1 text-lg font-semibold text-zinc-100', MONO.value)}
                        >
                          {formatMoney(currentAovCents)}
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                          Prev {formatMoney(previousAovCents)}
                        </div>
                      </div>

                      <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                          Lifetime gross profit
                        </div>
                        <div
                          className={clsx('mt-1 text-lg font-semibold text-zinc-100', MONO.value)}
                        >
                          {formatCompactMoney(state.profitSnapshot?.total_gross_profit_cents ?? 0)}
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                          Updated {profitSnapshotLabel}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {insights.map((insight) => (
                  <div
                    key={insight.key}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                          {insight.label}
                        </div>
                        <div
                          className={clsx('mt-1 text-xl font-semibold text-zinc-100', MONO.value)}
                        >
                          {formatCompactMoney(insight.valueCents)}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">{insight.helper}</div>
                      </div>

                      <Badge tone={accentBadgeTone(insight.accent)}>
                        {insight.day ? formatDateLabel(insight.day) : 'No data'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">Daily breakdown</h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Aggregated daily revenue from the admin revenue summary view.
                    </p>
                  </div>
                  <Badge tone="info">{windowDays} days</Badge>
                </div>

                <div className="px-4 py-3">
                  <Table className="min-w-full">
                    <thead>
                      <tr className="border-b border-zinc-800 text-left text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                        <th className="px-2 py-2 font-medium">Day</th>
                        <th className="px-2 py-2 font-medium">Gross</th>
                        <th className="px-2 py-2 font-medium">Net</th>
                        <th className="px-2 py-2 font-medium">Refunds</th>
                        <th className="px-2 py-2 font-medium">Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentSeries
                        .slice()
                        .reverse()
                        .map((point) => (
                          <tr
                            key={point.day}
                            className="border-b border-zinc-900 text-sm text-zinc-200 last:border-b-0"
                          >
                            <td className="px-2 py-2">
                              <div className="font-medium text-zinc-100">
                                {formatDateLabel(point.day)}
                              </div>
                              <div className="text-[11px] text-zinc-500">{point.day}</div>
                            </td>
                            <td className={clsx('px-2 py-2 text-zinc-200', MONO.value)}>
                              {formatExactMoney(point.grossRevenueCents)}
                            </td>
                            <td className={clsx('px-2 py-2 text-emerald-300', MONO.value)}>
                              {formatExactMoney(point.netRevenueCents)}
                            </td>
                            <td className={clsx('px-2 py-2 text-red-300', MONO.value)}>
                              {formatExactMoney(point.refundedCents)}
                            </td>
                            <td className={clsx('px-2 py-2 text-zinc-200', MONO.value)}>
                              {formatInteger(point.paidOrdersCount)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </Table>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <h3 className="text-sm font-semibold text-zinc-100">Window summary</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Quick operators view for the selected revenue range.
                </p>

                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                        Net vs gross
                      </span>
                      <span className={clsx('text-sm text-zinc-100', MONO.value)}>
                        {formatPercent(retentionRate)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Higher is better. This shows how much gross revenue was retained after
                      refunds.
                    </p>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                        Refund count
                      </span>
                      <span className={clsx('text-sm text-zinc-100', MONO.value)}>
                        {formatInteger(currentTotals.refundsCount)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {formatMoney(currentTotals.refundedCents)} refunded across the selected
                      period.
                    </p>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                        Prior window comparison
                      </span>
                      <span
                        className={clsx(
                          'text-sm',
                          deltaNet >= 0 ? 'text-emerald-300' : 'text-red-300',
                          MONO.value,
                        )}
                      >
                        {formatSignedPercent(deltaNet)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Net revenue compared with the previous {windowDays}-day window.
                    </p>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                        Order velocity
                      </span>
                      <span className={clsx('text-sm text-zinc-100', MONO.value)}>
                        {formatInteger(currentTotals.paidOrdersCount)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {pointCountDelta(
                        currentTotals.paidOrdersCount,
                        previousTotals.paidOrdersCount,
                      )}{' '}
                      paid orders versus the previous window ({formatSignedPercent(deltaOrders)}).
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

export const AdminRevenuePanel = memo(AdminRevenuePanelComponent);
export default AdminRevenuePanel;
