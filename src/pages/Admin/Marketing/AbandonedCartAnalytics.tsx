// =============================================================================
// src/pages/Admin/Marketing/AbandonedCartAnalytics.tsx
//
// ABANDONED CART ANALYTICS — production-hardened
//
// CHANGES vs previous version:
//
// 1. ABANDONED_THRESHOLD_MINUTES constant matches growth.service.ts.
//    Displayed in the subtitle and the empty-state message for transparency.
//
// 2. cartToVM() field key order updated:
//    - lastActivity / last_activity are the authoritative DB column names.
//      They appear first in the abandonedAt fallback array.
//    - itemCount reads from the AbandonedCartSession domain model directly
//      (growth.service.ts populates it; no DB column lookup needed).
//    - cartValueCents matches the AbandonedCartSession.cartValueCents field.
//    - recoveredAt reads from AbandonedCartSession.recoveredAt (derived by
//      growth.service.ts from pending_carts.consumed_at).
//
// 3. summaryToVM() is a thin pass-through since AbandonedCartSummary is now
//    purely camelCase (growth.service.ts maps at the service boundary).
//
// 4. DevRawShape: dev-only helper surfaces field names so schema drift is
//    immediately visible during development without guesswork.
//
// 5. export default added (required for lazyRoute() in router.tsx).
// =============================================================================

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchAbandonedCarts,
  fetchAbandonedCartSummary,
} from '@/features/admin/growth/growth.service';
import type {
  AbandonedCartSession,
  AbandonedCartSummary,
} from '@/features/admin/growth/growth.types';
import {
  Panel,
  KPICard,
  SectionHeader,
  ActionButton,
  TableWrapper,
  Th,
  Td,
  Skeleton,
  EmptyState,
  HealthBar,
} from '@/features/admin/ui';

// ─────────────────────────────────────────────────────────────────────────────
// Must match ABANDONED_THRESHOLD_MINUTES in growth.service.ts.
// Change both files if the business rule changes.
// ─────────────────────────────────────────────────────────────────────────────
const ABANDONED_THRESHOLD_MINUTES = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

function fmt$(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// ─────────────────────────────────────────────────────────────────────────────
// View models
//
// growth.service.ts already performs all snake_case→camelCase mapping at the
// service boundary. AbandonedCartSession fields are pure camelCase here.
// cartToVM() is a thin projection; its only job is to provide stable nulls for
// missing optional fields and a fallback id when somehow absent.
// ─────────────────────────────────────────────────────────────────────────────

type CartRowVM = {
  id: string;
  email: string | null;
  itemCount: number | null;
  cartValueCents: number;
  abandonedAt: string | null;
  recovered: boolean;
  recoveredAt: string | null;
};

function cartToVM(c: AbandonedCartSession): CartRowVM {
  return {
    id: c.id || `row_${Math.random().toString(16).slice(2)}`,
    email: c.email ?? null,
    itemCount: c.itemCount ?? null,
    cartValueCents: c.cartValueCents ?? 0,
    // lastActivity is the DB column; service maps it as lastActivity
    abandonedAt: c.lastActivity ?? null,
    recovered: c.recovered ?? false,
    // recoveredAt is derived by service from pending_carts.consumed_at
    recoveredAt: c.recoveredAt ?? null,
  };
}

type SummaryVM = {
  totalAbandoned: number;
  totalRecovered: number;
  recoveryRate: number; // 0..1
  lostRevenueCents: number;
  recoveredRevenueCents: number;
};

function summaryToVM(s: AbandonedCartSummary): SummaryVM {
  // growth.service.ts returns recoveryRate as 0..1 from division.
  // Defensively clamp in case of edge cases (e.g. > 1 from rounding).
  const recoveryRate = clamp01(s.recoveryRate);
  return {
    totalAbandoned: s.totalAbandoned,
    totalRecovered: s.totalRecovered,
    recoveryRate,
    lostRevenueCents: s.lostRevenueCents,
    recoveredRevenueCents: s.recoveredRevenueCents,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatusPill({ recovered }: { recovered: boolean }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide',
        recovered
          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
          : 'bg-red-500/10 text-red-300 border border-red-500/20',
      ].join(' ')}
    >
      {recovered ? 'Recovered' : 'Lost'}
    </span>
  );
}

/**
 * DEV-only: renders the field names of the first raw session row so that
 * any service-layer schema drift (missing fields, renamed keys) surfaces
 * immediately without requiring a network inspector.
 */
function DevRawShape({ raw }: { raw: AbandonedCartSession[] }) {
  if (process.env.NODE_ENV !== 'development') return null;
  if (!raw.length) return null;
  return (
    <details className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-10px text-zinc-500 mb-2">
      <summary className="cursor-pointer font-mono uppercase tracking-wider">
        DEV — raw[0] field names (check for schema mismatches)
      </summary>
      <pre className="mt-2 overflow-auto text-zinc-400">
        {JSON.stringify(Object.keys(raw[0] as object), null, 2)}
      </pre>
    </details>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const AbandonedCartAnalytics = memo(function AbandonedCartAnalytics() {
  const [rawCarts, setRawCarts] = useState<AbandonedCartSession[]>([]);
  const [rawSummary, setRawSummary] = useState<AbandonedCartSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, s] = await Promise.all([fetchAbandonedCarts(), fetchAbandonedCartSummary()]);
      setRawCarts(Array.isArray(c) ? c : []);
      setRawSummary(s ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load abandoned carts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const carts = useMemo(() => rawCarts.map(cartToVM), [rawCarts]);
  const summary = useMemo(() => (rawSummary ? summaryToVM(rawSummary) : null), [rawSummary]);

  const kpis = useMemo(() => {
    if (!summary) {
      return { totalAbandoned: '—', totalRecovered: '—', recoveryRateLabel: '—', lostRevenue: '—' };
    }
    return {
      totalAbandoned: String(summary.totalAbandoned),
      totalRecovered: String(summary.totalRecovered),
      recoveryRateLabel: `${(summary.recoveryRate * 100).toFixed(1)}%`,
      lostRevenue: fmt$(summary.lostRevenueCents),
    };
  }, [summary]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Abandoned Carts"
        subtitle={`Carts idle >${ABANDONED_THRESHOLD_MINUTES}min — abandonment, recovery, and lost revenue`}
        right={
          <ActionButton onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </ActionButton>
        }
      />

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Abandoned" value={kpis.totalAbandoned} accent="red" />
        <KPICard label="Recovered" value={kpis.totalRecovered} accent="emerald" />
        <KPICard label="Recovery Rate" value={kpis.recoveryRateLabel} accent="sky" />
        <KPICard label="Lost Revenue" value={kpis.lostRevenue} accent="amber" />
      </div>

      {summary && (
        <Panel>
          <p className="text-xs font-bold text-zinc-400 mb-4 uppercase tracking-widest">
            Recovery Performance
          </p>
          <div className="space-y-3">
            <HealthBar
              label={`Recovery Rate — ${(summary.recoveryRate * 100).toFixed(1)}%`}
              value={summary.recoveryRate * 100}
            />
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-zinc-500 pt-1">
              <span>
                Recovered revenue:{' '}
                <span className="text-emerald-300 font-bold">
                  {fmt$(summary.recoveredRevenueCents)}
                </span>
              </span>
              <span>
                Lost revenue:{' '}
                <span className="text-red-300 font-bold">{fmt$(summary.lostRevenueCents)}</span>
              </span>
            </div>
          </div>
        </Panel>
      )}

      <Panel noPad>
        <div className="px-5 py-4 border-b border-zinc-800">
          <p className="text-sm font-bold text-zinc-200">Abandoned Cart Log</p>
          <p className="text-xs text-zinc-600 mt-0.5">
            {carts.length} records · idle &gt;{ABANDONED_THRESHOLD_MINUTES}min
          </p>
        </div>

        {!loading && rawCarts.length > 0 && (
          <div className="px-5 pt-3">
            <DevRawShape raw={rawCarts} />
          </div>
        )}

        {loading ? (
          <div className="p-5 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : carts.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No abandoned carts"
              description={
                `No carts have been idle for more than ${ABANDONED_THRESHOLD_MINUTES} minutes. ` +
                `If you expected records here, verify that abandoned_cart_sessions is being ` +
                `written and that last_activity timestamps are older than the threshold.`
              }
            />
          </div>
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Items</Th>
                <Th>Cart Value</Th>
                <Th>Abandoned</Th>
                <Th>Status</Th>
                <Th>Recovered At</Th>
              </tr>
            </thead>
            <tbody>
              {carts.map((c) => (
                <tr key={c.id} className="hover:bg-zinc-800/30 transition-colors">
                  <Td>
                    <span className="text-zinc-300">{c.email ?? '—'}</span>
                  </Td>
                  <Td className="text-zinc-300">
                    {typeof c.itemCount === 'number'
                      ? `${c.itemCount} item${c.itemCount !== 1 ? 's' : ''}`
                      : '—'}
                  </Td>
                  <Td className="font-bold text-zinc-200">{fmt$(c.cartValueCents)}</Td>
                  <Td className="text-zinc-500 text-xs">{fmtDate(c.abandonedAt)}</Td>
                  <Td>
                    <StatusPill recovered={c.recovered} />
                  </Td>
                  <Td className="text-zinc-500 text-xs">{fmtDate(c.recoveredAt)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Panel>
    </div>
  );
});

export { AbandonedCartAnalytics };
export default AbandonedCartAnalytics;