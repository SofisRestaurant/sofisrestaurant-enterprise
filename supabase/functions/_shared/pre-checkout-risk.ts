// supabase/functions/_shared/pre-checkout-risk.ts
// =============================================================================
// Pre-checkout risk scoring engine — pure functions only.
//
// NO side effects. NO DB calls. NO Stripe calls. NO Supabase calls.
// All inputs must be loaded by callers before invoking computePreCheckoutRisk().
//
// Scoring model (additive, capped at 100):
//
//   Factor                              Pts  Condition
//   ───────────────────────────────────────────────────────────────────────────
//   Guest checkout                       20  isGuest === true
//   Medium order ($40–$74.99)             8  orderTotalCents ≥ 40_00
//   Large order ($75+)                   15  orderTotalCents ≥ 75_00 (replaces medium)
//   IP velocity                          20  ipCheckoutAttempts > 2 in 15 min
//   Device fingerprint velocity          20  deviceCheckoutAttempts > 2 in 15 min
//   Guest email velocity                 15  emailCheckoutAttempts > 1 in 15 min
//   New auth account                     12  !isGuest, 0 paid orders, < 7 days old
//   ───────────────────────────────────────────────────────────────────────────
//
// Trusted user bypass (score forced to 0, action = 'allow'):
//   • !isGuest
//   • paidOrderCount ≥ 3
//   • accountAgeDays ≥ 7
//
// Action thresholds:
//   score < 60   →  allow    (proceed without friction)
//   60 ≤ score < 75  →  challenge  (OTP required before session creation)
//   score ≥ 75   →  block    (hard reject — contact support)
//
// Imported by:
//   create-checkout/risk-gate.ts
// =============================================================================

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PreCheckoutRiskInput {
  // Order and identity context
  isGuest:         boolean;
  orderTotalCents: number;
  deviceFingerprint: string | null;
  requestIp:       string | null;
  guestEmail:      string | null;

  // From loadTrustSignals() — DB-authoritative
  paidOrderCount:         number;
  accountAgeDays:         number;
  ipCheckoutAttempts:     number;
  deviceCheckoutAttempts: number;
  emailCheckoutAttempts:  number;
}

export interface PreCheckoutRiskResult {
  score:   number;
  tier:    RiskTier;
  action:  RiskAction;
  bypass:  boolean;
  breakdown: RiskBreakdown;
}

export type RiskTier   = 'low' | 'medium' | 'high' | 'critical';
export type RiskAction = 'allow' | 'challenge' | 'block';

export interface RiskBreakdown {
  guestPts:        number;
  largeOrderPts:   number;
  ipVelocityPts:   number;
  deviceVelocityPts: number;
  emailVelocityPts:  number;
  newAccountPts:   number;
}

// ─── Scoring constants ────────────────────────────────────────────────────────
//
// Adjust these values to tune the sensitivity of the risk gate.
// Do NOT inline them at call sites — centralised here for maintainability.

const WEIGHTS = {
  GUEST:           20,
  LARGE_ORDER:     15,
  MEDIUM_ORDER:     8,
  IP_VELOCITY:     20,
  DEVICE_VELOCITY: 20,
  EMAIL_VELOCITY:  15,
  NEW_ACCOUNT:     12,
} as const;

const VELOCITY = {
  IP_LIMIT:     2,   // >2 attempts in 15 min from same IP triggers the signal
  DEVICE_LIMIT: 2,   // >2 from same device fingerprint
  EMAIL_LIMIT:  1,   // >1 from same guest email (lower bar — email is cheap to fake)
} as const;

const ORDER = {
  LARGE_CENTS:  75_00,   // $75.00
  MEDIUM_CENTS: 40_00,   // $40.00
} as const;

const TRUST = {
  MIN_PAID_ORDERS:     3,
  MIN_ACCOUNT_AGE_DAYS: 7,
} as const;

const ACTION_THRESHOLDS = {
  CHALLENGE_FLOOR: 60,
  BLOCK_FLOOR:     75,
} as const;

// ─── Scoring engine ───────────────────────────────────────────────────────────

export function computePreCheckoutRisk(
  input: PreCheckoutRiskInput,
): PreCheckoutRiskResult {
  const { isGuest, paidOrderCount, accountAgeDays } = input;

  // ── Trusted user fast path ─────────────────────────────────────────────────
  // Authenticated users with an established purchase history bypass all scoring.
  // paidOrderCount and accountAgeDays are DB-authoritative (never from client).
  const isTrusted =
    !isGuest &&
    paidOrderCount >= TRUST.MIN_PAID_ORDERS &&
    accountAgeDays >= TRUST.MIN_ACCOUNT_AGE_DAYS;

  if (isTrusted) {
    return {
      score:  0,
      tier:   'low',
      action: 'allow',
      bypass: true,
      breakdown: {
        guestPts: 0, largeOrderPts: 0, ipVelocityPts: 0,
        deviceVelocityPts: 0, emailVelocityPts: 0, newAccountPts: 0,
      },
    };
  }

  // ── Order total guard ──────────────────────────────────────────────────────
  // Guard against NaN, Infinity, and negatives — treat them as 0 cents.
  // A zero-cent order still carries guest/velocity risk if applicable.
  const safeTotal =
    Number.isFinite(input.orderTotalCents) && input.orderTotalCents >= 0
      ? input.orderTotalCents
      : 0;

  // ── Additive scoring ───────────────────────────────────────────────────────

  const guestPts = isGuest ? WEIGHTS.GUEST : 0;

  // Large and medium are mutually exclusive — large subsumes medium.
  const largeOrderPts =
    safeTotal >= ORDER.LARGE_CENTS  ? WEIGHTS.LARGE_ORDER  :
    safeTotal >= ORDER.MEDIUM_CENTS ? WEIGHTS.MEDIUM_ORDER :
    0;

  const ipVelocityPts =
    (input.ipCheckoutAttempts ?? 0) > VELOCITY.IP_LIMIT
      ? WEIGHTS.IP_VELOCITY : 0;

  // Device velocity only scores when a fingerprint is present. A missing
  // fingerprint is NOT itself penalised — it could be a legitimate browser
  // without fingerprintJS loaded.
  const deviceVelocityPts =
    input.deviceFingerprint !== null &&
    (input.deviceCheckoutAttempts ?? 0) > VELOCITY.DEVICE_LIMIT
      ? WEIGHTS.DEVICE_VELOCITY : 0;

  // Email velocity applies to guests only — auth users have per-user rate
  // limiting already enforced upstream by enforceRateLimit().
  const emailVelocityPts =
    isGuest &&
    input.guestEmail !== null &&
    (input.emailCheckoutAttempts ?? 0) > VELOCITY.EMAIL_LIMIT
      ? WEIGHTS.EMAIL_VELOCITY : 0;

  // New auth accounts (< 7 days, zero paid orders) get partial guest treatment.
  // This closes the "create account to bypass guest penalties" vector.
  const newAccountPts =
    !isGuest &&
    paidOrderCount === 0 &&
    accountAgeDays < TRUST.MIN_ACCOUNT_AGE_DAYS
      ? WEIGHTS.NEW_ACCOUNT : 0;

  const score = Math.min(
    guestPts + largeOrderPts + ipVelocityPts +
    deviceVelocityPts + emailVelocityPts + newAccountPts,
    100,
  );

  // ── Tier + action ──────────────────────────────────────────────────────────

  const tier: RiskTier =
    score >= ACTION_THRESHOLDS.BLOCK_FLOOR     ? 'critical' :
    score >= ACTION_THRESHOLDS.CHALLENGE_FLOOR ? 'high'     :
    score >= 30                                ? 'medium'   : 'low';

  const action: RiskAction =
    score >= ACTION_THRESHOLDS.BLOCK_FLOOR     ? 'block'     :
    score >= ACTION_THRESHOLDS.CHALLENGE_FLOOR ? 'challenge' : 'allow';

  return {
    score,
    tier,
    action,
    bypass: false,
    breakdown: {
      guestPts,
      largeOrderPts,
      ipVelocityPts,
      deviceVelocityPts,
      emailVelocityPts,
      newAccountPts,
    },
  };
}