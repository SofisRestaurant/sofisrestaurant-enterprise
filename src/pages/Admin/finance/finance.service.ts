// =============================================================================
// src/features/admin/finance/finance.service.ts
// Finance data service — all queries isolated from UI
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';
import type { FinanceMetrics, LedgerRow, RevenueBreakdownRow, DateRange } from './finance.types';

// ─────────────────────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

interface FunctionInvokeResult<T> {
  data: T | null;
  error: unknown;
}

interface RevenueBreakdownResponse {
  rows: RevenueBreakdownRow[];
}

interface OrderLedgerRow {
  id: string;
  created_at: string;
  amount_subtotal: number | null;
  amount_tax: number | null;
  amount_total: number | null;
  payment_status: string;
  status: string;
  stripe_session_id: string | null;
}

interface RefundOrderRow {
  amount_total: number | null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  if (isRecord(error) && typeof error.message === 'string' && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

function asFunctionInvokeResult<T>(value: unknown): FunctionInvokeResult<T> | null {
  if (!isRecord(value) || !('data' in value) || !('error' in value)) {
    return null;
  }

  return {
    data: (value.data as T | null) ?? null,
    error: value.error,
  };
}

function toStripeSession(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

async function invokeGateway<T>(
  body: Record<string, unknown>,
  fallbackMessage: string,
): Promise<T> {
  const rawResult: unknown = await supabase.functions.invoke('admin-gateway', { body });
  const result = asFunctionInvokeResult<T>(rawResult);

  if (result === null) {
    throw new Error(fallbackMessage);
  }

  if (result.error !== null || result.data === null) {
    throw new Error(getErrorMessage(result.error, fallbackMessage));
  }

  return result.data;
}

export async function fetchFinanceMetrics(range: DateRange): Promise<FinanceMetrics> {
  return invokeGateway<FinanceMetrics>(
    { action: 'finance-metrics', from: range.from, to: range.to },
    'Failed to load finance metrics',
  );
}

export async function fetchLedger(range: DateRange): Promise<LedgerRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, created_at, amount_subtotal, amount_tax, amount_total, payment_status, status, stripe_session_id',
    )
    .gte('created_at', range.from)
    .lte('created_at', range.to)
    .order('created_at', { ascending: false })
    .limit(200)
    .returns<OrderLedgerRow[]>();

  if (error !== null) {
    throw new Error(getErrorMessage(error, 'Failed to load ledger'));
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    subtotalCents: row.amount_subtotal ?? 0,
    taxCents: row.amount_tax ?? 0,
    totalCents: row.amount_total ?? 0,
    paymentStatus: row.payment_status,
    orderStatus: row.status,
    stripeSession: toStripeSession(row.stripe_session_id),
  }));
}

export async function fetchRevenueBreakdown(range: DateRange): Promise<RevenueBreakdownRow[]> {
  const data = await invokeGateway<RevenueBreakdownResponse>(
    { action: 'revenue-breakdown', from: range.from, to: range.to },
    'Failed to load revenue breakdown',
  );

  return data.rows;
}

export async function fetchRefundSummary(
  range: DateRange,
): Promise<{ totalCents: number; count: number }> {
  const { data, error, count } = await supabase
    .from('orders')
    .select('amount_total', { count: 'exact' })
    .eq('payment_status', 'refunded')
    .gte('created_at', range.from)
    .lte('created_at', range.to)
    .returns<RefundOrderRow[]>();

  if (error !== null) {
    throw new Error(getErrorMessage(error, 'Failed to load refund summary'));
  }

  const totalCents = (data ?? []).reduce((sum, row) => sum + (row.amount_total ?? 0), 0);

  return {
    totalCents,
    count: count ?? 0,
  };
}