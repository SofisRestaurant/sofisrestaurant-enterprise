import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Alert,
  Badge,
  EmptyState,
  LoadingSpinner,
  MetricGrid,
  Panel,
  StatCard,
} from '@/features/admin/ui/AdminPrimitives';
import {
  ORDERS_FILTER_TABS,
  matchesOrderSearch,
  type OrderRow,
  type OrdersFilterTab,
} from '@/modules/orders/types';
import {
  getNextOrderStatus,
  isOrderStatus,
  ORDER_STATUS_LABELS,
  OrderStatus,
} from '@/domain/orders/order.types';
import {
  fetchAdminMetrics,
  fetchAdminOrderRows,
  updateOrderStatusRow,
} from '@/modules/orders/api/orders.admin.api';
import { useOrdersRealtime } from '@/modules/orders/hooks/useOrdersRealtime';
import { formatCurrency } from '@/utils/currency';

const AUTO_REFRESH_MS = 20_000;
const MAX_ORDERS = 500;
const HIGH_PRIORITY_MINUTES = 12;
const URGENT_PRIORITY_MINUTES = 20;

type OrderPriority = 'normal' | 'high' | 'urgent';
type MetricsState = Awaited<ReturnType<typeof fetchAdminMetrics>>;
type MetricTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

type CartItemView = {
  key: string;
  name: string;
  quantity: number;
  notes: string | null;
  menuItemId: string | null;
  lineTotalCents: number | null;
  unitPriceCents: number | null;
  hasResolvedPrice: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();

    if (normalized.length === 0) {
      return null;
    }

    const parsed = Number(normalized);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function readString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = asTrimmedString(record[key]);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function readNumber(
  record: Record<string, unknown>,
  keys: readonly string[],
  fallback: number | null = null,
): number | null {
  for (const key of keys) {
    const value = asFiniteNumber(record[key]);

    if (value !== null) {
      return value;
    }
  }

  return fallback;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load orders.';
}

function toOrderStatus(value: string): OrderStatus | null {
  return isOrderStatus(value) ? value : null;
}

function normalizeStatusValue(value: string): string {
  return value.trim().toLowerCase();
}

function matchesAdminTab(order: OrderRow, tab: OrdersFilterTab): boolean {
  if (tab === 'all') {
    return true;
  }

  const status = normalizeStatusValue(order.status);

  switch (tab) {
    case 'new':
      return status === 'new' || status === 'pending';
    case 'confirmed':
      return status === 'confirmed';
    case 'preparing':
      return status === 'preparing';
    case 'ready':
      return status === 'ready';
    case 'out_for_delivery':
      return status === 'out_for_delivery';
    case 'completed':
      return status === 'completed' || status === 'delivered';
    case 'canceled':
      return status === 'canceled' || status === 'cancelled';
    default:
      return false;
  }
}

function getMetricsNumber(
  metrics: MetricsState | null,
  keys: readonly string[],
  fallback = 0,
): number {
  if (!isRecord(metrics)) {
    return fallback;
  }

  const value = readNumber(metrics, keys, fallback);
  return value ?? fallback;
}

function getMetricsSummary(metrics: MetricsState | null) {
  const totalOrders = getMetricsNumber(metrics, ['totalOrders', 'total']);
  const openOrders = getMetricsNumber(metrics, ['openOrders', 'active']);
  const totalRevenue = getMetricsNumber(metrics, ['totalRevenue']);
  const todayRevenue = getMetricsNumber(metrics, ['todayRevenue']);
  const todayOrders = getMetricsNumber(metrics, ['todayOrders']);
  const averageOrderValue =
    totalOrders > 0
      ? getMetricsNumber(metrics, ['averageOrderValue'], Math.round(totalRevenue / totalOrders))
      : getMetricsNumber(metrics, ['averageOrderValue']);

  const newOrders = getMetricsNumber(metrics, ['newOrders', 'new']);
  const confirmedOrders = getMetricsNumber(metrics, ['confirmedOrders', 'confirmed']);
  const preparingOrders = getMetricsNumber(metrics, ['preparingOrders', 'preparing']);
  const readyOrders = getMetricsNumber(metrics, ['readyOrders', 'ready']);

  return {
    totalOrders,
    openOrders,
    totalRevenue,
    todayRevenue,
    todayOrders,
    averageOrderValue,
    newOrders,
    confirmedOrders,
    preparingOrders,
    readyOrders,
  };
}

function buildCartItemName(
  record: Record<string, unknown>,
  fallbackOrdinal: number,
): { name: string; menuItemId: string | null } {
  const explicitName = readString(record, ['name', 'title']);

  if (explicitName !== null) {
    return {
      name: explicitName,
      menuItemId: readString(record, ['menuItemId', 'menu_item_id', 'id']),
    };
  }

  const menuItemId = readString(record, ['menuItemId', 'menu_item_id', 'id']);

  if (menuItemId !== null) {
    return {
      name: `Item ${menuItemId.slice(0, 8)}`,
      menuItemId,
    };
  }

  return {
    name: `Item ${fallbackOrdinal}`,
    menuItemId: null,
  };
}

function buildCartItemBaseSignature(
  name: string,
  quantity: number,
  notes: string | null,
  menuItemId: string | null,
  lineTotalCents: number | null,
  unitPriceCents: number | null,
): string {
  return [
    'item',
    menuItemId ?? 'na',
    name.trim().toLowerCase(),
    String(quantity),
    notes?.trim().toLowerCase() ?? '',
    lineTotalCents === null ? 'na' : String(lineTotalCents),
    unitPriceCents === null ? 'na' : String(unitPriceCents),
  ].join(':');
}

function parseCartItems(value: OrderRow['cart_items']): CartItemView[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: CartItemView[] = [];
  const signatureCounts = new Map<string, number>();
  let fallbackOrdinal = 1;

  for (const rawItem of value) {
    if (!isRecord(rawItem)) {
      continue;
    }

    const quantityValue = readNumber(rawItem, ['quantity', 'qty'], 1) ?? 1;
    const quantity = Math.max(1, Math.trunc(quantityValue));
    const notes = readString(rawItem, [
      'notes',
      'note',
      'specialInstructions',
      'special_instructions',
    ]);
    const { name, menuItemId } = buildCartItemName(rawItem, fallbackOrdinal);

    const lineTotalCents = readNumber(rawItem, ['lineTotalCents', 'line_total_cents']);
    const unitPriceRaw = readNumber(rawItem, [
      'unitPriceCents',
      'unit_price_cents',
      'unitPrice',
      'unit_price',
      'price_cents',
      'price',
    ]);

    const unitPriceCents =
      typeof unitPriceRaw === 'number' && Number.isFinite(unitPriceRaw)
        ? Math.round(unitPriceRaw)
        : null;

    const resolvedLineTotalCents =
      typeof lineTotalCents === 'number' && Number.isFinite(lineTotalCents)
        ? Math.round(lineTotalCents)
        : null;

    const hasResolvedPrice = resolvedLineTotalCents !== null || unitPriceCents !== null;

    const baseSignature = buildCartItemBaseSignature(
      name,
      quantity,
      notes,
      menuItemId,
      resolvedLineTotalCents,
      unitPriceCents,
    );

    const nextOccurrence = (signatureCounts.get(baseSignature) ?? 0) + 1;
    signatureCounts.set(baseSignature, nextOccurrence);

    items.push({
      key: `${baseSignature}:dup-${nextOccurrence}`,
      name,
      quantity,
      notes,
      menuItemId,
      lineTotalCents: resolvedLineTotalCents,
      unitPriceCents,
      hasResolvedPrice,
    });

    fallbackOrdinal += 1;
  }

  return items;
}

function getCartItemDisplayTotalCents(item: CartItemView): number | null {
  if (item.lineTotalCents !== null) {
    return item.lineTotalCents;
  }

  if (item.unitPriceCents !== null) {
    return item.unitPriceCents * item.quantity;
  }

  return null;
}

function getCartItemPriceLabel(item: CartItemView): string {
  const total = getCartItemDisplayTotalCents(item);

  if (total === null) {
    return 'Included in subtotal';
  }

  return formatCurrency(total / 100);
}

function getMinutesAgo(createdAt: string): number {
  const createdAtMs = Date.parse(createdAt);

  if (!Number.isFinite(createdAtMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - createdAtMs) / 60_000));
}

function getPriority(order: OrderRow): OrderPriority {
  const status = toOrderStatus(order.status);
  const normalizedStatus = normalizeStatusValue(order.status);

  if (
    status === OrderStatus.DELIVERED ||
    status === OrderStatus.CANCELLED ||
    normalizedStatus === 'completed'
  ) {
    return 'normal';
  }

  const minutes = getMinutesAgo(order.created_at);

  if (minutes >= URGENT_PRIORITY_MINUTES) {
    return 'urgent';
  }

  if (minutes >= HIGH_PRIORITY_MINUTES) {
    return 'high';
  }

  return 'normal';
}

function getPriorityTone(priority: OrderPriority): MetricTone {
  if (priority === 'urgent') {
    return 'danger';
  }

  if (priority === 'high') {
    return 'warning';
  }

  return 'neutral';
}

function getStatusTone(status: string): MetricTone {
  const normalized = normalizeStatusValue(status);

  if (normalized === 'confirmed' || normalized === 'new' || normalized === 'pending') {
    return 'warning';
  }

  if (normalized === 'preparing' || normalized === 'out_for_delivery') {
    return 'info';
  }

  if (normalized === 'ready') {
    return 'success';
  }

  if (normalized === 'completed' || normalized === 'delivered') {
    return 'neutral';
  }

  if (normalized === 'canceled' || normalized === 'cancelled') {
    return 'danger';
  }

  return 'neutral';
}

function getPaymentTone(status: string): MetricTone {
  switch (status.trim().toLowerCase()) {
    case 'paid':
      return 'success';
    case 'unpaid':
    case 'pending':
      return 'warning';
    case 'failed':
      return 'danger';
    case 'refunded':
    case 'partially_refunded':
      return 'neutral';
    case 'disputed':
      return 'danger';
    default:
      return 'neutral';
  }
}

function formatOrderStatus(status: string): string {
  const normalizedStatus = normalizeStatusValue(status);
  const enumStatus = toOrderStatus(status);

  if (enumStatus !== null) {
    return ORDER_STATUS_LABELS[enumStatus];
  }

  if (normalizedStatus === 'completed') {
    return 'Completed';
  }

  if (normalizedStatus === 'canceled') {
    return 'Canceled';
  }

  return status.replace(/_/g, ' ');
}

function formatFilterLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

function formatTimeLabel(value: Date | null): string {
  if (value === null) {
    return 'Never';
  }

  return value.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getCustomerLabel(order: OrderRow): string {
  return order.customer_name ?? order.customer_email ?? order.customer_phone ?? 'Guest';
}

function getOrderKeyLabel(order: OrderRow): string {
  return order.order_number !== null ? `#${order.order_number}` : order.id.slice(0, 8);
}

function sortOrders(rows: readonly OrderRow[]): OrderRow[] {
  return [...rows].sort((left, right) => {
    const leftTs = Date.parse(left.created_at);
    const rightTs = Date.parse(right.created_at);

    if (!Number.isFinite(leftTs) && !Number.isFinite(rightTs)) {
      return 0;
    }

    if (!Number.isFinite(leftTs)) {
      return 1;
    }

    if (!Number.isFinite(rightTs)) {
      return -1;
    }

    return rightTs - leftTs;
  });
}

function upsertOrderRow(rows: readonly OrderRow[], nextRow: OrderRow): OrderRow[] {
  const index = rows.findIndex((row) => row.id === nextRow.id);

  if (index === -1) {
    return sortOrders([nextRow, ...rows]);
  }

  const nextRows = [...rows];
  nextRows[index] = nextRow;

  return sortOrders(nextRows);
}

function removeOrderRow(rows: readonly OrderRow[], rowId: string): OrderRow[] {
  return rows.filter((row) => row.id !== rowId);
}

function getShippingSummary(order: OrderRow): string | null {
  const parts = [order.shipping_name, order.shipping_phone].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );

  if (parts.length === 0) {
    return null;
  }

  return parts.join(' • ');
}

function getAriaSummary(metrics: MetricsState | null, visibleCount: number): string {
  const summary = getMetricsSummary(metrics);
  return `${summary.totalOrders} total orders, ${visibleCount} visible, ${summary.openOrders} open.`;
}

function getTabCount(orders: readonly OrderRow[], tab: OrdersFilterTab): number {
  if (tab === 'all') {
    return orders.length;
  }

  return orders.filter((order) => matchesAdminTab(order, tab)).length;
}

function getOrderItemsPricingNotice(
  items: readonly CartItemView[],
  amountSubtotal: number,
): string | null {
  if (items.length === 0) {
    return null;
  }

  const missingPricingCount = items.filter((item) => !item.hasResolvedPrice).length;

  if (missingPricingCount === 0) {
    return null;
  }

  if (amountSubtotal <= 0) {
    return 'Line-item pricing is unavailable for this order snapshot.';
  }

  if (missingPricingCount === items.length) {
    return 'This order subtotal is accurate, but this snapshot does not include per-item pricing details.';
  }

  return 'Some line items in this order snapshot do not include stored pricing details.';
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [metrics, setMetrics] = useState<MetricsState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [activeTab, setActiveTab] = useState<OrdersFilterTab>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [announcement, setAnnouncement] = useState<string>('');

  const mountedRef = useRef<boolean>(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const refreshMetrics = useCallback(async (): Promise<void> => {
    try {
      const nextMetrics = await fetchAdminMetrics();

      if (!mountedRef.current) {
        return;
      }

      setMetrics(nextMetrics);
    } catch {
      // Background metric refresh failures should not interrupt the page.
    }
  }, []);

  const refreshOrders = useCallback(async (background = false): Promise<void> => {
    if (mountedRef.current) {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);
    }

    try {
      const [rows, nextMetrics] = await Promise.all([
        fetchAdminOrderRows({ limit: MAX_ORDERS }),
        fetchAdminMetrics(),
      ]);

      if (!mountedRef.current) {
        return;
      }

      setOrders(sortOrders(rows));
      setMetrics(nextMetrics);
      setLastRefreshAt(new Date());
    } catch (loadError: unknown) {
      if (!mountedRef.current) {
        return;
      }

      setError(getErrorMessage(loadError));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshOrders();

    return () => {
      mountedRef.current = false;
    };
  }, [refreshOrders]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshOrders(true);
    }, AUTO_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshOrders]);

  useEffect(() => {
    if (announcement.length === 0) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setAnnouncement('');
    }, 4_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [announcement]);

  const playNotification = useCallback((): void => {
    if (!soundEnabled) {
      return;
    }

    const element = audioRef.current;

    if (element === null) {
      return;
    }

    void element.play().catch(() => {
      // Browsers can block autoplay.
    });
  }, [soundEnabled]);

  const realtime = useOrdersRealtime({
    channelName: 'admin-orders-rt',
    onInsert: (row) => {
      setOrders((current) => upsertOrderRow(current, row));
      setAnnouncement(`New order ${getOrderKeyLabel(row)} received.`);
      playNotification();
      void refreshMetrics();
    },
    onUpdate: (row) => {
      setOrders((current) => upsertOrderRow(current, row));
      setAnnouncement(
        `Order ${getOrderKeyLabel(row)} updated to ${formatOrderStatus(row.status)}.`,
      );
      void refreshMetrics();
    },
    onDelete: (row) => {
      setOrders((current) => removeOrderRow(current, row.id));
      setAnnouncement(`Order ${getOrderKeyLabel(row)} removed.`);
      void refreshMetrics();
    },
  });

  const tabCounts = useMemo(() => {
    const counts = new Map<OrdersFilterTab, number>();

    for (const tab of ORDERS_FILTER_TABS) {
      counts.set(tab, getTabCount(orders, tab));
    }

    return counts;
  }, [orders]);

  const filteredOrders = useMemo(
    () =>
      orders.filter(
        (order) => matchesAdminTab(order, activeTab) && matchesOrderSearch(order, search),
      ),
    [activeTab, orders, search],
  );

  const metricsSummary = useMemo(() => getMetricsSummary(metrics), [metrics]);

  const visibleSummary = useMemo(
    () => getAriaSummary(metrics, filteredOrders.length),
    [filteredOrders.length, metrics],
  );

  const handleManualRefresh = useCallback((): void => {
    void refreshOrders(true);
  }, [refreshOrders]);

  const handleAdvanceStatus = useCallback(
    async (order: OrderRow): Promise<void> => {
      if (updatingId !== null) {
        return;
      }

      const currentStatus = toOrderStatus(order.status);

      if (currentStatus === null) {
        setError(`Unsupported order status: ${order.status}`);
        return;
      }

      const nextStatus = getNextOrderStatus(currentStatus);

      if (nextStatus === null) {
        return;
      }

      setUpdatingId(order.id);
      setError(null);

      const previousOrder = order;

      setOrders((current) =>
        current.map((row) => {
          if (row.id !== order.id) {
            return row;
          }

          return {
            ...row,
            status: nextStatus,
          };
        }),
      );

      try {
        const updated = await updateOrderStatusRow(order.id, nextStatus);

        if (!mountedRef.current) {
          return;
        }

        setOrders((current) => upsertOrderRow(current, updated));
        setAnnouncement(
          `Order ${getOrderKeyLabel(updated)} moved to ${formatOrderStatus(updated.status)}.`,
        );
        void refreshMetrics();
      } catch (statusError: unknown) {
        if (!mountedRef.current) {
          return;
        }

        setOrders((current) =>
          current.map((row) => (row.id === previousOrder.id ? previousOrder : row)),
        );
        setError(statusError instanceof Error ? statusError.message : 'Unable to update order.');
      } finally {
        if (mountedRef.current) {
          setUpdatingId(null);
        }
      }
    },
    [refreshMetrics, updatingId],
  );

  const handleCancelOrder = useCallback(
    async (order: OrderRow): Promise<void> => {
      if (updatingId !== null) {
        return;
      }

      setUpdatingId(order.id);
      setError(null);

      const previousOrder = order;

      setOrders((current) =>
        current.map((row) => {
          if (row.id !== order.id) {
            return row;
          }

          return {
            ...row,
            status: OrderStatus.CANCELLED,
          };
        }),
      );

      try {
        const updated = await updateOrderStatusRow(order.id, OrderStatus.CANCELLED);

        if (!mountedRef.current) {
          return;
        }

        setOrders((current) => upsertOrderRow(current, updated));
        setAnnouncement(`Order ${getOrderKeyLabel(updated)} cancelled.`);
        void refreshMetrics();
      } catch (statusError: unknown) {
        if (!mountedRef.current) {
          return;
        }

        setOrders((current) =>
          current.map((row) => (row.id === previousOrder.id ? previousOrder : row)),
        );
        setError(statusError instanceof Error ? statusError.message : 'Unable to cancel order.');
      } finally {
        if (mountedRef.current) {
          setUpdatingId(null);
        }
      }
    },
    [refreshMetrics, updatingId],
  );

  return (
    <div className="space-y-5">
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <Panel
        title="Orders"
        subtitle={`Last refresh: ${formatTimeLabel(lastRefreshAt)}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={realtime.isSubscribed ? 'success' : 'warning'}>
              {realtime.isSubscribed ? 'Live' : 'Polling'}
            </Badge>
            <button
              type="button"
              className="rounded-full border border-zinc-700 px-3 py-1 text-[11px] font-semibold uppercase tracking-caps[0.12em] text-zinc-200 transition hover:border-zinc-500 hover:text-white"
              onClick={() => {
                setSoundEnabled((current) => !current);
              }}
              aria-pressed={soundEnabled}
            >
              {soundEnabled ? 'Sound on' : 'Muted'}
            </button>
            <button
              type="button"
              className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-caps[0.12em] text-amber-300 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleManualRefresh}
              disabled={refreshing}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-zinc-400">{visibleSummary}</p>

          {error !== null ? <Alert tone="danger" title="Orders" message={error} /> : null}

          <MetricGrid columns={4}>
            <StatCard
              title="Open Orders"
              value={metricsSummary.openOrders}
              subtitle={`${metricsSummary.newOrders} new • ${metricsSummary.preparingOrders} preparing • ${metricsSummary.readyOrders} ready`}
            />
            <StatCard
              title="Revenue"
              value={formatCurrency(metricsSummary.totalRevenue / 100)}
              subtitle={`${metricsSummary.totalOrders} lifetime orders`}
            />
            <StatCard
              title="Today"
              value={formatCurrency(metricsSummary.todayRevenue / 100)}
              subtitle={`${metricsSummary.todayOrders} orders today`}
            />
            <StatCard
              title="Average Ticket"
              value={formatCurrency(metricsSummary.averageOrderValue / 100)}
              subtitle={`Updated ${formatTimeLabel(lastRefreshAt)}`}
            />
          </MetricGrid>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Search
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.currentTarget.value);
                }}
                placeholder="Order #, customer name, email, or phone"
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-base md:text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20"
                aria-label="Search orders"
              />
            </label>

            <div className="flex flex-wrap items-end gap-2">
              {ORDERS_FILTER_TABS.map((tab) => {
                const count = tabCounts.get(tab) ?? 0;

                return (
                  <button
                    key={tab}
                    type="button"
                    aria-pressed={activeTab === tab}
                    onClick={() => {
                      setActiveTab(tab);
                    }}
                    className={[
                      'rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-caps[0.12em] transition',
                      activeTab === tab
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                        : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                    ].join(' ')}
                  >
                    {formatFilterLabel(tab)} <span className="ml-1 text-zinc-500">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Panel>

      {loading ? (
        <Panel title="Loading orders">
          <div className="flex items-center gap-3 text-base md:text-sm text-zinc-400">
            <LoadingSpinner />
            <span>Fetching the latest orders and metrics…</span>
          </div>
        </Panel>
      ) : filteredOrders.length === 0 ? (
        <Panel title="Orders">
          <EmptyState
            title="No orders found"
            description="Try a different search or filter, or refresh to sync the latest orders."
            action={{
              label: 'Refresh',
              onClick: handleManualRefresh,
            }}
            icon="🧾"
          />
        </Panel>
      ) : (
        <Panel title="Active queue" subtitle={`${filteredOrders.length} visible orders`} noPad>
          <div className="divide-y divide-zinc-900">
            {filteredOrders.map((order) => {
              const priority = getPriority(order);
              const items = parseCartItems(order.cart_items);
              const pricingNotice = getOrderItemsPricingNotice(items, order.amount_subtotal);
              const currentStatus = toOrderStatus(order.status);
              const nextStatus = currentStatus === null ? null : getNextOrderStatus(currentStatus);
              const isExpanded = expandedId === order.id;
              const isUpdating = updatingId === order.id;
              const shippingSummary = getShippingSummary(order);

              return (
                <article key={order.id} className="px-4 py-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-zinc-100">
                          {getOrderKeyLabel(order)}
                        </h2>
                        <Badge tone={getStatusTone(order.status)}>
                          {formatOrderStatus(order.status)}
                        </Badge>
                        <Badge tone={getPaymentTone(order.payment_status)}>
                          {order.payment_status}
                        </Badge>
                        {priority !== 'normal' ? (
                          <Badge tone={getPriorityTone(priority)}>{priority}</Badge>
                        ) : null}
                      </div>

                      <div className="space-y-1 text-base md:text-sm text-zinc-300">
                        <p>{getCustomerLabel(order)}</p>
                        <p className="text-zinc-500">
                          {new Date(order.created_at).toLocaleString()} •{' '}
                          {getMinutesAgo(order.created_at)}m ago
                        </p>
                        {shippingSummary !== null ? (
                          <p className="text-zinc-500">{shippingSummary}</p>
                        ) : null}
                      </div>

                      {items.length > 0 ? (
                        <div className="space-y-2">
                          <ul className="space-y-1 text-base md:text-sm text-zinc-400">
                            {items.slice(0, isExpanded ? items.length : 2).map((item) => (
                              <li
                                key={`${order.id}:${item.key}`}
                                className="flex items-start justify-between gap-3"
                              >
                                <span className="min-w-0">
                                  <span className="font-medium text-zinc-300">
                                    {item.quantity}×
                                  </span>{' '}
                                  {item.name}
                                  {item.notes !== null ? (
                                    <span className="block text-xs text-zinc-500">
                                      {item.notes}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="shrink-0 text-zinc-500">
                                  {getCartItemPriceLabel(item)}
                                </span>
                              </li>
                            ))}
                          </ul>

                          {pricingNotice !== null ? (
                            <p className="text-xs text-amber-300/90">{pricingNotice}</p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex min-w-13.75rem flex-col items-start gap-3 lg:items-end">
                      <div className="text-right">
                        <div className="text-xl font-black text-zinc-100">
                          {formatCurrency(order.amount_total / 100)}
                        </div>
                        <div className="text-xs text-zinc-500">{order.currency.toUpperCase()}</div>
                      </div>

                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-full border border-zinc-700 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-caps[0.12em] text-zinc-200 transition hover:border-zinc-500 hover:text-white"
                          onClick={() => {
                            setExpandedId((current) => (current === order.id ? null : order.id));
                          }}
                          aria-expanded={isExpanded}
                          aria-controls={`order-panel-${order.id}`}
                        >
                          {isExpanded ? 'Collapse' : 'Details'}
                        </button>

                        {nextStatus !== null ? (
                          <button
                            type="button"
                            className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-caps[0.12em] text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isUpdating}
                            onClick={() => {
                              void handleAdvanceStatus(order);
                            }}
                          >
                            {isUpdating ? 'Saving…' : `Move to ${ORDER_STATUS_LABELS[nextStatus]}`}
                          </button>
                        ) : null}

                        {currentStatus !== null &&
                        currentStatus !== OrderStatus.CANCELLED &&
                        currentStatus !== OrderStatus.DELIVERED ? (
                          <button
                            type="button"
                            className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-caps[0.12em] text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isUpdating}
                            onClick={() => {
                              void handleCancelOrder(order);
                            }}
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div
                      id={`order-panel-${order.id}`}
                      className="mt-4 grid gap-4 rounded-2xl border border-zinc-900 bg-zinc-950/40 p-4 md:grid-cols-2"
                    >
                      <div className="space-y-2">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Customer
                        </h3>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-base md:text-sm">
                          <dt className="text-zinc-500">Name</dt>
                          <dd className="text-zinc-200">{order.customer_name ?? '—'}</dd>
                          <dt className="text-zinc-500">Email</dt>
                          <dd className="text-zinc-200">{order.customer_email ?? '—'}</dd>
                          <dt className="text-zinc-500">Phone</dt>
                          <dd className="text-zinc-200">{order.customer_phone ?? '—'}</dd>
                          <dt className="text-zinc-500">Assigned</dt>
                          <dd className="text-zinc-200">{order.assigned_to ?? '—'}</dd>
                        </dl>
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Order details
                        </h3>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                          <dt className="text-zinc-500">Subtotal</dt>
                          <dd className="text-zinc-200">
                            {formatCurrency(order.amount_subtotal / 100)}
                          </dd>
                          <dt className="text-zinc-500">Tax</dt>
                          <dd className="text-zinc-200">
                            {formatCurrency(order.amount_tax / 100)}
                          </dd>
                          <dt className="text-zinc-500">Shipping</dt>
                          <dd className="text-zinc-200">
                            {formatCurrency(order.amount_shipping / 100)}
                          </dd>
                          <dt className="text-zinc-500">Notes</dt>
                          <dd className="text-zinc-200">{order.notes ?? '—'}</dd>
                        </dl>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}
