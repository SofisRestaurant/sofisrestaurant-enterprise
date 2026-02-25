// src/components/auth/AuthBootstrap.tsx
// ============================================================================
// AUTH BOOTSTRAP — PRODUCTION GRADE 2026
// ============================================================================
// Sits between UserProvider and Router.
// Responsibilities:
//   1. Block render until auth state is resolved (loading === false)
//   2. Expose a stable "auth is ready" gate — no flash of unauthenticated content
//   3. Handle fatal auth errors gracefully
//   4. Never redirect — that's AuthGuard's job
// ============================================================================

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useUserContext } from '@/contexts/useUserContext';
import { Loader2, ShieldAlert } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface AuthBootstrapProps {
  /** App content — rendered only when auth state is resolved */
  children: ReactNode;

  /**
   * Max ms to wait for auth resolution before showing a timeout warning.
   * Does NOT block rendering — only surfaces a UI hint.
   * @default 8000
   */
  timeoutMs?: number;

  /**
   * Optional custom loading screen. Falls back to built-in spinner.
   */
  loadingFallback?: ReactNode;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function AuthBootstrap({ children, timeoutMs = 8000, loadingFallback }: AuthBootstrapProps) {
  const { loading } = useUserContext();
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Timeout detection ──────────────────────────────────────────────────────
  // If auth hasn't resolved within `timeoutMs`, surface a warning.
  // We do NOT force-resolve because the session might still be in flight
  // on a slow mobile network — we just tell the user something is slow.
  useEffect(() => {
    if (!loading) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setTimeout(() => {
      setTimedOut(true);
    }, timeoutMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [loading, timeoutMs]);

  // ── Auth is still resolving ────────────────────────────────────────────────
  if (loading) {
    if (loadingFallback) return <>{loadingFallback}</>;
    return <AuthLoadingScreen timedOut={timedOut} />;
  }

  // ── Auth resolved — render the app ────────────────────────────────────────
  return <>{children}</>;
}

// ============================================================================
// LOADING SCREEN
// ============================================================================

interface AuthLoadingScreenProps {
  timedOut: boolean;
}

function AuthLoadingScreen({ timedOut }: AuthLoadingScreenProps) {
  return (
    <div
      role="status"
      aria-label={timedOut ? 'Authentication is taking longer than expected' : 'Authenticating'}
      className="flex h-screen w-full flex-col items-center justify-center bg-gray-50 gap-4"
    >
      {timedOut ? (
        <>
          <ShieldAlert className="h-10 w-10 text-amber-500" />
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-gray-800">Taking longer than expected…</p>
            <p className="text-xs text-gray-500">
              Check your connection. The page will load automatically once authentication completes.
            </p>
          </div>
        </>
      ) : (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="text-sm text-gray-500">Authenticating…</p>
        </>
      )}
    </div>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default AuthBootstrap;
