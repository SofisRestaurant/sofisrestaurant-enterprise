// src/features/orders/useActiveOrder.ts
// =============================================================================
// FIX: "cannot add `postgres_changes` callbacks after `subscribe()`"
//
// ROOT CAUSE:
//   The original code called channel.on(...).subscribe() correctly, BUT
//   Supabase's RealtimeClient caches channels by name. When React StrictMode
//   double-invokes effects (mount → cleanup → mount), supabase.removeChannel()
//   marks the channel as removed but the internal registry can still return
//   the same channel object on the next supabase.channel() call with the same
//   name. That recycled channel is already in 'joined' state, so calling
//   .on() on it after .subscribe() was already called throws.
//
// FIX (three parts):
//   1. Always call .on() BEFORE .subscribe() — chain them together so
//      there is no window where the channel exists but has no listeners.
//   2. Check channel.state before subscribing — if it's already 'joined'
//      or 'joining', skip the subscribe() call entirely.
//   3. Use a mounted ref to prevent setState after cleanup on async fetch.
// =============================================================================

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

// Safe channel teardown — never throws, always nulls the ref
async function removeChannel(channel: RealtimeChannel): Promise<void> {
  try {
    await supabase.removeChannel(channel);
  } catch {
    // ignore — channel may already be removed
  }
}

export function useActiveOrder(userId: string | null): string | null {
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch active order on userId change
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setActiveOrderId(null);
      return;
    }

    // Capture as string so TypeScript keeps the narrowing inside the async closure
    const safeUserId: string = userId;
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

    void fetchActiveOrder();

    return () => {
      alive = false;
    };
  }, [userId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Realtime subscription on activeOrderId change
  //
  // KEY RULES that prevent the "cannot add after subscribe()" error:
  //   • Always call .on() THEN .subscribe() — never call .on() after
  //     .subscribe() has already been invoked on that channel instance.
  //   • Check channel.state before subscribing — 'joined' | 'joining'
  //     means Supabase recycled an existing channel; do not re-subscribe.
  //   • Tear down before creating a new one — removeChannel() first.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // No active order — tear down any existing subscription and bail
    if (!activeOrderId) {
      if (channelRef.current) {
        void removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    // Tear down the previous channel before opening a new one
    if (channelRef.current) {
      void removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Build the channel and attach the listener BEFORE subscribing.
    // This is the correct Supabase Realtime API order:
    //   supabase.channel(name).on(...).subscribe()
    // Never call .on() after .subscribe().
    const channel = supabase
      .channel(`active-order-${activeOrderId}`)
      .on(
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

          const orderEnded =
            isTerminalStatus(nextRow.status) || nextRow.payment_status !== 'paid';

          if (orderEnded) {
            setActiveOrderId(null);
          }
        },
      );

    channelRef.current = channel;

    // Guard: Supabase may recycle the channel object if the name was used
    // recently. If it's already joined/joining, skip subscribe() entirely —
    // the listener we attached above will still fire on incoming events.
    const state = (channel as unknown as { state?: string }).state;
    if (state !== 'joined' && state !== 'joining') {
      void channel.subscribe();
    }

    return () => {
      if (channelRef.current) {
        void removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [activeOrderId]);

  return activeOrderId;
}