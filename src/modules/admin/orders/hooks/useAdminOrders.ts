// =============================================================================
// PATH: src/modules/admin/orders/useAdminOrders.ts
// =============================================================================
// Manages order fetching: initial load, polling, loading/error state,
// and the setOrders updater used by the realtime hook.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminOrder } from '../types/admin-orders.types';
import { AUTO_REFRESH_MS } from '../utils/admin-orders.constants';
import { fetchAdminOrders } from '../api/admin-orders.api';

export interface UseAdminOrdersReturn {
  orders: AdminOrder[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  /** Manual refetch — also called by the auto-refresh interval. */
  loadOrders: () => Promise<void>;
  /** Exposed so useAdminOrdersRealtime can push live updates into the same list. */
  setOrders: React.Dispatch<React.SetStateAction<AdminOrder[]>>;
  setLastUpdated: React.Dispatch<React.SetStateAction<Date | null>>;
  dismissError: () => void;
}

export function useAdminOrders(): UseAdminOrdersReturn {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const mountedRef = useRef(true);

  const loadOrders = useCallback(async () => {
    try {
      setError(null);
      const fetched = await fetchAdminOrders();
      if (!mountedRef.current) return;
      setOrders(fetched);
      setLastUpdated(new Date());
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load orders.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    void loadOrders();
    return () => { mountedRef.current = false; };
  }, [loadOrders]);

  // Auto-refresh polling
  useEffect(() => {
    const timer = window.setInterval(() => { void loadOrders(); }, AUTO_REFRESH_MS);
    return () => { window.clearInterval(timer); };
  }, [loadOrders]);

  const dismissError = useCallback(() => setError(null), []);

  return {
    orders,
    loading,
    error,
    lastUpdated,
    loadOrders,
    setOrders,
    setLastUpdated,
    dismissError,
  };
}