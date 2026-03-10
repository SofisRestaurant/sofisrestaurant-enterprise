// =============================================================================
// src/modules/tax/api/taxReports.api.ts
//
// Admin-side tax reporting API layer.
// Wraps every Supabase RPC defined in:
//   20260308000006_create_tax_period_rpc.sql
//
// All functions return TaxApiResult<T> — a discriminated union that forces
// callers to handle both success and error branches explicitly.
// No exceptions are thrown; all errors are captured and returned.
// =============================================================================

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import { supabase as appSupabase } from '@/lib/supabase/supabaseClient';

import type {
  RawTaxSummaryResult,
  RawTaxDailyRow,
  RawTaxMonthlyRow,
  RawTaxOrderRow,
  RawTaxExportPayload,
  TaxSummaryCards,
  TaxDailyRow,
  TaxMonthlyRow,
  TaxOrderRow,
  TaxExportPayload,
  TaxApiResult,
  TaxApiError,
  TaxSummaryQueryParams,
  TaxPeriodQueryParams,
  TaxOrderQueryParams,
  TaxExportQueryParams,
  TaxOrderPaginationParams,
  TaxCurrency,
} from '../types/tax.types';

import { DEFAULT_TAX_PAGE_SIZE, DEFAULT_TAX_CURRENCY } from '../types/tax.types';

import {
  mapRawSummaryToCards,
  mapRawDailyRows,
  mapRawMonthlyRows,
  mapRawOrderRows,
  mapRawExportPayload,
  extractTotalRows,
} from '../mappers/taxReport.mappers';

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------

type Supabase = SupabaseClient;

let _supabase: Supabase | null = null;

/**
 * Injects the Supabase client. Preserved for tests or explicit setup.
 * In production, this module falls back to the shared app singleton.
 */
export function initTaxApiClient(client: Supabase): void {
  _supabase = client;
}

function getClient(): Supabase {
  return _supabase ?? appSupabase;
}

// ---------------------------------------------------------------------------
// Runtime guards
// ---------------------------------------------------------------------------

type UnknownRecord = Record<string, unknown>;

interface ArrayTypeMismatchShape {
  Error: string;
}

interface RpcLikeResponse {
  data: unknown;
  error: PostgrestError | null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPostgrestError(value: unknown): value is PostgrestError {
  return (
    isRecord(value) &&
    typeof value.message === 'string' &&
    typeof value.code === 'string' &&
    'details' in value &&
    'hint' in value
  );
}

function isRpcLikeResponse(value: unknown): value is RpcLikeResponse {
  if (!isRecord(value) || !('data' in value) || !('error' in value)) {
    return false;
  }

  const candidateError = value.error;
  return candidateError === null || isPostgrestError(candidateError);
}

function asRpcLikeResponse(value: unknown): RpcLikeResponse {
  if (isRpcLikeResponse(value)) {
    return value;
  }

  return {
    data: null,
    error: {
      message: 'Invalid RPC response envelope',
      code: 'INVALID_RPC_RESPONSE',
      details: '',
      hint: '',
      name: 'PostgrestError',
    },
  };
}

function isArrayTypeMismatchShape(value: unknown): value is ArrayTypeMismatchShape {
  return isRecord(value) && typeof value.Error === 'string';
}

function isRawTaxSummaryResult(value: unknown): value is RawTaxSummaryResult {
  return isRecord(value);
}

function isRawTaxExportPayload(value: unknown): value is RawTaxExportPayload {
  return isRecord(value);
}

function isRawTaxDailyRow(value: unknown): value is RawTaxDailyRow {
  return isRecord(value);
}

function isRawTaxMonthlyRow(value: unknown): value is RawTaxMonthlyRow {
  return isRecord(value);
}

function isRawTaxOrderRow(value: unknown): value is RawTaxOrderRow {
  return isRecord(value);
}

function asRawTaxDailyRows(value: unknown): RawTaxDailyRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRawTaxDailyRow);
}

function asRawTaxMonthlyRows(value: unknown): RawTaxMonthlyRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRawTaxMonthlyRow);
}

function asRawTaxOrderRows(value: unknown): RawTaxOrderRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRawTaxOrderRow);
}

// ---------------------------------------------------------------------------
// Error normalization
// ---------------------------------------------------------------------------

function normalizeError(error: unknown): TaxApiError['error'] {
  if (error === null || error === undefined) {
    return { message: 'Unknown error', code: 'UNKNOWN' };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: 'ERROR',
    };
  }

  if (isRecord(error)) {
    return {
      message: typeof error.message === 'string' ? error.message : 'Unknown error',
      code: typeof error.code === 'string' ? error.code : 'UNKNOWN',
      details: typeof error.details === 'string' ? error.details : undefined,
      hint: typeof error.hint === 'string' ? error.hint : undefined,
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      code: 'UNKNOWN',
    };
  }

  return {
    message: 'Unknown error',
    code: 'UNKNOWN',
  };
}

function ok<T>(data: T): TaxApiResult<T> {
  return { data, error: null };
}

function fail(error: unknown): TaxApiResult<never> {
  return {
    data: null,
    error: normalizeError(error),
  };
}

function resolveCurrency(currency: TaxCurrency | undefined): TaxCurrency {
  return currency ?? DEFAULT_TAX_CURRENCY;
}

// ---------------------------------------------------------------------------
// 1. fetchTaxSummary
// ---------------------------------------------------------------------------

export async function fetchTaxSummary(
  params: TaxSummaryQueryParams,
): Promise<TaxApiResult<TaxSummaryCards>> {
  try {
    const client = getClient();
    const currency = resolveCurrency(params.p_currency);

    const rawResult: unknown = await client
      .rpc('admin_get_tax_summary', {
        date_from: params.date_from,
        date_to: params.date_to,
        p_currency: currency,
        use_cache: params.use_cache ?? true,
      })
      .single<RawTaxSummaryResult>();

    const result = asRpcLikeResponse(rawResult);

    if (result.error !== null) {
      return fail(result.error);
    }

    if (result.data === null) {
      return fail({ message: 'No summary data returned', code: 'EMPTY' });
    }

    if (!isRawTaxSummaryResult(result.data)) {
      return fail({ message: 'Invalid summary payload', code: 'INVALID_PAYLOAD' });
    }

    return ok(mapRawSummaryToCards(result.data, currency));
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// 2. fetchTaxYtd
// ---------------------------------------------------------------------------

export async function fetchTaxYtd(
  year?: number,
  currency: TaxCurrency = DEFAULT_TAX_CURRENCY,
): Promise<TaxApiResult<TaxSummaryCards>> {
  try {
    const client = getClient();
    const targetYear = year ?? new Date().getFullYear();

    const rawResult: unknown = await client
      .rpc('admin_get_tax_ytd', {
        p_year: targetYear,
        p_currency: currency,
      })
      .single<RawTaxSummaryResult>();

    const result = asRpcLikeResponse(rawResult);

    if (result.error !== null) {
      return fail(result.error);
    }

    if (result.data === null) {
      return fail({ message: 'No YTD data returned', code: 'EMPTY' });
    }

    if (!isRawTaxSummaryResult(result.data)) {
      return fail({ message: 'Invalid YTD payload', code: 'INVALID_PAYLOAD' });
    }

    return ok(mapRawSummaryToCards(result.data, currency));
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// 3. fetchTaxDailyRows
// ---------------------------------------------------------------------------

export async function fetchTaxDailyRows(
  params: TaxPeriodQueryParams,
): Promise<TaxApiResult<TaxDailyRow[]>> {
  try {
    const client = getClient();
    const currency = resolveCurrency(params.p_currency);

    const rawResult: unknown = await client.rpc('admin_get_tax_daily_rows', {
      date_from: params.date_from,
      date_to: params.date_to,
      p_currency: currency,
      use_cache: params.use_cache ?? true,
    });

    const result = asRpcLikeResponse(rawResult);

    if (result.error !== null) {
      return fail(result.error);
    }

    if (isArrayTypeMismatchShape(result.data)) {
      return fail({
        message: result.data.Error,
        code: 'TYPE_MISMATCH',
      });
    }

    return ok(mapRawDailyRows(asRawTaxDailyRows(result.data), currency));
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// 4. fetchTaxMonthlyRows
// ---------------------------------------------------------------------------

export async function fetchTaxMonthlyRows(
  params: TaxPeriodQueryParams,
): Promise<TaxApiResult<TaxMonthlyRow[]>> {
  try {
    const client = getClient();
    const currency = resolveCurrency(params.p_currency);

    const rawResult: unknown = await client.rpc('admin_get_tax_monthly_rows', {
      month_from: params.date_from,
      month_to: params.date_to,
      p_currency: currency,
    });

    const result = asRpcLikeResponse(rawResult);

    if (result.error !== null) {
      return fail(result.error);
    }

    if (isArrayTypeMismatchShape(result.data)) {
      return fail({
        message: result.data.Error,
        code: 'TYPE_MISMATCH',
      });
    }

    return ok(mapRawMonthlyRows(asRawTaxMonthlyRows(result.data), currency));
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// 5. fetchTaxOrders
// ---------------------------------------------------------------------------

export interface FetchTaxOrdersResult {
  rows: TaxOrderRow[];
  pagination: TaxOrderPaginationParams;
}

export async function fetchTaxOrders(
  params: TaxOrderQueryParams,
): Promise<TaxApiResult<FetchTaxOrdersResult>> {
  try {
    const client = getClient();
    const pageSize = params.page_size ?? DEFAULT_TAX_PAGE_SIZE;
    const pageOffset = params.page_offset ?? 0;
    const currency = resolveCurrency(params.p_currency);

    const rawResult: unknown = await client.rpc('admin_get_tax_orders', {
      date_from: params.date_from,
      date_to: params.date_to,
      p_currency: currency,
      fulfillment_filter: params.fulfillment_filter ?? null,
      disputed_only: params.disputed_only ?? false,
      refunded_only: params.refunded_only ?? false,
      page_size: pageSize,
      page_offset: pageOffset,
    });

    const result = asRpcLikeResponse(rawResult);

    if (result.error !== null) {
      return fail(result.error);
    }

    if (isArrayTypeMismatchShape(result.data)) {
      return fail({
        message: result.data.Error,
        code: 'TYPE_MISMATCH',
      });
    }

    const rawRows = asRawTaxOrderRows(result.data);
    const totalRows = extractTotalRows(rawRows);
    const mappedRows = mapRawOrderRows(rawRows, currency);

    const currentPage = Math.floor(pageOffset / pageSize) + 1;
    const totalPages = totalRows === 0 ? 0 : Math.ceil(totalRows / pageSize);

    return ok({
      rows: mappedRows,
      pagination: {
        pageSize,
        pageOffset,
        totalRows,
        currentPage,
        totalPages,
      },
    });
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// 6. fetchTaxExport
// ---------------------------------------------------------------------------

export async function fetchTaxExport(
  params: TaxExportQueryParams,
): Promise<TaxApiResult<TaxExportPayload>> {
  try {
    const client = getClient();

    const rawResult: unknown = await client
      .rpc('admin_get_tax_export', {
        date_from: params.date_from,
        date_to: params.date_to,
        p_currency: params.p_currency ?? DEFAULT_TAX_CURRENCY,
        granularity: params.granularity ?? 'daily',
      })
      .single<RawTaxExportPayload>();

    const result = asRpcLikeResponse(rawResult);

    if (result.error !== null) {
      return fail(result.error);
    }

    if (result.data === null) {
      return fail({ message: 'No export data returned', code: 'EMPTY' });
    }

    if (!isRawTaxExportPayload(result.data)) {
      return fail({ message: 'Invalid export payload', code: 'INVALID_PAYLOAD' });
    }

    return ok(mapRawExportPayload(result.data));
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// 7. refreshTaxCache
// ---------------------------------------------------------------------------

export async function refreshTaxCache(): Promise<TaxApiResult<{ refreshed: true }>> {
  try {
    const client = getClient();

    const rawResult: unknown = await client.rpc('refresh_tax_daily_summary');
    const result = asRpcLikeResponse(rawResult);

    if (result.error !== null) {
      return fail(result.error);
    }

    return ok({ refreshed: true });
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// 8. Composite: fetchTaxReportPage
// ---------------------------------------------------------------------------

export interface TaxReportPageResult {
  summary: TaxSummaryCards;
  dailyRows: TaxDailyRow[];
  monthlyRows: TaxMonthlyRow[];
}

export async function fetchTaxReportPage(
  summaryParams: TaxSummaryQueryParams,
  periodParams: TaxPeriodQueryParams,
): Promise<TaxApiResult<TaxReportPageResult>> {
  try {
    const [summaryResult, dailyResult, monthlyResult] = await Promise.all([
      fetchTaxSummary(summaryParams),
      fetchTaxDailyRows(periodParams),
      fetchTaxMonthlyRows(periodParams),
    ]);

    if (summaryResult.error !== null) {
      return fail(summaryResult.error);
    }

    if (dailyResult.error !== null) {
      return fail(dailyResult.error);
    }

    if (monthlyResult.error !== null) {
      return fail(monthlyResult.error);
    }

    return ok({
      summary: summaryResult.data,
      dailyRows: dailyResult.data,
      monthlyRows: monthlyResult.data,
    });
  } catch (error) {
    return fail(error);
  }
}

// ---------------------------------------------------------------------------
// 9. Type guard helpers for callers
// ---------------------------------------------------------------------------

export function isTaxApiSuccess<T>(
  result: TaxApiResult<T>,
): result is { data: T; error: null } {
  return result.error === null;
}

export function isTaxApiError<T>(
  result: TaxApiResult<T>,
): result is { data: null; error: NonNullable<TaxApiResult<T>['error']> } {
  return result.error !== null;
}