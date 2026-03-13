// =============================================================================
// src/pages/Admin/components/AdminSidebar.tsx
// =============================================================================
// Left-side navigation shell for the admin layout.
//
// Renders:
//   - KPI header (revenue + orders today, gross profit)
//   - Skeleton during first load
//   - Non-fatal error banner (metrics failed, nav stays usable)
//   - Last-refreshed timestamp + manual refresh trigger
//   - Fraud alert banner (links to /admin/fraud)
//   - Navigation groups driven by nav.config.tsx (zero hardcoded routes)
//   - Footer (admin name + sign-out)
//
// Props are intentionally flat — no context, no hook calls inside.
// All data and callbacks come from AdminLayout (single source of truth).
// =============================================================================

import { NavLink, useNavigate } from 'react-router-dom';
import { fmt$, fmtCount, fmtTime } from '../admin-layout.utils';
import type { AdminLayoutSnapshot, MetricsState } from '../admin-layout.types';
import type { NavGroup } from '@/features/admin/menu/nav.config';

// ── Inline SVGs ───────────────────────────────────────────────────────────────
// Sidebar-scoped only. Topbar icons live in AdminTopbar.tsx.

const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M2 2l10 10M12 2L2 12" />
  </svg>
);

const IconLogout = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M8.5 2H3a1 1 0 00-1 1v8a1 1 0 001 1h5.5M9.5 9.5l3-3-3-3M5.5 6.5h7" />
  </svg>
);

const IconFraud = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M7 1L1 13h12L7 1z" />
    <path d="M7 5.5v3M7 10.5v.5" />
  </svg>
);

const IconRefresh = ({ spinning }: { spinning: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
    style={{ animation: spinning ? 'spin 1s linear infinite' : 'none' }}>
    <path d="M10 6A4 4 0 112 4.2" />
    <path d="M2 1.5v2.8h2.8" />
  </svg>
);

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="animate-pulse space-y-1.5 px-1 pt-1">
      <div className="h-7 w-28 bg-zinc-800 rounded-md" />
      <div className="h-3 w-20 bg-zinc-800/60 rounded" />
      <div className="h-3 w-24 bg-zinc-800/40 rounded mt-2" />
    </div>
  );
}

function LiveDot({ color = 'amber' }: { color?: 'amber' | 'red' | 'green' }) {
  const ring = color === 'red' ? 'bg-red-400' : color === 'green' ? 'bg-green-400' : 'bg-amber-400';
  const fill = color === 'red' ? 'bg-red-500' : color === 'green' ? 'bg-green-500' : 'bg-amber-500';
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${ring} opacity-75`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${fill}`} />
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AdminSidebarProps {
  snapshot: AdminLayoutSnapshot | null;
  metricsState: MetricsState;
  isLoading: boolean;
  isRefreshing: boolean;
  countdown: number;
  adminName: string;
  sidebarOpen: boolean;
  navGroups: NavGroup[];
  onManualRefresh: () => void;
  onSignOut: () => Promise<void>;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AdminSidebar({
  snapshot,
  metricsState,
  isLoading,
  isRefreshing,
  countdown,
  adminName,
  sidebarOpen,
  navGroups,
  onManualRefresh,
  onSignOut,
  onClose,
}: AdminSidebarProps) {
  const navigate = useNavigate();

  return (
    <aside
      className={[
        'fixed lg:relative inset-y-0 left-0 z-30 w-64 flex flex-col',
        'bg-zinc-900 border-r border-zinc-800',
        'transition-transform duration-300 ease-out',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ].join(' ')}
    >

      {/* ── KPI header ─────────────────────────────────────────────────── */}
      <div className="p-5 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-amber-500">
            Sofi's Command Center
          </p>
          <button
            onClick={onClose}
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
            {/* Today revenue */}
            <div className="flex items-center gap-2 mb-0.5">
              <LiveDot color={metricsState.phase === 'error' ? 'red' : 'amber'} />
              <span className="text-2xl font-black text-white tracking-tight">
                {snapshot ? fmt$(snapshot.today_revenue_cents) : '—'}
              </span>
            </div>
            <p className="text-xs text-zinc-500 pl-4">
              {snapshot ? fmtCount(snapshot.today_orders) : '—'} orders today
            </p>

            {/* Gross profit — sourced from admin_profit_snapshot via layout view */}
            {snapshot && snapshot.total_gross_profit_cents > 0 && (
              <p className="mt-1 pl-4 text-[10px] text-emerald-500/70 font-mono">
                {fmt$(snapshot.total_gross_profit_cents)} gross profit
              </p>
            )}
          </>
        )}

        {/* Non-fatal metrics error banner */}
        {metricsState.phase === 'error' && metricsState.errorMsg && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1.5">
            <span aria-hidden>⚠</span>
            <span className="truncate">{metricsState.errorMsg}</span>
          </div>
        )}

        {/* Last refreshed + manual refresh trigger */}
        <div className="mt-2 flex items-center justify-between pl-4">
          <p className="text-[9px] text-zinc-700">
            {metricsState.lastRefreshedAt
              ? fmtTime(metricsState.lastRefreshedAt)
              : '—'}
          </p>
          <button
            onClick={onManualRefresh}
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

      {/* ── Fraud alert banner ──────────────────────────────────────────── */}
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

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      {/*
        Driven entirely by nav.config.tsx.
        badgeKey maps a NavItem to its AdminLayoutSnapshot field name.
        If the field value > 0, a badge chip is rendered.
      */}
      <nav
        className="flex-1 p-3 space-y-5 overflow-y-auto"
        aria-label="Admin navigation"
      >
        {navGroups.map((group) => (
          <div key={group.title}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-1.5 px-2">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
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
                    onClick={onClose}
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

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="p-4 border-t border-zinc-800 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-zinc-300">{adminName}</p>
          <p className="text-[9px] text-zinc-600 uppercase tracking-wider">Administrator</p>
        </div>
        <button
          onClick={() => { void onSignOut(); }}
          className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          title="Sign out"
          aria-label="Sign out"
        >
          <IconLogout />
        </button>
      </div>
    </aside>
  );
}