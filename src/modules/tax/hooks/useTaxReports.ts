// =============================================================================
// src/modules/tax/hooks/useTaxReports.ts
//
// Central state + data-fetching hook for the tax reporting module.
// Owns: filter state, loading states, pagination, memoized summaries,
//       period row data, export flow, and refresh logic.
//
// Usage:
//   const tax = useTaxReports();
//   tax.summary        → TaxSummaryCards | null
//   tax.periodRows     → TaxDailyRow[] | TaxMonthlyRow[]
//   tax.filters        → TaxReportFilters
//   tax.setFilters(f)  → update filters + refetch
//   tax.exportCsv()    → trigger download
// =============================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

import {
  DEFAULT_TAX_FILTERS,
  DEFAULT_PAGINATION,
  DEFAULT_TAX_PAGE_SIZE,
} from '../types/tax.types';

import type {
  TaxReportFilters,
  TaxSummaryCards,
  TaxDailyRow,
  TaxMonthlyRow,
  TaxOrderRow,
  TaxOrderPaginationParams,
  TaxReconciliationResult,
  TaxDatePresetOption,
  TaxDatePreset,
} from '../types/tax.types';

import {
  fetchTaxReportPage,
  fetchTaxOrders,
  fetchTaxExport,
  refreshTaxCache,
  isTaxApiSuccess,
} from '../api/taxReports.api';

import {
  filtersToSummaryParams,
  filtersToPeriodParams,
  filtersToOrderParams,
  filtersToExportParams,
  reconcileTaxSummary,
  validateDateRange,
  rowsToCsv,
  downloadCsv,
  buildDatePresets,
  detectDatePreset,
  computeEffectiveTaxRate,
  sumDailyRows,
  sumMonthlyRows,
  formatRate,
} from '../utils/taxTotals';

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseTaxReportsReturn {
  summary: TaxSummaryCards | null;
  dailyRows: TaxDailyRow[];
  monthlyRows: TaxMonthlyRow[];
  orderRows: TaxOrderRow[];
  periodRows: TaxDailyRow[] | TaxMonthlyRow[];

  pagination: TaxOrderPaginationParams;
  goToPage: (page: number) => void;
  goToNextPage: () => void;
  goToPrevPage: () => void;

  filters: TaxReportFilters;
  setFilters: (partial: Partial<TaxReportFilters>) => void;
  resetFilters: () => void;
  activePreset: TaxDatePreset;
  datePresets: TaxDatePresetOption[];
  applyDatePreset: (preset: TaxDatePreset) => void;
  dateRangeError: string | null;

  isLoadingSummary: boolean;
  isLoadingPeriod: boolean;
  isLoadingOrders: boolean;
  isExporting: boolean;
  isRefreshing: boolean;
  isAnyLoading: boolean;

  summaryError: string | null;
  periodError: string | null;
  ordersError: string | null;
  clearErrors: () => void;

  refresh: () => Promise<void>;
  refreshCache: () => Promise<void>;
  exportCsv: () => Promise<void>;
  loadMoreOrders: () => void;

  reconciliation: TaxReconciliationResult | null;
  lastFetchedAt: Date | null;
  hasOrders: boolean;
  hasDisputedOrders: boolean;
  effectiveTaxRateFormatted: string;
  avgOrderFormatted: string;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTaxReports(
  initialFilters: Partial<TaxReportFilters> = {},
): UseTaxReportsReturn {
  const [filters, setFiltersState] = useState<TaxReportFilters>({
    ...DEFAULT_TAX_FILTERS,
    ...initialFilters,
  });

  const [summary, setSummary] = useState<TaxSummaryCards | null>(null);
  const [dailyRows, setDailyRows] = useState<TaxDailyRow[]>([]);
  const [monthlyRows, setMonthlyRows] = useState<TaxMonthlyRow[]>([]);
  const [orderRows, setOrderRows] = useState<TaxOrderRow[]>([]);
  const [pagination, setPagination] = useState<TaxOrderPaginationParams>(DEFAULT_PAGINATION);

  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isLoadingPeriod, setIsLoadingPeriod] = useState(false);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const datePresets = useMemo(() => buildDatePresets(), []);

  const activePreset = useMemo(
    () => detectDatePreset(filters.dateFrom, filters.dateTo, datePresets),
    [filters.dateFrom, filters.dateTo, datePresets],
  );

  const dateRangeValidation = useMemo(
    () => validateDateRange(filters.dateFrom, filters.dateTo),
    [filters.dateFrom, filters.dateTo],
  );

  const dateRangeError = dateRangeValidation.isValid ? null : dateRangeValidation.errorMessage;

  const reconciliation = useMemo<TaxReconciliationResult | null>(() => {
    if (summary === null) {
      return null;
    }

    return reconcileTaxSummary(summary);
  }, [summary]);

  const periodRows: TaxDailyRow[] | TaxMonthlyRow[] = useMemo(() => {
    return filters.granularity === 'monthly' ? monthlyRows : dailyRows;
  }, [filters.granularity, dailyRows, monthlyRows]);

  const effectiveTaxRateFormatted = useMemo(() => {
    if (summary !== null) {
      return summary.effectiveTaxRateFormatted;
    }

    if (filters.granularity === 'daily' && dailyRows.length > 0) {
      const totals = sumDailyRows(dailyRows);
      const rate = computeEffectiveTaxRate(totals.taxCollectedCents, totals.taxableSalesCents);
      return formatRate(rate);
    }

    if (filters.granularity === 'monthly' && monthlyRows.length > 0) {
      const totals = sumMonthlyRows(monthlyRows);
      const rate = computeEffectiveTaxRate(totals.taxCollectedCents, totals.taxableSalesCents);
      return formatRate(rate);
    }

    return '—';
  }, [summary, dailyRows, monthlyRows, filters.granularity]);

  const avgOrderFormatted = useMemo(() => {
    return summary !== null ? summary.avgOrderFormatted : '—';
  }, [summary]);

  const hasOrders = summary !== null ? summary.ordersCount > 0 : periodRows.length > 0;
  const hasDisputedOrders = summary !== null ? summary.disputedOrdersCount > 0 : false;

  const fetchSummaryAndPeriod = useCallback(
    async (currentFilters: TaxReportFilters, signal?: AbortSignal): Promise<void> => {
      const currentDateRangeValidation = validateDateRange(
        currentFilters.dateFrom,
        currentFilters.dateTo,
      );

      if (!currentDateRangeValidation.isValid) {
        return;
      }

      const summaryParams = filtersToSummaryParams(currentFilters);
      const periodParams = filtersToPeriodParams(currentFilters);

      setIsLoadingSummary(true);
      setIsLoadingPeriod(true);
      setSummaryError(null);
      setPeriodError(null);

      try {
        const result = await fetchTaxReportPage(summaryParams, periodParams);

        if (signal?.aborted === true) {
          return;
        }

        if (isTaxApiSuccess(result)) {
          setSummary(result.data.summary);
          setDailyRows(result.data.dailyRows);
          setMonthlyRows(result.data.monthlyRows);
          setLastFetchedAt(new Date());
          return;
        }

        setSummaryError(result.error.message);
        setPeriodError(result.error.message);
      } finally {
        if (signal?.aborted !== true) {
          setIsLoadingSummary(false);
          setIsLoadingPeriod(false);
        }
      }
    },
    [],
  );

  const fetchOrders = useCallback(
    async (
      currentFilters: TaxReportFilters,
      pageOffset = 0,
      signal?: AbortSignal,
    ): Promise<void> => {
      const currentDateRangeValidation = validateDateRange(
        currentFilters.dateFrom,
        currentFilters.dateTo,
      );

      if (!currentDateRangeValidation.isValid) {
        return;
      }

      const params = filtersToOrderParams(currentFilters, DEFAULT_TAX_PAGE_SIZE, pageOffset);

      setIsLoadingOrders(true);
      setOrdersError(null);

      try {
        const result = await fetchTaxOrders(params);

        if (signal?.aborted === true) {
          return;
        }

        if (isTaxApiSuccess(result)) {
          setOrderRows(result.data.rows);
          setPagination(result.data.pagination);
          return;
        }

        setOrdersError(result.error.message);
      } finally {
        if (signal?.aborted !== true) {
          setIsLoadingOrders(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    void fetchSummaryAndPeriod(filters, controller.signal);

    if (filters.granularity === 'orders') {
      void fetchOrders(filters, 0, controller.signal);
    } else {
      setOrderRows([]);
      setPagination(DEFAULT_PAGINATION);
      setIsLoadingOrders(false);
      setOrdersError(null);
    }

    return () => {
      controller.abort();
    };
  }, [filters, fetchSummaryAndPeriod, fetchOrders]);

  const setFilters = useCallback((partial: Partial<TaxReportFilters>): void => {
    setFiltersState((previous) => ({ ...previous, ...partial }));
  }, []);

  const resetFilters = useCallback((): void => {
    setFiltersState({
      ...DEFAULT_TAX_FILTERS,
      ...initialFilters,
    });
  }, [initialFilters]);

  const applyDatePreset = useCallback(
    (presetValue: TaxDatePreset): void => {
      const preset = datePresets.find((item) => item.value === presetValue);

      if (preset === undefined || presetValue === 'custom') {
        return;
      }

      setFilters({
        dateFrom: preset.dateFrom,
        dateTo: preset.dateTo,
      });
    },
    [datePresets, setFilters],
  );

  const goToPage = useCallback(
    (page: number): void => {
      const safePage = Math.max(1, page);
      const offset = (safePage - 1) * pagination.pageSize;
      void fetchOrders(filters, offset);
    },
    [filters, pagination.pageSize, fetchOrders],
  );

  const goToNextPage = useCallback((): void => {
    if (pagination.currentPage < pagination.totalPages) {
      goToPage(pagination.currentPage + 1);
    }
  }, [goToPage, pagination.currentPage, pagination.totalPages]);

  const goToPrevPage = useCallback((): void => {
    if (pagination.currentPage > 1) {
      goToPage(pagination.currentPage - 1);
    }
  }, [goToPage, pagination.currentPage]);

  const loadMoreOrders = useCallback((): void => {
    if (pagination.currentPage < pagination.totalPages) {
      goToNextPage();
    }
  }, [goToNextPage, pagination.currentPage, pagination.totalPages]);

  const refresh = useCallback(async (): Promise<void> => {
    await fetchSummaryAndPeriod(filters);

    if (filters.granularity === 'orders') {
      await fetchOrders(filters, pagination.pageOffset);
    }
  }, [filters, pagination.pageOffset, fetchSummaryAndPeriod, fetchOrders]);

  const refreshCache = useCallback(async (): Promise<void> => {
    setIsRefreshing(true);

    try {
      const result = await refreshTaxCache();

      if (!isTaxApiSuccess(result)) {
        return;
      }

      const freshSummaryParams = filtersToSummaryParams(filters, false);
      const freshPeriodParams = filtersToPeriodParams(filters, false);
      const pageResult = await fetchTaxReportPage(freshSummaryParams, freshPeriodParams);

      if (isTaxApiSuccess(pageResult)) {
        setSummary(pageResult.data.summary);
        setDailyRows(pageResult.data.dailyRows);
        setMonthlyRows(pageResult.data.monthlyRows);
        setLastFetchedAt(new Date());
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [filters]);

  const exportCsv = useCallback(async (): Promise<void> => {
    setIsExporting(true);

    try {
      const params = filtersToExportParams(filters);
      const result = await fetchTaxExport(params);

      if (isTaxApiSuccess(result)) {
        const { rows, headers, filename } = result.data;
        const csv = rowsToCsv(headers, rows);
        downloadCsv(csv, filename);
        return;
      }

      setSummaryError(`Export failed: ${result.error.message}`);
    } finally {
      setIsExporting(false);
    }
  }, [filters]);

  const clearErrors = useCallback((): void => {
    setSummaryError(null);
    setPeriodError(null);
    setOrdersError(null);
  }, []);

  return {
    summary,
    dailyRows,
    monthlyRows,
    orderRows,
    periodRows,

    pagination,
    goToPage,
    goToNextPage,
    goToPrevPage,

    filters,
    setFilters,
    resetFilters,
    activePreset,
    datePresets,
    applyDatePreset,
    dateRangeError,

    isLoadingSummary,
    isLoadingPeriod,
    isLoadingOrders,
    isExporting,
    isRefreshing,
    isAnyLoading: isLoadingSummary || isLoadingPeriod || isLoadingOrders,

    summaryError,
    periodError,
    ordersError,
    clearErrors,

    refresh,
    refreshCache,
    exportCsv,
    loadMoreOrders,

    reconciliation,
    lastFetchedAt,
    hasOrders,
    hasDisputedOrders,
    effectiveTaxRateFormatted,
    avgOrderFormatted,
  };
}