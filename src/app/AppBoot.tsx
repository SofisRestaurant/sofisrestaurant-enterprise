import { useEffect, useRef, useState } from 'react';
import AuthBootstrapGuard from './boot/AuthBootstrapGuard';
import { runStartupHealthCheck } from '@/security/StartupHealthCheck';
import { retryStartup } from '@/lib/resilience/startupRetry';
import { supabase } from '@/lib/supabase/supabaseClient';
import BootSplash3D from '@/components/app/BootSplash3D';

type BootState = 'loading' | 'ready' | 'fallback' | 'fatal';

const MIN_BOOT_SCREEN_MS = 900;
const EXIT_ANIMATION_MS = 350;
const BOOT_MODEL_SRC = '/sofis3dlogo-2.glb';

function safeNowMs() {
  return Date.now();
}

function clampMs(ms: number, min: number, max: number) {
  if (!Number.isFinite(ms)) return min;
  return Math.max(min, Math.min(max, Math.trunc(ms)));
}

export default function AppBoot({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BootState>('loading');
  const [showSplash, setShowSplash] = useState(true);

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minBootTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRefreshTimer = () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
  };

  const clearVisualTimers = () => {
    if (minBootTimerRef.current) clearTimeout(minBootTimerRef.current);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    minBootTimerRef.current = null;
    exitTimerRef.current = null;
  };

  const scheduleRefresh = (expiresAtSeconds: number | null | undefined) => {
    clearRefreshTimer();
    if (!expiresAtSeconds || !Number.isFinite(expiresAtSeconds)) return;

    const expiresAtMs = expiresAtSeconds * 1000;
    const msUntil = expiresAtMs - safeNowMs() - 60_000;
    const delay = clampMs(msUntil, 5_000, 24 * 60 * 60 * 1000);

    refreshTimerRef.current = setTimeout(() => {
      void supabase.auth.refreshSession().catch(() => {
        // best effort only
      });
    }, delay);
  };

  useEffect(() => {
    let mounted = true;
    const bootStartedAt = safeNowMs();

    const moveToReady = () => {
      if (!mounted) return;

      const elapsed = safeNowMs() - bootStartedAt;
      const remaining = Math.max(0, MIN_BOOT_SCREEN_MS - elapsed);

      minBootTimerRef.current = setTimeout(() => {
        if (!mounted) return;
        setState('ready');

        exitTimerRef.current = setTimeout(() => {
          if (!mounted) return;
          setShowSplash(false);
        }, EXIT_ANIMATION_MS);
      }, remaining);
    };

    const boot = async () => {
      try {
        const result = await retryStartup(async () => {
          const health = await runStartupHealthCheck();
          if (!health.ok) throw new Error(health.reason);
          return health;
        });

        const { data } = await supabase.auth.getSession();
        scheduleRefresh(data?.session?.expires_at ?? null);

        if (!mounted) return;
        console.log('🟢 Startup healthy:', result);
        moveToReady();
      } catch (err) {
        if (!mounted) return;
        console.warn('⚠️ Startup fallback mode:', err);
        setState('fallback');
        console.error('🚨 SYSTEM ALERT:', err);
      }
    };

    void boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      scheduleRefresh(session?.expires_at ?? null);
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void supabase.auth.getSession().then(({ data }) => {
          scheduleRefresh(data?.session?.expires_at ?? null);
        });
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mounted = false;
      clearRefreshTimer();
      clearVisualTimers();
      sub?.subscription?.unsubscribe();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  if (state === 'fatal') {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-red-500">
        System offline
      </div>
    );
  }

  if (state === 'fallback') {
    return (
      <>
        <div className="min-h-screen bg-black text-white">
          <div className="p-4 bg-yellow-600 text-black text-sm font-bold text-center">
            ⚠️ Running in fallback mode — backend unstable
          </div>
          <AuthBootstrapGuard>{children}</AuthBootstrapGuard>
        </div>

        {showSplash && (
          <BootSplash3D
            visible
            fadingOut={false}
            modelSrc={BOOT_MODEL_SRC}
            title="SOFI'S RESTAURANT"
            subtitle="Preparing your experience..."
          />
        )}
      </>
    );
  }

  return (
    <>
      <AuthBootstrapGuard>{children}</AuthBootstrapGuard>

      {showSplash && (
        <BootSplash3D
          visible={state === 'loading'}
          fadingOut={state === 'ready'}
          modelSrc={BOOT_MODEL_SRC}
          title="SOFI'S RESTAURANT"
          subtitle="Preparing your experience..."
        />
      )}
    </>
  );
}
