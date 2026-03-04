import { useEffect, useRef, useState } from 'react';
import AuthBootstrapGuard from './boot/AuthBootstrapGuard';
import { runStartupHealthCheck } from '@/security/StartupHealthCheck';
import { retryStartup } from '@/lib/resilience/startupRetry';
import { supabase } from '@/lib/supabase/supabaseClient';

type BootState = 'loading' | 'ready' | 'fallback' | 'fatal';

function safeNowMs() {
  return Date.now();
}

function clampMs(ms: number, min: number, max: number) {
  if (!Number.isFinite(ms)) return min;
  return Math.max(min, Math.min(max, Math.trunc(ms)));
}

export default function AppBoot({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BootState>('loading');

  // single scheduled refresh timer
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRefreshTimer = () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  };

  const scheduleRefresh = (expiresAtSeconds: number | null | undefined) => {
    clearRefreshTimer();
    if (!expiresAtSeconds || !Number.isFinite(expiresAtSeconds)) return;

    // refresh ~60s before expiry, but never sooner than 5s
    const expiresAtMs = expiresAtSeconds * 1000;
    const msUntil = expiresAtMs - safeNowMs() - 60_000;
    const delay = clampMs(msUntil, 5_000, 24 * 60 * 60 * 1000);

    refreshTimerRef.current = setTimeout(() => {
      // best-effort refresh (do not flip app state)
      void supabase.auth.refreshSession().catch(() => {
        // ignore; invokeEdge will also auto refresh + retry
      });
    }, delay);
  };

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      try {
        const result = await retryStartup(async () => {
          const health = await runStartupHealthCheck();
          if (!health.ok) throw new Error(health.reason);
          return health;
        });

        // 1) Hydrate session early (prevents “null session flash”)
        const { data } = await supabase.auth.getSession();
        scheduleRefresh(data?.session?.expires_at ?? null);

        if (!mounted) return;
        console.log('🟢 Startup healthy:', result);
        setState('ready');
      } catch (err) {
        if (!mounted) return;
        console.warn('⚠️ Startup fallback mode:', err);
        setState('fallback');
        console.error('🚨 SYSTEM ALERT:', err);
      }
    };

    boot();

    // 2) Keep session stable across refreshes / token rotations
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Do not log session/token
      scheduleRefresh(session?.expires_at ?? null);
    });

    // 3) When tab becomes visible again, re-hydrate session (fixes “stale tab” issues)
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void supabase.auth.getSession().then(({ data }) => {
          scheduleRefresh(data?.session?.expires_at ?? null);
        });
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      mounted = false;
      clearRefreshTimer();
      sub?.subscription?.unsubscribe();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  if (state === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white">
        Starting system...
      </div>
    );
  }

  if (state === 'fallback') {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="p-4 bg-yellow-600 text-black text-sm font-bold text-center">
          ⚠️ Running in fallback mode — backend unstable
        </div>
        <AuthBootstrapGuard>{children}</AuthBootstrapGuard>
      </div>
    );
  }

  if (state === 'fatal') {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-red-500">
        System offline
      </div>
    );
  }

  return <AuthBootstrapGuard>{children}</AuthBootstrapGuard>;
}
