// =============================================================================
// src/modules/tax/api/index.ts
//
// Clean re-export surface for the tax API module.
// Import from here, not from taxReports.api.ts directly.
// =============================================================================

// ── Core API functions ───────────────────────────────────────────────────────

export {
  // Client initialization
  initTaxApiClient,

  // Individual RPC wrappers
  fetchTaxSummary,
  fetchTaxYtd,
  fetchTaxDailyRows,
  fetchTaxMonthlyRows,
  fetchTaxOrders,
  fetchTaxExport,
  refreshTaxCache,

  // Composite batch loader (summary + period rows in one call)
  fetchTaxReportPage,

  // Type guards
  isTaxApiSuccess,
  isTaxApiError,
} from './taxReports.api';

// ── Result types exported for consumers ─────────────────────────────────────

export type {
  FetchTaxOrdersResult,
  TaxReportPageResult,
} from './taxReports.api';