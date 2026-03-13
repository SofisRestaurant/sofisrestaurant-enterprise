// =============================================================================
// src/modules/tax/utils/index.ts
// =============================================================================

export {
  // Currency formatting
  formatCents,
  formatCentsCompact,
  formatRate,
  formatPctChange,
  centsToDollarsString,

  // Safe coercion
  centsToNumber,
  safeNumber,
  safeDate,
  dateToYMD,

  // Date formatting
  formatDateLabel,
  formatMonthLabel,
  formatMonthDisplay,

  // Totals
  sumDailyRows,
  sumMonthlyRows,
  computeEffectiveTaxRate,
  computeAvgOrderCents,

  // Reconciliation
  reconcileTaxSummary,
  validateOrderCentsBalance,

  // Date range presets
  buildDatePresets,
  detectDatePreset,
  validateDateRange,

  // Filter → param serialization
  filtersToSummaryParams,
  filtersToPeriodParams,
  filtersToOrderParams,
  filtersToExportParams,

  // Export
  buildExportHeaders,
  buildExportFilename,
  rowsToCsv,
  downloadCsv,

  // Trends
  computeTrend,
  classifyDisputeUrgency,
  formatDisputeDaysRemaining,
} from './taxTotals';

export type { TrendDirection, TrendResult, DisputeUrgency } from './taxTotals';