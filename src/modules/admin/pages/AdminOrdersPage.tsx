import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  Alert,
  Badge,
  EmptyState,
  KPICard,
  MetricGrid,
  Panel,
  SkeletonBlock,
  Table,
} from '@/features/admin/ui/AdminPrimitives';
import { supabase } from '@/lib/supabase/supabaseClient';
import type { Database } from '@/types/supabase';
import { formatCurrency } from '@/utils/currency';

type OrderRow = Database['public']['Tables']['orders']['Row'];

interface CartItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
}

interface AdminOrder {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  orderType: string | null;
  status: string;
  paymentStatus: string;
  amountSubtotalCents: number;
  amountTaxCents: number;
  amountTotalCents: number;
  createdAt: string;
  notes: string | null;
  stripePaymentIntentId: string | null;
  cartItems: CartItem[];
}

type FilterTab = 'all' | 'new' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

const AUTO_REFRESH_MS = 20_000;
const HIGH_PRIORITY_MINUTES = 12;
const URGENT_PRIORITY_MINUTES = 20;
const NEW_STATUSES = new Set<string>(['confirmed', 'pending']);

const NEXT_STATUS: Readonly<Record<string, string | null>> = {
  pending: 'preparing',
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
  delivered: null,
  cancelled: null,
};

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
      if (value) {
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

function normalizeMoneyToCents(value: number): number {
  const absolute = Math.abs(value);

  if (absolute >= 1000 || (Number.isInteger(value) && absolute > 80)) {
    return Math.round(value);
  }

  return Math.round(value * 100);
}

function parseCartItems(value: OrderRow['cart_items'] | unknown): CartItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: CartItem[] = [];

  for (const rawItem of value) {
    if (!isRecord(rawItem)) {
      continue;
    }

    const name = readText(rawItem, ['name', 'title']) ?? 'Item';
    const quantity = Math.max(1, Math.round(readNumber(rawItem, ['quantity', 'qty']) ?? 1));
    const rawPrice = readNumber(rawItem, [
      'price_cents',
      'priceCents',
      'unit_price_cents',
      'unitPriceCents',
      'price',
      'unit_price',
      'unitPrice',
    ]);
    const unitPriceCents = rawPrice === null ? 0 : normalizeMoneyToCents(rawPrice);

    items.push({
      name,
      quantity,
      unitPriceCents,
    });
  }

  return items;
}

function mapOrderRow(row: OrderRow): AdminOrder {
  return {
    id: row.id,
    orderNumber: row.order_number === null ? null : String(row.order_number),
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    orderType: row.order_type,
    status: row.status,
    paymentStatus: row.payment_status,
    amountSubtotalCents: row.amount_subtotal,
    amountTaxCents: row.amount_tax,
    amountTotalCents: row.amount_total,
    createdAt: row.created_at,
    notes: row.notes,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    cartItems: parseCartItems(row.cart_items),
  };
}

function parseRealtimeOrder(value: unknown): AdminOrder | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readText(value, ['id']);
  const createdAt = readText(value, ['created_at', 'createdAt']);
  const status = readText(value, ['status']) ?? 'unknown';
  const paymentStatus = readText(value, ['payment_status', 'paymentStatus']) ?? 'unknown';

  if (!id || !createdAt) {
    return null;
  }

  return {
    id,
    orderNumber: readText(value, ['order_number', 'orderNumber']),
    customerName: readText(value, ['customer_name', 'customerName']),
    customerEmail: readText(value, ['customer_email', 'customerEmail']),
    customerPhone: readText(value, ['customer_phone', 'customerPhone']),
    orderType: readText(value, ['order_type', 'orderType']),
    status,
    paymentStatus,
    amountSubtotalCents: readNumber(value, ['amount_subtotal', 'amountSubtotal']) ?? 0,
    amountTaxCents: readNumber(value, ['amount_tax', 'amountTax']) ?? 0,
    amountTotalCents: readNumber(value, ['amount_total', 'amountTotal']) ?? 0,
    createdAt,
    notes: readText(value, ['notes']),
    stripePaymentIntentId: readText(value, [
      'stripe_payment_intent_id',
      'stripePaymentIntentId',
    ]),
    cartItems: parseCartItems(value.cart_items),
  };
}

function compareByCreatedAtDesc(left: AdminOrder, right: AdminOrder): number {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function upsertOrder(items: readonly AdminOrder[], incoming: AdminOrder): AdminOrder[] {
  const next = items.filter((item) => item.id !== incoming.id);
  next.push(incoming);
  next.sort(compareByCreatedAtDesc);
  return next;
}

function removeOrder(items: readonly AdminOrder[], id: string): AdminOrder[] {
  return items.filter((item) => item.id !== id);
}

function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}

function priorityLevel(order: AdminOrder): 'normal' | 'high' | 'urgent' {
  if (order.status === 'cancelled' || order.status === 'delivered') {
    return 'normal';
  }

  const ageMinutes = minutesSince(order.createdAt);

  if (ageMinutes >= URGENT_PRIORITY_MINUTES) {
    return 'urgent';
  }

  if (ageMinutes >= HIGH_PRIORITY_MINUTES) {
    return 'high';
  }

  return 'normal';
}

function statusLabel(status: string): string {
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

function statusTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
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

function paymentTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
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

function matchesTab(order: AdminOrder, tab: FilterTab): boolean {
  if (tab === 'all') {
    return true;
  }

  if (tab === 'new') {
    return NEW_STATUSES.has(order.status);
  }

  return order.status === tab;
}

function matchesSearch(order: AdminOrder, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }

  const haystack = [
    order.orderNumber ?? '',
    order.customerName ?? '',
    order.customerEmail ?? '',
    order.customerPhone ?? '',
    order.id,
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalized);
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const mountedRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      setError(null);

      const { data, error: queryError } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (queryError) {
        throw queryError;
      }

      if (!mountedRef.current) {
        return;
      }

      setOrders((data ?? []).map(mapOrderRow));
      setLastUpdated(new Date());
    } catch (loadError) {
      if (!mountedRef.current) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : 'Failed to load orders.');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void loadOrders();

    return () => {
      mountedRef.current = false;
    };
  }, [loadOrders]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadOrders();
    }, AUTO_REFRESH_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadOrders]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-orders-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const nextOrder = parseRealtimeOrder(payload.new);
          if (!nextOrder) {
            return;
          }

          setOrders((current) => upsertOrder(current, nextOrder));
          setLastUpdated(new Date());

          const customerLabel = nextOrder.customerName ?? nextOrder.customerEmail ?? 'guest';
          setLiveAnnouncement(`New order ${nextOrder.orderNumber ?? 'received'} from ${customerLabel}.`);

          if (soundEnabled && audioRef.current) {
            void audioRef.current.play().catch(() => undefined);
          }

          return;
        }

        if (payload.eventType === 'UPDATE') {
          const nextOrder = parseRealtimeOrder(payload.new);
          if (nextOrder) {
            setOrders((current) => upsertOrder(current, nextOrder));
            setLastUpdated(new Date());
          }
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
  }, [soundEnabled]);

  useEffect(() => {
    if (!liveAnnouncement) {
      return;
    }

    const timer = window.setTimeout(() => {
      setLiveAnnouncement('');
    }, 4_000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [liveAnnouncement]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? null,
    [orders, selectedOrderId],
  );

  useEffect(() => {
    if (!selectedOrderId) {
      return;
    }

    if (!selectedOrder) {
      setSelectedOrderId(null);
    }
  }, [selectedOrder, selectedOrderId]);

  useEffect(() => {
    if (!selectedOrder) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedOrderId(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedOrder]);

  const counts = useMemo(() => {
    return {
      all: orders.length,
      new: orders.filter((order) => NEW_STATUSES.has(order.status)).length,
      preparing: orders.filter((order) => order.status === 'preparing').length,
      ready: orders.filter((order) => order.status === 'ready').length,
      delivered: orders.filter((order) => order.status === 'delivered').length,
      cancelled: orders.filter((order) => order.status === 'cancelled').length,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders
      .filter((order) => matchesTab(order, activeTab))
      .filter((order) => matchesSearch(order, search))
      .sort(compareByCreatedAtDesc);
  }, [activeTab, orders, search]);

  const queueCount = useMemo(
    () => orders.filter((order) => order.status !== 'delivered' && order.status !== 'cancelled').length,
    [orders],
  );

  const readyCount = useMemo(
    () => orders.filter((order) => order.status === 'ready').length,
    [orders],
  );

  const overdueCount = useMemo(
    () =>
      orders.filter((order) => {
        if (order.status === 'delivered' || order.status === 'cancelled') {
          return false;
        }
        return minutesSince(order.createdAt) >= URGENT_PRIORITY_MINUTES;
      }).length,
    [orders],
  );

  const paidRevenueCents = useMemo(
    () =>
      orders
        .filter((order) => order.paymentStatus === 'paid')
        .reduce((total, order) => total + order.amountTotalCents, 0),
    [orders],
  );

  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '—';

  const mutateStatus = useCallback(
    async (order: AdminOrder, nextStatus: string) => {
      if (updatingOrderId) {
        return;
      }

      const previousStatus = order.status;
      setUpdatingOrderId(order.id);
      setError(null);

      setOrders((current) =>
        current.map((item) =>
          item.id === order.id
            ? {
                ...item,
                status: nextStatus,
              }
            : item,
        ),
      );

      try {
        const { error: rpcError } = await supabase.rpc('update_order_status_secure', {
          order_id: order.id,
          new_status: nextStatus,
        });

        if (rpcError) {
          throw rpcError;
        }

        setLastUpdated(new Date());
      } catch (mutationError) {
        setOrders((current) =>
          current.map((item) =>
            item.id === order.id
              ? {
                  ...item,
                  status: previousStatus,
                }
              : item,
          ),
        );

        setError(
          mutationError instanceof Error ? mutationError.message : 'Status update failed.',
        );
      } finally {
        setUpdatingOrderId(null);
      }
    },
    [updatingOrderId],
  );

  const tabOptions: Array<{ key: FilterTab; label: string; count: number }> = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'new', label: 'New', count: counts.new },
    { key: 'preparing', label: 'Cooking', count: counts.preparing },
    { key: 'ready', label: 'Ready', count: counts.ready },
    { key: 'delivered', label: 'Delivered', count: counts.delivered },
    { key: 'cancelled', label: 'Cancelled', count: counts.cancelled },
  ];

  return (
    <div className="space-y-5">
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      <div className="sr-only" aria-live="polite">
        {liveAnnouncement || `Orders page refreshed at ${lastUpdatedLabel}.`}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Admin Orders</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Live order queue with secure status progression through the hardened RPC path.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSoundEnabled((current) => !current)}
            className={[
              'rounded-xl border px-3 py-2 text-sm font-semibold transition',
              soundEnabled
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                : 'border-zinc-700 bg-zinc-900 text-zinc-300',
            ].join(' ')}
            aria-pressed={soundEnabled}
          >
            {soundEnabled ? '🔔 Sound on' : '🔕 Muted'}
          </button>

          <button
            type="button"
            onClick={() => void loadOrders()}
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <Alert
          tone="danger"
          title="Orders error"
          message={error}
          action={
            <button
              type="button"
              onClick={() => setError(null)}
              className="rounded-lg border border-red-500/30 px-2.5 py-1 text-[11px] font-semibold text-red-100 transition hover:bg-red-500/10"
            >
              Dismiss
            </button>
          }
        />
      ) : null}

      <MetricGrid columns={4}>
        <KPICard
          label="Active Queue"
          value={queueCount}
          sub={`${counts.new} new · ${counts.preparing} cooking`}
          accent="amber"
          trend={queueCount > 0 ? 'up' : 'flat'}
          trendLabel="Live workload"
          icon="🧾"
        />
        <KPICard
          label="Ready for handoff"
          value={readyCount}
          sub="Pickup or dispatch now"
          accent="emerald"
          trend={readyCount > 0 ? 'up' : 'flat'}
          trendLabel="Ready staging lane"
          icon="✅"
        />
        <KPICard
          label="Overdue tickets"
          value={overdueCount}
          sub={`>${URGENT_PRIORITY_MINUTES} minutes old`}
          accent={overdueCount > 0 ? 'red' : 'slate'}
          trend={overdueCount > 0 ? 'down' : 'flat'}
          trendLabel={overdueCount > 0 ? 'Needs intervention' : 'No queue slippage'}
          icon="⏱️"
        />
        <KPICard
          label="Collected revenue"
          value={formatCurrency(paidRevenueCents / 100)}
          sub={`Last refresh ${lastUpdatedLabel}`}
          accent="sky"
          trend="flat"
          trendLabel="Paid orders only"
          icon="💳"
        />
      </MetricGrid>

      <div className="flex flex-wrap gap-2">
        {tabOptions.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={[
                'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition',
                isActive
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                  : 'border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900',
              ].join(' ')}
              aria-pressed={isActive}
            >
              <span>{tab.label}</span>
              <span className="rounded-full bg-black/20 px-2 py-0.5 text-[11px]">{tab.count}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
        <label htmlFor="admin-orders-search" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Search orders
        </label>
        <input
          id="admin-orders-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Order #, customer, email, phone, or order id"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-amber-500/40"
        />
      </div>

      <Panel
        title="Orders"
        subtitle={`Showing ${filteredOrders.length} of ${orders.length} total orders.`}
        noPad
      >
        {loading && orders.length === 0 ? (
          <div className="space-y-3 p-4">
            <SkeletonBlock height={72} className="rounded-2xl" />
            <SkeletonBlock height={72} className="rounded-2xl" />
            <SkeletonBlock height={72} className="rounded-2xl" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No matching orders"
              description="Adjust filters or search terms to find a ticket."
              icon="📋"
            />
          </div>
        ) : (
          <>
            <div className="md:hidden">
              <div className="space-y-3 p-4">
                {filteredOrders.map((order) => {
                  const priority = priorityLevel(order);

                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedOrderId(order.id)}
                      className={[
                        'w-full rounded-2xl border p-4 text-left transition',
                        priority === 'urgent'
                          ? 'border-red-500/30 bg-red-500/5'
                          : priority === 'high'
                            ? 'border-amber-500/25 bg-amber-500/5'
                            : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-black text-zinc-100">
                            #{order.orderNumber ?? '—'}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {order.customerName ?? order.customerEmail ?? 'Guest'}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-black text-zinc-100">
                            {formatCurrency(order.amountTotalCents / 100)}
                          </div>
                          <div className="mt-1 text-[11px] text-zinc-500">
                            {minutesSince(order.createdAt)}m ago
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
                        <Badge tone={paymentTone(order.paymentStatus)}>{order.paymentStatus}</Badge>
                        {priority !== 'normal' ? (
                          <Badge tone={priority === 'urgent' ? 'danger' : 'warning'}>
                            {priority === 'urgent' ? 'Urgent' : 'High'}
                          </Badge>
                        ) : null}
                        <Badge tone="neutral">{humanOrderType(order.orderType)}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="hidden md:block">
              <Table dense>
                <thead className="bg-zinc-950/80 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Order</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Age</th>
                    <th className="px-4 py-3 font-semibold">Payment</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {filteredOrders.map((order) => {
                    const priority = priorityLevel(order);

                    return (
                      <tr
                        key={order.id}
                        className={
                          priority === 'urgent'
                            ? 'bg-red-500/5'
                            : priority === 'high'
                              ? 'bg-amber-500/5'
                              : 'bg-zinc-950/20'
                        }
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-100">
                              #{order.orderNumber ?? '—'}
                            </span>
                            {priority !== 'normal' ? (
                              <Badge tone={priority === 'urgent' ? 'danger' : 'warning'}>
                                {priority === 'urgent' ? 'Urgent' : 'High'}
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="max-w-220px truncate text-zinc-300">
                            {order.customerName ?? order.customerEmail ?? 'Guest'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{humanOrderType(order.orderType)}</td>
                        <td className="px-4 py-3 text-zinc-400">{minutesSince(order.createdAt)}m</td>
                        <td className="px-4 py-3">
                          <Badge tone={paymentTone(order.paymentStatus)}>{order.paymentStatus}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
                        </td>
                        <td className="px-4 py-3 font-semibold text-zinc-100">
                          {formatCurrency(order.amountTotalCents / 100)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setSelectedOrderId(order.id)}
                            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Panel>

      {selectedOrder ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close order details"
            onClick={() => setSelectedOrderId(null)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-order-detail-title"
            className="relative h-full w-full max-w-xl overflow-y-auto border-l border-zinc-800 bg-[#050509] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="admin-order-detail-title" className="text-xl font-black text-white">
                  Order #{selectedOrder.orderNumber ?? '—'}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  {selectedOrder.customerName ?? selectedOrder.customerEmail ?? 'Guest'} ·{' '}
                  {minutesSince(selectedOrder.createdAt)} minutes old
                </p>
              </div>

              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setSelectedOrderId(null)}
                className="rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(selectedOrder.status)}>{statusLabel(selectedOrder.status)}</Badge>
              <Badge tone={paymentTone(selectedOrder.paymentStatus)}>
                {selectedOrder.paymentStatus}
              </Badge>
              <Badge tone="neutral">{humanOrderType(selectedOrder.orderType)}</Badge>
              {priorityLevel(selectedOrder) !== 'normal' ? (
                <Badge
                  tone={priorityLevel(selectedOrder) === 'urgent' ? 'danger' : 'warning'}
                >
                  {priorityLevel(selectedOrder) === 'urgent' ? 'Urgent' : 'High priority'}
                </Badge>
              ) : null}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Order id</div>
                <div className="mt-2 break-all text-sm font-semibold text-zinc-100">
                  {selectedOrder.id}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  Created
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-100">
                  {new Date(selectedOrder.createdAt).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  Customer
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-100">
                  {selectedOrder.customerName ?? 'Guest'}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {selectedOrder.customerEmail ?? selectedOrder.customerPhone ?? 'No contact provided'}
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">
                  Payment intent
                </div>
                <div className="mt-2 break-all text-sm font-semibold text-zinc-100">
                  {selectedOrder.stripePaymentIntentId ?? '—'}
                </div>
              </div>
            </div>

            <Panel title="Items" className="mt-5">
              {selectedOrder.cartItems.length === 0 ? (
                <p className="text-sm text-zinc-500">No cart items were stored on this order.</p>
              ) : (
                <div className="space-y-2">
                  {selectedOrder.cartItems.map((item, index) => (
                    <div
                      key={`${item.name}-${index}`}
                      className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2.5"
                    >
                      <div>
                        <div className="text-sm font-semibold text-zinc-100">{item.name}</div>
                        <div className="text-xs text-zinc-500">{item.quantity} × item</div>
                      </div>
                      <div className="text-sm font-semibold text-zinc-100">
                        {formatCurrency((item.unitPriceCents * item.quantity) / 100)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {selectedOrder.notes ? (
              <Panel title="Notes" className="mt-5">
                <p className="text-sm leading-6 text-zinc-200">{selectedOrder.notes}</p>
              </Panel>
            ) : null}

            <Panel title="Financials" className="mt-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 text-center">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Subtotal</div>
                  <div className="mt-2 text-lg font-black text-zinc-100">
                    {formatCurrency(selectedOrder.amountSubtotalCents / 100)}
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 text-center">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Tax</div>
                  <div className="mt-2 text-lg font-black text-zinc-100">
                    {formatCurrency(selectedOrder.amountTaxCents / 100)}
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 text-center">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-zinc-500">Total</div>
                  <div className="mt-2 text-lg font-black text-white">
                    {formatCurrency(selectedOrder.amountTotalCents / 100)}
                  </div>
                </div>
              </div>
            </Panel>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'delivered' ? (
                <button
                  type="button"
                  onClick={() => void mutateStatus(selectedOrder, 'cancelled')}
                  disabled={updatingOrderId === selectedOrder.id}
                  className="rounded-xl border border-red-500/30 px-3 py-2 text-sm font-semibold text-red-100 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel order
                </button>
              ) : null}

              {NEXT_STATUS[selectedOrder.status] ? (
                <button
                  type="button"
                  onClick={() => {
                    const nextStatus = NEXT_STATUS[selectedOrder.status];
                    if (nextStatus) {
                      void mutateStatus(selectedOrder, nextStatus);
                    }
                  }}
                  disabled={updatingOrderId === selectedOrder.id}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updatingOrderId === selectedOrder.id
                    ? 'Updating…'
                    : `Mark as ${statusLabel(NEXT_STATUS[selectedOrder.status] ?? '')}`}
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}