// =============================================================================
// supabase/functions/_shared/pre-checkout-risk.ts
// Re-export barrel — preserves import paths for all existing consumers.
//
// Internal implementation is modularised into:
//   _shared/risk/types.ts      — type definitions
//   _shared/risk/constants.ts  — all tunable scoring constants
//   _shared/risk/signals.ts    — individual pure signal evaluators
//   _shared/risk/scoring.ts    — computePreCheckoutRisk() implementation
//
// Existing imports (e.g. in create-checkout/risk-gate.ts) require no changes:
//   import { computePreCheckoutRisk } from '../_shared/pre-checkout-risk.ts';
//   import type { RiskTier }           from '../_shared/pre-checkout-risk.ts';
//
// To import specific internals in new code, prefer direct submodule paths:
//   import { RISK_THRESHOLDS } from '../_shared/risk/constants.ts';
//   import { evaluateOrderValueSignal } from '../_shared/risk/signals.ts';
// =============================================================================

export { computePreCheckoutRisk } from './risk/scoring.ts';

export type {
  PreCheckoutRiskInput,
  PreCheckoutRiskResult,
  RiskBreakdown,
  RiskTier,
  RiskAction,
} from './risk/types.ts';