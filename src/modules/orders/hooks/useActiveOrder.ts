// src/modules/orders/hooks/useActiveOrder.ts
// =============================================================================
// ACTIVE ORDER HOOK — singleton channel pattern
// =============================================================================
// PROBLEM THIS SOLVES:
//   TopBar, BottomNav, and Header all call useActiveOrder(userId).
//   All three mount simultaneously in RootLayout. Each call created its own
//   Supabase channel with the same name: `active-order-{uuid}`.
//   The second and third channels hit an already-subscribed channel object
//   (Supabase caches by name) and threw:
//   "cannot add postgres_changes callbacks after subscribe()"
//
// FIX — module-level singleton:
//   Only ONE real Supabase channel is ever created per userId.
//   All components calling useActiveOrder() subscribe to the same
//   in-memory subject. The channel is created on first subscriber,
//   torn down when the last subscriber unmounts.
//
// This is the canonical solution for this pattern — no React Context needed,
// no prop drilling, no performance overhead.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/supabaseClient';
import { OrderStatus } from '@/domain/orders/order.types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Listener = (orderId: string | null) => void;

interface ActiveOrderEntry {
  orderId: string | null;
  channel: RealtimeChannel | null;
  listeners: Set<Listener>;
  fetchController: AbortController | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TRACKABLE_STATUSES = [
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.SHIPPED,
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Module-level singleton store — one entry per userId
// ─────────────────────────────────────────────────────────────────────────────

const store = new Map<string, ActiveOrderEntry>();

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function isTrackableStatus(value: unknown): value is (typeof TRACKABLE_STATUSES)[number] {
  return TRACKABLE_STATUSES.includes(value as (typeof TRACKABLE_STATUSES)[number]);
}

function isTerminalStatus(value: unknown): boolean {
  return value === OrderStatus.CANCELLED || value === OrderStatus.DELIVERED;
}

function safeRemoveChannel(channel: RealtimeChannel): void {
  void supabase.removeChannel(channel).catch(() => {
    // ignore — channel may already be removed
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton management
// ─────────────────────────────────────────────────────────────────────────────

function notifyListeners(entry: ActiveOrderEntry): void {
  for (const listener of entry.listeners) {
    listener(entry.orderId);
  }
}

function setOrderId(userId: string, orderId: string | null): void {
  const entry = store.get(userId);
  if (!entry) return;
  if (entry.orderId === orderId) return; // no change — skip notify
  entry.orderId = orderId;
  notifyListeners(entry);
}

function subscribeChannel(userId: string, orderId: string): void {
  const entry = store.get(userId);
  if (!entry) return;

  // Tear down any existing channel first
  if (entry.channel) {
    safeRemoveChannel(entry.channel);
    entry.channel = null;
  }

  // Chain .on() before .subscribe() — the only correct Supabase Realtime order
  const channel = supabase
    .channel(`active-order-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      },
      (payload) => {
        if (!payload?.new || typeof payload.new !== 'object') return;
        const row = payload.new as { status?: unknown; payment_status?: unknown };
        const ended = isTerminalStatus(row.status) || row.payment_status !== 'paid';
        if (ended) {
          setOrderId(userId, null);
          // Tear down channel — order is done
          const e = store.get(userId);
          if (e?.channel) {
            safeRemoveChannel(e.channel);
            e.channel = null;
          }
        }
      },
    );

  // Guard: if Supabase recycled an already-subscribed channel, skip subscribe()
  const channelState = (channel as unknown as { state?: string }).state;
  if (channelState !== 'joined' && channelState !== 'joining') {
    void channel.subscribe();
  }

  entry.channel = channel;
}

async function fetchActiveOrder(userId: string): Promise<void> {
  const entry = store.get(userId);
  if (!entry) return;

  // Cancel any in-flight fetch
  entry.fetchController?.abort();
  const controller = new AbortController();
  entry.fetchController = controller;

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, payment_status')
      .eq('customer_uid', userId)
      .eq('payment_status', 'paid')
      .in('status', TRACKABLE_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (controller.signal.aborted) return;
    if (error || !data) {
      setOrderId(userId, null);
      return;
    }

    const isValid =
      typeof data.id === 'string' &&
      data.payment_status === 'paid' &&
      isTrackableStatus(data.status);

    const nextId = isValid ? data.id : null;
    setOrderId(userId, nextId);

    if (nextId) {
      subscribeChannel(userId, nextId);
    }
  } catch {
    if (controller.signal.aborted) return;
    setOrderId(userId, null);
  } finally {
    const e = store.get(userId);
    if (e?.fetchController === controller) {
      e.fetchController = null;
    }
  }
}

function acquireEntry(userId: string, listener: Listener): void {
  let entry = store.get(userId);

  if (!entry) {
    // First subscriber for this userId — create entry and fetch
    entry = {
      orderId: null,
      channel: null,
      listeners: new Set(),
      fetchController: null,
    };
    store.set(userId, entry);
    void fetchActiveOrder(userId);
  }

  entry.listeners.add(listener);
  // Immediately deliver current value to new subscriber
  listener(entry.orderId);
}

function releaseEntry(userId: string, listener: Listener): void {
  const entry = store.get(userId);
  if (!entry) return;

  entry.listeners.delete(listener);

  // Last subscriber gone — clean up everything
  if (entry.listeners.size === 0) {
    entry.fetchController?.abort();
    if (entry.channel) {
      safeRemoveChannel(entry.channel);
    }
    store.delete(userId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook — safe to call from any number of components simultaneously
// ─────────────────────────────────────────────────────────────────────────────

export function useActiveOrder(userId: string | null): string | null {
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  // Stable ref to the listener so we can remove the exact same function
  const listenerRef = useRef<Listener | null>(null);

  useEffect(() => {
    if (!userId) {
      setActiveOrderId(null);
      return;
    }

    const safeUserId = userId;

    const listener: Listener = (orderId) => {
      setActiveOrderId(orderId);
    };
    listenerRef.current = listener;

    acquireEntry(safeUserId, listener);

    return () => {
      releaseEntry(safeUserId, listener);
      listenerRef.current = null;
    };
  }, [userId]);

  return activeOrderId;
}