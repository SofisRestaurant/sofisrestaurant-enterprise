// src/app/AppBoot.tsx
// =============================================================================
// APP BOOT — Performance-first + secure session bootstrap
// =============================================================================
//
// 2026 production behavior:
//   - Renders the app immediately. No backend health check blocks FCP/LCP.
//   - Runs startup health check in the background.
//   - Keeps Supabase session refresh scheduled safely.
//   - Cleans all timers/subscriptions on unmount.
//   - Optional boot splash is fully lazy and disabled by default for Lighthouse.
//   - Fallback banner appears only if backend health fails.
//   - Initializes campaign attribution tracking on first render.
//
// Biggest Lighthouse win:
//   The old version forced the app to wait for retryStartup() + health_ping()
//   + a minimum 900ms splash. That can destroy FCP/LCP.
// =============================================================================

import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import AuthBootstrapGuard from './boot/AuthBootstrapGuard';
import { initCampaignTracking } from '@/lib/analytics/campaignTracking';
import { retryStartup } from '@/lib/resilience/startupRetry';
import { supabase } from '@/lib/supabase/supabaseClient';
import { runStartupHealthCheck } from '@/security/StartupHealthCheck';

// Disabled by default for maximum Lighthouse performance.
// Turn true only if you accept a visual boot overlay cost.
const ENABLE_BOOT_SPLASH = false;

const BootSplash3D = lazy(() => import('@/components/app/BootSplash3D'));

type BootState = 'ready' | 'fallback';

const SESSION_REFRESH_SAFETY_WINDOW_MS = 60_000;
const MIN_REFRESH_DELAY_MS = 5_000;
const MAX_REFRESH_DELAY_MS = 24 * 60 * 60 * 1000;

function safeNowMs(): number {
  return Date.now();
}

function clampMs(ms: number, min: number, max: number): number {
  if (!Number.isFinite(ms)) return min;
  return Math.max(min, Math.min(max, Math.trunc(ms)));
}

function scheduleIdleWork(fn: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const win = window as Window & {
    requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (typeof win.requestIdleCallback === 'function') {
    const id = win.requestIdleCallback(fn, { timeout: 2_500 });
    return () => win.cancelIdleCallback?.(id);
  }

  const id = window.setTimeout(fn, 750);
  return () => window.clearTimeout(id);
}

export default function AppBoot({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BootState>('ready');

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback(
    (expiresAtSeconds: number | null | undefined) => {
      clearRefreshTimer();

      if (!expiresAtSeconds || !Number.isFinite(expiresAtSeconds)) {
        return;
      }

      const expiresAtMs = expiresAtSeconds * 1000;
      const msUntilRefresh = expiresAtMs - safeNowMs() - SESSION_REFRESH_SAFETY_WINDOW_MS;
      const delay = clampMs(msUntilRefresh, MIN_REFRESH_DELAY_MS, MAX_REFRESH_DELAY_MS);

      refreshTimerRef.current = setTimeout(() => {
        void supabase.auth.refreshSession().catch(() => {
          // Best effort only. Auth state listener / next visibility event will retry.
        });
      }, delay);
    },
    [clearRefreshTimer],
  );

  // ── Session bootstrap + campaign tracking ──────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    // Capture UTM params and landing page on first render.
    // Must run before any navigation can clear URL params.
    initCampaignTracking();

    const bootstrapSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();

        if (!mountedRef.current) return;

        scheduleRefresh(data?.session?.expires_at ?? null);
      } catch {
        // Do not block rendering because of session bootstrap.
      }
    };

    void bootstrapSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mountedRef.current) return;
      scheduleRefresh(session?.expires_at ?? null);
    });

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      void supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!mountedRef.current) return;
          scheduleRefresh(data?.session?.expires_at ?? null);
        })
        .catch(() => {
          // Best effort only. Do not block the app.
        });
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mountedRef.current = false;
      clearRefreshTimer();
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [clearRefreshTimer, scheduleRefresh]);

  // ── Background startup health check ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const cancelIdle = scheduleIdleWork(() => {
      void retryStartup(async () => {
        const health = await runStartupHealthCheck();

        if (!health.ok) {
          throw new Error(health.reason || 'startup_health_check_failed');
        }

        return health;
      })
        .then(() => {
          if (cancelled || !mountedRef.current) return;
          setState('ready');
        })
        .catch((err: unknown) => {
          if (cancelled || !mountedRef.current) return;

          setState('fallback');

          if (import.meta.env.DEV) {
            console.warn('⚠️ Startup fallback mode:', err);
          }
        });
    });

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, []);

  return (
    <>
      {state === 'fallback' ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 top-0 z-9998 bg-yellow-500 px-4 py-2 text-center text-xs font-bold text-black shadow-md"
        >
          Backend is responding slowly. Ordering may be temporarily limited.
        </div>
      ) : null}

      <AuthBootstrapGuard>{children}</AuthBootstrapGuard>

      {ENABLE_BOOT_SPLASH ? (
        <Suspense fallback={null}>
          <BootSplash3D
            visible
            fadingOut={false}
            title="SOFI'S RESTAURANT"
            subtitle="Preparing your experience..."
          />
        </Suspense>
      ) : null}
    </>
  );
}