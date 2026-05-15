// =============================================================================
// PATH: src/modules/orders/components/ExpoCommandCenter.tsx
// =============================================================================
// EXPO COMMAND CENTER — FULFILLMENT EVIDENCE + DISPUTE DEFENSE — 2026
// =============================================================================
// ✅ All original logic preserved (realtime, priority, sound, failsafe)
// ✅ "Handed Out" button opens HandoffModal instead of direct DB write
// ✅ HandoffModal captures recipient name, handoff notes, PIN verification
// ✅ Evidence strength bar shows staff how strong their record will be
// ✅ writeFulfillmentEvidence called after order status update (best-effort)
// ✅ Staff ID resolved from live Supabase session — never passed from client
// ✅ Order type drives which evidence fields are shown
// ✅ Fixed no-floating-promises / no-misused-promises / await-thenable lint errors
// ✅ Fixed unsafe enum comparison on payment_status / realtime subscribe state
// ✅ Removed array-index key usage
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  Bell,
  BellOff,
  CheckCircle,
  ClipboardList,
  Clock,
  Package,
  RefreshCcw,
  User,
  X,
} from 'lucide-react';

import {
  OrderStatus,
  PaymentStatus,
  type KitchenOrder,
  type Order,
} from '@/domain/orders/order.types';
import { supabase, isRealtimeSubscribed } from '@/lib/supabase/supabaseClient';
import { writeFulfillmentEvidence } from '@/modules/orders/api/order-evidence.api';
import { mapOrderRowToDomain } from '@/modules/orders/mappers';
import type { Database } from '@/types/supabase';

// ============================================================================
// TYPES
// ============================================================================

type OrderRow = Database['public']['Tables']['orders']['Row'];
type Priority = 'urgent' | 'high' | 'normal';
type OrderType = 'pickup' | 'delivery' | 'dine_in';

type CartItemLike = {
  id?: string | null;
  name?: string | null;
  quantity?: number | null;
};

interface ExpoOrder extends KitchenOrder {
  minutes: number;
  priority: Priority;
  order_type?: string;
}

interface HandoffContext {
  orderId: string;
  orderType: OrderType;
  staffId: string;
}

// ============================================================================
// CONFIG
// ============================================================================

const CONFIG = {
  AUTO_REFRESH_INTERVAL: 15_000,
  URGENT_MINUTES: 15,
  HIGH_MINUTES: 8,
  SOUND_ENABLED_DEFAULT: true,
} as const;

// ============================================================================
// HELPERS
// ============================================================================

async function resolveStaffId(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

function isPaidPaymentStatus(value: unknown): boolean {
  return value === PaymentStatus.PAID || value === 'paid';
}

function isOrderReadyStatus(value: unknown): boolean {
  return value === OrderStatus.READY || value === 'ready';
}

function isOrderDeliveredStatus(value: unknown): boolean {
  return value === OrderStatus.DELIVERED || value === 'delivered';
}

function normalizeOrderType(value: unknown): OrderType {
  if (value === 'delivery') {
    return 'delivery';
  }

  if (value === 'dine_in') {
    return 'dine_in';
  }

  return 'pickup';
}

function removeChannelSafely(channel: RealtimeChannel): void {
  void supabase.removeChannel(channel).catch(() => {
    // Best-effort cleanup only.
  });
}

function getLineItemKey(orderId: string, item: CartItemLike, position: number): string {
  const idPart = typeof item.id === 'string' && item.id.trim().length > 0 ? item.id.trim() : null;
  if (idPart) {
    return `${orderId}:${idPart}`;
  }

  const namePart =
    typeof item.name === 'string' && item.name.trim().length > 0 ? item.name.trim() : 'item';
  const quantityPart =
    typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : 0;

  return `${orderId}:${namePart}:${quantityPart}:${position}`;
}

function playNotification(audio: HTMLAudioElement | null): void {
  if (!audio) {
    return;
  }

  void audio.play().catch(() => {
    // Ignore autoplay / device playback failures.
  });
}

function mapToExpoOrder(order: Order, rawOrderType?: unknown): ExpoOrder {
  const createdAtMs = new Date(order.created_at).getTime();
  const minutes = Number.isFinite(createdAtMs)
    ? Math.max(0, Math.floor((Date.now() - createdAtMs) / 60_000))
    : 0;

  const priority: Priority =
    minutes >= CONFIG.URGENT_MINUTES
      ? 'urgent'
      : minutes >= CONFIG.HIGH_MINUTES
        ? 'high'
        : 'normal';

  return {
    id: order.id,
    assigned_to: order.assigned_to ?? null,
    created_at: order.created_at,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    amount_total: order.amount_total,
    status: order.status,
    cart_items: order.cart_items ?? [],
    minutes,
    priority,
    order_type: typeof rawOrderType === 'string' ? rawOrderType : undefined,
    fulfillment_type: order.fulfillment_type,
    pickup_time: order.pickup_time,
    notes: order.notes,
  };
}

function sortByPriority(list: ExpoOrder[]): ExpoOrder[] {
  const weight: Record<Priority, number> = {
    urgent: 0,
    high: 1,
    normal: 2,
  };

  return [...list].sort((left, right) => {
    const byPriority = weight[left.priority] - weight[right.priority];
    if (byPriority !== 0) {
      return byPriority;
    }

    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  });
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ExpoCommandCenter() {
  const [orders, setOrders] = useState<ExpoOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(CONFIG.SOUND_ENABLED_DEFAULT);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [handoffContext, setHandoffContext] = useState<HandoffContext | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ============================================================================
  // LOAD ORDERS
  // ============================================================================

  const loadOrders = useCallback(async (): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, guest_phone_e164, sms_opt_in')
        .eq('payment_status', PaymentStatus.PAID)
        .eq('status', OrderStatus.READY)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      const enriched = (data ?? [])
        .map((row) => mapOrderRowToDomain(row))
        .map((order, index) => mapToExpoOrder(order, data?.[index]?.order_type));

      setOrders(sortByPriority(enriched));
      setLastRefresh(new Date());
    } catch (error) {
      console.error('❌ Expo load error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  // ============================================================================
  // REALTIME SUBSCRIPTION
  // ============================================================================

  useEffect(() => {
    if (channelRef.current) {
      removeChannelSafely(channelRef.current);
      channelRef.current = null;
    }

    const handleUpdate = (payload: { new: OrderRow }): void => {
      const row = payload.new;
      if (!row) {
        return;
      }

      if (!isPaidPaymentStatus(row.payment_status)) {
        return;
      }

      const order = mapOrderRowToDomain(row);

      setOrders((prev) => {
        if (isOrderDeliveredStatus(order.status)) {
          return prev.filter((existing) => existing.id !== order.id);
        }

        if (isOrderReadyStatus(order.status)) {
          const exists = prev.some((existing) => existing.id === order.id);
          const enriched = mapToExpoOrder(order, row.order_type);

          if (!exists) {
            if (soundEnabled) {
              playNotification(audioRef.current);
            }

            return sortByPriority([...prev, enriched]);
          }

          return sortByPriority(
            prev.map((existing) => (existing.id === order.id ? enriched : existing)),
          );
        }

        return prev.filter((existing) => existing.id !== order.id);
      });
    };

    const channel = supabase
      .channel('expo-command-center')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, handleUpdate)
      .subscribe((status) => {
        if (isRealtimeSubscribed(status)) {
          console.log('🟢 Expo real-time connected');
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        removeChannelSafely(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [soundEnabled]);

  // ============================================================================
  // FAILSAFE AUTO-REFRESH
  // ============================================================================

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      console.log('🔄 Expo failsafe refresh');
      void loadOrders();
    }, CONFIG.AUTO_REFRESH_INTERVAL);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadOrders]);

  // ============================================================================
  // COMPLETE ORDER — opens HandoffModal, then writes evidence + updates status
  // ============================================================================

  const requestHandoff = useCallback(
    async (id: string): Promise<void> => {
      const staffId = await resolveStaffId();
      if (!staffId) {
        console.error('❌ Cannot record handoff: no authenticated staff session');
        return;
      }

      const order = orders.find((entry) => entry.id === id);
      const orderType = normalizeOrderType(order?.order_type);

      setHandoffContext({
        orderId: id,
        orderType,
        staffId,
      });
    },
    [orders],
  );

  const confirmHandoff = useCallback(
    async (
      ctx: HandoffContext,
      recipientName: string,
      handoffNotes: string,
      pinVerified: boolean,
    ): Promise<void> => {
      setHandoffContext(null);

      try {
        const { error } = await supabase
          .from('orders')
          .update({
            status: OrderStatus.DELIVERED,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ctx.orderId);

        if (error) {
          throw error;
        }

        setOrders((prev) => prev.filter((entry) => entry.id !== ctx.orderId));
        console.log('✅ Order delivered:', ctx.orderId);
      } catch (error) {
        console.error('❌ Complete order failed:', error);
      }

      const safeRecipient = recipientName.trim() || undefined;
      const safeNotes = handoffNotes.trim() || undefined;

      if (ctx.orderType === 'delivery') {
        const result = await writeFulfillmentEvidence({
          type: 'delivery',
          orderId: ctx.orderId,
          staffId: ctx.staffId,
          recipientName: safeRecipient,
          handoffNotes: safeNotes,
        });

        if (!result.ok) {
          console.error('⚠️ Delivery evidence write failed:', result.error);
        }

        return;
      }

      if (ctx.orderType === 'dine_in') {
        const result = await writeFulfillmentEvidence({
          type: 'dine_in',
          orderId: ctx.orderId,
          staffId: ctx.staffId,
          handoffNotes: safeNotes,
        });

        if (!result.ok) {
          console.error('⚠️ Dine-in evidence write failed:', result.error);
        }

        return;
      }

      const result = await writeFulfillmentEvidence({
        type: 'pickup',
        orderId: ctx.orderId,
        staffId: ctx.staffId,
        recipientName: safeRecipient,
        pickedUpByName: safeRecipient,
        handoffNotes: safeNotes,
        pinVerified,
      });

      if (!result.ok) {
        console.error('⚠️ Pickup evidence write failed:', result.error);
      }
    },
    [],
  );

  // ============================================================================
  // LOADING STATE
  // ============================================================================

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white">
        <div className="text-center">
          <Package className="mx-auto h-12 w-12 animate-pulse text-orange-500" />
          <p className="mt-4 text-lg">Loading Expo Command Center...</p>
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-black text-white">
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      {handoffContext ? (
        <HandoffModal
          context={handoffContext}
          onConfirm={confirmHandoff}
          onCancel={() => setHandoffContext(null)}
        />
      ) : null}

      <header className="border-b border-neutral-800 bg-neutral-900 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Package className="h-8 w-8 text-orange-500" />
            <div>
              <h1 className="text-2xl font-bold">Expo Command Center</h1>
              <p className="text-sm text-neutral-400">
                {orders.length} {orders.length === 1 ? 'order' : 'orders'} ready for pickup
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {lastRefresh ? (
              <div className="text-xs text-neutral-500">
                <Clock className="inline h-3 w-3" /> Last refresh:{' '}
                {lastRefresh.toLocaleTimeString()}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => {
                void loadOrders();
              }}
              className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold transition-colors hover:bg-neutral-700"
              title="Refresh orders"
            >
              <RefreshCcw className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setSoundEnabled((prev) => !prev)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                soundEnabled
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-neutral-700 hover:bg-neutral-600'
              }`}
              title={soundEnabled ? 'Sound enabled' : 'Sound disabled'}
            >
              {soundEnabled ? (
                <>
                  <Bell className="inline h-4 w-4" /> Sound On
                </>
              ) : (
                <>
                  <BellOff className="inline h-4 w-4" /> Sound Off
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="p-6">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Package className="h-16 w-16 text-neutral-700" />
            <h2 className="mt-4 text-xl font-bold text-neutral-500">All clear!</h2>
            <p className="mt-2 text-sm text-neutral-600">No orders waiting for handoff</p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} onComplete={requestHandoff} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================================
// HANDOFF MODAL
// ============================================================================

interface HandoffModalProps {
  context: HandoffContext;
  onConfirm: (
    ctx: HandoffContext,
    recipientName: string,
    handoffNotes: string,
    pinVerified: boolean,
  ) => Promise<void>;
  onCancel: () => void;
}

function HandoffModal({ context, onConfirm, onCancel }: HandoffModalProps) {
  const [recipientName, setRecipientName] = useState('');
  const [handoffNotes, setHandoffNotes] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isPickup = context.orderType === 'pickup';
  const isDelivery = context.orderType === 'delivery';

  const handleConfirm = useCallback(async (): Promise<void> => {
    setSubmitting(true);
    try {
      await onConfirm(context, recipientName, handoffNotes, pinVerified);
    } finally {
      setSubmitting(false);
    }
  }, [context, handoffNotes, onConfirm, pinVerified, recipientName]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="expo-handoff-title"
        className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-400" />
            <h2 id="expo-handoff-title" className="text-xl font-bold">
              {isPickup ? 'Confirm Pickup' : isDelivery ? 'Confirm Delivery' : 'Confirm Handoff'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-white"
            aria-label="Cancel"
            disabled={submitting}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {isPickup || isDelivery ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-300">
                <User className="mr-1 inline h-3.5 w-3.5" />
                {isPickup ? 'Picked up by' : 'Received by'}
                <span className="ml-1 text-neutral-500">(optional but strongly recommended)</span>
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                placeholder={isPickup ? 'Customer name' : 'Recipient name'}
                maxLength={200}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none"
              />
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              <ClipboardList className="mr-1 inline h-3.5 w-3.5" />
              Handoff notes
              <span className="ml-1 text-neutral-500">(optional)</span>
            </label>
            <textarea
              value={handoffNotes}
              onChange={(event) => setHandoffNotes(event.target.value)}
              placeholder="e.g. Left at front desk, Customer showed ID, No issues..."
              maxLength={500}
              rows={2}
              className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-orange-500 focus:outline-none"
            />
          </div>

          {isPickup ? (
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3">
              <input
                type="checkbox"
                checked={pinVerified}
                onChange={(event) => setPinVerified(event.target.checked)}
                className="h-4 w-4 accent-orange-500"
              />
              <span className="text-sm text-neutral-300">Customer PIN verified at handoff</span>
            </label>
          ) : null}
        </div>

        <EvidenceStrengthBar
          orderType={context.orderType}
          hasRecipient={recipientName.trim().length > 0}
          hasPinVerified={pinVerified}
          hasNotes={handoffNotes.trim().length > 0}
        />

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 py-3 font-semibold text-neutral-300 transition-colors hover:bg-neutral-700"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void handleConfirm();
            }}
            disabled={submitting}
            className="flex-1 rounded-lg bg-green-600 py-3 font-bold text-white transition-colors hover:bg-green-500 disabled:bg-neutral-700 disabled:text-neutral-500"
          >
            {submitting ? 'Saving...' : '✓ Confirm Handoff'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EVIDENCE STRENGTH BAR
// ============================================================================

interface EvidenceStrengthBarProps {
  orderType: OrderType;
  hasRecipient: boolean;
  hasPinVerified: boolean;
  hasNotes: boolean;
}

function EvidenceStrengthBar({
  orderType,
  hasRecipient,
  hasPinVerified,
  hasNotes,
}: EvidenceStrengthBarProps) {
  let score = 0;
  const signals: string[] = [];

  score += 1;
  signals.push('Staff authenticated');

  if (hasRecipient) {
    score += 3;
    signals.push('Recipient name captured');
  }

  if (hasPinVerified && orderType === 'pickup') {
    score += 3;
    signals.push('PIN verified');
  }

  if (hasNotes) {
    score += 1;
    signals.push('Handoff notes');
  }

  if (orderType === 'dine_in') {
    score = Math.max(score, 5);
    signals.push('Dine-in table service');
  }

  const max = orderType === 'pickup' ? 8 : 5;
  const pct = Math.min(100, Math.round((score / max) * 100));
  const label = pct >= 80 ? 'Strong' : pct >= 50 ? 'Moderate' : 'Weak';
  const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  const textColor = pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="mt-4 rounded-lg border border-neutral-700 bg-neutral-950 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400">Dispute defense strength</span>
        <span className={`text-xs font-bold ${textColor}`}>
          {label} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {signals.map((signal) => (
          <span
            key={signal}
            className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400"
          >
            ✓ {signal}
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// ORDER CARD
// ============================================================================

interface OrderCardProps {
  order: ExpoOrder;
  onComplete: (id: string) => Promise<void>;
}

function OrderCard({ order, onComplete }: OrderCardProps) {
  const [isRequesting, setIsRequesting] = useState(false);

  const handleComplete = useCallback(async (): Promise<void> => {
    setIsRequesting(true);
    try {
      await onComplete(order.id);
    } finally {
      setIsRequesting(false);
    }
  }, [onComplete, order.id]);

  const borderColor =
    order.priority === 'urgent'
      ? 'border-red-500 shadow-lg shadow-red-500/20 animate-pulse'
      : order.priority === 'high'
        ? 'border-yellow-500 shadow-lg shadow-yellow-500/20'
        : 'border-neutral-700';

  const timeColor =
    order.priority === 'urgent'
      ? 'text-red-400'
      : order.priority === 'high'
        ? 'text-yellow-400'
        : 'text-neutral-400';

  return (
    <div
      className={`rounded-lg border-2 ${borderColor} bg-neutral-900 p-5 transition-all hover:scale-105`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-xl font-bold">{order.customer_name || 'Guest Order'}</h3>
          {order.customer_phone ? (
            <p className="mt-1 text-xs text-neutral-500">{order.customer_phone}</p>
          ) : null}
        </div>

        <div className="text-right">
          <div className={`text-2xl font-bold ${timeColor}`}>{order.minutes}m</div>
          {order.priority === 'urgent' ? (
            <div className="mt-1 text-xs font-semibold text-red-400">URGENT</div>
          ) : null}
          {order.priority === 'high' ? (
            <div className="mt-1 text-xs font-semibold text-yellow-400">HIGH PRIORITY</div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-neutral-950/50 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-400">Order Total</span>
          <span className="text-lg font-bold text-green-400">
            ${(order.amount_total / 100).toFixed(2)}
          </span>
        </div>
      </div>

      {order.cart_items && order.cart_items.length > 0 ? (
        <div className="mt-3 space-y-1">
          {order.cart_items.slice(0, 3).map((item, position) => {
            const cartItem = item as CartItemLike;
            return (
              <div
                key={getLineItemKey(order.id, cartItem, position)}
                className="text-xs text-neutral-500"
              >
                <span className="font-semibold text-orange-400">{item.quantity}×</span> {item.name}
              </div>
            );
          })}
          {order.cart_items.length > 3 ? (
            <div className="text-xs text-neutral-600">
              +{order.cart_items.length - 3} more items
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          void handleComplete();
        }}
        disabled={isRequesting}
        className="mt-4 w-full rounded-lg bg-green-600 py-3 font-bold text-white transition-colors hover:bg-green-500 disabled:bg-neutral-700 disabled:text-neutral-500"
      >
        {isRequesting ? 'Opening...' : '✓ Handed Out'}
      </button>
    </div>
  );
}