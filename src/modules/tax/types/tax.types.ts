 // =============================================================================
// src/modules/tax/types/tax.types.ts
//
// Canonical TypeScript types for the tax reporting module.
// All types mirror the SQL schema / RPC return shapes defined in:
//   - 20260308000001_add_order_payment_columns.sql
//   - 20260308000005_create_tax_reporting_views.sql
//   - 20260308000006_create_tax_period_rpc.sql
//
// Naming conventions:
//   Raw*      → direct Supabase JSON shapes (snake_case, nullable)
//   Tax*      → UI-safe mapped models (camelCase, non-nullable where safe)
//   *Filter   → query param / filter input shapes
//   *Export   → CSV/download export shapes
// =============================================================================

// ---------------------------------------------------------------------------
// 1. Enumerations (mirror SQL enums exactly)
// ---------------------------------------------------------------------------

export type PaymentStatus =
  | 'pending'
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'succeeded'
  | 'canceled'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

export type DisputeStatus =
  | 'none'
  | 'warning_needs_response'
  | 'warning_under_review'
  | 'warning_closed'
  | 'needs_response'
  | 'under_review'
  | 'charge_refunded'
  | 'won'
  | 'lost';

export type FulfillmentType =
  | 'pickup'
  | 'curbside'
  | 'delivery'
  | 'dine_in'
  | 'drive_through'
  | 'ship';

export type CardFunding = 'credit' | 'debit' | 'prepaid' | 'unknown';

export type TaxGranularity = 'daily' | 'monthly' | 'orders';

export type TaxCurrency = 'usd';

// ---------------------------------------------------------------------------
// 2. Raw Supabase row types
//    These match the exact snake_case column/field names returned by
//    Postgres RPCs and views. Always nullable at this layer.
// ---------------------------------------------------------------------------

/**
 * Return shape of admin_get_tax_summary() RPC.
 * Maps to the tax_summary_result composite type in SQL.
 */
export interface RawTaxSummaryResult {
  date_from: string | null;
  date_to: string | null;
  currency: string | null;
  period_days: number | null;

  orders_count: number | null;
  disputed_orders_count: number | null;
  refunded_orders_count: number | null;

  gross_sales_cents: number | null;
  discount_cents: number | null;
  taxable_sales_cents: number | null;
  tax_collected_cents: number | null;
  tip_cents: number | null;
  delivery_fee_cents: number | null;
  service_fee_cents: number | null;
  gross_total_cents: number | null;

  refunded_sales_cents: number | null;
  refunded_tax_cents: number | null;

  net_sales_cents: number | null;
  net_tax_cents: number | null;
  total_stripe_fees_cents: number | null;

  effective_tax_rate_pct: string | number | null;
  avg_order_cents: string | number | null;
  avg_tax_per_order_cents: string | number | null;
}

/**
 * Return shape of admin_tax_daily_summary view / admin_get_tax_daily_rows() RPC.
 */
export interface RawTaxDailyRow {
  report_date: string | null;
  currency: string | null;

  orders_count: number | null;
  disputed_orders_count: number | null;
  refunded_orders_count: number | null;

  gross_sales_cents: number | null;
  discount_cents: number | null;
  taxable_sales_cents: number | null;
  tax_collected_cents: number | null;
  tip_cents: number | null;
  delivery_fee_cents: number | null;
  service_fee_cents: number | null;
  gross_total_cents: number | null;

  refunded_sales_cents: number | null;
  refunded_tax_cents: number | null;

  net_sales_cents: number | null;
  net_tax_cents: number | null;
  total_stripe_fees_cents: number | null;
}

/**
 * Return shape of admin_tax_monthly_summary view / admin_get_tax_monthly_rows() RPC.
 */
export interface RawTaxMonthlyRow {
  report_month: string | null;
  report_month_label: string | null;
  currency: string | null;

  active_days: number | null;
  orders_count: number | null;
  disputed_orders_count: number | null;
  refunded_orders_count: number | null;

  gross_sales_cents: number | null;
  discount_cents: number | null;
  taxable_sales_cents: number | null;
  tax_collected_cents: number | null;
  tip_cents: number | null;
  delivery_fee_cents: number | null;
  service_fee_cents: number | null;
  gross_total_cents: number | null;

  refunded_sales_cents: number | null;
  refunded_tax_cents: number | null;

  net_sales_cents: number | null;
  net_tax_cents: number | null;
  total_stripe_fees_cents: number | null;

  effective_tax_rate_pct: string | number | null;
}

/**
 * Return shape of admin_tax_order_breakdown view / admin_get_tax_orders() RPC.
 */
export interface RawTaxOrderRow {
  order_id: string | null;
  order_created_at: string | null;
  captured_date: string | null;
  charge_captured_at: string | null;
  payment_status: string | null;
  fulfillment_type: string | null;
  currency: string | null;

  subtotal_cents: number | null;
  discount_cents: number | null;
  taxable_sales_cents: number | null;
  tax_collected_cents: number | null;
  tip_cents: number | null;
  delivery_fee_cents: number | null;
  service_fee_cents: number | null;
  gross_total_cents: number | null;

  refunded_amount_cents: number | null;
  refunded_tax_estimate_cents: number | null;

  net_total_cents: number | null;
  net_tax_cents: number | null;

  dispute_status: string | null;
  is_disputed: boolean | null;

  card_brand: string | null;
  card_funding: string | null;
  stripe_fee_cents: number | null;
  stripe_payment_intent_id: string | null;

  // pagination meta
  total_rows?: number | null;
}

/**
 * Raw export JSONB from admin_get_tax_export() RPC.
 */
export interface RawTaxExportPayload {
  granularity: TaxGranularity;
  date_from: string;
  date_to: string;
  currency: string;
  generated_at: string;
  generated_by: string;
  rows: RawTaxExportDailyRow[] | RawTaxExportMonthlyRow[] | RawTaxExportOrderRow[];
}

export interface RawTaxExportDailyRow {
  date: string;
  orders_count: number;
  gross_sales_cents: number;
  discount_cents: number;
  taxable_sales_cents: number;
  tax_collected_cents: number;
  refunded_sales_cents: number;
  refunded_tax_cents: number;
  net_sales_cents: number;
  net_tax_cents: number;
  stripe_fees_cents: number;
}

export interface RawTaxExportMonthlyRow {
  month: string;
  orders_count: number;
  gross_sales_cents: number;
  discount_cents: number;
  taxable_sales_cents: number;
  tax_collected_cents: number;
  refunded_sales_cents: number;
  refunded_tax_cents: number;
  net_sales_cents: number;
  net_tax_cents: number;
  effective_tax_rate_pct: number;
}

export interface RawTaxExportOrderRow {
  order_id: string;
  date: string;
  subtotal_cents: number;
  discount_cents: number;
  taxable_sales_cents: number;
  tax_collected_cents: number;
  refunded_amount_cents: number;
  refunded_tax_estimate_cents: number;
  net_tax_cents: number;
  dispute_status: string;
  payment_intent_id: string;
}

// ---------------------------------------------------------------------------
// 3. UI-safe mapped models (camelCase, display-ready)
// ---------------------------------------------------------------------------

/**
 * Summary card data for the AdminTaxesPage header section.
 * All money values are in cents (integers).
 * Formatted string versions (e.g. grossSalesFormatted) are added by mapper.
 */
export interface TaxSummaryCards {
  // Period
  dateFrom: Date;
  dateTo: Date;
  currency: TaxCurrency;
  periodDays: number;

  // Counts
  ordersCount: number;
  disputedOrdersCount: number;
  refundedOrdersCount: number;

  // Revenue (cents)
  grossSalesCents: number;
  discountCents: number;
  taxableSalesCents: number;
  taxCollectedCents: number;
  tipCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  grossTotalCents: number;

  // Refunds (cents)
  refundedSalesCents: number;
  refundedTaxCents: number;

  // Net (cents)
  netSalesCents: number;
  netTaxCents: number;
  totalStripeFeesCents: number;

  // Derived display values (set by mapper)
  effectiveTaxRatePct: number;
  avgOrderCents: number;
  avgTaxPerOrderCents: number;

  // Formatted strings (set by mapper via formatCents)
  grossSalesFormatted: string;
  taxableSalesFormatted: string;
  taxCollectedFormatted: string;
  refundedTaxFormatted: string;
  netTaxFormatted: string;
  netSalesFormatted: string;
  grossTotalFormatted: string;
  effectiveTaxRateFormatted: string;
  avgOrderFormatted: string;
}

/**
 * A single day row in the period table.
 */
export interface TaxDailyRow {
  reportDate: Date;
  reportDateLabel: string;       // "Mar 8, 2026"
  currency: TaxCurrency;

  ordersCount: number;
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

  // Formatted
  grossSalesFormatted: string;
  taxableSalesFormatted: string;
  taxCollectedFormatted: string;
  netTaxFormatted: string;
  netSalesFormatted: string;
}

/**
 * A single month row in the period table.
 */
export interface TaxMonthlyRow {
  reportMonth: Date;
  reportMonthLabel: string;      // "2026-03"
  reportMonthDisplay: string;    // "March 2026"
  currency: TaxCurrency;

  activeDays: number;
  ordersCount: number;
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

  effectiveTaxRatePct: number;
  effectiveTaxRateFormatted: string;

  // Formatted
  grossSalesFormatted: string;
  taxableSalesFormatted: string;
  taxCollectedFormatted: string;
  netTaxFormatted: string;
  netSalesFormatted: string;
}

/**
 * A single order row in the detailed breakdown table.
 */
export interface TaxOrderRow {
  orderId: string;
  capturedDate: Date;
  capturedDateLabel: string;
  chargeTimestamp: Date;
  paymentStatus: PaymentStatus;
  fulfillmentType: FulfillmentType;
  currency: TaxCurrency;

  subtotalCents: number;
  discountCents: number;
  taxableSalesCents: number;
  taxCollectedCents: number;
  tipCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  grossTotalCents: number;

  refundedAmountCents: number;
  refundedTaxEstimateCents: number;

  netTotalCents: number;
  netTaxCents: number;

  disputeStatus: DisputeStatus;
  isDisputed: boolean;

  cardBrand: string;
  cardFunding: CardFunding;
  stripeFeesCents: number;
  stripePaymentIntentId: string;

  // Formatted
  grossTotalFormatted: string;
  taxCollectedFormatted: string;
  netTaxFormatted: string;
  refundedAmountFormatted: string;
}

// ---------------------------------------------------------------------------
// 4. Export row models (flat, CSV-ready)
// ---------------------------------------------------------------------------

export interface TaxExportDailyRow {
  date: string;
  ordersCount: number;
  grossSales: string;       // formatted dollar string e.g. "1,234.56"
  discounts: string;
  taxableSales: string;
  taxCollected: string;
  refundedSales: string;
  refundedTax: string;
  netSales: string;
  netTax: string;
  stripeFees: string;
}

export interface TaxExportMonthlyRow {
  month: string;
  ordersCount: number;
  grossSales: string;
  discounts: string;
  taxableSales: string;
  taxCollected: string;
  refundedSales: string;
  refundedTax: string;
  netSales: string;
  netTax: string;
  effectiveTaxRate: string;
}

export interface TaxExportOrderRow {
  orderId: string;
  date: string;
  subtotal: string;
  discount: string;
  taxableSales: string;
  taxCollected: string;
  refundedAmount: string;
  refundedTaxEstimate: string;
  netTax: string;
  disputeStatus: string;
  paymentIntentId: string;
}

export type TaxExportRow = TaxExportDailyRow | TaxExportMonthlyRow | TaxExportOrderRow;

/**
 * Complete export payload ready for CSV conversion.
 */
export interface TaxExportPayload {
  granularity: TaxGranularity;
  dateFrom: string;
  dateTo: string;
  currency: TaxCurrency;
  generatedAt: Date;
  generatedBy: string;
  filename: string;
  rows: TaxExportRow[];
  headers: string[];
}

// ---------------------------------------------------------------------------
// 5. Filter input types
// ---------------------------------------------------------------------------

/**
 * Primary filter input used by useTaxReports hook and TaxFiltersBar component.
 */
export interface TaxReportFilters {
  dateFrom: Date;
  dateTo: Date;
  currency: TaxCurrency;
  granularity: TaxGranularity;
  fulfillmentType: FulfillmentType | 'all';
  disputedOnly: boolean;
  refundedOnly: boolean;
}

/**
 * Preset date range shortcuts displayed in TaxFiltersBar.
 */
export type TaxDatePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'custom';

export interface TaxDatePresetOption {
  label: string;
  value: TaxDatePreset;
  dateFrom: Date;
  dateTo: Date;
}

/**
 * Pagination params for the order breakdown table.
 */
export interface TaxOrderPaginationParams {
  pageSize: number;
  pageOffset: number;
  totalRows: number;
  currentPage: number;
  totalPages: number;
}

/**
 * Params passed directly to admin_get_tax_orders RPC.
 */
export interface TaxOrderQueryParams {
  date_from: string;
  date_to: string;
  p_currency: TaxCurrency;
  fulfillment_filter?: FulfillmentType | null;
  disputed_only?: boolean;
  refunded_only?: boolean;
  page_size?: number;
  page_offset?: number;
}

/**
 * Params passed to admin_get_tax_summary RPC.
 */
export interface TaxSummaryQueryParams {
  date_from: string;
  date_to: string;
  p_currency: TaxCurrency;
  use_cache?: boolean;
}

/**
 * Params passed to admin_get_tax_daily_rows / admin_get_tax_monthly_rows RPCs.
 */
export interface TaxPeriodQueryParams {
  date_from: string;
  date_to: string;
  p_currency: TaxCurrency;
  use_cache?: boolean;
}

/**
 * Params passed to admin_get_tax_export RPC.
 */
export interface TaxExportQueryParams {
  date_from: string;
  date_to: string;
  p_currency: TaxCurrency;
  granularity: TaxGranularity;
}

// ---------------------------------------------------------------------------
// 6. API response wrappers
// ---------------------------------------------------------------------------

export interface TaxApiSuccess<T> {
  data: T;
  error: null;
}

export interface TaxApiError {
  data: null;
  error: {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
  };
}

export type TaxApiResult<T> = TaxApiSuccess<T> | TaxApiError;

// ---------------------------------------------------------------------------
// 7. Hook state types (used by useTaxReports)
// ---------------------------------------------------------------------------

export interface TaxReportState {
  summary: TaxSummaryCards | null;
  dailyRows: TaxDailyRow[];
  monthlyRows: TaxMonthlyRow[];
  orderRows: TaxOrderRow[];
  pagination: TaxOrderPaginationParams;
  filters: TaxReportFilters;
  isLoading: boolean;
  isExporting: boolean;
  summaryError: string | null;
  periodError: string | null;
  ordersError: string | null;
  lastFetchedAt: Date | null;
}

/**
 * Reconciliation check result — used to flag data integrity issues.
 */
export interface TaxReconciliationResult {
  isBalanced: boolean;
  deltaNetTaxCents: number;        // should be 0 if reconciled
  deltaNetSalesCents: number;
  expectedNetTaxCents: number;
  actualNetTaxCents: number;
  warningMessage: string | null;
}

// ---------------------------------------------------------------------------
// 8. Default/initial values
// ---------------------------------------------------------------------------

export const DEFAULT_TAX_PAGE_SIZE = 50 as const;
export const DEFAULT_TAX_CURRENCY: TaxCurrency = 'usd';
export const TAX_MAX_DATE_RANGE_DAYS = 366 as const;

export const DEFAULT_TAX_FILTERS: TaxReportFilters = {
  dateFrom: (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    d.setHours(0, 0, 0, 0);
    return d;
  })(),
  dateTo: (() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  })(),
  currency: DEFAULT_TAX_CURRENCY,
  granularity: 'daily',
  fulfillmentType: 'all',
  disputedOnly: false,
  refundedOnly: false,
};

export const DEFAULT_PAGINATION: TaxOrderPaginationParams = {
  pageSize: DEFAULT_TAX_PAGE_SIZE,
  pageOffset: 0,
  totalRows: 0,
  currentPage: 1,
  totalPages: 0,
};