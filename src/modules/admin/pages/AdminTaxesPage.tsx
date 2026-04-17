// =============================================================================
// src/modules/admin/pages/AdminTaxesPage.tsx
//
// Admin tax reporting page.
// Composes: useTaxReports hook + all Tax* components.
// Route:    /admin/taxes
// =============================================================================

import { Receipt, RefreshCw, AlertTriangle, Clock, TrendingUp } from 'lucide-react';

import { useTaxReports } from '../../tax/hooks/useTaxReports';
import { TaxSummaryCards } from '../../tax/components/TaxSummaryCards';
import { TaxFiltersBar }   from '../../tax/components/TaxFiltersBar';
import { TaxPeriodTable }  from '../../tax/components/TaxPeriodTable';
import { TaxExportPanel }  from '../../tax/components/TaxExportPanel';
import { formatDateLabel } from '../../tax/utils/taxTotals';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Top bar with page title, last-fetched timestamp, and refresh button */
function PageHeader({
  lastFetchedAt,
  isAnyLoading,
  onRefresh,
}: {
  lastFetchedAt: Date | null;
  isAnyLoading:  boolean;
  onRefresh:     () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-violet-500/15 border border-violet-500/25
                        flex items-center justify-center shrink-0">
          <Receipt size={18} className="text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Tax Reports
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Revenue, tax collected, refunds, and reconciliation
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {lastFetchedAt && (
          <span className="hidden sm:flex items-center gap-1 text-xs text-slate-500">
            <Clock size={11} />
            Updated {formatDateLabel(lastFetchedAt)}
          </span>
        )}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isAnyLoading}
          className={[
            'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium',
            'border border-white/10 bg-white/5 text-slate-300',
            'hover:bg-white/8 hover:border-white/20 transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-violet-500/40',
            isAnyLoading ? 'opacity-50 cursor-not-allowed' : '',
          ].join(' ')}
        >
          <RefreshCw size={14} className={isAnyLoading ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>
    </div>
  );
}

/** Global error banner */
function ErrorBanner({
  message,
  onDismiss,
}: {
  message:   string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3
                    rounded-xl bg-rose-500/10 border border-rose-500/30">
      <div className="flex items-start gap-2 text-rose-400 text-sm">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-rose-400/60 hover:text-rose-300 text-lg leading-none transition-colors"
        aria-label="Dismiss error"
      >
        ×
      </button>
    </div>
  );
}

/** Empty / zero state for when there's no data at all */
function EmptyState({ hasFilters, onReset }: {
  hasFilters: boolean;
  onReset:    () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
      <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-white/8
                      flex items-center justify-center">
        <TrendingUp size={22} className="text-slate-500" />
      </div>
      <div>
        <p className="text-slate-300 font-semibold">No tax data</p>
        <p className="text-sm text-slate-500 mt-1">
          {hasFilters
            ? 'No orders match your current filters.'
            : 'No completed orders in this period.'}
        </p>
      </div>
      {hasFilters && (
        <button
          type="button"
          onClick={onReset}
          className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
        >
          Reset filters
        </button>
      )}
    </div>
  );
}

/** Disputed orders alert strip */
function DisputeAlert({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5
                    rounded-xl bg-amber-500/10 border border-amber-500/30"
    >
      <AlertTriangle size={14} className="text-amber-400 shrink-0" />
      <p className="text-sm text-amber-300">
        <span className="font-semibold">
          {count} disputed {count === 1 ? 'order' : 'orders'}
        </span>{' '}
        in this period. Filter by "Disputed only" to review.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AdminTaxesPage() {
  const tax = useTaxReports();

  const hasFilters =
    tax.filters.fulfillmentType !== 'all' ||
    tax.filters.disputedOnly ||
    tax.filters.refundedOnly;

  const showEmpty =
    !tax.isAnyLoading &&
    !tax.summaryError &&
    !tax.hasOrders;

  const errorMessage = tax.summaryError
    ? `Summary: ${tax.summaryError}`
    : tax.periodError
      ? `Period data: ${tax.periodError}`
      : tax.ordersError
        ? `Orders: ${tax.ordersError}`
        : null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-(--breakpoint-2xl) mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <PageHeader
          lastFetchedAt={tax.lastFetchedAt}
          isAnyLoading={tax.isAnyLoading}
          onRefresh={tax.refresh}
        />

        {errorMessage && <ErrorBanner message={errorMessage} onDismiss={tax.clearErrors} />}

        <DisputeAlert count={tax.summary?.disputedOrdersCount ?? 0} />

        <TaxFiltersBar
          filters={tax.filters}
          setFilters={tax.setFilters}
          resetFilters={tax.resetFilters}
          applyDatePreset={tax.applyDatePreset}
          activePreset={tax.activePreset}
          datePresets={tax.datePresets}
          dateRangeError={tax.dateRangeError}
          isLoading={tax.isAnyLoading}
          isRefreshing={tax.isRefreshing}
          onRefreshCache={tax.refreshCache}
        />

        <TaxSummaryCards
          summary={tax.summary}
          isLoading={tax.isLoadingSummary}
          reconciliation={tax.reconciliation}
        />

        {showEmpty ? (
          <EmptyState hasFilters={hasFilters} onReset={tax.resetFilters} />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5 items-start">
            <TaxPeriodTable
              granularity={tax.filters.granularity}
              dailyRows={tax.dailyRows}
              monthlyRows={tax.monthlyRows}
              orderRows={tax.orderRows}
              pagination={tax.pagination}
              isLoading={tax.isLoadingPeriod || tax.isLoadingOrders}
              error={tax.periodError ?? tax.ordersError}
              onGoToPage={tax.goToPage}
            />

            <div className="space-y-4">
              <TaxExportPanel
                filters={tax.filters}
                onExport={tax.exportCsv}
                isExporting={tax.isExporting}
              />

              {tax.summary && !tax.isLoadingSummary && (
                <div className="rounded-2xl border border-white/8 bg-white/3 p-5 space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                    Quick Stats
                  </p>

                  <div className="space-y-3">
                    {[
                      {
                        label: 'Avg order value',
                        value: tax.avgOrderFormatted,
                      },
                      {
                        label: 'Effective tax rate',
                        value: tax.effectiveTaxRateFormatted,
                      },
                      {
                        label: 'Total orders',
                        value: tax.summary.ordersCount.toLocaleString(),
                      },
                      {
                        label: 'Tips collected',
                        value: tax.summary
                          ? new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: tax.summary.currency.toUpperCase(),
                            }).format(tax.summary.tipCents / 100)
                          : '—',
                      },
                      {
                        label: 'Stripe fees',
                        value: tax.summary
                          ? new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: tax.summary.currency.toUpperCase(),
                            }).format(tax.summary.totalStripeFeesCents / 100)
                          : '—',
                      },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">{label}</span>
                        <span className="text-sm font-semibold text-slate-200 tabular-nums">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminTaxesPage;