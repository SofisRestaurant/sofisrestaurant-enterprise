// =============================================================================
// src/pages/Admin/hooks/useAdminLayoutMetrics.ts
// =============================================================================
// Metrics polling for the AdminLayout shell.
//
// Responsibilities:
//   1. Fetch admin_layout_snapshot through admin-gateway Edge Function
//   2. Module-level cache with TTL (survives re-renders)
//   3. Polling every POLL_MS with Page Visibility API pause
//   4. Exponential backoff retry for transient failures (never for auth errors)
//   5. Auth errors redirect immediately — never shown as an error banner
//   6. Non-auth errors are non-fatal: banner shown, layout stays usable
//   7. Countdown ticker (cosmetic — shows seconds to next auto-refresh)
//   8. Manual refresh: cache bust + poll timer reset
//
// Contract:
//   - Call only when authStatus === 'authorized'
//   - Pass setAuthStatus so auth failures can flip the gate
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invokeEdge } from '@/lib/supabase/invoke';
import {
  POLL_MS,
  COUNTDOWN_S,
  CACHE_TTL_MS,
  readCache,
  readCacheEntry,
  writeCache,
  bustCache,
  parseSnapshot,
  isAuthError,
  withRetry,
} from '../admin-layout.utils';
import type {
  AdminLayoutSnapshot,
  AuthStatus,
  LayoutMetricsPayload,
  MetricsState,
} from '../admin-layout.types';

export interface UseAdminLayoutMetricsResult {
  snapshot: AdminLayoutSnapshot | null;
  metricsState: MetricsState;
  isLoading: boolean;
  isRefreshing: boolean;
  countdown: number;
  handleManualRefresh: () => void;
}

export function useAdminLayoutMetrics(
  isAuthorized: boolean,
  setAuthStatus: (status: AuthStatus) => void,
): UseAdminLayoutMetricsResult {
  const navigate = useNavigate();

  const initialCache = readCacheEntry();

  const [metricsState, setMetricsState] = useState<MetricsState>({
    snapshot: initialCache?.snapshot ?? null,
    phase: initialCache ? 'idle' : 'loading',
    errorMsg: null,
    lastRefreshedAt: initialCache ? new Date(initialCache.ts) : null,
  });

  const [countdown, setCountdown] = useState<number>(COUNTDOWN_S);

  const mountedRef = useRef<boolean>(true);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPollTimer = useCallback((): void => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const clearCountdownTimer = useCallback((): void => {
    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const redirectToLogin = useCallback((): void => {
    setAuthStatus('denied');
    void navigate('/login', { replace: true });
  }, [navigate, setAuthStatus]);

  const fetchMetrics = useCallback(
    async (background = false): Promise<void> => {
      if (!mountedRef.current) return;

      const cacheEntry = readCacheEntry();

      if (!background) {
        const freshSnapshot = readCache();
        if (freshSnapshot && cacheEntry) {
          setMetricsState((prev) => ({
            ...prev,
            snapshot: freshSnapshot,
            phase: 'idle',
            errorMsg: null,
            lastRefreshedAt: new Date(cacheEntry.ts),
          }));
          return;
        }
      }

      if (
        background &&
        cacheEntry &&
        Date.now() - cacheEntry.ts < CACHE_TTL_MS &&
        metricsState.snapshot !== null
      ) {
        setMetricsState((prev) => ({
          ...prev,
          snapshot: cacheEntry.snapshot,
          phase: 'idle',
          errorMsg: null,
          lastRefreshedAt: new Date(cacheEntry.ts),
        }));
        return;
      }

      setMetricsState((prev) => ({
        ...prev,
        phase: background && prev.snapshot ? 'refreshing' : 'loading',
        errorMsg: null,
      }));

      try {
        const envelope = await withRetry(() =>
          invokeEdge<LayoutMetricsPayload>('admin-gateway', { action: 'layout' }),
        );

        const parsed = parseSnapshot(envelope?.data);
        writeCache(parsed);

        if (!mountedRef.current) return;

        setMetricsState({
          snapshot: parsed,
          phase: 'idle',
          errorMsg: null,
          lastRefreshedAt: new Date(),
        });
        setCountdown(COUNTDOWN_S);
      } catch (error: unknown) {
        if (!mountedRef.current) return;

        if (isAuthError(error)) {
          redirectToLogin();
          return;
        }

        const message = error instanceof Error ? error.message : 'Metrics unavailable';

        setMetricsState((prev) => ({
          ...prev,
          phase: 'error',
          errorMsg: message,
        }));
      }
    },
    [metricsState.snapshot, redirectToLogin],
  );

  const startPollTimer = useCallback((): void => {
    clearPollTimer();

    pollTimerRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      if (document.visibilityState !== 'visible') return;
      void fetchMetrics(true);
    }, POLL_MS);
  }, [clearPollTimer, fetchMetrics]);

  const startCountdownTimer = useCallback((): void => {
    clearCountdownTimer();

    countdownTimerRef.current = setInterval(() => {
      if (!mountedRef.current) return;

      setCountdown((current) => {
        if (current <= 1) return COUNTDOWN_S;
        return current - 1;
      });
    }, 1_000);
  }, [clearCountdownTimer]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearPollTimer();
      clearCountdownTimer();
    };
  }, [clearCountdownTimer, clearPollTimer]);

  useEffect(() => {
    if (!isAuthorized) {
      clearPollTimer();
      clearCountdownTimer();
      return;
    }

    queueMicrotask(() => {
      void fetchMetrics(true);
    });

    startPollTimer();
    startCountdownTimer();

    const onVisibilityChange = (): void => {
      if (!mountedRef.current) return;

      if (document.visibilityState === 'visible') {
        setCountdown(COUNTDOWN_S);
        void fetchMetrics(true);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearPollTimer();
      clearCountdownTimer();
    };
  }, [
    isAuthorized,
    fetchMetrics,
    startPollTimer,
    startCountdownTimer,
    clearPollTimer,
    clearCountdownTimer,
  ]);

  const handleManualRefresh = useCallback((): void => {
    bustCache();
    setCountdown(COUNTDOWN_S);
    startPollTimer();
    void fetchMetrics(true);
  }, [fetchMetrics, startPollTimer]);

  return {
    snapshot: metricsState.snapshot,
    metricsState,
    isLoading: metricsState.phase === 'loading',
    isRefreshing: metricsState.phase === 'refreshing',
    countdown,
    handleManualRefresh,
  };
}