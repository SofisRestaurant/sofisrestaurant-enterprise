// =============================================================================
// src/modules/tax/components/TaxSummaryCards.tsx
// =============================================================================

import { useMemo, type ReactNode } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Receipt,
  AlertTriangle,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingCart,
} from 'lucide-react';

import type {
  TaxSummaryCards as TaxSummaryCardsData,
  TaxReconciliationResult,
} from '../types/tax.types';
import { formatDateLabel } from '../utils/taxTotals';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaxSummaryCardsProps {
  summary: TaxSummaryCardsData | null;
  isLoading: boolean;
  reconciliation: TaxReconciliationResult | null;
  className?: string;
}

interface MetricCardProps {
  title: string;
  value: string;
  subValue?: string;
  subLabel?: string;
  icon: ReactNode;
  accent: 'emerald' | 'blue' | 'violet' | 'amber' | 'rose';
  trend?: 'up' | 'down' | 'flat';
  trendLabel?: string;
  trendPositiveIsUp?: boolean;
  isLoading: boolean;
  badge?: ReactNode;
}

// ---------------------------------------------------------------------------
// Accent palettes
// ---------------------------------------------------------------------------

const ACCENTS: Record<
  MetricCardProps['accent'],
  {
    bg: string;
    icon: string;
    border: string;
    badge: string;
    glow: string;
  }
> = {
  emerald: {
    bg: 'bg-emerald-500/10',
    icon: 'text-emerald-400',
    border: 'border-emerald-500/20',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    glow: 'shadow-emerald-500/10',
  },
  blue: {
    bg: 'bg-blue-500/10',
    icon: 'text-blue-400',
    border: 'border-blue-500/20',
    badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    glow: 'shadow-blue-500/10',
  },
  violet: {
    bg: 'bg-violet-500/10',
    icon: 'text-violet-400',
    border: 'border-violet-500/20',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    glow: 'shadow-violet-500/10',
  },
  amber: {
    bg: 'bg-amber-500/10',
    icon: 'text-amber-400',
    border: 'border-amber-500/20',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    glow: 'shadow-amber-500/10',
  },
  rose: {
    bg: 'bg-rose-500/10',
    icon: 'text-rose-400',
    border: 'border-rose-500/20',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    glow: 'shadow-rose-500/10',
  },
};

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function CardSkeleton() {
  return (
    <div className="animate-pulse relative overflow-hidden rounded-2xl border border-white/8 bg-white/4 p-6">
      <div className="mb-4 flex items-start justify-between">
        <div className="h-10 w-10 rounded-xl bg-white/8" />
        <div className="h-5 w-16 rounded-full bg-white/8" />
      </div>
      <div className="space-y-2">
        <div className="h-7 w-32 rounded-lg bg-white/8" />
        <div className="h-4 w-20 rounded-md bg-white/6" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single metric card
// ---------------------------------------------------------------------------

function MetricCard({
  title,
  value,
  subValue,
  subLabel,
  icon,
  accent,
  trend,
  trendLabel,
  trendPositiveIsUp = true,
  isLoading,
  badge,
}: MetricCardProps) {
  const accentPalette = ACCENTS[accent];

  const trendColor =
    trend === 'flat'
      ? 'text-slate-400'
      : trendPositiveIsUp
        ? trend === 'up'
          ? 'text-emerald-400'
          : 'text-rose-400'
        : trend === 'down'
          ? 'text-emerald-400'
          : 'text-rose-400';

  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;

  if (isLoading) {
    return <CardSkeleton />;
  }

  return (
    <div
      className={[
        'relative overflow-hidden rounded-2xl border bg-white/4 p-6',
        'transition-all duration-300 hover:bg-white/6 hover:shadow-xl',
        accentPalette.border,
        accentPalette.glow,
      ].join(' ')}
    >
      <div
        className={[
          'pointer-events-none absolute -top-8 -right-8 h-32 w-32 rounded-full blur-2xl opacity-30',
          accentPalette.bg,
        ].join(' ')}
      />

      <div className="relative">
        <div className="mb-4 flex items-start justify-between">
          <div
            className={[
              'flex h-10 w-10 items-center justify-center rounded-xl',
              accentPalette.bg,
            ].join(' ')}
          >
            <span className={accentPalette.icon}>{icon}</span>
          </div>

          {badge ? (
            <span
              className={[
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                accentPalette.badge,
              ].join(' ')}
            >
              {badge}
            </span>
          ) : null}
        </div>

        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          {title}
        </p>
        <p className="text-2xl font-bold leading-none tracking-tight text-white tabular-nums">
          {value}
        </p>

        {subValue ? (
          <p className="mt-1.5 text-sm text-slate-400">
            {subLabel ? <span className="mr-1 text-slate-500">{subLabel}</span> : null}
            {subValue}
          </p>
        ) : null}

        {trend && trendLabel ? (
          <div
            className={['mt-3 flex items-center gap-1 text-xs font-medium', trendColor].join(' ')}
          >
            <TrendIcon size={12} />
            <span>{trendLabel}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reconciliation warning banner
// ---------------------------------------------------------------------------

function ReconciliationWarning({ result }: { result: TaxReconciliationResult }) {
  if (result.isBalanced) {
    return null;
  }

  return (
    <div
      className="col-span-full flex items-start gap-3 rounded-xl border border-amber-500/30
                 bg-amber-500/10 px-4 py-3 text-sm text-amber-300"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
      <div>
        <span className="font-semibold">Reconciliation warning: </span>
        {result.warningMessage} Expected net tax:{' '}
        <span className="font-mono">{result.expectedNetTaxCents / 100}</span>¢, actual:{' '}
        <span className="font-mono">{result.actualNetTaxCents / 100}</span>¢.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function TaxSummaryCards({
  summary,
  isLoading,
  reconciliation,
  className = '',
}: TaxSummaryCardsProps) {
  const periodLabel = useMemo(() => {
    if (summary === null) {
      return null;
    }

    return `${formatDateLabel(summary.dateFrom)} – ${formatDateLabel(summary.dateTo)}`;
  }, [summary]);

  const refundedTaxTrend = useMemo<'down' | 'flat'>(() => {
    if (summary === null || summary.refundedTaxCents <= 0) {
      return 'flat';
    }

    return 'down';
  }, [summary]);

  const refundedTaxTrendLabel = useMemo<string | undefined>(() => {
    if (summary === null) {
      return undefined;
    }

    if (summary.refundedTaxCents <= 0) {
      return 'No refunded tax';
    }

    return 'Refunds reduce net tax';
  }, [summary]);

  const netTaxTrend = useMemo<'up' | 'flat'>(() => {
    if (summary === null || summary.netTaxCents <= 0) {
      return 'flat';
    }

    return 'up';
  }, [summary]);

  const netTaxTrendLabel = useMemo<string | undefined>(() => {
    if (summary === null) {
      return undefined;
    }

    if (summary.netTaxCents <= 0) {
      return 'No net tax recorded';
    }

    return 'After refunds and disputes';
  }, [summary]);

  const taxableSalesSubValue = useMemo<string | undefined>(() => {
    if (summary === null) {
      return undefined;
    }

    if (summary.discountCents <= 0) {
      return 'No discounts';
    }

    return `−${(summary.discountCents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: summary.currency,
    })} discounts`;
  }, [summary]);

  return (
    <section className={['space-y-3', className].join(' ')}>
      {!isLoading && periodLabel && summary ? (
        <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
          {periodLabel} · {summary.ordersCount.toLocaleString()} orders
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          title="Gross Sales"
          value={summary?.grossSalesFormatted ?? '—'}
          subValue={summary?.grossTotalFormatted}
          subLabel="incl. fees"
          icon={<DollarSign size={18} />}
          accent="emerald"
          isLoading={isLoading}
          badge={summary ? <><TrendingUp size={10} /> Active</> : undefined}
        />

        <MetricCard
          title="Taxable Sales"
          value={summary?.taxableSalesFormatted ?? '—'}
          subValue={taxableSalesSubValue}
          icon={<ShoppingCart size={18} />}
          accent="blue"
          isLoading={isLoading}
        />

        <MetricCard
          title="Tax Collected"
          value={summary?.taxCollectedFormatted ?? '—'}
          subValue={summary?.effectiveTaxRateFormatted}
          subLabel="rate"
          icon={<Receipt size={18} />}
          accent="violet"
          isLoading={isLoading}
          badge={summary ? <><BarChart3 size={10} /> {summary.effectiveTaxRateFormatted}</> : undefined}
        />

        <MetricCard
          title="Refunded Tax"
          value={summary?.refundedTaxFormatted ?? '—'}
          subValue={
            summary
              ? `${summary.refundedOrdersCount} refunded ${
                  summary.refundedOrdersCount === 1 ? 'order' : 'orders'
                }`
              : undefined
          }
          icon={<TrendingDown size={18} />}
          accent="amber"
          isLoading={isLoading}
          trend={refundedTaxTrend}
          trendLabel={refundedTaxTrendLabel}
          trendPositiveIsUp={false}
          badge={
            summary && summary.refundedOrdersCount > 0 ? (
              <>
                <AlertTriangle size={10} /> {summary.refundedOrdersCount}
              </>
            ) : undefined
          }
        />

        <MetricCard
          title="Net Tax"
          value={summary?.netTaxFormatted ?? '—'}
          subValue={summary?.netSalesFormatted}
          subLabel="net sales"
          icon={<TrendingUp size={18} />}
          accent="rose"
          isLoading={isLoading}
          trend={netTaxTrend}
          trendLabel={netTaxTrendLabel}
          badge={
            summary && summary.disputedOrdersCount > 0 ? (
              <>
                <AlertTriangle size={10} />
                {summary.disputedOrdersCount} disputed
              </>
            ) : undefined
          }
        />
      </div>

      {reconciliation && !reconciliation.isBalanced ? (
        <div className="grid grid-cols-1">
          <ReconciliationWarning result={reconciliation} />
        </div>
      ) : null}
    </section>
  );
}

export default TaxSummaryCards;