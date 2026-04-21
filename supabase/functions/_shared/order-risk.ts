// supabase/functions/_shared/order-risk.ts
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
//   Large order (≥ $100)           25   chargedCents ≥ 100_00
//   Medium order ($25–$99)         10   chargedCents ≥ 25_00
//   Compound (guest + no phone)    10   isGuest && no phone
//   ─────────────────────────────────────────────────────────────────────────
//
// Tier thresholds (based on order value in cents):
//   score  0–29  → low    → not_required
//   score 30–59  → medium → not_required  (monitored, not gated)
//   score 60+    → high   → required
//
// Score examples after threshold update:
//   Auth user, $120 order, has phone  → 25 pts (large only)    → low
//   Guest, $20 order, has phone       → 30 pts (guest only)    → medium
//   Guest, $20 order, no phone        → 60 pts (guest+missing+compound) → high → gated
//   Guest, $120 order, no phone       → 85 pts                 → high → gated
//   Auth user, any order              → max 25 pts             → always low, never gated
//
// compoundPts is intentional — it penalises the *combination* of guest+no-phone
// more than either signal alone. guestPts, missingPhonePts, and compoundPts are
// independent additive terms, each with their own weight.
//
// IMPORTANT — minimum order enforcement is NOT done here.
// This module only scores fraud risk. Minimum order value ($15 or any other
// amount) must be enforced in create-checkout / create-checkout-guest BEFORE
// a Stripe session is created. Rejecting a paid order post-webhook means a
// customer paid real money and received nothing — that must never happen here.
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
  // [UPDATED] Aligned to owner's business rules:
  //   $100+ → "large" (high risk value)
  //   $25+  → "medium" (routine order range)
  LARGE_ORDER_CENTS:  100_00,   // $100.00
  MEDIUM_ORDER_CENTS:  25_00,   // $25.00
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

  // Guard chargedCents against NaN, Infinity, and negative values.
  // Treat as zero — score still reflects guest/phone signals correctly.
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