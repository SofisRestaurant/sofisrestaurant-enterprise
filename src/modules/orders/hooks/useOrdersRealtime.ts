import { useEffect, useRef } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import {
  REALTIME_SUBSCRIBE_STATES,
  isRealtimeSubscribeState,
  supabase,
  type RealtimeSubscribeState,
} from '@/lib/supabase/supabaseClient';
import type { Tables } from '@/types/supabase';
import { isOrderRow } from '@/modules/orders/utils/orderValidators';


type OrderRow = Tables<'orders'>;
export type OrdersRealtimePayload = RealtimePostgresChangesPayload<OrderRow>;

export interface UseOrdersRealtimeOptions {
  channelName: string;
  onInsert?: (row: OrderRow) => void;
  onUpdate?: (row: OrderRow) => void;
  onDelete?: (row: OrderRow) => void;
  onStatusChange?: (status: RealtimeSubscribeState) => void;
}

export interface UseOrdersRealtimeResult {
  readonly channelName: string | null;
  readonly isSubscribed: boolean;
}

type OrdersRealtimeHandlers = Pick<
  UseOrdersRealtimeOptions,
  'onDelete' | 'onInsert' | 'onStatusChange' | 'onUpdate'
>;

const ORDERS_REALTIME_CONFIG = {
  event: '*',
  schema: 'public',
  table: 'orders',
} as const;

const MAX_CHANNEL_NAME_LENGTH = 120;
const CHANNEL_NAME_PATTERN = /^[a-z0-9:_-]+$/i;


function normalizeChannelName(value: string): string | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_CHANNEL_NAME_LENGTH) return null;
  if (!CHANNEL_NAME_PATTERN.test(trimmed)) return null;

  return trimmed;
}

function removeChannelSafely(channel: RealtimeChannel): void {
  void supabase.removeChannel(channel).catch(() => {
    // Swallow realtime teardown failures so React unmounts remain deterministic.
  });
}

function safeInvokeRowHandler(handler: ((row: OrderRow) => void) | undefined, row: OrderRow): void {
  if (!handler) return;

  try {
    handler(row);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[orders-realtime] handler failed', error);
    }
  }
}

function safeInvokeStatusHandler(
  handler: ((status: RealtimeSubscribeState) => void) | undefined,
  status: RealtimeSubscribeState,
): void {
  if (!handler) return;

  try {
    handler(status);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[orders-realtime] status handler failed', error);
    }
  }
}

function isSubscribedState(status: RealtimeSubscribeState): boolean {
  return status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED;
}

function isTerminalRealtimeState(status: RealtimeSubscribeState): boolean {
  return (
    status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
    status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT ||
    status === REALTIME_SUBSCRIBE_STATES.CLOSED
  );
}

export function useOrdersRealtime({
  channelName,
  onInsert,
  onUpdate,
  onDelete,
  onStatusChange,
}: UseOrdersRealtimeOptions): UseOrdersRealtimeResult {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const currentChannelNameRef = useRef<string | null>(null);
  const subscribedRef = useRef<boolean>(false);

  const handlersRef = useRef<OrdersRealtimeHandlers>({
    onDelete,
    onInsert,
    onStatusChange,
    onUpdate,
  });

  useEffect(() => {
    handlersRef.current = {
      onDelete,
      onInsert,
      onStatusChange,
      onUpdate,
    };
  }, [onDelete, onInsert, onStatusChange, onUpdate]);

  useEffect(() => {
    const normalizedChannelName = normalizeChannelName(channelName);

    if (normalizedChannelName === null) {
      if (channelRef.current !== null) {
        removeChannelSafely(channelRef.current);
        channelRef.current = null;
      }

      currentChannelNameRef.current = null;
      subscribedRef.current = false;

      if (import.meta.env.DEV) {
        console.warn(
          '[orders-realtime] Skipping subscription because channelName is empty or invalid.',
        );
      }

      return undefined;
    }

    if (channelRef.current !== null) {
      removeChannelSafely(channelRef.current);
      channelRef.current = null;
    }

    let isActive = true;
    subscribedRef.current = false;
    currentChannelNameRef.current = normalizedChannelName;

    const handleChange = (payload: OrdersRealtimePayload): void => {
      if (!isActive) {
        return;
      }

      const nextRow = isOrderRow(payload.new) ? payload.new : null;
      const oldRow = isOrderRow(payload.old) ? payload.old : null;
      const handlers = handlersRef.current;

      switch (payload.eventType) {
        case 'INSERT':
          if (nextRow !== null) {
            safeInvokeRowHandler(handlers.onInsert, nextRow);
          }
          return;

        case 'UPDATE':
          if (nextRow !== null) {
            safeInvokeRowHandler(handlers.onUpdate, nextRow);
          }
          return;

        case 'DELETE':
          if (oldRow !== null) {
            safeInvokeRowHandler(handlers.onDelete, oldRow);
          }
          return;

        default:
          return;
      }
    };

    const channel = supabase.channel(normalizedChannelName);

    channel.on('postgres_changes', ORDERS_REALTIME_CONFIG, handleChange);

    void channel.subscribe((status) => {
      if (!isActive) {
        return;
      }

      if (!isRealtimeSubscribeState(status)) {
        return;
      }

      const safeStatus: RealtimeSubscribeState = status;

      subscribedRef.current = isSubscribedState(safeStatus);
      safeInvokeStatusHandler(handlersRef.current.onStatusChange, safeStatus);

      if (!import.meta.env.DEV) {
        return;
      }

      if (isSubscribedState(safeStatus)) {
        console.info(`[orders-realtime] ${normalizedChannelName} subscribed`);
        return;
      }

      if (isTerminalRealtimeState(safeStatus)) {
        console.warn(`[orders-realtime] ${normalizedChannelName} status: ${safeStatus}`);
      }
    });

    channelRef.current = channel;

    return () => {
      isActive = false;
      subscribedRef.current = false;

      if (channelRef.current === channel) {
        channelRef.current = null;
      }

      if (currentChannelNameRef.current === normalizedChannelName) {
        currentChannelNameRef.current = null;
      }

      removeChannelSafely(channel);
    };
  }, [channelName]);

  return {
    channelName: currentChannelNameRef.current,
    isSubscribed: subscribedRef.current,
  };
}