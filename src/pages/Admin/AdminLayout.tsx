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

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const POLL_MS = 30_000;
const CACHE_TTL_MS = 25_000;
const COUNTDOWN_S = POLL_MS / 1000;
const RETRY_MAX = 3;
const RETRY_BASE_MS = 1_000; // exponential: 1s → 2s → 4s

// ─────────────────────────────────────────────────────────────────────────────
// Module-level cache — survives re-renders, lost on hard reload
// ─────────────────────────────────────────────────────────────────────────────

interface MetricsCache {
  snapshot: AdminLayoutSnapshot;
  ts: number;
}

let _cache: MetricsCache | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Runtime validation
// Guard unknown → AdminLayoutSnapshot. Never trust gateway shape blindly.
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
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
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isAuthError(err)) throw err; // never retry auth failures
      lastErr = err;
      if (attempt < maxAttempts - 1) {
        await new Promise<void>((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
      }
    }
  }
  throw lastErr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline SVGs (sidebar chrome only — page-level icons live in nav.config)
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
  >
    <path d="M5.5 11.5a1.5 1.5 0 003 0" />
    <path d="M7 2a3.5 3.5 0 013.5 3.5c0 2.5 1 3.5 1 3.5H2.5s1-1 1-3.5A3.5 3.5 0 017 2z" />
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
  >
    <path d="M8.5 2H3a1 1 0 00-1 1v8a1 1 0 001 1h5.5M9.5 9.5l3-3-3-3M5.5 6.5h7" />
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
  >
    <path d="M2 4h14M2 9h14M2 14h14" />
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
  >
    <path d="M2 2l10 10M12 2L2 12" />
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
  >
    <path d="M7 1L1 13h12L7 1z" />
    <path d="M7 5.5v3M7 10.5v.5" />
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
    style={{ animation: spinning ? 'spin 1s linear infinite' : 'none' }}
  >
    <path d="M10 6A4 4 0 112 4.2" />
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
  >
    <path d="M1 1h1.5l1.3 5.5h5.5l.9-3.5H3.5" />
    <circle cx="5" cy="10" r=".9" />
    <circle cx="9.5" cy="10" r=".9" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// KPI Skeleton — holds layout height during initial data load
// ─────────────────────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="animate-pulse space-y-1.5 px-1 pt-1">
      <div className="h-7 w-28 bg-zinc-800 rounded-md" />
      <div className="h-3 w-20 bg-zinc-800/60 rounded" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pulsing live dot
// ─────────────────────────────────────────────────────────────────────────────

function LiveDot({ color = 'amber' }: { color?: 'amber' | 'red' | 'green' }) {
  const ring = color === 'red' ? 'bg-red-400' : color === 'green' ? 'bg-green-400' : 'bg-amber-400';
  const fill = color === 'red' ? 'bg-red-500' : color === 'green' ? 'bg-green-500' : 'bg-amber-500';
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span
        className={`animate-ping absolute inline-flex h-full w-full rounded-full ${ring} opacity-75`}
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

  // ── State ──────────────────────────────────────────────────────────────────

  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [adminName, setAdminName] = useState('Admin');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_S);

  const [metricsState, setMetricsState] = useState<MetricsState>({
    snapshot: _cache?.snapshot ?? null,
    phase: _cache ? 'idle' : 'loading',
    errorMsg: null,
    lastRefreshedAt: _cache ? new Date(_cache.ts) : null,
  });

  const snapshot = metricsState.snapshot;

  // ── Refs ───────────────────────────────────────────────────────────────────

  const mountedRef = useRef(true);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const countTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

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
      ?.toLowerCase() || '';

  // ── Auth check on mount ────────────────────────────────────────────────────

  useEffect(() => {
    let alive = true;

    async function verify() {
      const result = await verifyAdminAccess();
      if (!alive) return;

      if (!result.ok) {
        setAuthStatus('denied');
        navigate(result.redirectTo, { replace: true });
        return;
      }

      setAdminName(result.firstName);
      setAuthStatus('authorized');
    }

    verify();
    return () => {
      alive = false;
    };
  }, [navigate]);

  // ── Auth state change — handles token expiry mid-session ───────────────────

  useEffect(() => {
    return subscribeToAdminSession(() => {
      setAuthStatus('denied');
      navigate('/login', { replace: true });
    });
  }, [navigate]);

  // ── Metrics fetch ──────────────────────────────────────────────────────────
  //
  // background=false → first load (skeleton visible, no prior data)
  // background=true  → polling / manual refresh (spinner, keep existing data)
  //
  // Auth errors redirect immediately.
  // Transient errors (network / 5xx) retry with backoff then show error banner.
  // Error banner is non-fatal — layout and nav remain fully functional.

  const fetchMetrics = useCallback(
    async (background = false): Promise<void> => {
      if (!mountedRef.current) return;

      // Serve from cache if still fresh (not forced background refresh)
      if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS && !background) {
        setMetricsState((prev) => ({
          ...prev,
          snapshot: _cache!.snapshot,
          phase: 'idle',
          lastRefreshedAt: new Date(_cache!.ts),
        }));
        return;
      }

      setMetricsState((prev) => ({
        ...prev,
        phase: background ? 'refreshing' : 'loading',
        errorMsg: null,
      }));

      try {
        // invokeFn attaches Authorization: Bearer <token> internally
        const envelope = await withRetry(() =>
          invokeEdge<LayoutMetricsPayload>('admin-gateway', { action: 'layout' }),
        );

        // Runtime-validate shape — never trust unknown gateway response
        const parsed = parseSnapshot(envelope?.data);

        _cache = { snapshot: parsed, ts: Date.now() };

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

        // Auth failure → redirect, no error banner needed
        if (isAuthError(err)) {
          setAuthStatus('denied');
          navigate('/login', { replace: true });
          return;
        }

        // Non-fatal — keep existing snapshot if we have it, show banner
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

  // ── Polling + countdown — only when authorized ─────────────────────────────
  //
  // Page Visibility API: pause poll while hidden, refetch immediately on return.
  // This prevents unnecessary Edge Function calls for background tabs.

  const startPollTimer = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(() => {
      if (mountedRef.current && document.visibilityState === 'visible') {
        fetchMetrics(true);
      }
    }, POLL_MS);
  }, [fetchMetrics]);

  useEffect(() => {
    if (!isAuthorized) return;

    mountedRef.current = true;

    // Fire immediately on authorization
    queueMicrotask(() => {
      fetchMetrics(true);
    });
    startPollTimer();

    // Resume on tab focus
    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && mountedRef.current) {
        fetchMetrics(true);
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Countdown ticker — cosmetic, shows seconds to next auto-refresh
    countTimer.current = setInterval(() => {
      if (mountedRef.current) {
        setCountdown((c) => (c <= 1 ? COUNTDOWN_S : c - 1));
      }
    }, 1_000);

    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (countTimer.current) clearInterval(countTimer.current);
    };
  }, [isAuthorized, fetchMetrics, startPollTimer]);

  // ── Manual refresh ─────────────────────────────────────────────────────────
  //
  // Busts cache + resets poll timer so the next auto-fetch is 30s from NOW,
  // not from whenever the previous interval was scheduled.

  const handleManualRefresh = useCallback(() => {
    _cache = null;
    setCountdown(COUNTDOWN_S);
    startPollTimer();
    fetchMetrics(true);
  }, [fetchMetrics, startPollTimer]);

  // ── Sign out ───────────────────────────────────────────────────────────────

  const handleSignOut = async () => {
    _cache = null;
    await supabase.auth.signOut();
    navigate('/login');
  };

  // ── Auth guards ────────────────────────────────────────────────────────────

  if (authStatus === 'checking') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-zinc-950 gap-3">
        <span className="text-2xl animate-bounce">🌮</span>
        <div className="h-4 w-4 border-2 border-zinc-700 border-t-amber-500 rounded-full animate-spin" />
        <p className="text-[10px] uppercase tracking-widest text-zinc-600">Verifying access…</p>
      </div>
    );
  }

  if (authStatus === 'denied') return null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-200 overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside
        className={[
          'fixed lg:relative inset-y-0 left-0 z-30 w-64 flex flex-col',
          'bg-zinc-900 border-r border-zinc-800',
          'transition-transform duration-300 ease-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        {/* ── KPI header ───────────────────────────────────────────────── */}
        <div className="p-5 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-amber-500">
              Sofi's Command Center
            </p>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-zinc-600 hover:text-zinc-300 transition-colors"
              aria-label="Close sidebar"
            >
              <IconClose />
            </button>
          </div>

          {/* Revenue / orders — skeleton during first load */}
          {isLoading ? (
            <KpiSkeleton />
          ) : (
            <>
              <div className="flex items-center gap-2 mb-0.5">
                <LiveDot color={metricsState.phase === 'error' ? 'red' : 'amber'} />
                <span className="text-2xl font-black text-white tracking-tight">
                  {snapshot ? fmt$(snapshot.today_revenue_cents) : '—'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 pl-4">
                {snapshot ? fmtCount(snapshot.today_orders) : '—'} orders today
              </p>
            </>
          )}

          {/* Non-fatal error banner — keeps layout usable */}
          {metricsState.phase === 'error' && metricsState.errorMsg && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1.5">
              <span aria-hidden>⚠</span>
              <span className="truncate">{metricsState.errorMsg}</span>
            </div>
          )}

          {/* Last refreshed + manual refresh control */}
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
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1 text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-40"
              title={`Auto-refresh in ${countdown}s`}
              aria-label="Refresh metrics"
            >
              <IconRefresh spinning={isRefreshing} />
              <span>{isRefreshing ? '…' : `${countdown}s`}</span>
            </button>
          </div>
        </div>

        {/* ── Fraud alert banner ───────────────────────────────────────── */}
        {snapshot && snapshot.fraud_events_7d > 0 && (
          <button
            onClick={() => navigate('/admin/fraud')}
            className="mx-3 mt-3 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 hover:bg-red-500/15 transition-colors text-left"
          >
            <IconFraud />
            <p className="text-xs font-bold text-red-400">
              {fmtCount(snapshot.fraud_events_7d)} fraud event
              {snapshot.fraud_events_7d !== 1 ? 's' : ''} (7d) — Review
            </p>
          </button>
        )}

        {/* ── Nav — driven entirely by nav.config.tsx ──────────────────── */}
        <nav className="flex-1 p-3 space-y-5 overflow-y-auto" aria-label="Admin navigation">
          {navGroups.map((group) => (
            <div key={group.title}>
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-1.5 px-2">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  // badgeKey maps nav item → snapshot field name
                  const badgeVal =
                    item.badgeKey && snapshot
                      ? ((snapshot[item.badgeKey as keyof AdminLayoutSnapshot] as number) ?? 0)
                      : 0;
                  const badge = badgeVal > 0 ? badgeVal : null;

                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        [
                          'flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all',
                          isActive
                            ? 'bg-amber-500/15 text-amber-400 font-medium'
                            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
                        ].join(' ')
                      }
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="shrink-0">{item.icon}</span>
                        {item.label}
                      </span>
                      {badge !== null && (
                        <span
                          className={[
                            'text-[10px] font-black px-2 py-0.5 rounded-full min-w-[20px] text-center',
                            item.badgeWarn
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-amber-500/20 text-amber-400',
                          ].join(' ')}
                        >
                          {badge > 99 ? '99+' : fmtCount(badge)}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="p-4 border-t border-zinc-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-zinc-300">{adminName}</p>
            <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Administrator</p>
          </div>
          <button
            onClick={handleSignOut}
            className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            <IconLogout />
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <header className="h-14 shrink-0 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-zinc-400 hover:text-white transition-colors"
              aria-label="Open sidebar"
            >
              <IconBurger />
            </button>
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs">
              <span className="text-zinc-600">Admin</span>
              {pageTitle && (
                <>
                  <span className="text-zinc-700" aria-hidden>
                    /
                  </span>
                  <span className="text-zinc-300 font-semibold capitalize">{pageTitle}</span>
                </>
              )}
            </nav>
          </div>

          {/* ── Header KPI action chips ───────────────────────────────── */}
          <div className="flex items-center gap-2">
            {/* Pending orders — links to orders queue */}
            {!isLoading && snapshot && snapshot.pending_orders > 0 && (
              <button
                onClick={() => navigate('/admin/orders')}
                className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors"
                aria-label={`${snapshot.pending_orders} pending orders`}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
                </span>
                {fmtCount(snapshot.pending_orders)} pending
              </button>
            )}

            {/* Abandoned carts */}
            {!isLoading && snapshot && snapshot.abandoned_carts > 0 && (
              <button
                onClick={() => navigate('/admin/marketing/abandoned')}
                className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-colors"
                aria-label={`${snapshot.abandoned_carts} abandoned carts`}
              >
                <IconCart />
                {fmtCount(snapshot.abandoned_carts)} abandoned
              </button>
            )}

            {/* Pending carts — softer signal */}
            {!isLoading && snapshot && snapshot.pending_carts > 0 && (
              <button
                onClick={() => navigate('/admin/marketing/abandoned')}
                className="hidden md:flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-zinc-700/40 border border-zinc-700 text-zinc-400 hover:bg-zinc-700/60 transition-colors"
                aria-label={`${snapshot.pending_carts} carts in progress`}
              >
                {fmtCount(snapshot.pending_carts)} in cart
              </button>
            )}

            {/* Notification bell */}
            <button
              onClick={() => navigate('/admin/notifications')}
              className="relative p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
              title="Notifications"
              aria-label={
                snapshot && snapshot.unread_notifications > 0
                  ? `${snapshot.unread_notifications} unread notifications`
                  : 'Notifications'
              }
            >
              <IconBell />
              {!isLoading && snapshot && snapshot.unread_notifications > 0 && (
                <span
                  className="absolute top-1 right-1 h-3.5 w-3.5 flex items-center justify-center bg-amber-500 text-black text-[8px] font-black rounded-full leading-none"
                  aria-hidden
                >
                  {snapshot.unread_notifications > 9
                    ? '9+'
                    : fmtCount(snapshot.unread_notifications)}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* ── Page outlet ──────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
