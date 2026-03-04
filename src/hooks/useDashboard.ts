// =============================================================================
// src/hooks/useDashboard.ts
// Dashboard data hook — stale-while-revalidate, auto-refresh, abort-safe.
// Source: Edge Function "admin-metrics"
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DashboardPayload, UseDashboardReturn } from '@/types/dashboard.types'
import { invokeEdge } from '@/lib/supabase/invoke'

// ── Config ────────────────────────────────────────────────────────────────────

const REFRESH_MS = 30_000
const CACHE_TTL_MS = 25_000

// ── Module-level cache ────────────────────────────────────────────────────────

interface Cache {
  data: DashboardPayload
  ts: number
}

let _cache: Cache | null = null

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useDashboard(): UseDashboardReturn {
  const [data, setData] = useState<DashboardPayload | null>(_cache?.data ?? null)
  const [loading, setLoading] = useState<boolean>(!_cache)
  const [refreshing, setRefreshing] = useState<boolean>(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(
    _cache ? new Date(_cache.ts) : null,
  )
  const [countdown, setCountdown] = useState<number>(REFRESH_MS / 1000)
  const [error, setError] = useState<string | null>(null)

  const mounted = useRef<boolean>(true)
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const countTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // small helper: safely update state only if still mounted
  const safeSet = useCallback((fn: () => void) => {
    if (!mounted.current) return
    fn()
  }, [])

  // ── Core fetch ──────────────────────────────────────────────────────────────

  const fetchDashboard = useCallback(
    async (background = false): Promise<void> => {
      // Serve from cache when fresh (unless background refresh)
      if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS && !background) {
        safeSet(() => {
          setData(_cache!.data)
          setLoading(false)
          setError(null)
        })
        return
      }

      safeSet(() => {
        if (background) setRefreshing(true)
        else setLoading(true)
      })

      try {
        // ✅ Server source of truth (admin dashboard)
        const payload = await invokeEdge<DashboardPayload>('admin-metrics', {})

        _cache = { data: payload, ts: Date.now() }

        safeSet(() => {
          setData(payload)
          setLastRefresh(new Date())
          setError(null)
          setCountdown(REFRESH_MS / 1000)
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Dashboard failed to load'
        safeSet(() => setError(msg))
      } finally {
        safeSet(() => {
          setLoading(false)
          setRefreshing(false)
        })
      }
    },
    [safeSet],
  )

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  useEffect(() => {
    mounted.current = true

    // Initial load
    fetchDashboard(false)

    // Auto refresh timer
    autoTimer.current = setInterval(() => {
      fetchDashboard(true)
    }, REFRESH_MS)

    // Countdown timer
    countTimer.current = setInterval(() => {
      if (!mounted.current) return
      setCountdown((c) => (c <= 1 ? REFRESH_MS / 1000 : c - 1))
    }, 1_000)

    return () => {
      mounted.current = false
      if (autoTimer.current) clearInterval(autoTimer.current)
      if (countTimer.current) clearInterval(countTimer.current)
      autoTimer.current = null
      countTimer.current = null
    }
  }, [fetchDashboard])

  // ── Manual refresh ───────────────────────────────────────────────────────────

  const manualRefresh = useCallback(() => {
    _cache = null
    safeSet(() => setCountdown(REFRESH_MS / 1000))
    fetchDashboard(true)
  }, [fetchDashboard, safeSet])

  // (Optional) stabilize return reference a bit
  return useMemo(
    () => ({ data, loading, refreshing, lastRefresh, countdown, error, manualRefresh }),
    [data, loading, refreshing, lastRefresh, countdown, error, manualRefresh],
  )
}