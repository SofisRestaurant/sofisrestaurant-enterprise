// supabase/functions/_shared/riskScore.ts
// =============================================================================
// Risk score computation — used by auth-risk-evaluation and auth-device-trust.
// Pure functions. No Supabase calls. No side effects.
// =============================================================================

export interface RiskFactors {
  deviceUnknown:      boolean;
  geoMismatch:        boolean;   // country differs from last 5 sessions
  rapidAttempts:      boolean;   // > 3 failures in last 15 minutes
  unusualTime:        boolean;   // outside user's normal activity window
  passwordMismatches: number;    // consecutive password failures this session
}

export interface RiskResult {
  score:                number;   // 0–100
  breakdown: {
    deviceUnknownPts:   number;
    geoMismatchPts:     number;
    rapidAttemptsPts:   number;
    unusualTimePts:     number;
    pwMismatchPts:      number;
  };
  requiresDeviceTrust: boolean;  // score >= 20
  requiresMfa:         boolean;  // score >= 50
  requiresStepUp:      boolean;  // score >= 75 (step-up auth or lock)
  tier: 'low' | 'medium' | 'high' | 'critical';
}

const WEIGHTS = {
  deviceUnknown:    20,
  geoMismatch:      25,
  rapidAttempts:    20,
  unusualTime:      10,
  passwordMismatch: 10,   // per mismatch, capped at 25
} as const;

export function computeRiskScore(factors: RiskFactors): RiskResult {
  const deviceUnknownPts  = factors.deviceUnknown  ? WEIGHTS.deviceUnknown  : 0;
  const geoMismatchPts    = factors.geoMismatch    ? WEIGHTS.geoMismatch    : 0;
  const rapidAttemptsPts  = factors.rapidAttempts  ? WEIGHTS.rapidAttempts  : 0;
  const unusualTimePts    = factors.unusualTime    ? WEIGHTS.unusualTime    : 0;
  const pwMismatchPts     = Math.min(factors.passwordMismatches * WEIGHTS.passwordMismatch, 25);

  const score = Math.min(
    deviceUnknownPts + geoMismatchPts + rapidAttemptsPts + unusualTimePts + pwMismatchPts,
    100,
  );

  return {
    score,
    breakdown: { deviceUnknownPts, geoMismatchPts, rapidAttemptsPts, unusualTimePts, pwMismatchPts },
    requiresDeviceTrust: score >= 20,
    requiresMfa:         score >= 50,
    requiresStepUp:      score >= 75,
    tier: score >= 75 ? 'critical'
        : score >= 50 ? 'high'
        : score >= 20 ? 'medium'
        : 'low',
  };
}

/**
 * Determine if the current hour is "unusual" for this user.
 * Returns true if the current UTC hour falls outside the user's normal activity window.
 * normal window = hours that appear in >= 20% of their last 30 logins.
 */
export function isUnusualTime(currentHourUtc: number, recentLoginHours: number[]): boolean {
  if (recentLoginHours.length < 10) return false; // not enough data to judge

  const hourCounts = new Map<number, number>();
  for (const h of recentLoginHours) {
    hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
  }

  const threshold = recentLoginHours.length * 0.2;
  return (hourCounts.get(currentHourUtc) ?? 0) < threshold;
}