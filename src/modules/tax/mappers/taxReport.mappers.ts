// =============================================================================
// src/modules/tax/mappers/taxReport.mappers.ts
//
// Converts raw Supabase RPC/view rows (snake_case, nullable) into
// strongly-typed, UI-safe camelCase models.
//
// Every mapper is a pure function: no side effects, no API calls.
// Formatting helpers are imported from taxTotals.ts so this file
// only owns the shape-transformation responsibility.
// =============================================================================

import {
  RawTaxSummaryResult,
  RawTaxDailyRow,
  RawTaxMonthlyRow,
  RawTaxOrderRow,
  RawTaxExportPayload,
  RawTaxExportDailyRow,
  RawTaxExportMonthlyRow,
  RawTaxExportOrderRow,
  TaxSummaryCards,
  TaxDailyRow,
  TaxMonthlyRow,
  TaxOrderRow,
  TaxExportPayload,
  TaxExportDailyRow,
  TaxExportMonthlyRow,
  TaxExportOrderRow,
  TaxGranularity,
  TaxCurrency,
  PaymentStatus,
  DisputeStatus,
  FulfillmentType,
  CardFunding,
} from '../types/tax.types';

import {
  formatCents,
  formatRate,
  centsToNumber,
  safeNumber,
  safeDate,
  formatDateLabel,
  formatMonthLabel,
  formatMonthDisplay,
  buildExportFilename,
  buildExportHeaders,
  centsToDollarsString,
} from '../utils/taxTotals';

// ---------------------------------------------------------------------------
// 1. Summary mapper
//    Maps admin_get_tax_summary() → TaxSummaryCards
// ---------------------------------------------------------------------------

export function mapRawSummaryToCards(
  raw: RawTaxSummaryResult,
  currency: TaxCurrency = 'usd',
): TaxSummaryCards {
  const grossSalesCents = centsToNumber(raw.gross_sales_cents);
  const discountCents = centsToNumber(raw.discount_cents);
  const taxableSalesCents = centsToNumber(raw.taxable_sales_cents);
  const taxCollectedCents = centsToNumber(raw.tax_collected_cents);
  const tipCents = centsToNumber(raw.tip_cents);
  const deliveryFeeCents = centsToNumber(raw.delivery_fee_cents);
  const serviceFeeCents = centsToNumber(raw.service_fee_cents);
  const grossTotalCents = centsToNumber(raw.gross_total_cents);
  const refundedSalesCents = centsToNumber(raw.refunded_sales_cents);
  const refundedTaxCents = centsToNumber(raw.refunded_tax_cents);
  const netSalesCents = centsToNumber(raw.net_sales_cents);
  const netTaxCents = centsToNumber(raw.net_tax_cents);
  const totalStripeFeesCents = centsToNumber(raw.total_stripe_fees_cents);
  const effectiveTaxRatePct = safeNumber(raw.effective_tax_rate_pct);
  const avgOrderCents = safeNumber(raw.avg_order_cents);
  const avgTaxPerOrderCents = safeNumber(raw.avg_tax_per_order_cents);

  const resolvedCurrency = (raw.currency ?? currency) as TaxCurrency;

  return {
    // Period
    dateFrom: safeDate(raw.date_from) ?? new Date(),
    dateTo: safeDate(raw.date_to) ?? new Date(),
    currency: resolvedCurrency,
    periodDays: safeNumber(raw.period_days),

    // Counts
    ordersCount: safeNumber(raw.orders_count),
    disputedOrdersCount: safeNumber(raw.disputed_orders_count),
    refundedOrdersCount: safeNumber(raw.refunded_orders_count),

    // Revenue
    grossSalesCents,
    discountCents,
    taxableSalesCents,
    taxCollectedCents,
    tipCents,
    deliveryFeeCents,
    serviceFeeCents,
    grossTotalCents,

    // Refunds
    refundedSalesCents,
    refundedTaxCents,

    // Net
    netSalesCents,
    netTaxCents,
    totalStripeFeesCents,

    // Derived
    effectiveTaxRatePct,
    avgOrderCents: Math.round(avgOrderCents),
    avgTaxPerOrderCents: Math.round(avgTaxPerOrderCents),

    // Formatted strings
    grossSalesFormatted: formatCents(grossSalesCents, resolvedCurrency),
    taxableSalesFormatted: formatCents(taxableSalesCents, resolvedCurrency),
    taxCollectedFormatted: formatCents(taxCollectedCents, resolvedCurrency),
    refundedTaxFormatted: formatCents(refundedTaxCents, resolvedCurrency),
    netTaxFormatted: formatCents(netTaxCents, resolvedCurrency),
    netSalesFormatted: formatCents(netSalesCents, resolvedCurrency),
    grossTotalFormatted: formatCents(grossTotalCents, resolvedCurrency),
    effectiveTaxRateFormatted: formatRate(effectiveTaxRatePct),
    avgOrderFormatted: formatCents(Math.round(avgOrderCents), resolvedCurrency),
  };
}

// ---------------------------------------------------------------------------
// 2. Daily row mapper
//    Maps admin_tax_daily_summary rows → TaxDailyRow[]
// ---------------------------------------------------------------------------

export function mapRawDailyRow(
  raw: RawTaxDailyRow,
  currency: TaxCurrency = 'usd',
): TaxDailyRow {
  const resolvedCurrency = (raw.currency ?? currency) as TaxCurrency;
  const reportDate = safeDate(raw.report_date) ?? new Date();

  const grossSalesCents = centsToNumber(raw.gross_sales_cents);
  const taxableSalesCents = centsToNumber(raw.taxable_sales_cents);
  const taxCollectedCents = centsToNumber(raw.tax_collected_cents);
  const netSalesCents = centsToNumber(raw.net_sales_cents);
  const netTaxCents = centsToNumber(raw.net_tax_cents);

  return {
    reportDate,
    reportDateLabel: formatDateLabel(reportDate),
    currency: resolvedCurrency,

    ordersCount: safeNumber(raw.orders_count),
    disputedOrdersCount: safeNumber(raw.disputed_orders_count),
    refundedOrdersCount: safeNumber(raw.refunded_orders_count),

    grossSalesCents,
    discountCents: centsToNumber(raw.discount_cents),
    taxableSalesCents,
    taxCollectedCents,
    tipCents: centsToNumber(raw.tip_cents),
    deliveryFeeCents: centsToNumber(raw.delivery_fee_cents),
    serviceFeeCents: centsToNumber(raw.service_fee_cents),
    grossTotalCents: centsToNumber(raw.gross_total_cents),

    refundedSalesCents: centsToNumber(raw.refunded_sales_cents),
    refundedTaxCents: centsToNumber(raw.refunded_tax_cents),

    netSalesCents,
    netTaxCents,
    totalStripeFeesCents: centsToNumber(raw.total_stripe_fees_cents),

    // Formatted
    grossSalesFormatted: formatCents(grossSalesCents, resolvedCurrency),
    taxableSalesFormatted: formatCents(taxableSalesCents, resolvedCurrency),
    taxCollectedFormatted: formatCents(taxCollectedCents, resolvedCurrency),
    netTaxFormatted: formatCents(netTaxCents, resolvedCurrency),
    netSalesFormatted: formatCents(netSalesCents, resolvedCurrency),
  };
}

export function mapRawDailyRows(
  rows: RawTaxDailyRow[],
  currency: TaxCurrency = 'usd',
): TaxDailyRow[] {
  return rows.map((row) => mapRawDailyRow(row, currency));
}

// ---------------------------------------------------------------------------
// 3. Monthly row mapper
//    Maps admin_tax_monthly_summary rows → TaxMonthlyRow[]
// ---------------------------------------------------------------------------

export function mapRawMonthlyRow(
  raw: RawTaxMonthlyRow,
  currency: TaxCurrency = 'usd',
): TaxMonthlyRow {
  const resolvedCurrency = (raw.currency ?? currency) as TaxCurrency;
  const reportMonth = safeDate(raw.report_month) ?? new Date();
  const effectiveTaxRatePct = safeNumber(raw.effective_tax_rate_pct);

  const grossSalesCents = centsToNumber(raw.gross_sales_cents);
  const taxableSalesCents = centsToNumber(raw.taxable_sales_cents);
  const taxCollectedCents = centsToNumber(raw.tax_collected_cents);
  const netSalesCents = centsToNumber(raw.net_sales_cents);
  const netTaxCents = centsToNumber(raw.net_tax_cents);

  return {
    reportMonth,
    reportMonthLabel: raw.report_month_label ?? formatMonthLabel(reportMonth),
    reportMonthDisplay: formatMonthDisplay(reportMonth),
    currency: resolvedCurrency,

    activeDays: safeNumber(raw.active_days),
    ordersCount: safeNumber(raw.orders_count),
    disputedOrdersCount: safeNumber(raw.disputed_orders_count),
    refundedOrdersCount: safeNumber(raw.refunded_orders_count),

    grossSalesCents,
    discountCents: centsToNumber(raw.discount_cents),
    taxableSalesCents,
    taxCollectedCents,
    tipCents: centsToNumber(raw.tip_cents),
    deliveryFeeCents: centsToNumber(raw.delivery_fee_cents),
    serviceFeeCents: centsToNumber(raw.service_fee_cents),
    grossTotalCents: centsToNumber(raw.gross_total_cents),

    refundedSalesCents: centsToNumber(raw.refunded_sales_cents),
    refundedTaxCents: centsToNumber(raw.refunded_tax_cents),

    netSalesCents,
    netTaxCents,
    totalStripeFeesCents: centsToNumber(raw.total_stripe_fees_cents),

    effectiveTaxRatePct,
    effectiveTaxRateFormatted: formatRate(effectiveTaxRatePct),

    // Formatted
    grossSalesFormatted: formatCents(grossSalesCents, resolvedCurrency),
    taxableSalesFormatted: formatCents(taxableSalesCents, resolvedCurrency),
    taxCollectedFormatted: formatCents(taxCollectedCents, resolvedCurrency),
    netTaxFormatted: formatCents(netTaxCents, resolvedCurrency),
    netSalesFormatted: formatCents(netSalesCents, resolvedCurrency),
  };
}

export function mapRawMonthlyRows(
  rows: RawTaxMonthlyRow[],
  currency: TaxCurrency = 'usd',
): TaxMonthlyRow[] {
  return rows.map((row) => mapRawMonthlyRow(row, currency));
}

// ---------------------------------------------------------------------------
// 4. Order row mapper
//    Maps admin_tax_order_breakdown / admin_get_tax_orders rows → TaxOrderRow[]
// ---------------------------------------------------------------------------

export function mapRawOrderRow(
  raw: RawTaxOrderRow,
  currency: TaxCurrency = 'usd',
): TaxOrderRow {
  const resolvedCurrency = (raw.currency ?? currency) as TaxCurrency;
  const capturedDate = safeDate(raw.captured_date) ?? new Date();
  const chargeTimestamp = safeDate(raw.charge_captured_at) ?? capturedDate;

  const grossTotalCents = centsToNumber(raw.gross_total_cents);
  const taxCollectedCents = centsToNumber(raw.tax_collected_cents);
  const netTaxCents = centsToNumber(raw.net_tax_cents);
  const refundedAmountCents = centsToNumber(raw.refunded_amount_cents);

  return {
    orderId: raw.order_id ?? '',
    capturedDate,
    capturedDateLabel: formatDateLabel(capturedDate),
    chargeTimestamp,
    paymentStatus: (raw.payment_status ?? 'pending') as PaymentStatus,
    fulfillmentType: (raw.fulfillment_type ?? 'pickup') as FulfillmentType,
    currency: resolvedCurrency,

    subtotalCents: centsToNumber(raw.subtotal_cents),
    discountCents: centsToNumber(raw.discount_cents),
    taxableSalesCents: centsToNumber(raw.taxable_sales_cents),
    taxCollectedCents,
    tipCents: centsToNumber(raw.tip_cents),
    deliveryFeeCents: centsToNumber(raw.delivery_fee_cents),
    serviceFeeCents: centsToNumber(raw.service_fee_cents),
    grossTotalCents,

    refundedAmountCents,
    refundedTaxEstimateCents: centsToNumber(raw.refunded_tax_estimate_cents),

    netTotalCents: centsToNumber(raw.net_total_cents),
    netTaxCents,

    disputeStatus: (raw.dispute_status ?? 'none') as DisputeStatus,
    isDisputed: raw.is_disputed ?? false,

    cardBrand: raw.card_brand ?? '',
    cardFunding: (raw.card_funding ?? 'unknown') as CardFunding,
    stripeFeesCents: centsToNumber(raw.stripe_fee_cents),
    stripePaymentIntentId: raw.stripe_payment_intent_id ?? '',

    // Formatted
    grossTotalFormatted: formatCents(grossTotalCents, resolvedCurrency),
    taxCollectedFormatted: formatCents(taxCollectedCents, resolvedCurrency),
    netTaxFormatted: formatCents(netTaxCents, resolvedCurrency),
    refundedAmountFormatted: formatCents(refundedAmountCents, resolvedCurrency),
  };
}

export function mapRawOrderRows(
  rows: RawTaxOrderRow[],
  currency: TaxCurrency = 'usd',
): TaxOrderRow[] {
  return rows.map((row) => mapRawOrderRow(row, currency));
}

// ---------------------------------------------------------------------------
// 5. Export payload mapper
//    Maps admin_get_tax_export() JSONB → TaxExportPayload
// ---------------------------------------------------------------------------

export function mapRawExportDailyRow(raw: RawTaxExportDailyRow): TaxExportDailyRow {
  return {
    date: raw.date,
    ordersCount: raw.orders_count,
    grossSales: centsToDollarsString(raw.gross_sales_cents),
    discounts: centsToDollarsString(raw.discount_cents),
    taxableSales: centsToDollarsString(raw.taxable_sales_cents),
    taxCollected: centsToDollarsString(raw.tax_collected_cents),
    refundedSales: centsToDollarsString(raw.refunded_sales_cents),
    refundedTax: centsToDollarsString(raw.refunded_tax_cents),
    netSales: centsToDollarsString(raw.net_sales_cents),
    netTax: centsToDollarsString(raw.net_tax_cents),
    stripeFees: centsToDollarsString(raw.stripe_fees_cents),
  };
}

export function mapRawExportDailyRows(rows: RawTaxExportDailyRow[]): TaxExportDailyRow[] {
  return rows.map((row) => mapRawExportDailyRow(row));
}

export function mapRawExportMonthlyRow(raw: RawTaxExportMonthlyRow): TaxExportMonthlyRow {
  return {
    month: raw.month,
    ordersCount: raw.orders_count,
    grossSales: centsToDollarsString(raw.gross_sales_cents),
    discounts: centsToDollarsString(raw.discount_cents),
    taxableSales: centsToDollarsString(raw.taxable_sales_cents),
    taxCollected: centsToDollarsString(raw.tax_collected_cents),
    refundedSales: centsToDollarsString(raw.refunded_sales_cents),
    refundedTax: centsToDollarsString(raw.refunded_tax_cents),
    netSales: centsToDollarsString(raw.net_sales_cents),
    netTax: centsToDollarsString(raw.net_tax_cents),
    effectiveTaxRate: `${Number(raw.effective_tax_rate_pct).toFixed(2)}%`,
  };
}

export function mapRawExportMonthlyRows(rows: RawTaxExportMonthlyRow[]): TaxExportMonthlyRow[] {
  return rows.map((row) => mapRawExportMonthlyRow(row));
}

export function mapRawExportOrderRow(raw: RawTaxExportOrderRow): TaxExportOrderRow {
  return {
    orderId: raw.order_id,
    date: raw.date,
    subtotal: centsToDollarsString(raw.subtotal_cents),
    discount: centsToDollarsString(raw.discount_cents),
    taxableSales: centsToDollarsString(raw.taxable_sales_cents),
    taxCollected: centsToDollarsString(raw.tax_collected_cents),
    refundedAmount: centsToDollarsString(raw.refunded_amount_cents),
    refundedTaxEstimate: centsToDollarsString(raw.refunded_tax_estimate_cents),
    netTax: centsToDollarsString(raw.net_tax_cents),
    disputeStatus: raw.dispute_status,
    paymentIntentId: raw.payment_intent_id,
  };
}

export function mapRawExportOrderRows(rows: RawTaxExportOrderRow[]): TaxExportOrderRow[] {
  return rows.map((row) => mapRawExportOrderRow(row));
}

function resolveExportGranularity(value: TaxGranularity): TaxGranularity {
  switch (value) {
    case 'daily':
    case 'monthly':
    case 'orders':
      return value;
    default:
      return 'daily';
  }
}

export function mapRawExportPayload(raw: RawTaxExportPayload): TaxExportPayload {
  const granularity = resolveExportGranularity(raw.granularity);
  const currency = raw.currency as TaxCurrency;

  let rows: TaxExportDailyRow[] | TaxExportMonthlyRow[] | TaxExportOrderRow[];
  let headers: string[];

  switch (granularity) {
    case 'daily': {
      const dailyRaw = raw.rows as RawTaxExportDailyRow[];
      rows = mapRawExportDailyRows(dailyRaw);
      headers = buildExportHeaders('daily');
      break;
    }

    case 'monthly': {
      const monthlyRaw = raw.rows as RawTaxExportMonthlyRow[];
      rows = mapRawExportMonthlyRows(monthlyRaw);
      headers = buildExportHeaders('monthly');
      break;
    }

    case 'orders':
    default: {
      const orderRaw = raw.rows as RawTaxExportOrderRow[];
      rows = mapRawExportOrderRows(orderRaw);
      headers = buildExportHeaders('orders');
      break;
    }
  }

  return {
    granularity,
    dateFrom: raw.date_from,
    dateTo: raw.date_to,
    currency,
    generatedAt: new Date(raw.generated_at),
    generatedBy: raw.generated_by,
    filename: buildExportFilename(granularity, raw.date_from, raw.date_to, currency),
    rows,
    headers,
  };
}

// ---------------------------------------------------------------------------
// 6. Pagination extractor
//    Pulls total_rows from the first order row (injected by RPC window fn).
// ---------------------------------------------------------------------------

export function extractTotalRows(rows: RawTaxOrderRow[]): number {
  if (!rows.length) return 0;
  return centsToNumber(rows[0].total_rows ?? 0);
}