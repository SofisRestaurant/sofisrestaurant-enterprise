// src/hooks/useDashboard.cache.ts
// =============================================================================
// Dashboard cache — tiny in-memory cache to reduce spam + smooth UI
// =============================================================================

import type { LiveMetrics } from './useDashboard.types';

export type MetricsCache = {
  ts: number;
  metrics: LiveMetrics;
};

let _cache: MetricsCache | null = null;

export function getMetricsCache(): MetricsCache | null {
  return _cache;
}

export function setMetricsCache(metrics: LiveMetrics): void {
  _cache = { metrics, ts: Date.now() };
}

export function clearMetricsCache(): void {
  _cache = null;
}
