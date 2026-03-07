// =============================================================================
// src/pages/Admin/Marketing/PromoManager.tsx
// =============================================================================
// Admin UI for promo codes (2026 hardened)
// - List promo codes
// - Activate/Deactivate (privileged mutation via admin-gateway through growth.service)
// - Display schedule (starts/ends), usage, min order
//
// SECURITY + CONTRACT
// - This page must NOT call supabase.functions.invoke('admin-gateway') directly.
// - All privileged reads/writes must route through growth.service.ts, which
//   uses the SINGLE typed gateway client.
// =============================================================================

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { fetchPromoCodes, togglePromoCode } from '@/features/admin/growth/growth.service';
import type { PromoCode } from '@/features/admin/growth/growth.types';
import {
  Panel,
  KPICard,
  SectionHeader,
  ActionButton,
  TableWrapper,
  Th,
  Td,
  Badge,
  EmptyState,
  HealthBar,
  SkeletonGrid,
} from '@/features/admin/ui';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type BadgeTone = NonNullable<ComponentProps<typeof Badge>['tone']>;
type HealthVariant = NonNullable<ComponentProps<typeof HealthBar>['variant']>;

function promoTone(type: string): BadgeTone {
  // Keep tolerant: backend may introduce more promo types over time.
  if (type === 'percent' || type === 'fixed' || type === 'amount') return 'info';
  if (type === 'bogo' || type === 'free_item') return 'warning';
  return 'neutral';
}

function statusTone(active: boolean): BadgeTone {
  return active ? 'success' : 'neutral';
}

function usageVariant(pct: number): HealthVariant {
  // pct 0–100
  if (pct >= 90) return 'bad';
  if (pct >= 70) return 'warn';
  return 'good';
}

const fmt$ = (cents: number) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function discountLabel(p: PromoCode): string {
  if (p.type === 'percent') return `${p.value}%`;
  if (p.type === 'fixed') return fmt$(Math.round(p.value * 100));
  // Future types (bogo/free_item) show placeholder until UI implements details.
  return '—';
}

function isScheduledNow(p: PromoCode, now: number): boolean {
  const s = p.startsAt ? new Date(p.startsAt).getTime() : null;
  const e = p.endsAt ? new Date(p.endsAt).getTime() : null;
  if (s !== null && Number.isFinite(s) && now < s) return false;
  if (e !== null && Number.isFinite(e) && now > e) return false;
  return true;
}

type Filters = {
  q: string;
  onlyActive: boolean;
  type: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const PromoManager = memo(function PromoManager() {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>({
    q: '',
    onlyActive: false,
    type: '',
  });

  const errorRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchPromoCodes();
      setPromos(Array.isArray(data) ? data : []);
    } catch (e) {
      setPromos([]);
      setError(e instanceof Error ? e.message : 'Failed to load promo codes');
      // focus the error for screen readers / keyboard users
      window.setTimeout(() => errorRef.current?.focus(), 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = useCallback(async (p: PromoCode): Promise<void> => {
    const next = !p.active;

    setBusyId(p.id);
    setError(null);

    // optimistic update
    setPromos((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: next } : x)));

    try {
      await togglePromoCode(p.id, next);
    } catch (e) {
      // revert
      setPromos((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: p.active } : x)));
      setError(e instanceof Error ? e.message : 'Failed to update promo code');
      window.setTimeout(() => errorRef.current?.focus(), 0);
    } finally {
      setBusyId(null);
    }
  }, []);

  const totals = useMemo(() => {
    const now = Date.now();
    const activeCount = promos.filter((p) => p.active).length;
    const totalUses = promos.reduce((s, p) => s + (p.currentUses ?? 0), 0);

    // If your PromoCode model later adds revenueCents, wire it here.
    const totalRevenueCents = promos.reduce((s, p) => s + (p.revenueCents ?? 0), 0);

    const scheduledAndActive = promos.filter((p) => p.active && isScheduledNow(p, now)).length;
    const scheduledFuture = promos.filter((p) => {
      if (!p.startsAt) return false;
      const t = new Date(p.startsAt).getTime();
      return Number.isFinite(t) && t > now;
    }).length;

    return { totalRevenueCents, activeCount, scheduledAndActive, scheduledFuture, totalUses };
  }, [promos]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const onlyActive = filters.onlyActive;
    const type = filters.type.trim().toLowerCase();

    return promos.filter((p) => {
      if (onlyActive && !p.active) return false;
      if (type && String(p.type).toLowerCase() !== type) return false;
      if (!q) return true;

      const code = String(p.code ?? '').toLowerCase();
      const t = String(p.type ?? '').toLowerCase();
      return code.includes(q) || t.includes(q);
    });
  }, [promos, filters]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Promo Codes"
        subtitle="List, schedule visibility, and activate/deactivate — admin-only writes via gateway"
        right={
          <div className="flex items-center gap-2">
            <ActionButton
              size="sm"
              onClick={() => {
                void load();
              }}
              disabled={loading}
            >
              Refresh
            </ActionButton>
          </div>
        }
      />

      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400 outline-none"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard label="Active Codes" value={String(totals.activeCount)} accent="emerald" />
        <KPICard
          label="Active (in window)"
          value={String(totals.scheduledAndActive)}
          accent="sky"
        />
        <KPICard label="Scheduled (future)" value={String(totals.scheduledFuture)} accent="slate" />
        <KPICard label="Total Uses" value={String(totals.totalUses)} accent="amber" />
        <KPICard label="Revenue" value={fmt$(totals.totalRevenueCents)} accent="amber" />
      </div>

      <Panel noPad>
        <div className="px-5 py-4 border-b border-zinc-800 space-y-3">
          <div>
            <p className="text-sm font-bold text-zinc-200">All Promo Codes</p>
            <p className="text-xs text-zinc-600 mt-0.5">{filtered.length} records</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              value={filters.q}
              onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))}
              placeholder="Search code / type…"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
            />

            <input
              value={filters.type}
              onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))}
              placeholder="Filter type (percent/fixed)…"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
            />

            <button
              type="button"
              onClick={() => setFilters((p) => ({ ...p, onlyActive: !p.onlyActive }))}
              className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                filters.onlyActive
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900/60'
              }`}
            >
              {filters.onlyActive ? 'Showing active only' : 'Include inactive'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-5">
            <SkeletonGrid rows={5} columns={1} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8">
            <EmptyState title="No promo codes" description="No promo codes match your filters." />
          </div>
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Type</Th>
                <Th>Discount</Th>
                <Th>Uses</Th>
                <Th>Usage</Th>
                <Th>Min Order</Th>
                <Th>Starts</Th>
                <Th>Ends</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((p) => {
                const used = p.currentUses ?? 0;
                const max = p.maxUses;
                const usageRate = max ? clamp((used / Math.max(1, max)) * 100, 0, 100) : null;
                const isBusy = busyId === p.id;

                const now = Date.now();
                const inWindow = isScheduledNow(p, now);
                const scheduledBadge =
                  p.startsAt || p.endsAt
                    ? inWindow
                      ? { tone: 'success' as const, label: 'In window' }
                      : { tone: 'warning' as const, label: 'Out of window' }
                    : null;

                return (
                  <tr key={p.id} className="hover:bg-zinc-800/30 transition-colors">
                    <Td>
                      <div className="flex flex-col gap-1">
                        <span className="font-mono font-bold text-amber-400">{p.code}</span>
                        {scheduledBadge ? (
                          <span className="inline-flex">
                            <Badge tone={scheduledBadge.tone}>{scheduledBadge.label}</Badge>
                          </span>
                        ) : null}
                      </div>
                    </Td>

                    <Td>
                      <Badge tone={promoTone(String(p.type))}>{String(p.type)}</Badge>
                    </Td>

                    <Td className="font-mono text-xs text-zinc-300">{discountLabel(p)}</Td>

                    <Td className="font-mono text-xs text-zinc-400">
                      {used.toLocaleString()}
                      {max !== null && (
                        <span className="text-zinc-600"> / {max.toLocaleString()}</span>
                      )}
                    </Td>

                    <Td>
                      {usageRate !== null ? (
                        <HealthBar
                          label="Usage"
                          value={usageRate}
                          variant={usageVariant(usageRate)}
                        />
                      ) : (
                        <span className="text-zinc-600 text-xs">Unlimited</span>
                      )}
                    </Td>

                    <Td className="font-mono text-xs text-zinc-400">
                      {fmt$(p.minOrderCents ?? 0)}
                    </Td>
                    <Td className="font-mono text-xs text-zinc-500">{fmtDate(p.startsAt)}</Td>
                    <Td className="font-mono text-xs text-zinc-500">{fmtDate(p.endsAt)}</Td>

                    <Td>
                      <Badge tone={statusTone(p.active)}>{p.active ? 'Active' : 'Inactive'}</Badge>
                    </Td>

                    <Td>
                      <ActionButton
                        size="sm"
                        disabled={isBusy}
                        onClick={() => {
                          void handleToggle(p);
                        }}
                        aria-label={p.active ? `Deactivate ${p.code}` : `Activate ${p.code}`}
                      >
                        {isBusy ? 'Saving…' : p.active ? 'Deactivate' : 'Activate'}
                      </ActionButton>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrapper>
        )}
      </Panel>
    </div>
  );
});