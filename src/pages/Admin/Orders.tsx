// src/pages/Admin/Orders.tsx
// =============================================================================
// ADMIN ORDERS — 2026 Production (FULLY HARDENED)
// =============================================================================
//
// SECURITY MODEL:
//   ✅ Reads: supabase.from('orders') — RLS policy: is_admin() for full access
//   ✅ Writes: update_order_status_secure() RPC — server-enforced admin check
//             Never UPDATE orders directly from client
//   ✅ Realtime: single supabase channel, cleaned up on unmount
//   ✅ No admin_* materialized view queries
//
// FEATURES:
//   • Real-time order updates (INSERT + UPDATE)
//   • Status filter tabs with live counts
//   • Search by order#, name, email, phone
//   • Order detail drawer (expand in place)
//   • Status advance via RPC with optimistic UI
//   • Sound notification toggle
//   • Auto-refresh every 20s as fallback
//   • Priority badges (urgent/high) based on wait time
//   • Formatted cart items with quantities
//   • Payment & fulfillment status badges
//   • Responsive dark theme
// =============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';
import { formatCurrency } from '@/utils/currency';
import type { Database } from '@/types/supabase'
// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type OrderRow = Database['public']['Tables']['orders']['Row'];
type FilterTab = 'all' | 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

interface CartItem {
  name: string;
  quantity: number;
  price: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const AUTO_REFRESH_MS = 20_000;
const URGENT_MINUTES = 20;
const HIGH_MINUTES = 12;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function minutesAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
}

function getPriority(order: OrderRow): 'urgent' | 'high' | 'normal' {
  if (['delivered', 'cancelled'].includes(order.status)) return 'normal';
  const mins = minutesAgo(order.created_at);
  if (mins >= URGENT_MINUTES) return 'urgent';
  if (mins >= HIGH_MINUTES) return 'high';
  return 'normal';
}

function parseCartItems(cartItems: OrderRow['cart_items']): CartItem[] {
  if (!cartItems || !Array.isArray(cartItems)) return [];
  return cartItems.map((item: unknown) => {
    const i = item as Record<string, unknown>;
    return {
      name: (i.name as string) ?? 'Item',
      quantity: (i.quantity as number) ?? 1,
      price: (i.price as number) ?? 0,
    };
  });
}

function matchesSearch(order: OrderRow, q: string): boolean {
  if (!q.trim()) return true;
  const lower = q.toLowerCase();
  return (
    String(order.order_number ?? '').includes(q) ||
    (order.customer_name?.toLowerCase().includes(lower) ?? false) ||
    (order.customer_email?.toLowerCase().includes(lower) ?? false) ||
    (order.customer_phone?.includes(q) ?? false)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_NEXT: Record<string, string | null> = {
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
  delivered: null,
  cancelled: null,
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'New',
  preparing: 'Cooking',
  ready: 'Ready',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  preparing: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  ready: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  delivered: 'bg-zinc-700/50 text-zinc-500 border-zinc-700',
  cancelled: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const PAYMENT_COLORS: Record<string, string> = {
  paid: 'text-emerald-400',
  unpaid: 'text-amber-400',
  refunded: 'text-zinc-400',
  disputed: 'text-red-400',
  failed: 'text-red-500',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [soundOn, setSoundOn] = useState(true);

  const mountedRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Load orders ───────────────────────────────────────────────────────────

  const loadOrders = useCallback(async () => {
    try {
      setError(null);
      const { data, error: qErr } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (qErr) throw qErr;
      if (mountedRef.current) {
        setOrders(data ?? []);
        setLastRefresh(new Date());
      }
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // ── Auto-refresh fallback ────────────────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(loadOrders, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadOrders]);

  // ── Realtime ─────────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;

    const channel = supabase
      .channel('admin-orders-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        const newRow = payload.new as OrderRow | undefined;
        const oldRow = payload.old as Partial<OrderRow> | undefined;

        if (payload.eventType === 'INSERT' && newRow) {
          if (soundOn && audioRef.current) {
            audioRef.current.play().catch(() => {});
          }
          setOrders((prev) => [newRow, ...prev]);
        }

        if (payload.eventType === 'UPDATE' && newRow) {
          setOrders((prev) => prev.map((o) => (o.id === newRow.id ? newRow : o)));
        }

        if (payload.eventType === 'DELETE' && oldRow?.id) {
          setOrders((prev) => prev.filter((o) => o.id !== oldRow.id));
        }
      })
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [soundOn]);

  // ── Status update via RPC (never direct UPDATE) ──────────────────────────

  async function advanceStatus(order: OrderRow) {
    const nextStatus = STATUS_NEXT[order.status];
    if (!nextStatus || updatingId) return;

    setUpdatingId(order.id);

    // Optimistic update
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o)));

    try {
      // ✅ update_order_status_secure() — server-side admin check + audit log
      const { error: rpcErr } = await supabase.rpc('update_order_status_secure', {
        order_id: order.id,
        new_status: nextStatus,
      });

      if (rpcErr) throw rpcErr;
    } catch {
      // Rollback optimistic update
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: order.status } : o)),
      );
      setError('Status update failed. Please try again.');
    } finally {
      setUpdatingId(null);
    }
  }

  async function cancelOrder(order: OrderRow) {
    if (updatingId) return;
    setUpdatingId(order.id);
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: 'cancelled' } : o)));
    try {
      const { error: rpcErr } = await supabase.rpc('update_order_status_secure', {
        order_id: order.id,
        new_status: 'cancelled',
      });
      if (rpcErr) throw rpcErr;
    } catch {
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: order.status } : o)),
      );
      setError('Cancel failed.');
    } finally {
      setUpdatingId(null);
    }
  }

  // ── Counts per tab ────────────────────────────────────────────────────────

  const counts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === 'confirmed').length,
    preparing: orders.filter((o) => o.status === 'preparing').length,
    ready: orders.filter((o) => o.status === 'ready').length,
    delivered: orders.filter((o) => o.status === 'delivered').length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length,
  };

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = orders.filter((o) => {
    if (!matchesSearch(o, search)) return false;
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return o.status === 'confirmed';
    return o.status === activeTab;
  });

  // ── Revenue total for header ──────────────────────────────────────────────

  const paidTotal = orders
    .filter((o) => o.payment_status === 'paid')
    .reduce((s, o) => s + o.amount_total, 0);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">Orders</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {paidTotal > 0 && (
              <span className="text-amber-400 font-bold">
                {formatCurrency(paidTotal / 100)} collected
              </span>
            )}
            {lastRefresh && (
              <span className="ml-2">
                · {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sound toggle */}
          <button
            onClick={() => setSoundOn((v) => !v)}
            className={[
              'px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors',
              soundOn
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-zinc-800 border-zinc-700 text-zinc-500',
            ].join(' ')}
            title={soundOn ? 'Sound on' : 'Sound off'}
          >
            {soundOn ? '🔔 Sound' : '🔕 Muted'}
          </button>

          {/* Manual refresh */}
          <button
            onClick={loadOrders}
            className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-red-400">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-xs text-zinc-600 hover:text-white ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Status tabs ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['all', 'All'],
            ['pending', 'New'],
            ['preparing', 'Cooking'],
            ['ready', 'Ready'],
            ['delivered', 'Delivered'],
            ['cancelled', 'Cancelled'],
          ] as [FilterTab, string][]
        ).map(([tab, label]) => {
          const count = counts[tab];
          const isActive = activeTab === tab;
          const isUrgent = tab === 'pending' && count > 0;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                isActive
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-zinc-800/60 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-800 hover:text-zinc-200',
              ].join(' ')}
            >
              {label}
              {count > 0 && (
                <span
                  className={[
                    'text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-18px text-center',
                    isActive
                      ? 'bg-amber-500/20 text-amber-300'
                      : isUrgent
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-zinc-700 text-zinc-400',
                  ].join(' ')}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Search ────────────────────────────────────────────────────────── */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
          width="13"
          height="13"
          viewBox="0 0 13 13"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="5.5" cy="5.5" r="4.5" />
          <path d="M9 9l3 3" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by order #, name, email, phone…"
          className="w-full pl-9 pr-4 py-2.5 bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 focus:bg-zinc-800 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Orders list ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-zinc-800/40 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="text-3xl">📋</span>
          <p className="text-sm text-zinc-500">
            {search ? 'No orders match your search' : 'No orders in this category'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => {
            const priority = getPriority(order);
            const isExpanded = expandedId === order.id;
            const isUpdating = updatingId === order.id;
            const nextStatus = STATUS_NEXT[order.status];
            const cartItems = parseCartItems(order.cart_items);
            const mins = minutesAgo(order.created_at);

            return (
              <div
                key={order.id}
                className={[
                  'rounded-2xl border transition-all',
                  priority === 'urgent'
                    ? 'border-red-500/30 bg-red-500/5'
                    : priority === 'high'
                      ? 'border-amber-500/20 bg-amber-500/5'
                      : 'border-zinc-800 bg-zinc-900/60',
                ].join(' ')}
              >
                {/* ── Main row ──────────────────────────────────────────── */}
                <div className="flex items-center gap-3 px-4 py-3.5">
                  {/* Priority indicator */}
                  <div
                    className={[
                      'w-1 h-10 rounded-full shrink-0',
                      priority === 'urgent'
                        ? 'bg-red-500'
                        : priority === 'high'
                          ? 'bg-amber-500'
                          : 'bg-zinc-700',
                    ].join(' ')}
                  />

                  {/* Order # + time */}
                  <div className="shrink-0 w-16">
                    <p className="text-xs font-black text-white">#{order.order_number ?? '—'}</p>
                    <p
                      className={[
                        'text-[10px] font-semibold',
                        priority === 'urgent'
                          ? 'text-red-400'
                          : priority === 'high'
                            ? 'text-amber-400'
                            : 'text-zinc-600',
                      ].join(' ')}
                    >
                      {mins < 1 ? 'just now' : `${mins}m ago`}
                    </p>
                  </div>

                  {/* Customer */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-200 truncate">
                      {order.customer_name || order.customer_email || 'Guest'}
                    </p>
                    {order.customer_email && order.customer_name && (
                      <p className="text-[10px] text-zinc-600 truncate">{order.customer_email}</p>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-white">
                      {formatCurrency(order.amount_total / 100)}
                    </p>
                    <p
                      className={[
                        'text-[10px] font-semibold capitalize',
                        PAYMENT_COLORS[order.payment_status] ?? 'text-zinc-500',
                      ].join(' ')}
                    >
                      {order.payment_status}
                    </p>
                  </div>

                  {/* Fulfillment status badge */}
                  <div className="shrink-0">
                    <span
                      className={[
                        'text-[10px] font-bold px-2.5 py-1 rounded-full border',
                        STATUS_COLORS[order.status] ?? 'bg-zinc-800 text-zinc-500 border-zinc-700',
                      ].join(' ')}
                    >
                      {STATUS_LABEL[order.status] ?? order.status}
                    </span>
                  </div>

                  {/* Next status button */}
                  {nextStatus && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        advanceStatus(order);
                      }}
                      disabled={isUpdating || !!updatingId}
                      className={[
                        'shrink-0 text-[10px] font-black px-3 py-1.5 rounded-lg border transition-all',
                        isUpdating
                          ? 'opacity-40 cursor-not-allowed bg-zinc-800 border-zinc-700 text-zinc-500'
                          : 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25 active:scale-95',
                      ].join(' ')}
                    >
                      {isUpdating ? '…' : `→ ${STATUS_LABEL[nextStatus]}`}
                    </button>
                  )}

                  {/* Expand toggle */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : order.id)}
                    className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors p-1"
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      className={isExpanded ? 'rotate-180' : 'rotate-0'}
                      style={{ transition: 'transform 200ms' }}
                    >
                      <polyline points="2,4 6,8 10,4" />
                    </svg>
                  </button>
                </div>

                {/* ── Expanded detail ───────────────────────────────────── */}
                {isExpanded && (
                  <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <InfoField label="Order Type" value={order.order_type} />
                      <InfoField label="Order ID" value={order.id.split('-')[0] + '…'} mono />
                      <InfoField label="Phone" value={order.customer_phone ?? '—'} />
                      <InfoField
                        label="Created"
                        value={new Date(order.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      />
                    </div>

                    {/* Cart items */}
                    {cartItems.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-600 mb-2 font-semibold">
                          Items
                        </p>
                        <div className="space-y-1.5">
                          {cartItems.map((item, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-lg bg-zinc-800/40 px-3 py-2"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-zinc-400 w-5 text-center">
                                  {item.quantity}×
                                </span>
                                <span className="text-xs text-zinc-300">{item.name}</span>
                              </div>
                              <span className="text-xs font-semibold text-zinc-400">
                                {formatCurrency((item.price * item.quantity) / 100)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {order.notes && (
                      <div className="rounded-xl bg-amber-500/8 border border-amber-500/15 px-3 py-2.5">
                        <p className="text-[10px] uppercase tracking-wider text-amber-500/70 mb-0.5 font-semibold">
                          Notes
                        </p>
                        <p className="text-xs text-amber-300">{order.notes}</p>
                      </div>
                    )}

                    {/* Financials */}
                    <div className="grid grid-cols-3 gap-3">
                      <FinanceField
                        label="Subtotal"
                        value={formatCurrency(order.amount_subtotal / 100)}
                      />
                      <FinanceField label="Tax" value={formatCurrency(order.amount_tax / 100)} />
                      <FinanceField
                        label="Total"
                        value={formatCurrency(order.amount_total / 100)}
                        highlight
                      />
                    </div>

                    {/* Footer actions */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="text-[10px] text-zinc-600">
                        {order.stripe_payment_intent_id && (
                          <span>PI: {order.stripe_payment_intent_id.slice(-8)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {order.status !== 'cancelled' && order.status !== 'delivered' && (
                          <button
                            onClick={() => cancelOrder(order)}
                            disabled={isUpdating || !!updatingId}
                            className="text-[10px] font-semibold text-red-500 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                          >
                            Cancel Order
                          </button>
                        )}
                        {nextStatus && (
                          <button
                            onClick={() => advanceStatus(order)}
                            disabled={isUpdating || !!updatingId}
                            className="text-[10px] font-black text-white bg-amber-500/80 hover:bg-amber-500 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-40 active:scale-95"
                          >
                            {isUpdating ? 'Updating…' : `Mark as ${STATUS_LABEL[nextStatus]}`}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Result count */}
      {!loading && (
        <p className="text-[10px] text-zinc-700 text-center py-2">
          Showing {filtered.length} of {orders.length} orders
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function InfoField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-0.5 font-semibold">
        {label}
      </p>
      <p className={['text-xs text-zinc-300', mono ? 'font-mono' : ''].join(' ')}>{value}</p>
    </div>
  );
}

function FinanceField({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-zinc-800/40 border border-zinc-700/50 px-3 py-2 text-center">
      <p className="text-[9px] uppercase tracking-wider text-zinc-600 mb-0.5">{label}</p>
      <p className={['text-sm font-black', highlight ? 'text-white' : 'text-zinc-400'].join(' ')}>
        {value}
      </p>
    </div>
  );
}
