import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Alert,
  Badge,
  EmptyState,
  KPICard,
  MetricGrid,
  Panel,
  ProgressBar,
  SkeletonBlock,
  Table,
} from '@/features/admin/ui/AdminPrimitives';
import { supabase } from '@/lib/supabase/supabaseClient';
import type { Database } from '@/types/supabase';
import { formatCurrency } from '@/utils/currency';

type OrderRow = Database['public']['Tables']['orders']['Row'];
type DashboardOrderRow = Pick<
  OrderRow,
  | 'id'
  | 'order_number'
  | 'customer_name'
  | 'customer_email'
  | 'order_type'
  | 'status'
  | 'payment_status'
  | 'amount_total'
  | 'created_at'
>;

interface DashboardOrder {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  customerEmail: string | null;
  orderType: string | null;
  status: string;
  paymentStatus: string;
  amountTotalCents: number;
  createdAt: string;
}

interface DailyBucket {
  isoDate: string;
  label: string;
  orderCount: number;
  revenueCents: number;
}

interface DashboardOverview {
  todayOrderCount: number;
  yesterdayOrderCount: number;
  todayRevenueCents: number;
  yesterdayRevenueCents: number;
  averageTicketCents: number;
  liveQueueCount: number;
  readyCount: number;
  overdueCount: number;
  pendingPaymentCount: number;
  revenueDeltaPct: number;
  orderDeltaPct: number;
  deliveryPct: number;
  pickupPct: number;
  dailyRevenue: DailyBucket[];
  maxRevenueCents: number;
  recentOrders: DashboardOrder[];
}

type BadgeTone = 'neutral' | 'warning' | 'success' | 'danger' | 'info';
type ProgressTone = 'success' | 'primary' | 'warning' | 'danger' | 'neutral';

const DASHBOARD_REFRESH_MS = 30_000;
const LOOKBACK_DAYS = 30;
const OVERDUE_MINUTES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RECENT_ORDERS = 8;
const MAX_QUERY_ROWS = 1500;
const NEW_STATUSES = new Set<string>(['confirmed', 'pending']);
const TERMINAL_STATUSES = new Set<string>(['delivered', 'cancelled']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textFromUnknown(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized.length === 0) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readText(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    if (key in record) {
      const value = textFromUnknown(record[key]);
      if (value !== null) {
        return value;
      }
    }
  }

  return null;
}

function readNumber(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    if (key in record) {
      const value = numberFromUnknown(record[key]);
      if (value !== null) {
        return value;
      }
    }
  }

  return null;
}

function normalizeIsoDate(value: string): string | null {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function mapOrderRow(row: DashboardOrderRow): DashboardOrder {
  return {
    id: row.id,
    orderNumber: row.order_number === null ? null : String(row.order_number),
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    orderType: row.order_type,
    status: row.status,
    paymentStatus: row.payment_status,
    amountTotalCents: row.amount_total,
    createdAt: row.created_at,
  };
}

function parseRealtimeOrder(value: unknown): DashboardOrder | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readText(value, ['id']);
  const status = readText(value, ['status']) ?? 'unknown';
  const paymentStatus = readText(value, ['payment_status', 'paymentStatus']) ?? 'unknown';
  const createdAtRaw = readText(value, ['created_at', 'createdAt']);
  const createdAt = createdAtRaw ? normalizeIsoDate(createdAtRaw) : null;

  if (!id || !createdAt) {
    return null;
  }

  return {
    id,
    orderNumber: readText(value, ['order_number', 'orderNumber']),
    customerName: readText(value, ['customer_name', 'customerName']),
    customerEmail: readText(value, ['customer_email', 'customerEmail']),
    orderType: readText(value, ['order_type', 'orderType']),
    status,
    paymentStatus,
    amountTotalCents: readNumber(value, ['amount_total', 'amountTotal']) ?? 0,
    createdAt,
  };
}

function compareByCreatedAtDesc(left: DashboardOrder, right: DashboardOrder): number {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function upsertOrder(items: readonly DashboardOrder[], incoming: DashboardOrder): DashboardOrder[] {
  const next = items.filter((item) => item.id !== incoming.id);
  next.push(incoming);
  next.sort(compareByCreatedAtDesc);
  return next;
}

function removeOrder(items: readonly DashboardOrder[], id: string): DashboardOrder[] {
  return items.filter((item) => item.id !== id);
}

function startOfLocalDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatRelativeAge(iso: string): string {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));

  if (elapsedMinutes < 1) {
    return 'just now';
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const hours = Math.floor(elapsedMinutes / 60);
  return `${hours}h ago`;
}

function statusTone(status: string): BadgeTone {
  if (NEW_STATUSES.has(status)) {
    return 'warning';
  }

  if (status === 'preparing') {
    return 'info';
  }

  if (status === 'ready' || status === 'delivered') {
    return 'success';
  }

  if (status === 'cancelled') {
    return 'danger';
  }

  return 'neutral';
}

function paymentTone(status: string): BadgeTone {
  if (status === 'paid') {
    return 'success';
  }

  if (status === 'failed' || status === 'disputed') {
    return 'danger';
  }

  if (status === 'unpaid') {
    return 'warning';
  }

  if (status === 'refunded') {
    return 'neutral';
  }

  return 'info';
}

function humanStatus(status: string): string {
  if (NEW_STATUSES.has(status)) {
    return 'New';
  }

  if (status === 'preparing') {
    return 'Cooking';
  }

  if (status === 'ready') {
    return 'Ready';
  }

  if (status === 'delivered') {
    return 'Delivered';
  }

  if (status === 'cancelled') {
    return 'Cancelled';
  }

  return status;
}

function humanOrderType(orderType: string | null): string {
  if (!orderType) {
    return '—';
  }

  if (orderType === 'pickup') {
    return 'Pickup';
  }

  if (orderType === 'delivery') {
    return 'Delivery';
  }

  return orderType;
}

function isActiveOrder(status: string): boolean {
  return !TERMINAL_STATUSES.has(status);
}

function isPaidOrder(paymentStatus: string): boolean {
  return paymentStatus === 'paid';
}

function buildDailyRevenueBuckets(todayStartMs: number): Map<string, DailyBucket> {
  const buckets = new Map<string, DailyBucket>();

  for (let index = 6; index >= 0; index -= 1) {
    const current = new Date(todayStartMs - index * DAY_MS);
    const isoDate = current.toISOString().slice(0, 10);

    buckets.set(isoDate, {
      isoDate,
      label: current.toLocaleDateString('en-US', { weekday: 'short' }),
      orderCount: 0,
      revenueCents: 0,
    });
  }

  return buckets;
}

function buildOverview(orders: readonly DashboardOrder[]): DashboardOverview {
  const nowMs = Date.now();
  const todayStartMs = startOfLocalDay(new Date(nowMs)).getTime();
  const yesterdayStartMs = todayStartMs - DAY_MS;
  const sevenDayStartMs = todayStartMs - DAY_MS * 6;

  let todayOrderCount = 0;
  let yesterdayOrderCount = 0;
  let todayRevenueCents = 0;
  let yesterdayRevenueCents = 0;
  let todayGrossCents = 0;
  let liveQueueCount = 0;
  let readyCount = 0;
  let overdueCount = 0;
  let pendingPaymentCount = 0;
  let deliveryCount = 0;
  let pickupCount = 0;

  const bucketsByDate = buildDailyRevenueBuckets(todayStartMs);

  for (const order of orders) {
    const createdAtMs = new Date(order.createdAt).getTime();

    if (Number.isNaN(createdAtMs)) {
      continue;
    }

    if (createdAtMs >= todayStartMs) {
      todayOrderCount += 1;
      todayGrossCents += order.amountTotalCents;

      if (isPaidOrder(order.paymentStatus)) {
        todayRevenueCents += order.amountTotalCents;
      }
    } else if (createdAtMs >= yesterdayStartMs) {
      yesterdayOrderCount += 1;

      if (isPaidOrder(order.paymentStatus)) {
        yesterdayRevenueCents += order.amountTotalCents;
      }
    }

    if (isActiveOrder(order.status)) {
      liveQueueCount += 1;

      if (order.status === 'ready') {
        readyCount += 1;
      }

      const ageMinutes = Math.max(0, Math.floor((nowMs - createdAtMs) / 60_000));
      if (ageMinutes >= OVERDUE_MINUTES) {
        overdueCount += 1;
      }
    }

    if (!isPaidOrder(order.paymentStatus) && order.status !== 'cancelled') {
      pendingPaymentCount += 1;
    }

    if (order.orderType === 'delivery') {
      deliveryCount += 1;
    } else if (order.orderType === 'pickup') {
      pickupCount += 1;
    }

    if (createdAtMs >= sevenDayStartMs) {
      const bucketKey = new Date(createdAtMs).toISOString().slice(0, 10);
      const bucket = bucketsByDate.get(bucketKey);

      if (bucket) {
        bucket.orderCount += 1;

        if (isPaidOrder(order.paymentStatus)) {
          bucket.revenueCents += order.amountTotalCents;
        }
      }
    }
  }

  const dailyRevenue = Array.from(bucketsByDate.values());
  const maxRevenueCents = dailyRevenue.reduce(
    (currentMax, bucket) => Math.max(currentMax, bucket.revenueCents),
    0,
  );

  const averageTicketCents =
    todayOrderCount > 0 ? Math.round(todayGrossCents / todayOrderCount) : 0;

  const revenueDeltaPct =
    yesterdayRevenueCents > 0
      ? ((todayRevenueCents - yesterdayRevenueCents) / yesterdayRevenueCents) * 100
      : todayRevenueCents > 0
        ? 100
        : 0;

  const orderDeltaPct =
    yesterdayOrderCount > 0
      ? ((todayOrderCount - yesterdayOrderCount) / yesterdayOrderCount) * 100
      : todayOrderCount > 0
        ? 100
        : 0;

  const totalOrderTypes = deliveryCount + pickupCount;
  const deliveryPct = totalOrderTypes > 0 ? (deliveryCount / totalOrderTypes) * 100 : 0;
  const pickupPct = totalOrderTypes > 0 ? (pickupCount / totalOrderTypes) * 100 : 0;

  return {
    todayOrderCount,
    yesterdayOrderCount,
    todayRevenueCents,
    yesterdayRevenueCents,
    averageTicketCents,
    liveQueueCount,
    readyCount,
    overdueCount,
    pendingPaymentCount,
    revenueDeltaPct,
    orderDeltaPct,
    deliveryPct,
    pickupPct,
    dailyRevenue,
    maxRevenueCents,
    recentOrders: [...orders].slice(0, MAX_RECENT_ORDERS),
  };
}

function progressToneForPendingPayments(count: number): ProgressTone {
  return count > 0 ? 'danger' : 'neutral';
}

export default function AdminDashboardPage() {
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const loadDashboard = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const since = new Date(Date.now() - LOOKBACK_DAYS * DAY_MS).toISOString();

    try {
      setError(null);

      const { data, error: queryError } = await supabase
        .from('orders')
        .select(
          'id, order_number, customer_name, customer_email, order_type, status, payment_status, amount_total, created_at',
        )
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(MAX_QUERY_ROWS);

      if (queryError) {
        throw queryError;
      }

      if (!mountedRef.current || requestIdRef.current !== requestId) {
        return;
      }

      setOrders((data ?? []).map(mapOrderRow));
      setLastUpdated(new Date());
    } catch (loadError: unknown) {
      if (!mountedRef.current || requestIdRef.current !== requestId) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard data.');
    } finally {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void loadDashboard();

    return () => {
      mountedRef.current = false;
    };
  }, [loadDashboard]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadDashboard();
    }, DASHBOARD_REFRESH_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadDashboard]);

  useEffect(() => {
    const thresholdMs = Date.now() - LOOKBACK_DAYS * DAY_MS;

    const channel = supabase
      .channel('admin-dashboard-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        const nextOrder = parseRealtimeOrder(payload.new);

        if (payload.eventType === 'INSERT' && nextOrder) {
          if (new Date(nextOrder.createdAt).getTime() >= thresholdMs) {
            setOrders((current) => upsertOrder(current, nextOrder));
            setLastUpdated(new Date());
          }
          return;
        }

        if (payload.eventType === 'UPDATE' && nextOrder) {
          if (new Date(nextOrder.createdAt).getTime() >= thresholdMs) {
            setOrders((current) => upsertOrder(current, nextOrder));
          } else {
            setOrders((current) => removeOrder(current, nextOrder.id));
          }

          setLastUpdated(new Date());
          return;
        }

        if (payload.eventType === 'DELETE' && isRecord(payload.old)) {
          const id = readText(payload.old, ['id']);

          if (id) {
            setOrders((current) => removeOrder(current, id));
            setLastUpdated(new Date());
          }
        }
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const overview = useMemo(() => buildOverview(orders), [orders]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) {
      return '—';
    }

    return lastUpdated.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [lastUpdated]);

  return (
    <div className="space-y-5">
      <div className="sr-only" aria-live="polite">
        {loading ? 'Loading dashboard.' : `Dashboard refreshed at ${lastUpdatedLabel}.`}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            30-day operating view with live queue telemetry and revenue health.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge tone={error ? 'danger' : 'success'}>
            {error ? 'Degraded' : 'Live'} · {lastUpdatedLabel}
          </Badge>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <Alert
          tone="danger"
          title="Dashboard error"
          message={error}
          action={
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="rounded-lg border border-red-500/30 px-2.5 py-1 text-[11px] font-semibold text-red-100 transition hover:bg-red-500/10"
            >
              Retry
            </button>
          }
        />
      ) : null}

      {loading && orders.length === 0 ? (
        <div className="space-y-4">
          <MetricGrid columns={4}>
            <SkeletonBlock height={132} className="rounded-2xl" />
            <SkeletonBlock height={132} className="rounded-2xl" />
            <SkeletonBlock height={132} className="rounded-2xl" />
            <SkeletonBlock height={132} className="rounded-2xl" />
          </MetricGrid>
          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
            <SkeletonBlock height={320} className="rounded-2xl" />
            <SkeletonBlock height={320} className="rounded-2xl" />
          </div>
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          title="No recent order data"
          description="Orders from the last 30 days will appear here automatically."
          icon="📊"
          action={{
            label: 'Reload dashboard',
            onClick: () => {
              void loadDashboard();
            },
          }}
        />
      ) : (
        <>
          <MetricGrid columns={4}>
            <KPICard
              label="Revenue Today"
              value={formatCurrency(overview.todayRevenueCents / 100)}
              sub={`${overview.todayOrderCount} orders today`}
              accent="amber"
              trend={overview.revenueDeltaPct >= 0 ? 'up' : 'down'}
              trendLabel={`${overview.revenueDeltaPct >= 0 ? '+' : ''}${Math.round(
                overview.revenueDeltaPct,
              )}% vs yesterday`}
              icon="💳"
            />
            <KPICard
              label="Orders Today"
              value={overview.todayOrderCount}
              sub={`${overview.yesterdayOrderCount} yesterday`}
              accent="sky"
              trend={overview.orderDeltaPct >= 0 ? 'up' : 'down'}
              trendLabel={`${overview.orderDeltaPct >= 0 ? '+' : ''}${Math.round(
                overview.orderDeltaPct,
              )}% vs yesterday`}
              icon="🧾"
            />
            <KPICard
              label="Average Ticket"
              value={formatCurrency(overview.averageTicketCents / 100)}
              sub="Gross order value today"
              accent="emerald"
              trend="flat"
              trendLabel="Healthy basket size target"
              icon="🛒"
            />
            <KPICard
              label="Live Queue"
              value={overview.liveQueueCount}
              sub={`${overview.readyCount} ready · ${overview.overdueCount} overdue`}
              accent={overview.overdueCount > 0 ? 'red' : 'violet'}
              trend={overview.overdueCount > 0 ? 'down' : 'up'}
              trendLabel={
                overview.overdueCount > 0 ? 'Intervene on aging tickets' : 'Queue is stable'
              }
              icon="⏱️"
            />
          </MetricGrid>

          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
            <Panel
              title="Revenue — last 7 days"
              subtitle="Paid orders only. Bars update live from the orders feed."
            >
              <div className="flex min-h-220px items-end gap-3">
                {overview.dailyRevenue.map((bucket) => {
                  const barHeight =
                    overview.maxRevenueCents > 0
                      ? Math.max(16, (bucket.revenueCents / overview.maxRevenueCents) * 180)
                      : 16;

                  return (
                    <div key={bucket.isoDate} className="flex flex-1 flex-col items-center gap-2">
                      <div className="text-[11px] text-zinc-500">
                        {formatCurrency(bucket.revenueCents / 100)}
                      </div>
                      <div className="flex h-190px items-end">
                        <div
                          className="w-8 rounded-t-xl border border-amber-500/30 bg-amber-500/20"
                          style={{ height: `${barHeight}px` }}
                          aria-label={`${bucket.label}: ${bucket.orderCount} orders, ${formatCurrency(
                            bucket.revenueCents / 100,
                          )}`}
                        />
                      </div>
                      <div className="text-[11px] font-semibold text-zinc-300">{bucket.label}</div>
                      <div className="text-[10px] text-zinc-500">{bucket.orderCount} orders</div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Service mix" subtitle="Operational pressure indicators from recent orders.">
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
                    <span>Pickup</span>
                    <span>{Math.round(overview.pickupPct)}%</span>
                  </div>
                  <ProgressBar value={overview.pickupPct} color="success" />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
                    <span>Delivery</span>
                    <span>{Math.round(overview.deliveryPct)}%</span>
                  </div>
                  <ProgressBar value={overview.deliveryPct} color="primary" />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
                    <span>Ready now</span>
                    <span>{overview.readyCount}</span>
                  </div>
                  <ProgressBar
                    value={
                      overview.liveQueueCount > 0
                        ? (overview.readyCount / overview.liveQueueCount) * 100
                        : 0
                    }
                    color="warning"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
                    <span>Pending payment</span>
                    <span>{overview.pendingPaymentCount}</span>
                  </div>
                  <ProgressBar
                    value={orders.length > 0 ? (overview.pendingPaymentCount / orders.length) * 100 : 0}
                    color={progressToneForPendingPayments(overview.pendingPaymentCount)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                      Overdue queue
                    </div>
                    <div className="mt-2 text-2xl font-black text-red-400">
                      {overview.overdueCount}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                      Live tickets
                    </div>
                    <div className="mt-2 text-2xl font-black text-zinc-100">
                      {overview.liveQueueCount}
                    </div>
                  </div>
                </div>
              </div>
            </Panel>
          </div>

          <Panel
            title="Recent orders"
            subtitle="Most recent tickets from the live orders feed."
            noPad
          >
            <Table dense>
              <thead className="bg-zinc-950/80 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Payment</th>
                  <th className="px-4 py-3 font-semibold">Total</th>
                  <th className="px-4 py-3 font-semibold">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {overview.recentOrders.map((order) => (
                  <tr key={order.id} className="bg-zinc-950/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-100">
                          #{order.orderNumber ?? '—'}
                        </span>
                        <Badge tone={statusTone(order.status)}>{humanStatus(order.status)}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-220px truncate text-zinc-300">
                        {order.customerName ?? order.customerEmail ?? 'Guest'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{humanOrderType(order.orderType)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={paymentTone(order.paymentStatus)}>{order.paymentStatus}</Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold text-zinc-100">
                      {formatCurrency(order.amountTotalCents / 100)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{formatRelativeAge(order.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        </>
      )}
    </div>
  );
}