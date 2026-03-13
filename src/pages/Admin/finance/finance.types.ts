// =============================================================================
// src/features/admin/finance/finance.types.ts
// =============================================================================

export interface DateRange {
  from: string; // ISO 8601
  to: string;
}

export interface FinanceMetrics {
  revenueCents: number;
  orderCount: number;
  avgOrderCents: number;
  refundCents: number;
  refundCount: number;
  taxCents: number;
  grossProfitCents: number;
  netProfitCents: number;
  trendPct: number; // vs previous equivalent period
}

export interface LedgerRow {
  id: string;
  createdAt: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paymentStatus: string;
  orderStatus: string;
  stripeSession: string | null;
}

export interface RevenueBreakdownRow {
  day: string; // ISO date
  revenueCents: number;
  orderCount: number;
  avgOrderCents: number;
}

export type FinancePeriod = 'today' | 'week' | 'month' | 'custom';
