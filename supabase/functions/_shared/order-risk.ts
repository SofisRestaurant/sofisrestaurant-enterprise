// FILE: supabase/functions/_shared/order-risk.ts
// FIXED VERSION
// =============================================================================
// ORDER RISK — pure logic for Deno Edge Functions.
// No Supabase calls. No side effects. No frontend imports.
//
// Imported by:
//   supabase/functions/stripe-webhook/order-creation.ts
//
// DO NOT import from src/ — that path is inaccessible in the Deno sandbox.
//
// SCORING MODEL (additive, capped at 100):
//
//   Factor                        Pts   Condition
//   ─────────────────────────────────────────────────────────────────────────
//   Guest checkout                 30   isGuest === true
//   Missing phone (guest only)     20   isGuest && no phone
//   Large order (≥ $150)           25   chargedCents ≥ 150_00
//   Medium order ($75–$149)        10   chargedCents ≥ 75_00
//   Compound (guest + no phone)    10   isGuest && no phone
//   ─────────────────────────────────────────────────────────────────────────
//
// compoundPts is intentional — it penalises the *combination* of guest+no-phone
// more than either signal alone, which matches real-world fraud patterns.
// It does not double-count: guestPts, missingPhonePts, and compoundPts are
// independent additive terms, each with their own weight.
//
// Auth users can score at most 25 (large order only) → always below HIGH_FLOOR.
// Auth users are therefore never gated by verification.
// =============================================================================

// ─── Public types ──────────────────────────────────────────────────────────────

export interface OrderRiskInput {
  /** Total amount charged in cents (pricing.chargedCents). */
  chargedCents: number;
  /** True when the order was placed through guest checkout (userId === null). */
  isGuest: boolean;
  /** Phone from Stripe customer_details. Null when not collected. */
  customerPhone: string | null;
}

export type OrderRiskLevel = 'low' | 'medium' | 'high';

export type OrderVerificationStatus =
  | 'not_required'
  | 'required'
  | 'verified'
  | 'failed';

export interface OrderRiskResult {
  score: number;                  // 0–100
  level: OrderRiskLevel;
  requiresVerification: boolean;  // true only when level === 'high'
  breakdown: OrderRiskBreakdown;
}

export interface OrderRiskBreakdown {
  guestPts:        number;
  missingPhonePts: number;
  largeOrderPts:   number;
  compoundPts:     number;
}

// ─── Scoring constants ─────────────────────────────────────────────────────────

const THRESHOLDS = {
  LARGE_ORDER_CENTS:  150_00,  // $150.00
  MEDIUM_ORDER_CENTS:  75_00,  // $75.00
} as const;

const WEIGHTS = {
  GUEST:                    30,
  MISSING_PHONE:            20,
  LARGE_ORDER:              25,
  MEDIUM_ORDER:             10,
  COMPOUND_GUEST_NO_PHONE:  10,
} as const;

const TIER_THRESHOLDS = {
  MEDIUM_FLOOR: 30,
  HIGH_FLOOR:   60,
} as const;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normalisePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function scoreToLevel(score: number): OrderRiskLevel {
  if (score >= TIER_THRESHOLDS.HIGH_FLOOR)   return 'high';
  if (score >= TIER_THRESHOLDS.MEDIUM_FLOOR) return 'medium';
  return 'low';
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function evaluateOrderRisk(input: OrderRiskInput): OrderRiskResult {
  const { isGuest } = input;

  // [FIX] Guard chargedCents against NaN, Infinity, and negative values.
  // Any of these can arrive if an upstream cast fails (e.g. parseFloat on a
  // malformed snapshot string). Treat as zero — the score still reflects
  // guest/phone signals correctly, and zero-amount risk is a separate concern.
  const chargedCents = Number.isFinite(input.chargedCents) && input.chargedCents >= 0
    ? input.chargedCents
    : 0;

  const hasPhone = normalisePhone(input.customerPhone) !== null;

  const guestPts        = isGuest ? WEIGHTS.GUEST : 0;
  const missingPhonePts = isGuest && !hasPhone ? WEIGHTS.MISSING_PHONE : 0;
  const largeOrderPts   =
    chargedCents >= THRESHOLDS.LARGE_ORDER_CENTS  ? WEIGHTS.LARGE_ORDER  :
    chargedCents >= THRESHOLDS.MEDIUM_ORDER_CENTS ? WEIGHTS.MEDIUM_ORDER :
    0;
  const compoundPts     = isGuest && !hasPhone ? WEIGHTS.COMPOUND_GUEST_NO_PHONE : 0;

  const score = Math.min(guestPts + missingPhonePts + largeOrderPts + compoundPts, 100);
  const level = scoreToLevel(score);

  return {
    score,
    level,
    requiresVerification: level === 'high',
    breakdown: { guestPts, missingPhonePts, largeOrderPts, compoundPts },
  };
}

export function deriveVerificationStatus(result: OrderRiskResult): OrderVerificationStatus {
  return result.requiresVerification ? 'required' : 'not_required';
}