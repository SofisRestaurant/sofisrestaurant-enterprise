// =============================================================================
// PATH: src/modules/admin/orders/useAdminOrdersMetrics.ts
// =============================================================================
// Derives all dashboard KPI values from the raw orders array.
// Returns memoized metrics — the page and AdminOrdersMetrics component
// receive these as plain numbers, never compute them directly.
// =============================================================================

import { useMemo } from 'react';
import type { AdminOrder } from '../types/admin-orders.types';
import { URGENT_PRIORITY_MINUTES } from '../utils/admin-orders.constants';
import { minutesSince } from '../utils/admin-orders.priority';
import { formatLastUpdated } from '../utils/admin-orders.utils';

export interface AdminOrdersMetricsData {
  /** Active (non-terminal) orders in the queue. */
  queueCount: number;
  /** Orders with status 'ready'. */
  readyCount: number;
  /** Active orders whose age ≥ URGENT_PRIORITY_MINUTES. */
  overdueCount: number;
  /** Sum of amountTotalCents for all paid orders. */
  paidRevenueCents: number;
  /** Formatted "HH:MM AM/PM" string of the last successful fetch, or '—'. */
  lastUpdatedLabel: string;
}

export function useAdminOrdersMetrics(
  orders: readonly AdminOrder[],
  lastUpdated: Date | null,
): AdminOrdersMetricsData {
  const queueCount = useMemo(
    () =>
      orders.filter(
        (o) => o.status !== 'delivered' && o.status !== 'cancelled',
      ).length,
    [orders],
  );

  const readyCount = useMemo(
    () => orders.filter((o) => o.status === 'ready').length,
    [orders],
  );

  const overdueCount = useMemo(
    () =>
      orders.filter((o) => {
        if (o.status === 'delivered' || o.status === 'cancelled') return false;
        return minutesSince(o.createdAt) >= URGENT_PRIORITY_MINUTES;
      }).length,
    [orders],
  );

  const paidRevenueCents = useMemo(
    () =>
      orders
        .filter((o) => o.paymentStatus === 'paid')
        .reduce((total, o) => total + o.amountTotalCents, 0),
    [orders],
  );

  const lastUpdatedLabel = useMemo(
    () => formatLastUpdated(lastUpdated),
    [lastUpdated],
  );

  return { queueCount, readyCount, overdueCount, paidRevenueCents, lastUpdatedLabel };
}