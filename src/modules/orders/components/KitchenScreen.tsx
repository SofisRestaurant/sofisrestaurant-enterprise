import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { OrderStatus, PaymentStatus } from '@/domain/orders/order.types';
import { updateOrderStatus } from '@/modules/orders/api/orders.api';
import { writeFulfillmentEvidence } from '@/modules/orders/api/order-evidence.api';
import { useOrdersRealtime } from '@/modules/orders/hooks/useOrdersRealtime';
import { mapOrderRowToDomain } from '@/modules/orders/mappers';
import { supabase } from '@/lib/supabase/supabaseClient';
import type { Database } from '@/types/supabase';

import { KitchenColumn } from './kitchen/KitchenColumn';
import { KitchenHandoffModal } from './kitchen/KitchenHandoffModal';
import { playNotification } from './kitchen/kitchen.audio';
import { CONFIG } from './kitchen/kitchen.constants';
import { isPaidPaymentStatus, normalizeOrderType, resolveStaffId } from './kitchen/kitchen.helpers';
import { mapToKitchenOrder } from './kitchen/kitchen.order-mappers';
import type { HandoffContext, KitchenOrderWithType } from './kitchen/kitchen.types';

type OrderRow = Database['public']['Tables']['orders']['Row'];

function getTimeSince(timestamp: string): string {
  const minutes = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000);

  if (minutes < 1) {
    return 'Just now';
  }

  if (minutes === 1) {
    return '1 min ago';
  }

  return `${minutes} mins ago`;
}

/**
 * Sort kitchen orders with scheduled (pickup_time) orders first by earliest
 * pickup, then ASAP orders by most-recent created_at.
 */
function sortKitchenOrders(orders: readonly KitchenOrderWithType[]): KitchenOrderWithType[] {
  return [...orders].sort((a, b) => {
    const aTime = a.pickup_time ? new Date(a.pickup_time).getTime() : null;
    const bTime = b.pickup_time ? new Date(b.pickup_time).getTime() : null;

    // Both scheduled → earliest pickup first
    if (aTime !== null && bTime !== null) return aTime - bTime;
    // Scheduled before ASAP
    if (aTime !== null) return -1;
    if (bTime !== null) return 1;
    // Both ASAP → most recent first
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// ── Debug helpers ─────────────────────────────────────────────────────────────

const DEBUG = process.env.NODE_ENV !== 'production';

function debugLog(stage: string, data: unknown): void {
  if (DEBUG) {
    console.log(`[KitchenScreen] ${stage}`, data);
  }
}

function debugOrderSummary(

  label: string,

  orders: readonly KitchenOrderWithType[],

): void {

  if (!DEBUG) return;

  console.table(

    orders.map((o) => ({

      id: o.id.slice(0, 8),

      status: o.status,

      pickup_time: o.pickup_time ?? 'ASAP',

      created_at: o.created_at,

      customer: o.customer_name,

    })),

  );

  debugLog(label, `${orders.length} orders`);

}

// ═══════════════════════════════════════════════════════════════════════════════

export default function KitchenScreen() {
  const [orders, setOrders] = useState<KitchenOrderWithType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(CONFIG.DEFAULT_SOUND_ENABLED);
  const [handoffContext, setHandoffContext] = useState<HandoffContext | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const unlock = (): void => {
      const audio = audioRef.current;

      if (audio !== null) {
        void audio
          .play()
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
          })
          .catch(() => {
            // Best-effort unlock only.
          });
      }

      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('click', unlock);
    };

    window.addEventListener('touchstart', unlock);
    window.addEventListener('click', unlock);

    return () => {
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('click', unlock);
    };
  }, []);

  const loadOrders = useCallback(async (): Promise<void> => {
    try {
      setErrorMessage(null);

      const { data, error } = await supabase
        .from('orders')
        .select(
          'id,created_at,updated_at,currency,order_type,payment_status,status,' +
            'stripe_session_id,amount_shipping,amount_subtotal,amount_tax,amount_total,' +
            'assigned_to,cart_items,customer_email,customer_name,customer_phone,' +
            'customer_uid,notes,shipping_name,shipping_phone,stripe_payment_intent_id,' +
            'metadata,order_number,shipping_address,pickup_time',
        )
        .eq('payment_status', PaymentStatus.PAID)
        .in('status', [OrderStatus.CONFIRMED, OrderStatus.PREPARING, OrderStatus.READY])
        .order('created_at', { ascending: false })
        .returns<OrderRow[]>();

      if (error !== null) {
        throw error;
      }

      debugLog('loadOrders:raw', {
        rowCount: data?.length ?? 0,
        pickupTimes: (data ?? []).map((r) => ({
          id: r.id?.slice(0, 8),
          pickup_time: r.pickup_time,
          status: r.status,
          payment_status: r.payment_status,
        })),
      });

      const kitchenOrders = (data ?? []).map((row) =>
        mapToKitchenOrder(mapOrderRowToDomain(row), row.order_type),
      );

      debugLog('loadOrders:mapped', {
        count: kitchenOrders.length,
        pickupTimes: kitchenOrders.map((o) => ({
          id: o.id.slice(0, 8),
          pickup_time: o.pickup_time,
        })),
      });

      const sorted = sortKitchenOrders(kitchenOrders);
      debugOrderSummary('loadOrders:sorted', sorted);

      setOrders(sorted);
      setLastRefreshAt(new Date());
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load kitchen orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const handleRealtime = useCallback(
    (row: OrderRow): void => {
      const order = mapOrderRowToDomain(row);

      debugLog('realtime:incoming', {
        id: order.id.slice(0, 8),
        status: order.status,
        payment_status: order.payment_status,
        pickup_time: order.pickup_time,
      });

      if (!isPaidPaymentStatus(order.payment_status)) {
        debugLog('realtime:skipped', 'not paid');
        return;
      }

      setOrders((previous) => {
        if (order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED) {
          debugLog('realtime:removed', order.id.slice(0, 8));
          return previous.filter((entry) => entry.id !== order.id);
        }

        const mapped = mapToKitchenOrder(order, row.order_type);

        debugLog('realtime:mapped', {
          id: mapped.id.slice(0, 8),
          pickup_time: mapped.pickup_time,
        });

        const exists = previous.some((entry) => entry.id === order.id);

        if (!exists) {
          if (soundEnabled) {
            playNotification(audioRef.current);
          }

          const next = sortKitchenOrders([mapped, ...previous]);
          debugOrderSummary('realtime:inserted', next);
          return next;
        }

        const next = sortKitchenOrders(
          previous.map((entry) => (entry.id === order.id ? mapped : entry)),
        );
        debugOrderSummary('realtime:updated', next);
        return next;
      });
    },
    [soundEnabled],
  );

  useOrdersRealtime({
    channelName: 'admin-kitchen',
    onInsert: handleRealtime,
    onUpdate: handleRealtime,
  });

  // Alert kitchen when a scheduled pickup is within 15 minutes
  useEffect(() => {
    const ALERT_WINDOW_MS = 15 * 60 * 1000;

    const checkUpcoming = () => {
      const now = Date.now();
      orders.forEach((order) => {
        if (!order.pickup_time) return;
        const due = new Date(order.pickup_time).getTime();
        const diff = due - now;
        if (diff > 0 && diff <= ALERT_WINDOW_MS && order.status === OrderStatus.CONFIRMED) {
          if (soundEnabled) playNotification(audioRef.current);
        }
      });
    };

    const id = window.setInterval(checkUpcoming, 60_000);
    checkUpcoming();
    return () => window.clearInterval(id);
  }, [orders, soundEnabled]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadOrders();
    }, CONFIG.AUTO_REFRESH_INTERVAL);

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        void loadOrders();
      }
    };

    const onReconnect = (): void => {
      void loadOrders();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onReconnect);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onReconnect);
    };
  }, [loadOrders]);

  const updateStatus = useCallback(async (id: string, status: OrderStatus): Promise<void> => {
    try {
      setErrorMessage(null);

      const updated = await updateOrderStatus(id, status);

      setOrders((previous) =>
        sortKitchenOrders(
          previous.map((entry) => (entry.id === id ? { ...entry, status: updated.status } : entry)),
        ),
      );
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update order status.');
    }
  }, []);

  const requestHandoff = useCallback(
    async (id: string): Promise<void> => {
      const staffId = await resolveStaffId();

      if (staffId === null) {
        setErrorMessage('Cannot complete handoff: no authenticated staff session.');
        return;
      }

      const order = orders.find((entry) => entry.id === id);
      const orderType = normalizeOrderType(order?.order_type);

      setHandoffContext({
        orderId: id,
        orderType,
        nextStatus: OrderStatus.DELIVERED,
        staffId,
      });
    },
    [orders],
  );

  const confirmHandoff = useCallback(
    async (
      context: HandoffContext,
      recipientName: string,
      handoffNotes: string,
      pinVerified: boolean,
    ): Promise<void> => {
      setHandoffContext(null);
      setErrorMessage(null);

      try {
        const updated = await updateOrderStatus(context.orderId, context.nextStatus);

        setOrders((previous) =>
          sortKitchenOrders(
            previous.map((entry) =>
              entry.id === context.orderId ? { ...entry, status: updated.status } : entry,
            ),
          ),
        );
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to mark order handoff complete.',
        );
        return;
      }

      const safeRecipient = recipientName.trim() || undefined;
      const safeNotes = handoffNotes.trim() || undefined;

      if (context.orderType === 'delivery') {
        const evidenceResult = await writeFulfillmentEvidence({
          type: 'delivery',
          orderId: context.orderId,
          staffId: context.staffId,
          recipientName: safeRecipient,
          handoffNotes: safeNotes,
        });

        if (!evidenceResult.ok) {
          setErrorMessage(evidenceResult.error);
        }

        return;
      }

      if (context.orderType === 'dine_in') {
        const evidenceResult = await writeFulfillmentEvidence({
          type: 'dine_in',
          orderId: context.orderId,
          staffId: context.staffId,
          handoffNotes: safeNotes,
        });

        if (!evidenceResult.ok) {
          setErrorMessage(evidenceResult.error);
        }

        return;
      }

      const evidenceResult = await writeFulfillmentEvidence({
        type: 'pickup',
        orderId: context.orderId,
        staffId: context.staffId,
        recipientName: safeRecipient,
        pickedUpByName: safeRecipient,
        handoffNotes: safeNotes,
        pinVerified,
      });

      if (!evidenceResult.ok) {
        setErrorMessage(evidenceResult.error);
      }
    },
    [],
  );

  const confirmedOrders = useMemo(
    () => orders.filter((entry) => entry.status === OrderStatus.CONFIRMED),
    [orders],
  );

  const preparingOrders = useMemo(
    () => orders.filter((entry) => entry.status === OrderStatus.PREPARING),
    [orders],
  );

  const readyOrders = useMemo(
    () => orders.filter((entry) => entry.status === OrderStatus.READY),
    [orders],
  );

  // Debug: log final render state
  useEffect(() => {
    debugLog('render:state', {
      total: orders.length,
      confirmed: confirmedOrders.length,
      preparing: preparingOrders.length,
      ready: readyOrders.length,
      scheduled: orders.filter((o) => o.pickup_time !== null).length,
      asap: orders.filter((o) => o.pickup_time === null).length,
    });
  }, [orders, confirmedOrders, preparingOrders, readyOrders]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 text-white">
        Loading kitchen...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 p-4 text-white sm:p-6">
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      {handoffContext !== null ? (
        <KitchenHandoffModal
          context={handoffContext}
          onConfirm={confirmHandoff}
          onCancel={() => setHandoffContext(null)}
        />
      ) : null}

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Kitchen</h1>
          <p className="text-sm text-neutral-400">{orders.length} active orders</p>
          {lastRefreshAt !== null ? (
            <p className="mt-1 text-xs text-neutral-500">
              Last refresh: {lastRefreshAt.toLocaleTimeString()}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setSoundEnabled((current) => !current)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              soundEnabled
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-neutral-800 hover:bg-neutral-700'
            }`}
          >
            {soundEnabled ? '🔔 Sound On' : '🔕 Sound Off'}
          </button>

          <button
            type="button"
            onClick={() => {
              void loadOrders();
            }}
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-medium hover:bg-neutral-700"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {errorMessage !== null ? (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <KitchenColumn
          title="NEW"
          color="bg-red-600"
          orders={confirmedOrders}
          onAction={(id: string) => {
            void updateStatus(id, OrderStatus.PREPARING);
          }}
          actionLabel="Start Preparing"
          actionColor="bg-yellow-500 hover:bg-yellow-400 text-black"
          getTimeSince={getTimeSince}
        />

        <KitchenColumn
          title="PREPARING"
          color="bg-yellow-500"
          orders={preparingOrders}
          onAction={(id: string) => {
            void updateStatus(id, OrderStatus.READY);
          }}
          actionLabel="Mark Ready"
          actionColor="bg-green-600 hover:bg-green-500"
          getTimeSince={getTimeSince}
        />

        <KitchenColumn
          title="READY"
          color="bg-green-600"
          orders={readyOrders}
          onAction={(id: string) => {
            void requestHandoff(id);
          }}
          actionLabel="Complete Handoff"
          actionColor="bg-orange-600 hover:bg-orange-500"
          getTimeSince={getTimeSince}
        />
      </div>
    </div>
  );
}