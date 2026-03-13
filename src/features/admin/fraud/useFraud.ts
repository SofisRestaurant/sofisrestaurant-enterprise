// =============================================================================
// src/features/admin/fraud/useFraud.ts
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { fetchFraudEvents, resolveFraudEvent } from './fraud.service';
import type { FraudEvent, FraudFilters } from './fraud.types';

interface UseFraudReturn {
  events: FraudEvent[];
  loading: boolean;
  error: string | null;
  filters: FraudFilters;
  setFilters: (f: Partial<FraudFilters>) => void;
  resolve: (id: string) => Promise<void>;
  refresh: () => void;
}

const DEFAULT_FILTERS: FraudFilters = {
  limit: 100,
  resolved: false,
};

export function useFraud(): UseFraudReturn {
  const [events, setEvents] = useState<FraudEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<FraudFilters>(DEFAULT_FILTERS);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFraudEvents(filters);
      setEvents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load fraud events');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  const setFilters = useCallback((f: Partial<FraudFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...f }));
  }, []);

  const resolve = useCallback(async (id: string) => {
    await resolveFraudEvent(id);
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, resolved: true } : e)));
  }, []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return { events, loading, error, filters, setFilters, resolve, refresh };
}
