// =============================================================================
// src/pages/Admin/Marketing/AbandonedCartAnalytics.tsx
// Production-ready + type-safe against drifting shapes (snake_case vs camelCase)
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

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function readString(obj: unknown, keys: string[]): string | null {
  if (!isRecord(obj)) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim().length) return v;
  }
  return null;
}

function readNumber(obj: unknown, keys: string[]): number | null {
  if (!isRecord(obj)) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

function readBool(obj: unknown, keys: string[]): boolean | null {
  if (!isRecord(obj)) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'boolean') return v;
  }
  return null;
}

function fmt$(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function fmtDate(iso: string | null): string {
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
  const id = readString(c, ['id']) ?? `row_${Math.random().toString(16).slice(2)}`;
  const email = readString(c, ['email', 'customer_email', 'customerEmail']);

  // Different shapes across revisions
  const itemCount = readNumber(c, ['itemCount', 'item_count', 'items', 'line_items_count']) ?? null;

  const cartValueCents =
    readNumber(c, [
      'cartValueCents',
      'cart_value_cents',
      'totalCents',
      'total_cents',
      'amount_total',
    ]) ?? 0;

  const abandonedAt =
    readString(c, [
      'abandonedAt',
      'abandoned_at',
      'createdAt',
      'created_at',
      'lastActivity',
      'last_activity',
    ]) ?? null;

  const recovered = readBool(c, ['recovered', 'isRecovered', 'is_recovered']) ?? false;
  const recoveredAt = readString(c, ['recoveredAt', 'recovered_at']) ?? null;

  return {
    id,
    email,
    itemCount,
    cartValueCents,
    abandonedAt,
    recovered,
    recoveredAt,
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
  const totalAbandoned = readNumber(s, ['totalAbandoned', 'total_abandoned']) ?? 0;
  const totalRecovered = readNumber(s, ['totalRecovered', 'total_recovered']) ?? 0;

  // might be already 0..1 or 0..100 depending on earlier drafts
  const rrRaw = readNumber(s, ['recoveryRate', 'recovery_rate']) ?? 0;
  const recoveryRate = rrRaw > 1 ? clamp01(rrRaw / 100) : clamp01(rrRaw);

  const lostRevenueCents = readNumber(s, ['lostRevenueCents', 'lost_revenue_cents']) ?? 0;

  const recoveredRevenueCents =
    readNumber(s, ['recoveredRevenueCents', 'recovered_revenue_cents']) ?? 0;

  return { totalAbandoned, totalRecovered, recoveryRate, lostRevenueCents, recoveredRevenueCents };
}

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

export const AbandonedCartAnalytics = memo(function AbandonedCartAnalytics() {
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
      return {
        totalAbandoned: '—',
        totalRecovered: '—',
        recoveryRateLabel: '—',
        lostRevenue: '—',
      };
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
        subtitle="Cart abandonment, recovery metrics, and lost revenue"
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
            {/* HealthBar supports label/value in your codebase; avoid unsupported props (accent/variant). */}
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
          <p className="text-xs text-zinc-600 mt-0.5">{carts.length} records</p>
        </div>

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
              description="All carts have been checked out or recovered."
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
