// =============================================================================
// src/modules/tax/components/TaxExportPanel.tsx
// =============================================================================

import { useMemo, useState } from 'react';
import {
  Download,
  FileText,
  Calendar,
  List,
  BarChart3,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Info,
} from 'lucide-react';

import type { TaxReportFilters, TaxGranularity, TaxCurrency } from '../types/tax.types';
import { formatDateLabel, buildExportFilename } from '../utils/taxTotals';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaxExportPanelProps {
  filters: TaxReportFilters;
  onExport: () => Promise<void>;
  isExporting: boolean;
  className?: string;
}

interface ExportOption {
  value: TaxGranularity;
  label: string;
  description: string;
  icon: React.ReactNode;
  rowLabel: string;
}

// ---------------------------------------------------------------------------
// Granularity option card
// ---------------------------------------------------------------------------

const EXPORT_OPTIONS: ExportOption[] = [
  {
    value: 'daily',
    label: 'Daily Summary',
    description: 'One row per day with aggregated totals.',
    icon: <Calendar size={16} />,
    rowLabel: '~30 rows / month',
  },
  {
    value: 'monthly',
    label: 'Monthly Summary',
    description: 'One row per month with rollup totals and effective rate.',
    icon: <BarChart3 size={16} />,
    rowLabel: '12 rows / year',
  },
  {
    value: 'orders',
    label: 'Order Level',
    description: 'One row per order — full tax, refund, and dispute breakdown.',
    icon: <List size={16} />,
    rowLabel: '1 row / order',
  },
];

// ---------------------------------------------------------------------------
// Column preview
// ---------------------------------------------------------------------------

const COLUMN_PREVIEWS: Record<TaxGranularity, string[]> = {
  daily: [
    'Date',
    'Orders',
    'Gross Sales',
    'Discounts',
    'Taxable Sales',
    'Tax Collected',
    'Refunded Sales',
    'Refunded Tax',
    'Net Sales',
    'Net Tax',
    'Stripe Fees',
  ],
  monthly: [
    'Month',
    'Orders',
    'Gross Sales',
    'Discounts',
    'Taxable Sales',
    'Tax Collected',
    'Refunded Sales',
    'Refunded Tax',
    'Net Sales',
    'Net Tax',
    'Eff. Tax Rate',
  ],
  orders: [
    'Order ID',
    'Date',
    'Subtotal',
    'Discount',
    'Taxable',
    'Tax',
    'Refunded',
    'Refunded Tax (Est.)',
    'Net Tax',
    'Dispute Status',
    'Payment Intent ID',
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Export failed';
}

function formatCurrencyLabel(currency: TaxCurrency): string {
  return currency.toUpperCase();
}

// ---------------------------------------------------------------------------
// Success state (brief flash after download)
// ---------------------------------------------------------------------------

function ExportSuccess({ filename }: { filename: string }) {
  return (
    <div className="animate-fade-in flex items-center gap-2 text-sm font-medium text-emerald-400">
      <CheckCircle2 size={16} />
      <span>
        Downloaded <span className="font-mono text-xs">{filename}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function TaxExportPanel({
  filters,
  onExport,
  isExporting,
  className = '',
}: TaxExportPanelProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [justExported, setJustExported] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const selectedOption = useMemo<ExportOption | null>(() => {
    return EXPORT_OPTIONS.find((option) => option.value === filters.granularity) ?? null;
  }, [filters.granularity]);

  const selectedCurrencyLabel = useMemo<string>(() => {
    return formatCurrencyLabel(filters.currency);
  }, [filters.currency]);

  const previewFilename = useMemo<string>(() => {
    return buildExportFilename(
      filters.granularity,
      filters.dateFrom.toISOString().slice(0, 10),
      filters.dateTo.toISOString().slice(0, 10),
      filters.currency,
    );
  }, [filters.currency, filters.dateFrom, filters.dateTo, filters.granularity]);

  const dateRangeLabel = useMemo<string>(() => {
    return `${formatDateLabel(filters.dateFrom)} – ${formatDateLabel(filters.dateTo)}`;
  }, [filters.dateFrom, filters.dateTo]);

  const previewColumns = useMemo<string[]>(() => {
    return COLUMN_PREVIEWS[filters.granularity];
  }, [filters.granularity]);

  const handleExport = async (): Promise<void> => {
    setExportError(null);
    setJustExported(false);

    try {
      await onExport();
      setJustExported(true);
      window.setTimeout(() => setJustExported(false), 4000);
    } catch (error: unknown) {
      setExportError(getErrorMessage(error));
    }
  };

  return (
    <div
      className={['space-y-5 rounded-2xl border border-white/8 bg-white/3 p-5', className].join(
        ' ',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/15">
            <FileText size={15} className="text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Export Tax Data</h3>
            <p className="text-xs text-slate-500">{dateRangeLabel}</p>
          </div>
        </div>

        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">CSV</span>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          Export format
        </p>

        <div className="grid grid-cols-3 gap-2">
          {EXPORT_OPTIONS.map((option) => {
            const active = filters.granularity === option.value;

            return (
              <div
                key={option.value}
                className={[
                  'relative cursor-default rounded-xl border p-3',
                  'transition-all duration-150',
                  active
                    ? 'border-violet-500/50 bg-violet-500/10'
                    : 'border-white/8 bg-white/3 opacity-60',
                ].join(' ')}
              >
                <div
                  className={[
                    'mb-1 flex items-center gap-1.5',
                    active ? 'text-violet-300' : 'text-slate-400',
                  ].join(' ')}
                >
                  {option.icon}
                  <span className="text-xs font-semibold">{option.label}</span>
                </div>

                <p className="text-[11px] leading-tight text-slate-500">{option.description}</p>

                <span
                  className={[
                    'mt-2 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                    active ? 'bg-violet-500/20 text-violet-300' : 'bg-white/5 text-slate-600',
                  ].join(' ')}
                >
                  {option.rowLabel}
                </span>

                {active ? (
                  <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-violet-400" />
                ) : null}
              </div>
            );
          })}
        </div>

        <p className="flex items-center gap-1 text-[10px] text-slate-600">
          <Info size={10} />
          Change format in the filters bar above.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-white/6 bg-black/30 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Selected format
          </p>
          <p className="mt-1 text-xs font-medium text-slate-300">
            {selectedOption?.label ?? 'Unknown format'}
          </p>
        </div>

        <div className="rounded-xl border border-white/6 bg-black/30 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Currency
          </p>
          <p className="mt-1 text-xs font-medium text-slate-300">{selectedCurrencyLabel}</p>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowPreview((previous) => !previous)}
          className="flex items-center gap-1.5 text-xs text-slate-400 transition-colors duration-100 hover:text-slate-200"
        >
          <ChevronDown
            size={13}
            className={['transition-transform duration-150', showPreview ? 'rotate-180' : ''].join(
              ' ',
            )}
          />
          {showPreview ? 'Hide' : 'Preview'} columns ({previewColumns.length})
        </button>

        {showPreview ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {previewColumns.map((column) => (
              <span
                key={column}
                className="rounded-md border border-white/8 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-400"
              >
                {column}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-white/6 bg-black/30 px-3 py-2">
        <FileText size={12} className="shrink-0 text-slate-500" />
        <span className="truncate font-mono text-[11px] text-slate-400">{previewFilename}</span>
      </div>

      {exportError ? (
        <div className="flex items-center gap-2 text-xs text-rose-400">
          <AlertTriangle size={13} />
          {exportError}
        </div>
      ) : null}

      <div className="flex items-center justify-between pt-1">
        {justExported ? <ExportSuccess filename={previewFilename} /> : <span />}

        <button
          type="button"
          onClick={() => {
            void handleExport();
          }}
          disabled={isExporting}
          className={[
            'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold',
            'transition-all duration-200 focus:outline-none',
            'focus:ring-2 focus:ring-violet-500/60 focus:ring-offset-1 focus:ring-offset-transparent',
            isExporting
              ? 'cursor-not-allowed bg-violet-500/30 text-violet-300'
              : 'bg-violet-600 text-white shadow-lg shadow-violet-900/40 hover:bg-violet-500 hover:shadow-violet-800/50',
          ].join(' ')}
        >
          {isExporting ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Exporting…
            </>
          ) : (
            <>
              <Download size={15} />
              Download CSV
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default TaxExportPanel;