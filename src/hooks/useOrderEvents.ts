// src/hooks/useOrderEvents.ts
// ============================================================================
// USE ORDER EVENTS HOOKS — Production Grade (2026)
// ============================================================================
// Purpose:
// - Fetch order events, timelines, and performance metrics safely
// - Provide stable refresh handlers for UI consumers
// - Support realtime subscriptions without violating strict lint rules
// - Preserve backward compatibility for recordEvent trigger-based flows
//
// Notes:
// - No sensitive data is logged
// - Async effects use explicit void fire-and-forget semantics
// - State resets cleanly when orderId is missing or changes
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getOrderEvents,
  getOrderTimeline,
  getOrderPerformance,
  subscribeToOrderEvents,
  recordOrderEvent,
} from '@/modules/orders/api/order-events.api';
import type {
  OrderEvent,
  OrderTimeline,
  OrderPerformanceMetrics,
  RecordEventRequest,
} from '@/domain/orders/order-events.types';

// ============================================================================
// Shared helpers
// ============================================================================

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function normalizeOrderId(orderId: string | null): string | null {
  if (typeof orderId !== 'string') return null;
  const normalized = orderId.trim();
  return normalized.length > 0 ? normalized : null;
}

// ============================================================================
// HOOK: USE ORDER EVENTS
// ============================================================================

interface UseOrderEventsReturn {
  events: OrderEvent[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch and watch order events.
 *
 * @example
 * ```tsx
 * const { events, loading, refresh } = useOrderEvents(orderId);
 * ```
 */
export function useOrderEvents(orderId: string | null): UseOrderEventsReturn {
  const normalizedOrderId = normalizeOrderId(orderId);

  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadEvents = useCallback(async (): Promise<void> => {
    if (!normalizedOrderId) {
      if (!mountedRef.current) return;
      setEvents([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

  try {
  const data = await getOrderEvents(normalizedOrderId);

  if (!mountedRef.current) return;
  setEvents(Array.isArray(data) ? data : []);
} catch (err) {
  if (!mountedRef.current) return;
  setError(getErrorMessage(err, 'Failed to load events'));
  setEvents([]);
  console.error('Error loading order events:', err);
} finally {
  if (mountedRef.current) {
    setLoading(false);
  }
}
  }, [normalizedOrderId]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  return {
    events,
    loading,
    error,
    refresh: loadEvents,
  };
}

// ============================================================================
// HOOK: USE ORDER TIMELINE
// ============================================================================

interface UseOrderTimelineReturn {
  timeline: OrderTimeline | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch complete order timeline.
 *
 * @example
 * ```tsx
 * const { timeline, loading } = useOrderTimeline(orderId);
 * ```
 */
export function useOrderTimeline(orderId: string | null): UseOrderTimelineReturn {
  const normalizedOrderId = normalizeOrderId(orderId);

  const [timeline, setTimeline] = useState<OrderTimeline | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadTimeline = useCallback(async (): Promise<void> => {
    if (!normalizedOrderId) {
      if (!mountedRef.current) return;
      setTimeline(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

   try {
  const data = await getOrderTimeline(normalizedOrderId);

  if (!mountedRef.current) return;
  setTimeline(data);
} catch (err) {
  if (!mountedRef.current) return;
  setError(getErrorMessage(err, 'Failed to load timeline'));
  setTimeline(null);
  console.error('Error loading order timeline:', err);
} finally {
  if (mountedRef.current) {
    setLoading(false);
  }
}
  }, [normalizedOrderId]);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  return {
    timeline,
    loading,
    error,
    refresh: loadTimeline,
  };
}

// ============================================================================
// HOOK: USE ORDER PERFORMANCE
// ============================================================================

interface UseOrderPerformanceReturn {
  metrics: OrderPerformanceMetrics | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch order performance metrics.
 *
 * @example
 * ```tsx
 * const { metrics, loading } = useOrderPerformance(orderId);
 * ```
 */
export function useOrderPerformance(orderId: string | null): UseOrderPerformanceReturn {
  const normalizedOrderId = normalizeOrderId(orderId);

  const [metrics, setMetrics] = useState<OrderPerformanceMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadMetrics = useCallback(async (): Promise<void> => {
    if (!normalizedOrderId) {
      if (!mountedRef.current) return;
      setMetrics(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

   try {
  const data = await getOrderPerformance(normalizedOrderId);

  if (!mountedRef.current) return;
  setMetrics(data);
} catch (err) {
  if (!mountedRef.current) return;
  setError(getErrorMessage(err, 'Failed to load metrics'));
  setMetrics(null);
  console.error('Error loading order performance:', err);
} finally {
  if (mountedRef.current) {
    setLoading(false);
  }
}
  }, [normalizedOrderId]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  return {
    metrics,
    loading,
    error,
    refresh: loadMetrics,
  };
}

// ============================================================================
// HOOK: USE REALTIME ORDER EVENTS
// ============================================================================

interface UseRealtimeOrderEventsOptions {
  enabled?: boolean;
  onNewEvent?: (event: OrderEvent) => void;
}

/**
 * Hook to subscribe to real-time order events.
 *
 * @example
 * ```tsx
 * const { events } = useRealtimeOrderEvents(orderId, {
 *   onNewEvent: (event) => console.log('New event:', event),
 * });
 * ```
 */
export function useRealtimeOrderEvents(
  orderId: string | null,
  options: UseRealtimeOrderEventsOptions = {},
): UseOrderEventsReturn {
  const normalizedOrderId = normalizeOrderId(orderId);
  const { enabled = true, onNewEvent } = options;
  const { events, loading, error, refresh } = useOrderEvents(normalizedOrderId);

  useEffect(() => {
    if (!normalizedOrderId || !enabled) return;

    const unsubscribe = subscribeToOrderEvents(normalizedOrderId, (event) => {
      onNewEvent?.(event);
      void refresh();
    });

    return () => {
      unsubscribe();
    };
  }, [normalizedOrderId, enabled, onNewEvent, refresh]);

  return {
    events,
    loading,
    error,
    refresh,
  };
}

// ============================================================================
// HOOK: USE RECORD EVENT (DB Trigger Architecture)
// ============================================================================

interface UseRecordEventReturn {
  recordEvent: (request: Omit<RecordEventRequest, 'order_id'>) => Promise<boolean>;
  recording: boolean;
  error: string | null;
}

/**
 * Hook to record events for an order.
 * In trigger-based architecture, this remains a compatibility wrapper.
 */
export function useRecordEvent(orderId: string | null): UseRecordEventReturn {
  const normalizedOrderId = normalizeOrderId(orderId);

  const [recording, setRecording] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const record = useCallback(
    async (request: Omit<RecordEventRequest, 'order_id'>): Promise<boolean> => {
      if (!normalizedOrderId) {
        setError('Order ID is required');
        return false;
      }

      try {
        setRecording(true);
        setError(null);

        await recordOrderEvent({
          ...request,
          order_id: normalizedOrderId,
        });

        return true;
      } catch (err) {
        setError(getErrorMessage(err, 'Failed to record event'));
        console.error('Error recording order event:', err);
        return false;
      } finally {
        setRecording(false);
      }
    },
    [normalizedOrderId],
  );

  return {
    recordEvent: record,
    recording,
    error,
  };
}