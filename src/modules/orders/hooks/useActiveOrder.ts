// src/features/orders/useActiveOrder.ts

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/supabaseClient';
import { OrderStatus } from '@/domain/orders/order.types';

const TRACKABLE_STATUSES = [
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.SHIPPED,
] as const;

function isTrackableStatus(value: unknown): value is (typeof TRACKABLE_STATUSES)[number] {
  return TRACKABLE_STATUSES.includes(value as (typeof TRACKABLE_STATUSES)[number]);
}

function isTerminalStatus(value: unknown): boolean {
  return value === OrderStatus.CANCELLED || value === OrderStatus.DELIVERED;
}

export function useActiveOrder(userId: string | null): string | null {
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);

  // ─────────────────────────────────────────────
  // Fetch active order
  // ─────────────────────────────────────────────

  
  useEffect(() => {
    if (!userId) {
      setActiveOrderId(null);
      return;
    }

    const safeUserId = userId;
    let alive = true;

    async function fetchActiveOrder(): Promise<void> {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('id, status, payment_status')
          .eq('customer_uid', safeUserId)
          .eq('payment_status', 'paid')
          .in('status', TRACKABLE_STATUSES)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!alive) return;
        if (error) {
          setActiveOrderId(null);
          return;
        }

        const nextId =
          data &&
          typeof data.id === 'string' &&
          data.payment_status === 'paid' &&
          isTrackableStatus(data.status)
            ? data.id
            : null;

        setActiveOrderId(nextId);
      } catch {
        if (!alive) return;
        setActiveOrderId(null);
      }
    }

    void fetchActiveOrder().catch(() => {
      if (!alive) return;
      setActiveOrderId(null);
    });

    return () => {
      alive = false;
    };
  }, [userId]);

  // ─────────────────────────────────────────────
  // Realtime updates
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!activeOrderId) {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current).catch(() => {
          // ignore cleanup failure
        });
        channelRef.current = null;
      }
      return;
    }

    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current).catch(() => {
        // ignore cleanup failure
      });
      channelRef.current = null;
    }

    const channel = supabase.channel(`active-order-${activeOrderId}`);
    channelRef.current = channel;

    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${activeOrderId}`,
      },
      (payload) => {
        if (!payload?.new || typeof payload.new !== 'object') return;

        const nextRow = payload.new as {
          status?: unknown;
          payment_status?: unknown;
        };

        const status = nextRow.status;
        const payment = nextRow.payment_status;

        const orderEnded = isTerminalStatus(status) || payment !== 'paid';

        if (orderEnded) {
          setActiveOrderId(null);
        }
      },
    );

    void channel.subscribe();

    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current).catch(() => {
          // ignore cleanup failure
        });
        channelRef.current = null;
      }
    };
  }, [activeOrderId]);

  return activeOrderId;
}