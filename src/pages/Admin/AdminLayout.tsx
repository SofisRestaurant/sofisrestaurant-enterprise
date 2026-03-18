// =============================================================================
// src/pages/Admin/AdminLayout.tsx
// ADMIN SHELL — 2026 Production Grade
// =============================================================================
//
// SECURITY MODEL
//   ✅ Client gate: verifyAdminAccess() → getSession → is_admin() RPC
//   ✅ Server gate: every admin data call goes through admin-gateway Edge Fn
//   ✅ Zero direct table/view queries from client for admin data
//   ✅ onAuthStateChange handles token expiry mid-session
//   ✅ Admin name fetched ONLY after is_admin() RPC passes
//   ✅ JWT never logged, never stored in localStorage manually
//
// DATA STRATEGY
//   ✅ Single gateway call → admin_layout_snapshot (all KPIs in one round-trip)
//   ✅ Module-level cache with TTL — no unnecessary Edge Function calls
//   ✅ Page Visibility API pauses polling while tab is hidden
//   ✅ Exponential backoff retry for transient failures (network / 5xx only)
//   ✅ Auth failures (401/403) redirect immediately, never retry-loop
//   ✅ Metrics failure is NON-FATAL — layout stays usable with error banner
//
// GATEWAY CONTRACT
//   Add to admin-gateway router: action 'layout' → admin_layout_snapshot
//   Response shape: GatewayEnvelope<AdminLayoutSnapshot>
//
// ARCHITECTURE
//   ✅ invokeFn from @/lib/supabase/invoke (JWT attachment handled there)
//   ✅ verifyAdminAccess / subscribeToAdminSession from admin.auth
//   ✅ Nav driven by buildNavGroups() — edit nav.config.tsx to change nav
//   ✅ Skeleton KPI bar — no layout shift on load
//   ✅ Manual refresh with live countdown + polling timer reset
//
// TIMER TYPE FIX
//   useRef types use ReturnType<typeof setInterval/setTimeout> (no window. prefix).
//   All call sites use bare setInterval/clearInterval/setTimeout/clearTimeout.
//   Reason: window.setInterval returns `number` (DOM lib) but when @types/node
//   is installed TypeScript resolves the ref type as NodeJS.Timer via the global
//   setInterval declaration — causing "Type 'number' is not assignable to 'Timeout'".
//   Using the bare global for BOTH the type and the call sites forces TypeScript
//   to resolve both from the same declaration, eliminating the mismatch.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase/supabaseClient';
import { invokeEdge } from '@/lib/supabase/invoke';
import { subscribeToAdminSession, verifyAdminAccess } from '@/pages/Admin/admin.auth';
import { buildNavGroups } from '@/features/admin/menu/nav.config';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Exact shape of admin_layout_snapshot rows returned by the gateway */
export interface AdminLayoutSnapshot {
  today_revenue_cents: number;
  today_orders: number;
  pending_orders: number;
  unread_notifications: number;
  fraud_events_7d: number;
  abandoned_carts: number;
  pending_carts: number;
  generated_at: string;
}

/** Gateway envelope — matches GatewayEnvelope<T> from adminGateway.types */
interface GatewayEnvelope<T> {
  data: T;
  meta: { requestedBy: string; requestId: string; ts: number };
}

type LayoutMetricsPayload = GatewayEnvelope<AdminLayoutSnapshot>;

/** Auth state machine — three mutually-exclusive states */
type AuthStatus = 'checking' | 'authorized' | 'denied';

/** Metrics fetch phase — distinguishes skeleton load from background refresh */
type FetchPhase = 'idle' | 'loading' | 'refreshing' | 'error';

interface MetricsState {
  snapshot: AdminLayoutSnapshot | null;
  phase: FetchPhase;
  errorMsg: string | null;
  lastRefreshedAt: Date | null;
}

interface MetricsCache {
  snapshot: AdminLayoutSnapshot;
  ts: number;
}

type LiveDotColor = 'amber' | 'red' | 'green';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const POLL_MS = 30_000;
const CACHE_TTL_MS = 25_000;
const COUNTDOWN_S = POLL_MS / 1000;
const RETRY_MAX = 3;
const RETRY_BASE_MS = 1_000;

// ─────────────────────────────────────────────────────────────────────────────
// Module-level cache — survives re-renders, lost on hard reload
// ─────────────────────────────────────────────────────────────────────────────

let metricsCache: MetricsCache | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Runtime validation
// Guard unknown → AdminLayoutSnapshot. Never trust gateway shape blindly.
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asInt(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function asISOString(v: unknown): string {
  return typeof v === 'string' && v.length > 0 ? v : new Date().toISOString();
}

function parseSnapshot(raw: unknown): AdminLayoutSnapshot {
  if (!isRecord(raw)) {
    throw new Error('admin_layout_snapshot: unexpected response shape');
  }

  return {
    today_revenue_cents: asInt(raw['today_revenue_cents']),
    today_orders: asInt(raw['today_orders']),
    pending_orders: asInt(raw['pending_orders']),
    unread_notifications: asInt(raw['unread_notifications']),
    fraud_events_7d: asInt(raw['fraud_events_7d']),
    abandoned_carts: asInt(raw['abandoned_carts']),
    pending_carts: asInt(raw['pending_carts']),
    generated_at: asISOString(raw['generated_at']),
  };
}

function readFreshCache(): AdminLayoutSnapshot | null {
  if (!metricsCache) return null;
  if (Date.now() - metricsCache.ts >= CACHE_TTL_MS) return null;
  return metricsCache.snapshot;
}

function writeCache(snapshot: AdminLayoutSnapshot): void {
  metricsCache = { snapshot, ts: Date.now() };
}

function clearCache(): void {
  metricsCache = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatters — display only, never used for computation
// ─────────────────────────────────────────────────────────────────────────────

const fmt$ = (cents: number): string =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

const fmtCount = (n: number): string => (Number.isFinite(n) ? String(n) : '—');

// ─────────────────────────────────────────────────────────────────────────────
// Retry with exponential backoff
// Auth errors (401/403) throw immediately and are never retried.
// ─────────────────────────────────────────────────────────────────────────────

function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return msg.includes('unauthorized') || msg.includes('invalid jwt') || msg.includes('forbidden');
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = RETRY_MAX): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (isAuthError(err)) throw err;
      lastErr = err;

      if (attempt < maxAttempts - 1) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, RETRY_BASE_MS * 2 ** attempt);
        });
      }
    }
  }

  throw lastErr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small UI primitives (local to this file)
// ─────────────────────────────────────────────────────────────────────────────

const IconBell = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5.5 11.5a1.5 1.5 0 0 0 3 0" />
    <path d="M7 2a3.5 3.5 0 0 1 3.5 3.5c0 2.5 1 3.5 1 3.5H2.5s1-1 1-3.5A3.5 3.5 0 0 1 7 2Z" />
  </svg>
);

const IconLogout = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8.5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h5.5" />
    <path d="M9.5 9.5l3-3-3-3" />
    <path d="M5.5 6.5h7" />
  </svg>
);

const IconBurger = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 4h14" />
    <path d="M2 9h14" />
    <path d="M2 14h14" />
  </svg>
);

const IconClose = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 2l10 10" />
    <path d="M12 2L2 12" />
  </svg>
);

const IconFraud = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M7 1 1 13h12L7 1Z" />
    <path d="M7 5.5v3" />
    <path d="M7 10.5v.5" />
  </svg>
);

const IconRefresh = ({ spinning }: { spinning: boolean }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ animation: spinning ? 'spin 1s linear infinite' : 'none' }}
  >
    <path d="M10 6A4 4 0 1 1 2 4.2" />
    <path d="M2 1.5v2.8h2.8" />
  </svg>
);

const IconCart = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M1 1h1.5l1.3 5.5h5.5l.9-3.5H3.5" />
    <circle cx="5" cy="10" r=".9" />
    <circle cx="9.5" cy="10" r=".9" />
  </svg>
);

function KpiSkeleton() {
  return (
    <div className="animate-pulse space-y-1.5 px-1 pt-1">
      <div className="h-7 w-28 rounded-md bg-zinc-800" />
      <div className="h-3 w-20 rounded bg-zinc-800/60" />
    </div>
  );
}

function LiveDot({ color = 'amber' }: { color?: LiveDotColor }) {
  const ring = color === 'red' ? 'bg-red-400' : color === 'green' ? 'bg-green-400' : 'bg-amber-400';
  const fill = color === 'red' ? 'bg-red-500' : color === 'green' ? 'bg-green-500' : 'bg-amber-500';

  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
      <span
        className={`absolute inline-flex h-full w-full animate-ping rounded-full ${ring} opacity-75`}
      />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${fill}`} />
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AdminLayout
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const navGroups = buildNavGroups();

  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [adminName, setAdminName] = useState('Admin');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_S);

  const initialCache = readFreshCache();
  const [metricsState, setMetricsState] = useState<MetricsState>({
    snapshot: initialCache,
    phase: initialCache ? 'idle' : 'loading',
    errorMsg: null,
    lastRefreshedAt: initialCache && metricsCache ? new Date(metricsCache.ts) : null,
  });

  const mountedRef = useRef(true);

  // Timer refs typed with bare ReturnType<typeof setInterval> — no window. prefix.
  // See file header for the full explanation of why this matters with @types/node.
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const snapshot = metricsState.snapshot;
  const isAuthorized = authStatus === 'authorized';
  const isLoading = metricsState.phase === 'loading';
  const isRefreshing = metricsState.phase === 'refreshing';

  const pageTitle =
    location.pathname
      .replace('/admin', '')
      .split('/')
      .filter(Boolean)
      .slice(-1)[0]
      ?.replace(/-/g, ' ')
      .toLowerCase() || '';

  const fetchMetrics = useCallback(
    async (background = false): Promise<void> => {
      if (!mountedRef.current) return;

      const cached = readFreshCache();
      if (cached && !background) {
        setMetricsState((prev) => ({
          ...prev,
          snapshot: cached,
          phase: 'idle',
          lastRefreshedAt: metricsCache ? new Date(metricsCache.ts) : prev.lastRefreshedAt,
        }));
        return;
      }

      setMetricsState((prev) => ({
        ...prev,
        phase: background ? 'refreshing' : 'loading',
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
      } catch (err: unknown) {
        if (!mountedRef.current) return;

        if (isAuthError(err)) {
          setAuthStatus('denied');
          void navigate('/login', { replace: true });
          return;
        }

        const msg = err instanceof Error ? err.message : 'Metrics unavailable';
        setMetricsState((prev) => ({
          ...prev,
          phase: 'error',
          errorMsg: msg,
        }));
      }
    },
    [navigate],
  );

  const startPollTimer = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
    }

    pollTimerRef.current = setInterval(() => {
      if (mountedRef.current && document.visibilityState === 'visible') {
        void fetchMetrics(true);
      }
    }, POLL_MS);
  }, [fetchMetrics]);

  const handleManualRefresh = useCallback(() => {
    clearCache();
    setCountdown(COUNTDOWN_S);
    startPollTimer();
    void fetchMetrics(true);
  }, [fetchMetrics, startPollTimer]);

  const handleSignOut = useCallback(async () => {
    clearCache();
    await supabase.auth.signOut();
    void navigate('/login');
  }, [navigate]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function verify(): Promise<void> {
      const result = await verifyAdminAccess();
      if (!alive) return;

      if (!result.ok) {
        setAuthStatus('denied');
        void navigate(result.redirectTo, { replace: true });
        return;
      }

      setAdminName(result.firstName);
      setAuthStatus('authorized');
    }

    void verify();

    return () => {
      alive = false;
    };
  }, [navigate]);

  useEffect(() => {
    return subscribeToAdminSession(() => {
      setAuthStatus('denied');
      void navigate('/login', { replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    if (!isAuthorized) return;

    queueMicrotask(() => {
      void fetchMetrics(true);
    });

    startPollTimer();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mountedRef.current) {
        void fetchMetrics(true);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    countTimerRef.current = setInterval(() => {
      if (mountedRef.current) {
        setCountdown((c) => (c <= 1 ? COUNTDOWN_S : c - 1));
      }
    }, 1_000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);

      if (pollTimerRef.current !== null) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }

      if (countTimerRef.current !== null) {
        clearInterval(countTimerRef.current);
        countTimerRef.current = null;
      }
    };
  }, [fetchMetrics, isAuthorized, startPollTimer]);

  if (authStatus === 'checking') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-zinc-950">
        <span className="text-2xl animate-bounce">🌮</span>
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-500" />
        <p className="text-[10px] uppercase tracking-widest text-zinc-600">Verifying access…</p>
      </div>
    );
  }

  if (authStatus === 'denied') {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-200">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-20 bg-black/70 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-zinc-800 bg-zinc-900 transition-transform duration-300 ease-out',
          'lg:relative',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        <div className="border-b border-zinc-800 p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[9px] font-bold uppercase tracking-widest text-amber-500">
              Sofi&apos;s Command Center
            </p>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="text-zinc-600 transition-colors hover:text-zinc-300 lg:hidden"
              aria-label="Close sidebar"
            >
              <IconClose />
            </button>
          </div>

          {isLoading ? (
            <KpiSkeleton />
          ) : (
            <>
              <div className="mb-0.5 flex items-center gap-2">
                <LiveDot color={metricsState.phase === 'error' ? 'red' : 'amber'} />
                <span className="text-2xl font-black tracking-tight text-white">
                  {snapshot ? fmt$(snapshot.today_revenue_cents) : '—'}
                </span>
              </div>
              <p className="pl-4 text-xs text-zinc-500">
                {snapshot ? fmtCount(snapshot.today_orders) : '—'} orders today
              </p>
            </>
          )}

          {metricsState.phase === 'error' && metricsState.errorMsg ? (
            <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[10px] text-red-400">
              <span aria-hidden="true">⚠</span>
              <span className="truncate">{metricsState.errorMsg}</span>
            </div>
          ) : null}

          <div className="mt-2 flex items-center justify-between pl-4">
            <p className="text-[9px] text-zinc-700">
              {metricsState.lastRefreshedAt
                ? metricsState.lastRefreshedAt.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : '—'}
            </p>

            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1 text-[9px] text-zinc-600 transition-colors hover:text-zinc-400 disabled:opacity-40"
              title={`Auto-refresh in ${countdown}s`}
              aria-label="Refresh metrics"
            >
              <IconRefresh spinning={isRefreshing} />
              <span>{isRefreshing ? '…' : `${countdown}s`}</span>
            </button>
          </div>
        </div>

        {snapshot && snapshot.fraud_events_7d > 0 ? (
          <button
            type="button"
            onClick={() => void navigate('/admin/fraud')}
            className="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-left transition-colors hover:bg-red-500/15"
          >
            <IconFraud />
            <p className="text-xs font-bold text-red-400">
              {fmtCount(snapshot.fraud_events_7d)} fraud event
              {snapshot.fraud_events_7d !== 1 ? 's' : ''} (7d) — Review
            </p>
          </button>
        ) : null}

        <nav className="flex-1 space-y-5 overflow-y-auto p-3" aria-label="Admin navigation">
          {navGroups.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 px-2 text-[9px] font-bold uppercase tracking-widest text-zinc-600">
                {group.title}
              </p>

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const badgeVal =
                    item.badgeKey && snapshot
                      ? snapshot[item.badgeKey as keyof AdminLayoutSnapshot]
                      : 0;

                  const badge =
                    typeof badgeVal === 'number' && Number.isFinite(badgeVal) && badgeVal > 0
                      ? badgeVal
                      : null;

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        [
                          'flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-all',
                          isActive
                            ? 'bg-amber-500/15 font-medium text-amber-400'
                            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
                        ].join(' ')
                      }
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="shrink-0">{item.icon}</span>
                        {item.label}
                      </span>

                      {badge !== null ? (
                        <span
                          className={[
                            'min-w-5 rounded-full px-2 py-0.5 text-center text-[10px] font-black',
                            item.badgeWarn
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-amber-500/20 text-amber-400',
                          ].join(' ')}
                        >
                          {badge > 99 ? '99+' : fmtCount(badge)}
                        </span>
                      ) : null}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex items-center justify-between border-t border-zinc-800 p-4">
          <div>
            <p className="text-xs font-semibold text-zinc-300">{adminName}</p>
            <p className="text-[9px] uppercase tracking-wider text-zinc-600">Administrator</p>
          </div>

          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="rounded-lg p-2 text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
            title="Sign out"
            aria-label="Sign out"
          >
            <IconLogout />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900/40 px-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="text-zinc-400 transition-colors hover:text-white lg:hidden"
              aria-label="Open sidebar"
            >
              <IconBurger />
            </button>

            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs">
              <span className="text-zinc-600">Admin</span>
              {pageTitle ? (
                <>
                  <span className="text-zinc-700" aria-hidden="true">
                    /
                  </span>
                  <span className="font-semibold capitalize text-zinc-300">{pageTitle}</span>
                </>
              ) : null}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {!isLoading && snapshot && snapshot.pending_orders > 0 ? (
              <button
                type="button"
                onClick={() => void navigate('/admin/orders')}
                className="hidden items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5 text-[10px] font-bold text-amber-400 transition-colors hover:bg-amber-500/20 sm:flex"
                aria-label={`${snapshot.pending_orders} pending orders`}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
                </span>
                {fmtCount(snapshot.pending_orders)} pending
              </button>
            ) : null}

            {!isLoading && snapshot && snapshot.abandoned_carts > 0 ? (
              <button
                type="button"
                onClick={() => void navigate('/admin/marketing/abandoned')}
                className="hidden items-center gap-1.5 rounded-lg border border-orange-500/20 bg-orange-500/10 px-2.5 py-1.5 text-[10px] font-bold text-orange-400 transition-colors hover:bg-orange-500/20 sm:flex"
                aria-label={`${snapshot.abandoned_carts} abandoned carts`}
              >
                <IconCart />
                {fmtCount(snapshot.abandoned_carts)} abandoned
              </button>
            ) : null}

            {!isLoading && snapshot && snapshot.pending_carts > 0 ? (
              <button
                type="button"
                onClick={() => void navigate('/admin/marketing/abandoned')}
                className="hidden items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-700/40 px-2.5 py-1.5 text-[10px] font-bold text-zinc-400 transition-colors hover:bg-zinc-700/60 md:flex"
                aria-label={`${snapshot.pending_carts} carts in progress`}
              >
                {fmtCount(snapshot.pending_carts)} in cart
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => void navigate('/admin/notifications')}
              className="relative rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
              title="Notifications"
              aria-label={
                snapshot && snapshot.unread_notifications > 0
                  ? `${snapshot.unread_notifications} unread notifications`
                  : 'Notifications'
              }
            >
              <IconBell />
              {!isLoading && snapshot && snapshot.unread_notifications > 0 ? (
                <span
                  className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-black leading-none text-black"
                  aria-hidden="true"
                >
                  {snapshot.unread_notifications > 9
                    ? '9+'
                    : fmtCount(snapshot.unread_notifications)}
                </span>
              ) : null}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}