// =============================================================================
// src/modules/tax/utils/taxTotals.ts
//
// Pure utility functions for:
//   1. Currency formatting    — formatCents, formatRate, centsToDollarsString
//   2. Safe number coercion   — centsToNumber, safeNumber, safeDate
//   3. Total calculations     — sumTaxRows, computePeriodTotals
//   4. Reconciliation math    — reconcileTaxSummary, validateCentsBalance
//   5. Date helpers           — formatDateLabel, formatMonthLabel, formatMonthDisplay
//   6. Export helpers         — buildExportHeaders, buildExportFilename, rowsToCsv
//   7. Date range presets     — buildDatePresets
//   8. Filter serialization   — filtersToQueryParams
// =============================================================================

import {
  TaxDailyRow,
  TaxMonthlyRow,
  TaxSummaryCards,
  TaxGranularity,
  TaxCurrency,
  TaxReportFilters,
  TaxSummaryQueryParams,
  TaxPeriodQueryParams,
  TaxOrderQueryParams,
  TaxExportQueryParams,
  TaxDatePresetOption,
  TaxDatePreset,
  TaxReconciliationResult,
  TaxExportRow,
  TaxExportDailyRow,
  TaxExportMonthlyRow,
  TaxExportOrderRow,
  DEFAULT_TAX_PAGE_SIZE,
  TAX_MAX_DATE_RANGE_DAYS,
} from '../types/tax.types';

// ---------------------------------------------------------------------------
// 1. Currency formatting
// ---------------------------------------------------------------------------

const LOCALE = 'en-US';

/**
 * Formats an integer cents value into a locale currency string.
 * e.g. formatCents(123456, 'usd') → "$1,234.56"
 */
export function formatCents(
  cents: number,
  currency: TaxCurrency = 'usd',
  options?: Intl.NumberFormatOptions,
): string {
  const amount = cents / 100;

  try {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}

/**
 * Formats cents as a plain decimal dollar string (no symbol).
 * Used for CSV export. e.g. centsToDollarsString(123456) → "1234.56"
 */
export function centsToDollarsString(cents: number | null | undefined): string {
  const n = centsToNumber(cents);
  return (n / 100).toFixed(2);
}

/**
 * Formats a tax rate (0–100 range) as a percentage string.
 * e.g. formatRate(8.25) → "8.25%"
 */
export function formatRate(rate: number, decimalPlaces = 2): string {
  return `${safeNumber(rate).toFixed(decimalPlaces)}%`;
}

/**
 * Formats a large cents value in compact notation.
 * e.g. formatCentsCompact(1_234_567, 'usd') → "$12.3K"
 */
export function formatCentsCompact(cents: number, currency: TaxCurrency = 'usd'): string {
  const amount = cents / 100;

  try {
    return new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency: currency.toUpperCase(),
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return formatCents(cents, currency);
  }
}

/**
 * Formats a percentage change between two values.
 * e.g. formatPctChange(100, 110) → "+10.0%"
 */
export function formatPctChange(previous: number, current: number): string {
  if (previous === 0) {
    return current > 0 ? '+∞%' : '—';
  }

  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';

  return `${sign}${change.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// 2. Safe number / date coercion
// ---------------------------------------------------------------------------

/**
 * Converts a raw Postgres cents value (possibly null, string, or number) to
 * a safe integer.
 */
export function centsToNumber(value: number | string | null | undefined): number {
  if (value == null) {
    return 0;
  }

  const n = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isNaN(n) ? 0 : Math.round(n);
}

/**
 * Converts any numeric-ish value to a safe number (float).
 */
export function safeNumber(value: number | string | null | undefined): number {
  if (value == null) {
    return 0;
  }

  const n = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Parses a Postgres DATE string (YYYY-MM-DD) or ISO timestamp into a Date.
 * Returns null when the input is null/undefined/invalid.
 */
export function safeDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const iso = value.includes('T') ? value : `${value}T00:00:00.000Z`;
  const d = new Date(iso);

  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Converts a Date to a YYYY-MM-DD string in local timezone.
 * Used when building RPC query params.
 */
export function dateToYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// 3. Date formatting labels
// ---------------------------------------------------------------------------

const DATE_LABEL_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
};

const MONTH_DISPLAY_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
};

/**
 * e.g. "Mar 8, 2026"
 */
export function formatDateLabel(date: Date): string {
  try {
    return new Intl.DateTimeFormat(LOCALE, DATE_LABEL_FORMAT).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * e.g. "2026-03"
 */
export function formatMonthLabel(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');

  return `${y}-${m}`;
}

/**
 * e.g. "March 2026"
 */
export function formatMonthDisplay(date: Date): string {
  try {
    return new Intl.DateTimeFormat(LOCALE, MONTH_DISPLAY_FORMAT).format(date);
  } catch {
    return formatMonthLabel(date);
  }
}

// ---------------------------------------------------------------------------
// 4. Total calculations
// ---------------------------------------------------------------------------

type DailyTotals = Omit<
  TaxSummaryCards,
  | 'dateFrom'
  | 'dateTo'
  | 'periodDays'
  | 'currency'
  | 'effectiveTaxRatePct'
  | 'avgOrderCents'
  | 'avgTaxPerOrderCents'
  | 'grossSalesFormatted'
  | 'taxableSalesFormatted'
  | 'taxCollectedFormatted'
  | 'refundedTaxFormatted'
  | 'netTaxFormatted'
  | 'netSalesFormatted'
  | 'grossTotalFormatted'
  | 'effectiveTaxRateFormatted'
  | 'avgOrderFormatted'
>;

/**
 * Sums an array of TaxDailyRows into a single aggregate object.
 */
export function sumDailyRows(rows: TaxDailyRow[]): DailyTotals {
  return rows.reduce<DailyTotals>(
    (acc, row) => ({
      ordersCount: acc.ordersCount + row.ordersCount,
      disputedOrdersCount: acc.disputedOrdersCount + row.disputedOrdersCount,
      refundedOrdersCount: acc.refundedOrdersCount + row.refundedOrdersCount,
      grossSalesCents: acc.grossSalesCents + row.grossSalesCents,
      discountCents: acc.discountCents + row.discountCents,
      taxableSalesCents: acc.taxableSalesCents + row.taxableSalesCents,
      taxCollectedCents: acc.taxCollectedCents + row.taxCollectedCents,
      tipCents: acc.tipCents + row.tipCents,
      deliveryFeeCents: acc.deliveryFeeCents + row.deliveryFeeCents,
      serviceFeeCents: acc.serviceFeeCents + row.serviceFeeCents,
      grossTotalCents: acc.grossTotalCents + row.grossTotalCents,
      refundedSalesCents: acc.refundedSalesCents + row.refundedSalesCents,
      refundedTaxCents: acc.refundedTaxCents + row.refundedTaxCents,
      netSalesCents: acc.netSalesCents + row.netSalesCents,
      netTaxCents: acc.netTaxCents + row.netTaxCents,
      totalStripeFeesCents: acc.totalStripeFeesCents + row.totalStripeFeesCents,
    }),
    {
      ordersCount: 0,
      disputedOrdersCount: 0,
      refundedOrdersCount: 0,
      grossSalesCents: 0,
      discountCents: 0,
      taxableSalesCents: 0,
      taxCollectedCents: 0,
      tipCents: 0,
      deliveryFeeCents: 0,
      serviceFeeCents: 0,
      grossTotalCents: 0,
      refundedSalesCents: 0,
      refundedTaxCents: 0,
      netSalesCents: 0,
      netTaxCents: 0,
      totalStripeFeesCents: 0,
    },
  );
}

/**
 * Sums an array of TaxMonthlyRows into period totals.
 */
export function sumMonthlyRows(rows: TaxMonthlyRow[]): {
  ordersCount: number;
  activeDays: number;
  disputedOrdersCount: number;
  refundedOrdersCount: number;
  grossSalesCents: number;
  discountCents: number;
  taxableSalesCents: number;
  taxCollectedCents: number;
  tipCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  grossTotalCents: number;
  refundedSalesCents: number;
  refundedTaxCents: number;
  netSalesCents: number;
  netTaxCents: number;
  totalStripeFeesCents: number;
} {
  return rows.reduce(
    (acc, row) => ({
      ordersCount: acc.ordersCount + row.ordersCount,
      activeDays: acc.activeDays + row.activeDays,
      disputedOrdersCount: acc.disputedOrdersCount + row.disputedOrdersCount,
      refundedOrdersCount: acc.refundedOrdersCount + row.refundedOrdersCount,
      grossSalesCents: acc.grossSalesCents + row.grossSalesCents,
      discountCents: acc.discountCents + row.discountCents,
      taxableSalesCents: acc.taxableSalesCents + row.taxableSalesCents,
      taxCollectedCents: acc.taxCollectedCents + row.taxCollectedCents,
      tipCents: acc.tipCents + row.tipCents,
      deliveryFeeCents: acc.deliveryFeeCents + row.deliveryFeeCents,
      serviceFeeCents: acc.serviceFeeCents + row.serviceFeeCents,
      grossTotalCents: acc.grossTotalCents + row.grossTotalCents,
      refundedSalesCents: acc.refundedSalesCents + row.refundedSalesCents,
      refundedTaxCents: acc.refundedTaxCents + row.refundedTaxCents,
      netSalesCents: acc.netSalesCents + row.netSalesCents,
      netTaxCents: acc.netTaxCents + row.netTaxCents,
      totalStripeFeesCents: acc.totalStripeFeesCents + row.totalStripeFeesCents,
    }),
    {
      ordersCount: 0,
      activeDays: 0,
      disputedOrdersCount: 0,
      refundedOrdersCount: 0,
      grossSalesCents: 0,
      discountCents: 0,
      taxableSalesCents: 0,
      taxCollectedCents: 0,
      tipCents: 0,
      deliveryFeeCents: 0,
      serviceFeeCents: 0,
      grossTotalCents: 0,
      refundedSalesCents: 0,
      refundedTaxCents: 0,
      netSalesCents: 0,
      netTaxCents: 0,
      totalStripeFeesCents: 0,
    },
  );
}

/**
 * Derives the effective tax rate from aggregated cents values.
 * Returns 0 if taxable sales is zero.
 */
export function computeEffectiveTaxRate(
  taxCollectedCents: number,
  taxableSalesCents: number,
): number {
  if (taxableSalesCents === 0) {
    return 0;
  }

  return (taxCollectedCents / taxableSalesCents) * 100;
}

/**
 * Computes the average order value (cents) from totals and order count.
 */
export function computeAvgOrderCents(grossTotalCents: number, ordersCount: number): number {
  if (ordersCount === 0) {
    return 0;
  }

  return Math.round(grossTotalCents / ordersCount);
}

// ---------------------------------------------------------------------------
// 5. Reconciliation math
// ---------------------------------------------------------------------------

/**
 * Validates that a TaxSummaryCards object is internally consistent.
 */
export function reconcileTaxSummary(summary: TaxSummaryCards): TaxReconciliationResult {
  const TOLERANCE = 1;

  const expectedNetSales = summary.grossTotalCents - summary.refundedSalesCents;
  const expectedNetTax = summary.taxCollectedCents - summary.refundedTaxCents;

  const deltaNetSales = Math.abs(summary.netSalesCents - expectedNetSales);
  const deltaNetTax = Math.abs(summary.netTaxCents - expectedNetTax);

  const isBalanced = deltaNetSales <= TOLERANCE && deltaNetTax <= TOLERANCE;

  let warningMessage: string | null = null;

  if (!isBalanced) {
    warningMessage = [
      deltaNetSales > TOLERANCE
        ? `Net sales off by ${formatCents(deltaNetSales, summary.currency)}`
        : null,
      deltaNetTax > TOLERANCE
        ? `Net tax off by ${formatCents(deltaNetTax, summary.currency)}`
        : null,
    ]
      .filter((value): value is string => value !== null)
      .join('; ');
  }

  return {
    isBalanced,
    deltaNetTaxCents: deltaNetTax,
    deltaNetSalesCents: deltaNetSales,
    expectedNetTaxCents: expectedNetTax,
    actualNetTaxCents: summary.netTaxCents,
    warningMessage,
  };
}

/**
 * Validates that a gross total = subtotal + tax + tip + fees - discount.
 */
export function validateOrderCentsBalance(params: {
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  discountCents: number;
  totalCents: number;
}): { isValid: boolean; delta: number } {
  const expected =
    params.subtotalCents +
    params.taxCents +
    params.tipCents +
    params.deliveryFeeCents +
    params.serviceFeeCents -
    params.discountCents;

  const delta = Math.abs(params.totalCents - expected);

  return { isValid: delta <= 1, delta };
}

// ---------------------------------------------------------------------------
// 6. Date range presets
// ---------------------------------------------------------------------------

/**
 * Builds the full set of date preset options for TaxFiltersBar.
 */
export function buildDatePresets(now = new Date()): TaxDatePresetOption[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const startOf = (date: Date): Date => {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  };

  const daysAgo = (days: number): Date => {
    const date = new Date(today);
    date.setDate(date.getDate() - days);
    return date;
  };

  const yesterday = daysAgo(1);

  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  const quarter = Math.floor(today.getMonth() / 3);
  const thisQStart = new Date(today.getFullYear(), quarter * 3, 1);
  const thisQEnd = new Date(today.getFullYear(), quarter * 3 + 3, 0);

  const lastQStart = new Date(today.getFullYear(), (quarter - 1) * 3, 1);
  const lastQEnd = new Date(today.getFullYear(), (quarter - 1) * 3 + 3, 0);

  const thisYearStart = new Date(today.getFullYear(), 0, 1);
  const thisYearEnd = new Date(today.getFullYear(), 11, 31);

  const lastYearStart = new Date(today.getFullYear() - 1, 0, 1);
  const lastYearEnd = new Date(today.getFullYear() - 1, 11, 31);

  return [
    { label: 'Today', value: 'today', dateFrom: today, dateTo: endOfToday },
    {
      label: 'Yesterday',
      value: 'yesterday',
      dateFrom: yesterday,
      dateTo: startOf(new Date(yesterday.getTime() + 86_399_999)),
    },
    { label: 'Last 7 days', value: 'last_7_days', dateFrom: daysAgo(6), dateTo: endOfToday },
    { label: 'Last 30 days', value: 'last_30_days', dateFrom: daysAgo(29), dateTo: endOfToday },
    {
      label: 'This month',
      value: 'this_month',
      dateFrom: thisMonthStart,
      dateTo: thisMonthEnd,
    },
    {
      label: 'Last month',
      value: 'last_month',
      dateFrom: lastMonthStart,
      dateTo: lastMonthEnd,
    },
    {
      label: 'This quarter',
      value: 'this_quarter',
      dateFrom: thisQStart,
      dateTo: thisQEnd,
    },
    {
      label: 'Last quarter',
      value: 'last_quarter',
      dateFrom: lastQStart,
      dateTo: lastQEnd,
    },
    {
      label: 'This year',
      value: 'this_year',
      dateFrom: thisYearStart,
      dateTo: thisYearEnd,
    },
    {
      label: 'Last year',
      value: 'last_year',
      dateFrom: lastYearStart,
      dateTo: lastYearEnd,
    },
    {
      label: 'Custom range',
      value: 'custom',
      dateFrom: daysAgo(29),
      dateTo: endOfToday,
    },
  ];
}

/**
 * Detects which preset a given [dateFrom, dateTo] pair matches.
 */
export function detectDatePreset(
  dateFrom: Date,
  dateTo: Date,
  presets: TaxDatePresetOption[],
): TaxDatePreset {
  const fromYMD = dateToYMD(dateFrom);
  const toYMD = dateToYMD(dateTo);

  for (const preset of presets) {
    if (preset.value === 'custom') {
      continue;
    }

    if (dateToYMD(preset.dateFrom) === fromYMD && dateToYMD(preset.dateTo) === toYMD) {
      return preset.value;
    }
  }

  return 'custom';
}

/**
 * Validates that a date range doesn't exceed the max allowed days.
 */
export function validateDateRange(
  dateFrom: Date,
  dateTo: Date,
): { isValid: boolean; errorMessage: string | null; days: number } {
  const days = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / 86_400_000) + 1;

  if (dateTo < dateFrom) {
    return {
      isValid: false,
      errorMessage: 'End date must be after start date.',
      days,
    };
  }

  if (days > TAX_MAX_DATE_RANGE_DAYS) {
    return {
      isValid: false,
      errorMessage: `Date range cannot exceed ${TAX_MAX_DATE_RANGE_DAYS} days.`,
      days,
    };
  }

  return { isValid: true, errorMessage: null, days };
}

// ---------------------------------------------------------------------------
// 7. Filter → RPC param serialization
// ---------------------------------------------------------------------------

export function filtersToSummaryParams(
  filters: TaxReportFilters,
  useCache = true,
): TaxSummaryQueryParams {
  return {
    date_from: dateToYMD(filters.dateFrom),
    date_to: dateToYMD(filters.dateTo),
    p_currency: filters.currency,
    use_cache: useCache,
  };
}

export function filtersToPeriodParams(
  filters: TaxReportFilters,
  useCache = true,
): TaxPeriodQueryParams {
  return {
    date_from: dateToYMD(filters.dateFrom),
    date_to: dateToYMD(filters.dateTo),
    p_currency: filters.currency,
    use_cache: useCache,
  };
}

export function filtersToOrderParams(
  filters: TaxReportFilters,
  pageSize = DEFAULT_TAX_PAGE_SIZE,
  pageOffset = 0,
): TaxOrderQueryParams {
  return {
    date_from: dateToYMD(filters.dateFrom),
    date_to: dateToYMD(filters.dateTo),
    p_currency: filters.currency,
    fulfillment_filter: filters.fulfillmentType === 'all' ? null : filters.fulfillmentType,
    disputed_only: filters.disputedOnly,
    refunded_only: filters.refundedOnly,
    page_size: pageSize,
    page_offset: pageOffset,
  };
}

export function filtersToExportParams(filters: TaxReportFilters): TaxExportQueryParams {
  return {
    date_from: dateToYMD(filters.dateFrom),
    date_to: dateToYMD(filters.dateTo),
    p_currency: filters.currency,
    granularity: filters.granularity,
  };
}

// ---------------------------------------------------------------------------
// 8. Export helpers
// ---------------------------------------------------------------------------

export function buildExportHeaders(granularity: TaxGranularity): string[] {
  switch (granularity) {
    case 'daily':
      return [
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
      ];
    case 'monthly':
      return [
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
        'Effective Tax Rate',
      ];
    case 'orders':
      return [
        'Order ID',
        'Date',
        'Subtotal',
        'Discount',
        'Taxable Sales',
        'Tax Collected',
        'Refunded Amount',
        'Refunded Tax (Est.)',
        'Net Tax',
        'Dispute Status',
        'Payment Intent ID',
      ];
  }
}

export function buildExportFilename(
  granularity: TaxGranularity,
  dateFrom: string,
  dateTo: string,
  currency: TaxCurrency,
): string {
  const slug = `tax-report-${granularity}-${currency}-${dateFrom}-to-${dateTo}`;
  return `${slug}.csv`;
}

function isTaxExportDailyRow(row: TaxExportRow): row is TaxExportDailyRow {
  return 'stripeFees' in row && 'date' in row;
}

function isTaxExportMonthlyRow(row: TaxExportRow): row is TaxExportMonthlyRow {
  return 'effectiveTaxRate' in row && 'month' in row;
}

function isTaxExportOrderRow(row: TaxExportRow): row is TaxExportOrderRow {
  return 'orderId' in row && 'paymentIntentId' in row;
}

function unknownToCsvString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function taxExportRowToValues(row: TaxExportRow): string[] {
  if (isTaxExportDailyRow(row)) {
    return [
      row.date,
      String(row.ordersCount),
      row.grossSales,
      row.discounts,
      row.taxableSales,
      row.taxCollected,
      row.refundedSales,
      row.refundedTax,
      row.netSales,
      row.netTax,
      row.stripeFees,
    ];
  }

  if (isTaxExportMonthlyRow(row)) {
    return [
      row.month,
      String(row.ordersCount),
      row.grossSales,
      row.discounts,
      row.taxableSales,
      row.taxCollected,
      row.refundedSales,
      row.refundedTax,
      row.netSales,
      row.netTax,
      row.effectiveTaxRate,
    ];
  }

  if (isTaxExportOrderRow(row)) {
    return [
      row.orderId,
      row.date,
      row.subtotal,
      row.discount,
      row.taxableSales,
      row.taxCollected,
      row.refundedAmount,
      row.refundedTaxEstimate,
      row.netTax,
      row.disputeStatus,
      row.paymentIntentId,
    ];
  }

  return Object.values(row).map((value) => unknownToCsvString(value));
}

/**
 * Converts an array of export rows to a CSV string.
 */
export function rowsToCsv(headers: string[], rows: TaxExportRow[]): string {
  const escape = (value: string | number | boolean | undefined | null): string => {
    const str = String(value ?? '');

    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  };

  const headerLine = headers.map(escape).join(',');
  const dataLines = rows.map((row) => taxExportRowToValues(row).map(escape).join(','));

  return [headerLine, ...dataLines].join('\r\n');
}

/**
 * Triggers a CSV file download in the browser.
 */
export function downloadCsv(csvString: string, filename: string): void {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// 9. Trend / change helpers (for period-over-period comparisons)
// ---------------------------------------------------------------------------

export type TrendDirection = 'up' | 'down' | 'flat';

export interface TrendResult {
  direction: TrendDirection;
  pctChange: number;
  formatted: string;
  isPositive: boolean;
}

/**
 * Computes trend between two periods.
 */
export function computeTrend(
  previous: number,
  current: number,
  positiveIsUp = true,
): TrendResult {
  if (previous === 0 && current === 0) {
    return { direction: 'flat', pctChange: 0, formatted: '—', isPositive: true };
  }

  if (previous === 0) {
    return {
      direction: 'up',
      pctChange: 100,
      formatted: 'New',
      isPositive: positiveIsUp,
    };
  }

  const pctChange = ((current - previous) / Math.abs(previous)) * 100;

  const direction: TrendDirection =
    Math.abs(pctChange) < 0.05 ? 'flat' : pctChange > 0 ? 'up' : 'down';

  const isPositive =
    direction === 'flat' ? true : positiveIsUp ? direction === 'up' : direction === 'down';

  const sign = pctChange >= 0 ? '+' : '';
  const formatted =
    direction === 'flat' ? '0.0%' : `${sign}${Math.abs(pctChange).toFixed(1)}%`;

  return { direction, pctChange, formatted, isPositive };
}

// ---------------------------------------------------------------------------
// 10. Disputed order urgency helpers
// ---------------------------------------------------------------------------

export type DisputeUrgency = 'overdue' | 'critical' | 'warning' | 'normal' | 'closed';

/**
 * Classifies dispute urgency based on days remaining until due_by date.
 */
export function classifyDisputeUrgency(
  disputeDueBy: Date | null | undefined,
  disputeStatus: string,
): DisputeUrgency {
  if (['won', 'lost', 'charge_refunded', 'none'].includes(disputeStatus)) {
    return 'closed';
  }

  if (!disputeDueBy) {
    return 'normal';
  }

  const daysRemaining = Math.ceil((disputeDueBy.getTime() - Date.now()) / 86_400_000);

  if (daysRemaining < 0) {
    return 'overdue';
  }

  if (daysRemaining <= 2) {
    return 'critical';
  }

  if (daysRemaining <= 5) {
    return 'warning';
  }

  return 'normal';
}

/**
 * Formats days remaining into a human string.
 */
export function formatDisputeDaysRemaining(disputeDueBy: Date | null | undefined): string {
  if (!disputeDueBy) {
    return '—';
  }

  const days = Math.ceil((disputeDueBy.getTime() - Date.now()) / 86_400_000);

  if (days === 0) {
    return 'Due today';
  }

  if (days === 1) {
    return '1 day left';
  }

  if (days > 0) {
    return `${days} days left`;
  }

  if (days === -1) {
    return 'Overdue by 1 day';
  }

  return `Overdue by ${Math.abs(days)} days`;
}