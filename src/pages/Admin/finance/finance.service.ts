// =============================================================================
// src/features/admin/finance/finance.service.ts
// Finance data service — all queries isolated from UI
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient'
import type {
  FinanceMetrics,
  LedgerRow,
  RevenueBreakdownRow,
  DateRange,
} from './finance.types'

// ─────────────────────────────────────────────────────────────────────────────

export async function fetchFinanceMetrics(range: DateRange): Promise<FinanceMetrics> {
  const { data, error } = await supabase.functions.invoke<FinanceMetrics>('admin-gateway', {
    body: { action: 'finance-metrics', from: range.from, to: range.to },
  })
  if (error || !data) throw new Error(error?.message ?? 'Failed to load finance metrics')
  return data
}

export async function fetchLedger(range: DateRange): Promise<LedgerRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, created_at, amount_subtotal, amount_tax, amount_total, payment_status, status, stripe_session_id')
    .gte('created_at', range.from)
    .lte('created_at', range.to)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    id:             row.id as string,
    createdAt:      row.created_at as string,
    subtotalCents:  (row.amount_subtotal as number) ?? 0,
    taxCents:       (row.amount_tax as number)       ?? 0,
    totalCents:     (row.amount_total as number)     ?? 0,
    paymentStatus:  row.payment_status as string,
    orderStatus:    row.status as string,
    stripeSession:  row.stripe_session_id as string | null,
  }))
}

export async function fetchRevenueBreakdown(range: DateRange): Promise<RevenueBreakdownRow[]> {
  const { data, error } = await supabase.functions.invoke<{ rows: RevenueBreakdownRow[] }>(
    'admin-gateway',
    { body: { action: 'revenue-breakdown', from: range.from, to: range.to } },
  )
  if (error || !data) throw new Error(error?.message ?? 'Failed to load revenue breakdown')
  return data.rows
}

export async function fetchRefundSummary(range: DateRange): Promise<{ totalCents: number; count: number }> {
  const { data, error, count } = await supabase
    .from('orders')
    .select('amount_total', { count: 'exact' })
    .eq('payment_status', 'refunded')
    .gte('created_at', range.from)
    .lte('created_at', range.to)

  if (error) throw new Error(error.message)

  const totalCents = (data ?? []).reduce((s, r) => s + ((r.amount_total as number) ?? 0), 0)
  return { totalCents, count: count ?? 0 }
}