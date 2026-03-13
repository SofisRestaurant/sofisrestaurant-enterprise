// =============================================================================
// src/modules/tax/components/TaxPeriodTable.tsx
// =============================================================================

import React, { useMemo, useState } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

import type {
  TaxDailyRow,
  TaxMonthlyRow,
  TaxOrderRow,
  TaxGranularity,
  TaxOrderPaginationParams,
  DisputeStatus,
  TaxCurrency,
} from '../types/tax.types';

import { formatCents } from '../utils/taxTotals';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaxPeriodTableProps {
  granularity: TaxGranularity;
  dailyRows: TaxDailyRow[];
  monthlyRows: TaxMonthlyRow[];
  orderRows: TaxOrderRow[];
  pagination: TaxOrderPaginationParams;
  isLoading: boolean;
  error: string | null;
  onGoToPage: (page: number) => void;
  className?: string;
}

type SortDir = 'asc' | 'desc' | null;
type SortValue = string | number;

interface DailySortAccessors {
  reportDateLabel: (row: TaxDailyRow) => SortValue;
  ordersCount: (row: TaxDailyRow) => SortValue;
}

interface MonthlySortAccessors {
  reportMonthDisplay: (row: TaxMonthlyRow) => SortValue;
  activeDays: (row: TaxMonthlyRow) => SortValue;
  ordersCount: (row: TaxMonthlyRow) => SortValue;
}

interface OrderSortAccessors {
  capturedDateLabel: (row: TaxOrderRow) => SortValue;
  orderId: (row: TaxOrderRow) => SortValue;
  fulfillmentType: (row: TaxOrderRow) => SortValue;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function DisputeBadge({ status }: { status: DisputeStatus }): React.ReactElement | null {
  if (!status || status === 'none') {
    return null;
  }

  const variants: Partial<Record<DisputeStatus, string>> = {
    needs_response: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    warning_needs_response: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    under_review: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    warning_under_review: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    won: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    lost: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    charge_refunded: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  };

  const cls = variants[status] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30';
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]',
        'font-semibold border leading-none',
        cls,
      ].join(' ')}
    >
      <AlertTriangle size={9} />
      {label}
    </span>
  );
}

function SortIcon({ dir }: { dir: SortDir }): React.ReactElement {
  if (dir === 'asc') {
    return <ChevronUp size={12} className="text-violet-400" />;
  }

  if (dir === 'desc') {
    return <ChevronDown size={12} className="text-violet-400" />;
  }

  return <ChevronsUpDown size={12} className="text-slate-600" />;
}

function SortableHeader<TField extends string>({
  label,
  field,
  sortField,
  sortDir,
  onSort,
}: {
  label: string;
  field: TField;
  sortField: TField | null;
  sortDir: SortDir;
  onSort: (field: TField) => void;
}): React.ReactElement {
  const active = sortField === field;

  return (
    <th className="px-4 py-3 text-left">
      <button
        type="button"
        className="group inline-flex items-center gap-1 cursor-pointer select-none"
        onClick={() => onSort(field)}
        aria-pressed={active}
      >
        <span
          className={[
            'inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest',
            active ? 'text-violet-300' : 'text-slate-500 group-hover:text-slate-300',
            'transition-colors duration-100',
          ].join(' ')}
        >
          {label}
          <SortIcon dir={active ? sortDir : null} />
        </span>
      </button>
    </th>
  );
}

/** Table skeleton rows */
function TableSkeleton({ cols }: { cols: number }): React.ReactElement {
  const skeletonRows = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'];
  const skeletonCols = Array.from({ length: cols }, (_, idx) => `c${idx + 1}`);

  return (
    <>
      {skeletonRows.map((rowKey, rowIndex) => (
        <tr key={rowKey} className="border-t border-white/5 animate-pulse">
          {skeletonCols.map((colKey, colIndex) => (
            <td key={`${rowKey}-${colKey}`} className="px-4 py-3">
              <div
                className="h-3.5 rounded-md bg-white/6"
                style={{ width: `${40 + ((rowIndex * (colIndex + 1) + colIndex) % 5) * 12}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Empty state */
function EmptyState({ message }: { message: string }): React.ReactElement {
  return (
    <tr>
      <td colSpan={20} className="px-6 py-16 text-center">
        <p className="text-slate-500 text-sm">{message}</p>
      </td>
    </tr>
  );
}

/** Error row */
function ErrorRow({ message }: { message: string }): React.ReactElement {
  return (
    <tr>
      <td colSpan={20} className="px-6 py-10 text-center">
        <div className="inline-flex items-center gap-2 text-rose-400 text-sm">
          <AlertTriangle size={14} />
          {message}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Column money cell
// ---------------------------------------------------------------------------

function MoneyCell({
  cents,
  currency,
  dim = false,
}: {
  cents: number;
  currency: TaxCurrency;
  dim?: boolean;
}): React.ReactElement {
  return (
    <td
      className={[
        'px-4 py-3 text-right text-sm tabular-nums font-medium',
        cents < 0
          ? 'text-rose-400'
          : cents === 0
            ? 'text-slate-600'
            : dim
              ? 'text-slate-400'
              : 'text-slate-200',
      ].join(' ')}
    >
      {formatCents(cents, currency)}
    </td>
  );
}

// ---------------------------------------------------------------------------
// Sort hook
// ---------------------------------------------------------------------------

function compareSortValues(left: SortValue, right: SortValue): number {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right));
}

function useSortedRows<T, TField extends string>(
  rows: T[],
  accessors: Record<TField, (row: T) => SortValue>,
): {
  sorted: T[];
  sortField: TField | null;
  sortDir: SortDir;
  toggleSort: (field: TField) => void;
} {
  const [sortField, setSortField] = useState<TField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (field: TField): void => {
    if (sortField !== field) {
      setSortField(field);
      setSortDir('desc');
      return;
    }

    setSortDir((currentDir) => {
      if (currentDir === 'desc') {
        return 'asc';
      }

      if (currentDir === 'asc') {
        setSortField(null);
        return null;
      }

      return 'desc';
    });
  };

  const sorted = useMemo(() => {
    if (sortField === null || sortDir === null) {
      return rows;
    }

    const accessor = accessors[sortField];

    return [...rows].sort((left, right) => {
      const comparison = compareSortValues(accessor(left), accessor(right));
      return sortDir === 'asc' ? comparison : -comparison;
    });
  }, [accessors, rows, sortDir, sortField]);

  return { sorted, sortField, sortDir, toggleSort };
}

// ---------------------------------------------------------------------------
// Daily table
// ---------------------------------------------------------------------------

function DailyTable({
  rows,
  isLoading,
  error,
}: {
  rows: TaxDailyRow[];
  isLoading: boolean;
  error: string | null;
}): React.ReactElement {
  const dailyAccessors: DailySortAccessors = {
    reportDateLabel: (row) => row.reportDate.getTime(),
    ordersCount: (row) => row.ordersCount,
  };

  const { sorted, sortField, sortDir, toggleSort } = useSortedRows(rows, dailyAccessors);
  const currency: TaxCurrency = rows[0]?.currency ?? 'usd';

  return (
    <table className="w-full text-sm min-w-900px">
      <thead>
        <tr className="border-b border-white/10">
          <SortableHeader
            label="Date"
            field="reportDateLabel"
            sortField={sortField}
            sortDir={sortDir}
            onSort={toggleSort}
          />
          <SortableHeader
            label="Orders"
            field="ordersCount"
            sortField={sortField}
            sortDir={sortDir}
            onSort={toggleSort}
          />
          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Gross Sales
          </th>
          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Discounts
          </th>
          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Taxable Sales
          </th>
          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Tax Collected
          </th>
          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Refunded Tax
          </th>
          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Net Tax
          </th>
          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Net Sales
          </th>
        </tr>
      </thead>
      <tbody>
        {error ? (
          <ErrorRow message={error} />
        ) : isLoading ? (
          <TableSkeleton cols={9} />
        ) : sorted.length === 0 ? (
          <EmptyState message="No data for this period." />
        ) : (
          sorted.map((row) => (
            <tr
              key={row.reportDate.toISOString()}
              className="border-t border-white/5 hover:bg-white/3 transition-colors duration-75"
            >
              <td className="px-4 py-3 text-sm text-slate-300 font-medium whitespace-nowrap">
                {row.reportDateLabel}
              </td>
              <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">
                {row.ordersCount.toLocaleString()}
                {row.disputedOrdersCount > 0 ? (
                  <span className="ml-1.5 text-[10px] text-amber-400">
                    {row.disputedOrdersCount}⚠
                  </span>
                ) : null}
              </td>
              <MoneyCell cents={row.grossSalesCents} currency={currency} />
              <MoneyCell cents={row.discountCents} currency={currency} dim />
              <MoneyCell cents={row.taxableSalesCents} currency={currency} />
              <MoneyCell cents={row.taxCollectedCents} currency={currency} />
              <MoneyCell cents={row.refundedTaxCents} currency={currency} dim />
              <MoneyCell cents={row.netTaxCents} currency={currency} />
              <MoneyCell cents={row.netSalesCents} currency={currency} />
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Monthly table
// ---------------------------------------------------------------------------

function MonthlyTable({
  rows,
  isLoading,
  error,
}: {
  rows: TaxMonthlyRow[];
  isLoading: boolean;
  error: string | null;
}): React.ReactElement {
  const monthlyAccessors: MonthlySortAccessors = {
    reportMonthDisplay: (row) => row.reportMonth.getTime(),
    activeDays: (row) => row.activeDays,
    ordersCount: (row) => row.ordersCount,
  };

  const { sorted, sortField, sortDir, toggleSort } = useSortedRows(rows, monthlyAccessors);
  const currency: TaxCurrency = rows[0]?.currency ?? 'usd';

  return (
    <table className="w-full text-sm min-w-1000px">
      <thead>
        <tr className="border-b border-white/10">
          <SortableHeader
            label="Month"
            field="reportMonthDisplay"
            sortField={sortField}
            sortDir={sortDir}
            onSort={toggleSort}
          />
          <SortableHeader
            label="Days"
            field="activeDays"
            sortField={sortField}
            sortDir={sortDir}
            onSort={toggleSort}
          />
          <SortableHeader
            label="Orders"
            field="ordersCount"
            sortField={sortField}
            sortDir={sortDir}
            onSort={toggleSort}
          />
          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Gross Sales
          </th>
          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Taxable Sales
          </th>
          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Tax Collected
          </th>
          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Refunded Tax
          </th>
          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Net Tax
          </th>
          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Tax Rate
          </th>
          <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Net Sales
          </th>
        </tr>
      </thead>
      <tbody>
        {error ? (
          <ErrorRow message={error} />
        ) : isLoading ? (
          <TableSkeleton cols={10} />
        ) : sorted.length === 0 ? (
          <EmptyState message="No data for this period." />
        ) : (
          sorted.map((row) => (
            <tr
              key={row.reportMonth.toISOString()}
              className="border-t border-white/5 hover:bg-white/3 transition-colors duration-75"
            >
              <td className="px-4 py-3 text-sm text-slate-200 font-semibold">
                {row.reportMonthDisplay}
              </td>
              <td className="px-4 py-3 text-sm text-slate-400 text-right tabular-nums">
                {row.activeDays}
              </td>
              <td className="px-4 py-3 text-sm text-slate-300 text-right tabular-nums">
                {row.ordersCount.toLocaleString()}
              </td>
              <MoneyCell cents={row.grossSalesCents} currency={currency} />
              <MoneyCell cents={row.taxableSalesCents} currency={currency} />
              <MoneyCell cents={row.taxCollectedCents} currency={currency} />
              <MoneyCell cents={row.refundedTaxCents} currency={currency} dim />
              <MoneyCell cents={row.netTaxCents} currency={currency} />
              <td className="px-4 py-3 text-right text-sm text-violet-300 font-semibold tabular-nums">
                {row.effectiveTaxRateFormatted}
              </td>
              <MoneyCell cents={row.netSalesCents} currency={currency} />
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Orders table
// ---------------------------------------------------------------------------

function OrdersTable({
  rows,
  isLoading,
  error,
  pagination,
  onGoToPage,
}: {
  rows: TaxOrderRow[];
  isLoading: boolean;
  error: string | null;
  pagination: TaxOrderPaginationParams;
  onGoToPage: (page: number) => void;
}): React.ReactElement {
  const orderAccessors: OrderSortAccessors = {
    capturedDateLabel: (row) => row.capturedDate.getTime(),
    orderId: (row) => row.orderId,
    fulfillmentType: (row) => row.fulfillmentType,
  };

  const { sorted, sortField, sortDir, toggleSort } = useSortedRows(rows, orderAccessors);
  const currency: TaxCurrency = rows[0]?.currency ?? 'usd';

  return (
    <div>
      <table className="w-full text-sm min-w-1100px">
        <thead>
          <tr className="border-b border-white/10">
            <SortableHeader
              label="Date"
              field="capturedDateLabel"
              sortField={sortField}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <SortableHeader
              label="Order"
              field="orderId"
              sortField={sortField}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <SortableHeader
              label="Fulfillment"
              field="fulfillmentType"
              sortField={sortField}
              sortDir={sortDir}
              onSort={toggleSort}
            />
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Taxable
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Tax
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Total
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Refunded
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Net Tax
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {error ? (
            <ErrorRow message={error} />
          ) : isLoading ? (
            <TableSkeleton cols={9} />
          ) : sorted.length === 0 ? (
            <EmptyState message="No orders for this period." />
          ) : (
            sorted.map((row) => (
              <tr
                key={row.orderId}
                className={[
                  'border-t border-white/5 hover:bg-white/3 transition-colors duration-75',
                  row.isDisputed ? 'bg-amber-500/5' : '',
                ].join(' ')}
              >
                <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                  {row.capturedDateLabel}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-slate-400 font-mono">
                      {row.orderId.slice(0, 8)}…
                    </span>
                    <ExternalLink
                      size={11}
                      className="text-slate-600 hover:text-slate-400 cursor-pointer"
                    />
                  </div>
                  {row.stripePaymentIntentId ? (
                    <span className="text-[10px] text-slate-600 font-mono block mt-0.5">
                      {row.stripePaymentIntentId.slice(0, 20)}…
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-slate-400 capitalize">
                    {row.fulfillmentType.replace(/_/g, ' ')}
                  </span>
                </td>
                <MoneyCell cents={row.taxableSalesCents} currency={currency} />
                <MoneyCell cents={row.taxCollectedCents} currency={currency} />
                <MoneyCell cents={row.grossTotalCents} currency={currency} />
                <MoneyCell cents={row.refundedAmountCents} currency={currency} dim />
                <MoneyCell cents={row.netTaxCents} currency={currency} />
                <td className="px-4 py-3">
                  <DisputeBadge status={row.disputeStatus} />
                  {!row.isDisputed ? <span className="text-[10px] text-slate-600">—</span> : null}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/8">
          <p className="text-xs text-slate-500">
            {pagination.totalRows.toLocaleString()} orders · Page {pagination.currentPage} of{' '}
            {pagination.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.currentPage <= 1}
              onClick={() => onGoToPage(pagination.currentPage - 1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs
                         border border-white/10 bg-white/5 text-slate-400
                         hover:bg-white/8 hover:text-white disabled:opacity-40
                         disabled:cursor-not-allowed transition-all duration-100"
            >
              <ArrowLeft size={12} /> Prev
            </button>
            <button
              type="button"
              disabled={pagination.currentPage >= pagination.totalPages}
              onClick={() => onGoToPage(pagination.currentPage + 1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs
                         border border-white/10 bg-white/5 text-slate-400
                         hover:bg-white/8 hover:text-white disabled:opacity-40
                         disabled:cursor-not-allowed transition-all duration-100"
            >
              Next <ArrowRight size={12} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function TaxPeriodTable({
  granularity,
  dailyRows,
  monthlyRows,
  orderRows,
  pagination,
  isLoading,
  error,
  onGoToPage,
  className = '',
}: TaxPeriodTableProps): React.ReactElement {
  return (
    <div
      className={[
        'rounded-2xl border border-white/8 bg-white/3 overflow-hidden',
        className,
      ].join(' ')}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
        <h3 className="text-sm font-semibold text-white">
          {granularity === 'daily'
            ? 'Daily Breakdown'
            : granularity === 'monthly'
              ? 'Monthly Breakdown'
              : 'Order Breakdown'}
        </h3>
        {isLoading ? <RefreshCw size={13} className="text-slate-400 animate-spin" /> : null}
      </div>

      <div className="overflow-x-auto">
        {granularity === 'daily' ? (
          <DailyTable rows={dailyRows} isLoading={isLoading} error={error} />
        ) : null}
        {granularity === 'monthly' ? (
          <MonthlyTable rows={monthlyRows} isLoading={isLoading} error={error} />
        ) : null}
        {granularity === 'orders' ? (
          <OrdersTable
            rows={orderRows}
            isLoading={isLoading}
            error={error}
            pagination={pagination}
            onGoToPage={onGoToPage}
          />
        ) : null}
      </div>
    </div>
  );
}

export default TaxPeriodTable;