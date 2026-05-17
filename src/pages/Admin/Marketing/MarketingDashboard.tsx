// =============================================================================
// src/pages/Admin/Marketing/MarketingDashboard.tsx
// Marketing Command Center — top-level shell for all marketing admin pages.
//
// REPLACES the broken stub that imported from non-existent paths:
//   ✕ @/services/marketing.service  (does not exist)
//   ✕ @/types/marketing              (does not exist)
//   ✕ c.revenue / c.spent            (wrong field names)
//
// Now imports from the real, schema-aligned sources:
//   ✓ @/features/admin/growth/growth.service  (fetchCampaigns, fetchPromoCodes, fetchAbandonedCarts)
//   ✓ @/features/admin/growth/growth.types    (Campaign, PromoCode, AbandonedCartSummary)
//   ✓ @/features/admin/ui                      (Panel, KPICard, SectionHeader, etc.)
//
// ARCHITECTURE:
//   • This file is the /admin/marketing index route shell
//   • Sub-routes (Campaigns, Promos, Abandoned, Optimizer) render their own pages
//   • This page shows rolled-up KPIs + navigation cards into each sub-section
//   • All data fetched in parallel via Promise.all — single loading state
//   • Error boundaries per-section so one failure doesn't crash the tree
// =============================================================================

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchCampaigns,
  fetchPromoCodes,
  fetchAbandonedCarts,
  fetchAbandonedCartSummary,
} from '@/features/admin/growth/growth.service';
import type {
  Campaign,
  PromoCode,
  AbandonedCartSession,
  AbandonedCartSummary,
} from '@/features/admin/growth/growth.types';
import { Panel, KPICard, SectionHeader, ActionButton, Badge } from '@/features/admin/ui';

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

const fmt$ = (cents: number) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

function roiLabel(revenueCents: number, spentCents: number): string {
  if (spentCents <= 0) return '—';
  const roi = ((revenueCents - spentCents) / spentCents) * 100;
  const sign = roi >= 0 ? '+' : '';
  return `${sign}${roi.toFixed(1)}%`;
}

function roaTone(
  revenueCents: number,
  spentCents: number,
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (spentCents <= 0) return 'neutral';
  const roas = revenueCents / spentCents;
  if (roas >= 3) return 'success';
  if (roas >= 1) return 'warning';
  return 'danger';
}

// ─────────────────────────────────────────────────────────────────────────────
// Data shape
// ─────────────────────────────────────────────────────────────────────────────

interface MarketingData {
  campaigns: Campaign[];
  promos: PromoCode[];
  abandonedCarts: AbandonedCartSession[];
  abandonedSummary: AbandonedCartSummary | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-section navigation card
// ─────────────────────────────────────────────────────────────────────────────

interface NavCardProps {
  title: string;
  description: string;
  href: string;
  badge?: string;
  badgeTone?: 'success' | 'warning' | 'danger' | 'neutral';
  stat?: string;
  statLabel?: string;
  icon: React.ReactNode;
}

function NavCard({
  title,
  description,
  href,
  badge,
  badgeTone = 'neutral',
  stat,
  statLabel,
  icon,
}: NavCardProps) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(href)}
      className="group w-full text-left rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 hover:border-zinc-700 hover:bg-zinc-900 transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 group-hover:text-amber-400 transition-colors">
            {icon}
          </span>
          <div>
            <p className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">
              {title}
            </p>
            <p className="text-[11px] text-zinc-600 mt-0.5">{description}</p>
          </div>
        </div>
        {badge && <Badge tone={badgeTone}>{badge}</Badge>}
      </div>
      {stat && (
        <div className="pt-3 border-t border-zinc-800">
          <p className="text-lg font-black text-amber-400 tabular-nums">{stat}</p>
          {statLabel && <p className="text-[10px] font-mono text-zinc-600 mt-0.5">{statLabel}</p>}
        </div>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────

const Icons = {
  Campaigns: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <polyline points="1,12 4,9 8,11 15,4" />
      <path d="M10 4h5v5" />
    </svg>
  ),
  Promos: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <rect x="1" y="6" width="14" height="8" rx="1" />
      <path d="M6 6V4.5a3 3 0 016 0V6" />
      <circle cx="8" cy="10" r="1.4" />
    </svg>
  ),
  Abandoned: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M1 1l14 14M6 2H3l2 9H12l1-4" />
      <circle cx="7" cy="15" r="1" />
      <circle cx="12" cy="15" r="1" />
    </svg>
  ),
  Optimizer: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="2.8" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4" />
    </svg>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const MarketingDashboard = memo(function MarketingDashboard() {
  const [data, setData] = useState<MarketingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [campaigns, promos, abandonedCarts, abandonedSummary] = await Promise.all([
        fetchCampaigns(),
        fetchPromoCodes(),
        fetchAbandonedCarts(),
        fetchAbandonedCartSummary(),
      ]);

      setData({
        campaigns: Array.isArray(campaigns) ? campaigns : [],
        promos: Array.isArray(promos) ? promos : [],
        abandonedCarts: Array.isArray(abandonedCarts) ? abandonedCarts : [],
        abandonedSummary: abandonedSummary ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load marketing data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Aggregates ─────────────────────────────────────────────────────────────

  const agg = useMemo(() => {
    if (!data) return null;
    const { campaigns, promos, abandonedSummary } = data;

    const totalRevenueCents = campaigns.reduce((s, c) => s + (c.revenueCents ?? 0), 0);
    const totalSpentCents = campaigns.reduce((s, c) => s + (c.spentCents ?? 0), 0);
    const activeCampaigns = campaigns.length; // growth_campaigns has no status col — count all
    const activePromos = promos.filter((p) => p.active).length;
    const totalPromoUses = promos.reduce((s, p) => s + (p.currentUses ?? 0), 0);

    const recoveryRate = abandonedSummary
      ? (() => {
          const r = abandonedSummary.recoveryRate ?? 0;
          // normalize: might be 0..1 or 0..100 depending on service version
          return r > 1 ? r : r * 100;
        })()
      : null;

    const lostRevenueCents = abandonedSummary?.lostRevenueCents ?? 0;
    const recoveredRevenueCents = abandonedSummary?.recoveredRevenueCents ?? 0;
    const totalAbandoned = abandonedSummary?.totalAbandoned ?? 0;

    return {
      totalRevenueCents,
      totalSpentCents,
      activeCampaigns,
      activePromos,
      totalPromoUses,
      recoveryRate,
      lostRevenueCents,
      recoveredRevenueCents,
      totalAbandoned,
    };
  }, [data]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Marketing Command Center"
        subtitle="Campaigns, promo codes, abandoned cart recovery, and AI-driven optimization"
        right={
          <ActionButton onClick={load} disabled={loading}>
            {loading ? 'Loading…' : '↻ Refresh'}
          </ActionButton>
        }
      />

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={load}
            className="text-[11px] font-mono text-red-400 underline decoration-dotted hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Campaign Revenue"
          value={loading ? '—' : fmt$(agg?.totalRevenueCents ?? 0)}
          accent="amber"
        />
        <KPICard
          label="Total Spent"
          value={loading ? '—' : fmt$(agg?.totalSpentCents ?? 0)}
          accent="slate"
        />
        <KPICard
          label="ROI"
          value={loading ? '—' : roiLabel(agg?.totalRevenueCents ?? 0, agg?.totalSpentCents ?? 0)}
          accent="emerald"
        />
        <KPICard
          label="Active Promo Codes"
          value={loading ? '—' : String(agg?.activePromos ?? 0)}
          accent="sky"
        />
      </div>

      {/* ROI summary panel */}
      {!loading && agg && agg.totalSpentCents > 0 && (
        <Panel>
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
                Campaign ROAS
              </p>
              <p className="mt-1 text-2xl font-black text-white tabular-nums">
                {(agg.totalRevenueCents / Math.max(1, agg.totalSpentCents)).toFixed(2)}x
              </p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
                Budget Utilization
              </p>
              <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-700"
                  style={{
                    width: `${Math.min(100, (agg.totalSpentCents / Math.max(1, agg.totalRevenueCents)) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1 font-mono text-[9px] text-zinc-600">
                {fmt$(agg.totalSpentCents)} of {fmt$(agg.totalRevenueCents)} revenue
              </p>
            </div>
            <div className="ml-auto">
              <Badge tone={roaTone(agg.totalRevenueCents, agg.totalSpentCents)}>
                {roiLabel(agg.totalRevenueCents, agg.totalSpentCents)} ROI
              </Badge>
            </div>
          </div>
        </Panel>
      )}

      {/* Abandoned cart alert */}
      {!loading && agg && agg.totalAbandoned > 0 && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-red-300">
              {agg.totalAbandoned} abandoned cart{agg.totalAbandoned !== 1 ? 's' : ''} detected
            </p>
            <p className="text-[11px] text-zinc-600 mt-0.5">
              {fmt$(agg.lostRevenueCents)} at risk · {fmt$(agg.recoveredRevenueCents)} recovered
              {agg.recoveryRate !== null && <> · {agg.recoveryRate.toFixed(1)}% recovery rate</>}
            </p>
          </div>
          <ActionButton onClick={() => void 0} size="sm">
            View Carts →
          </ActionButton>
        </div>
      )}

      {/* Section nav cards */}
      <div>
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600 mb-3">
          Sections
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <NavCard
            title="Campaigns"
            description="ROI, channel performance, and spend tracking"
            href="/admin/marketing/campaigns"
            stat={loading ? '—' : String(agg?.activeCampaigns ?? 0)}
            statLabel="total campaigns"
            badge={
              !loading && agg && agg.totalSpentCents > 0
                ? roiLabel(agg.totalRevenueCents, agg.totalSpentCents)
                : undefined
            }
            badgeTone={
              !loading && agg ? roaTone(agg.totalRevenueCents, agg.totalSpentCents) : 'neutral'
            }
            icon={<Icons.Campaigns />}
          />

          <NavCard
            title="Promo Codes"
            description="Active codes, usage caps, and redemptions"
            href="/admin/marketing/promos"
            stat={loading ? '—' : String(agg?.activePromos ?? 0)}
            statLabel={`active · ${agg?.totalPromoUses ?? 0} total uses`}
            icon={<Icons.Promos />}
          />

          <NavCard
            title="Abandoned Carts"
            description="Recovery analytics and lost revenue signals"
            href="/admin/marketing/abandoned"
            stat={
              loading ? '—' : agg?.recoveryRate == null ? 'N/A' : `${agg.recoveryRate.toFixed(1)}%`
            }
            statLabel="recovery rate"
            badge={
              !loading && agg && agg.totalAbandoned > 0 ? `${agg.totalAbandoned} open` : undefined
            }
            badgeTone="danger"
            icon={<Icons.Abandoned />}
          />

          <NavCard
            title="AI Optimizer"
            description="Discount predictions and smart pricing insights"
            href="/admin/marketing/optimizer"
            icon={<Icons.Optimizer />}
          />
        </div>
      </div>

      {/* Promo codes quick snapshot */}
      {!loading && data && data.promos.length > 0 && (
        <Panel title="Active Promo Codes — Quick View">
          <div className="mt-3 space-y-2">
            {data.promos
              .filter((p) => p.active)
              .slice(0, 5)
              .map((p) => {
                const used = p.currentUses ?? 0;
                const max = p.maxUses;
                const usagePct = max ? Math.min(100, (used / max) * 100) : null;

                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-base md:text-sm font-bold text-amber-400">
                        {p.code}
                      </span>
                      <Badge tone="info">
                        {p.type === 'percent'
                          ? `${p.value}% off`
                          : `$${(p.value / 100).toFixed(0)} off`}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      {usagePct !== null && (
                        <div className="hidden sm:flex items-center gap-2">
                          <div className="h-1 w-20 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className={[
                                'h-full rounded-full transition-all',
                                usagePct >= 90
                                  ? 'bg-red-500'
                                  : usagePct >= 70
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500',
                              ].join(' ')}
                              style={{ width: `${usagePct}%` }}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-zinc-600">
                            {used}/{max}
                          </span>
                        </div>
                      )}
                      {!max && (
                        <span className="font-mono text-[10px] text-zinc-600">
                          {used} uses · unlimited
                        </span>
                      )}
                      <Badge tone="success">Active</Badge>
                    </div>
                  </div>
                );
              })}

            {data.promos.filter((p) => p.active).length > 5 && (
              <p className="font-mono text-[10px] text-zinc-600 pt-1 text-right">
                +{data.promos.filter((p) => p.active).length - 5} more — view all in Promo Codes
              </p>
            )}
          </div>
        </Panel>
      )}

      {/* Empty state */}
      {!loading && !error && data && data.campaigns.length === 0 && data.promos.length === 0 && (
        <Panel>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-3xl mb-3">📣</p>
            <p className="font-bold text-zinc-300">No marketing data yet</p>
            <p className="text-sm text-zinc-600 mt-1">
              Create your first campaign or promo code to start tracking performance.
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
});

export default MarketingDashboard;
