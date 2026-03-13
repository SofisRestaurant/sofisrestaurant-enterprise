// =============================================================================
// src/pages/Admin/Finance.tsx
// Route entry point — delegates to feature layer
// =============================================================================

import { memo, useCallback } from 'react';
import { useFinance } from '@/features/admin/finance/useFinance';
import {
  Panel,
  KPICard,
  SectionHeader,
  ActionButton,
  TableWrapper,
  Th,
  Td,
  Badge,
  Skeleton,
  EmptyState,
} from '@/features/admin/ui';
import type { FinancePeriod } from '@/pages/Admin/finance/finance.types';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmt$ = (cents: number) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

function paymentBadge(status: string) {
  const s = String(status ?? '').toLowerCase();
  const map: Record<string, BadgeTone> = {
    paid: 'success',
    refunded: 'warning',
    failed: 'danger',
    pending: 'info',
    requires_payment_method: 'warning',
    requires_action: 'warning',
    canceled: 'danger',
  };

  return <Badge tone={map[s] ?? 'neutral'}>{s || 'unknown'}</Badge>;
}

function toTrend(trendPct: number | null | undefined): 'up' | 'down' | 'flat' {
  const n = Number(trendPct);
  if (!Number.isFinite(n) || n === 0) {
    return 'flat';
  }

  return n > 0 ? 'up' : 'down';
}

function safeInt(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function buildRevenueSubtext(
  metricsAvailable: boolean,
  orderCount: number,
  trendPct: number,
): string | undefined {
  if (!metricsAvailable) {
    return undefined;
  }

  const parts = [`${orderCount.toLocaleString()} orders`];

  if (Number.isFinite(trendPct)) {
    parts.push(`${Math.abs(trendPct).toFixed(1)}% vs prior`);
  }

  return parts.join(' • ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Period Selector
// ─────────────────────────────────────────────────────────────────────────────

const PERIODS: { label: string; value: FinancePeriod }[] = [
  { label: 'Today', value: 'today' },
  { label: '7 Days', value: 'week' },
  { label: '30 Days', value: 'month' },
];

interface PeriodSelectorProps {
  value: FinancePeriod;
  onChange: (p: FinancePeriod) => void;
}

function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex gap-1 rounded-lg bg-zinc-900/60 p-1 ring-1 ring-zinc-800">
      {PERIODS.map((period) => (
        <button
          key={period.value}
          type="button"
          onClick={() => onChange(period.value)}
          className={[
            'rounded-md px-3 py-1 text-[11px] font-bold transition-colors',
            value === period.value
              ? 'bg-amber-500 text-black'
              : 'text-zinc-400 hover:text-zinc-200',
          ].join(' ')}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Finance Page
// ─────────────────────────────────────────────────────────────────────────────

const Finance = memo(function Finance() {
  const { metrics, ledger, refundTotal, refundCount, loading, error, period, setPeriod, refresh } =
    useFinance();

  const onRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);

  const revenueCents = safeInt(metrics?.revenueCents);
  const orderCount = safeInt(metrics?.orderCount);
  const avgOrderCents = safeInt(metrics?.avgOrderCents);
  const taxCents = safeInt(metrics?.taxCents);
  const grossProfitCents = safeInt(metrics?.grossProfitCents);
  const netProfitCents = safeInt(metrics?.netProfitCents);
  const trendPct = Number(metrics?.trendPct);

  const revenueSub = buildRevenueSubtext(metrics !== null, orderCount, trendPct);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Finance"
        subtitle="Revenue, transactions, and ledger overview"
        right={
          <div className="flex items-center gap-3">
            <PeriodSelector value={period} onChange={setPeriod} />
            <ActionButton tone="neutral" size="sm" onClick={onRefresh}>
              Refresh
            </ActionButton>
          </div>
        }
      />

      {error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="Revenue"
          value={metrics ? fmt$(revenueCents) : '—'}
          sub={revenueSub}
          accent="amber"
          trend={toTrend(trendPct)}
        />

        <KPICard label="Avg Order" value={metrics ? fmt$(avgOrderCents) : '—'} accent="sky" />

        <KPICard label="Tax Collected" value={metrics ? fmt$(taxCents) : '—'} accent="slate" />

        <KPICard
          label="Refunds"
          value={metrics ? fmt$(safeInt(refundTotal)) : '—'}
          sub={`${safeInt(refundCount).toLocaleString()} transactions`}
          accent="red"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <KPICard
          label="Gross Profit (est.)"
          value={metrics ? fmt$(grossProfitCents) : '—'}
          accent="emerald"
        />
        <KPICard
          label="Net Profit (est.)"
          value={metrics ? fmt$(netProfitCents) : '—'}
          accent="emerald"
        />
      </div>

      <Panel noPad>
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <p className="text-sm font-bold text-zinc-200">Transaction Ledger</p>
            <p className="mt-0.5 text-xs text-zinc-600">
              Most recent {ledger.length.toLocaleString()} transactions
            </p>
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            {loading ? <span className="text-xs text-zinc-500">Loading…</span> : null}
          </div>
        </div>

        {loading ? (
          <div className="p-5">
            <Skeleton className="h-40 w-full" />
          </div>
        ) : ledger.length === 0 ? (
          <div className="p-8">
            <EmptyState title="No transactions" description="No orders found for this period." />
          </div>
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Order ID</Th>
                <Th>Date</Th>
                <Th>Subtotal</Th>
                <Th>Tax</Th>
                <Th>Total</Th>
                <Th>Status</Th>
              </tr>
            </thead>

            <tbody>
              {ledger.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-zinc-800/30">
                  <Td>
                    <span className="font-mono text-xs text-zinc-500">{row.id.slice(0, 8)}…</span>
                  </Td>

                  <Td className="text-zinc-300">{fmtDate(row.createdAt)}</Td>

                  <Td className="text-zinc-300">{fmt$(row.subtotalCents)}</Td>

                  <Td className="text-zinc-500">{fmt$(row.taxCents)}</Td>

                  <Td className="font-bold text-zinc-200">{fmt$(row.totalCents)}</Td>

                  <Td>{paymentBadge(row.paymentStatus)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Panel>
    </div>
  );
});

export default Finance;