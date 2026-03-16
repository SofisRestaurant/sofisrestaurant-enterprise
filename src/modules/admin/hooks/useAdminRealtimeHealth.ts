import { useEffect, useMemo, useState } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { isOrderRow } from '@/modules/orders/utils/orderValidators';
import {
  REALTIME_SUBSCRIBE_STATES,
  isRealtimeSubscribeState,
  supabase,
  type RealtimeSubscribeState,
} from '@/lib/supabase/supabaseClient';
import type { Tables } from '@/types/supabase';

import type { AdminRealtimeHealth } from '../types/admin-common.types';

type OrderRow = Tables<'orders'>;

export interface UseAdminRealtimeHealthOptions {
  channelName?: string;
  staleAfterMs?: number;
  enabled?: boolean;
}

type InternalRealtimeState = AdminRealtimeHealth;

const DEFAULT_CHANNEL_NAME = 'admin:orders:health';
const DEFAULT_STALE_AFTER_MS = 45_000;
const CHANNEL_NAME_PATTERN = /^[a-z0-9:_-]+$/i;
const MAX_CHANNEL_NAME_LENGTH = 120;

type TerminalRealtimeState =
  | typeof REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR
  | typeof REALTIME_SUBSCRIBE_STATES.TIMED_OUT
  | typeof REALTIME_SUBSCRIBE_STATES.CLOSED;

function normalizeChannelName(value: string | undefined): string | null {
  const next = (value ?? DEFAULT_CHANNEL_NAME).trim();

  if (next.length === 0) {
    return null;
  }

  if (next.length > MAX_CHANNEL_NAME_LENGTH) {
    return null;
  }

  if (!CHANNEL_NAME_PATTERN.test(next)) {
    return null;
  }

  return next;
}

function nowIso(): string {
  return new Date().toISOString();
}

function removeChannelSafely(channel: RealtimeChannel): void {
  void supabase.removeChannel(channel).catch(() => {
    // Keep cleanup deterministic.
  });
}

function isTerminalRealtimeState(status: RealtimeSubscribeState): status is TerminalRealtimeState {
  return (
    status === 'CHANNEL_ERROR' ||
    status === 'TIMED_OUT' ||
    status === 'CLOSED'
  );
}

function isSubscribedRealtimeState(
  status: RealtimeSubscribeState,
): status is typeof REALTIME_SUBSCRIBE_STATES.SUBSCRIBED {
  return status === 'SUBSCRIBED';
}

function deriveHealth(
  state: Pick<
    InternalRealtimeState,
    'status' | 'isSubscribed' | 'lastEventAt' | 'lastStatusAt' | 'staleAfterMs'
  >,
  now = Date.now(),
): InternalRealtimeState['health'] {
  if (!state.lastStatusAt && !state.lastEventAt) {
    return 'unknown';
  }

  if (!state.isSubscribed) {
    if (
      state.status === 'CHANNEL_ERROR' ||
      state.status === 'TIMED_OUT' ||
      state.status === 'CLOSED'
    ) {
      return 'down';
    }

    return 'degraded';
  }

  if (!state.lastEventAt) {
    return 'healthy';
  }

  const eventAge = now - new Date(state.lastEventAt).getTime();
  if (eventAge > state.staleAfterMs) {
    return 'degraded';
  }

  return 'healthy';
}

export function useAdminRealtimeHealth(
  options: UseAdminRealtimeHealthOptions = {},
): AdminRealtimeHealth {
  const enabled = options.enabled ?? true;
  const staleAfterMs = Math.max(5_000, options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS);
  const normalizedChannelName = normalizeChannelName(options.channelName);

  const [state, setState] = useState<InternalRealtimeState>({
    channelName: normalizedChannelName,
    status: 'idle',
    health: 'unknown',
    isSubscribed: false,
    lastEventAt: null,
    lastStatusAt: null,
    inserts: 0,
    updates: 0,
    deletes: 0,
    reconnects: 0,
    consecutiveFailures: 0,
    staleAfterMs,
  });

  useEffect(() => {
    setState((current) => ({
      ...current,
      channelName: normalizedChannelName,
      staleAfterMs,
      health: deriveHealth({
        status: current.status,
        isSubscribed: current.isSubscribed,
        lastEventAt: current.lastEventAt,
        lastStatusAt: current.lastStatusAt,
        staleAfterMs,
      }),
    }));
  }, [normalizedChannelName, staleAfterMs]);

  useEffect(() => {
    if (!enabled || normalizedChannelName === null) {
      setState((current) => ({
        ...current,
        channelName: normalizedChannelName,
        status: normalizedChannelName === null ? 'invalid_channel' : 'disabled',
        isSubscribed: false,
        health: normalizedChannelName === null ? 'down' : 'unknown',
      }));
      return undefined;
    }

    let active = true;

    const channel = supabase.channel(normalizedChannelName);

    const handleRealtimeEvent = (
      payload: RealtimePostgresChangesPayload<OrderRow>,
    ): void => {
      if (!active) {
        return;
      }

      const hasNextRow = isOrderRow(payload.new);
      const hasOldRow = isOrderRow(payload.old);

      if (!hasNextRow && !hasOldRow) {
        return;
      }

      setState((current) => {
        const timestamp = nowIso();

        const next: InternalRealtimeState = {
          ...current,
          lastEventAt: timestamp,
        };

        switch (payload.eventType) {
          case 'INSERT':
            next.inserts += 1;
            break;
          case 'UPDATE':
            next.updates += 1;
            break;
          case 'DELETE':
            next.deletes += 1;
            break;
          default:
            break;
        }

        next.health = deriveHealth(next);
        return next;
      });
    };

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'orders',
      },
      handleRealtimeEvent,
    );

    void channel.subscribe((status) => {
      if (!active || !isRealtimeSubscribeState(status)) {
        return;
      }

      setState((current) => {
        const timestamp = nowIso();
        const isSubscribed = isSubscribedRealtimeState(status);
        const wasSubscribed = current.status === 'SUBSCRIBED';

        const next: InternalRealtimeState = {
          ...current,
          status,
          isSubscribed,
          lastStatusAt: timestamp,
          reconnects: isSubscribed && !wasSubscribed
            ? current.reconnects + 1
            : current.reconnects,
          consecutiveFailures: isTerminalRealtimeState(status)
            ? current.consecutiveFailures + 1
            : isSubscribed
              ? 0
              : current.consecutiveFailures,
        };

        next.health = deriveHealth(next);
        return next;
      });
    });

    return () => {
      active = false;
      removeChannelSafely(channel);
    };
  }, [enabled, normalizedChannelName]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setState((current) => {
        const next: InternalRealtimeState = {
          ...current,
        };
        next.health = deriveHealth(next);
        return next;
      });
    }, Math.min(15_000, staleAfterMs));

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, staleAfterMs]);

  return useMemo(
    () => ({
      ...state,
      health: deriveHealth(state),
    }),
    [state],
  );
}

export default useAdminRealtimeHealth;