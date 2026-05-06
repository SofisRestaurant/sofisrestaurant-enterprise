// =============================================================================
// supabase/functions/_shared/risk/types.ts
// Pre-checkout risk engine — shared type definitions.
//
// Imported by: constants.ts, signals.ts, scoring.ts, pre-checkout-risk.ts
//
// RiskBreakdown field notes:
//   largeOrderPts — preserved name for telemetry backward-compatibility.
//   For guest orders >= $100, this field carries WEIGHTS.HIGH_VALUE_GUEST (40)
//   rather than WEIGHTS.LARGE_ORDER (15). The field represents "effective
//   order-value points" for the winning tier, not literally the large-order weight.
// =============================================================================

export interface PreCheckoutRiskInput {
  // Identity and order context
  isGuest:           boolean;
  orderTotalCents:   number;
  deviceFingerprint: string | null;
  requestIp:         string | null;
  guestEmail:        string | null;

  // DB-authoritative signals — loaded by loadTrustSignals() before this call
  paidOrderCount:         number;
  accountAgeDays:         number;
  ipCheckoutAttempts:     number;
  deviceCheckoutAttempts: number;
  emailCheckoutAttempts:  number;
}

export interface PreCheckoutRiskResult {
  score:     number;
  tier:      RiskTier;
  action:    RiskAction;
  bypass:    boolean;
  breakdown: RiskBreakdown;
}

export type RiskTier   = 'low' | 'medium' | 'high' | 'critical';
export type RiskAction = 'allow' | 'challenge' | 'block';

export interface RiskBreakdown {
  guestPts:          number;
  largeOrderPts:     number;  // effective order-value pts (medium / large / high-value tier)
  ipVelocityPts:     number;
  deviceVelocityPts: number;
  emailVelocityPts:  number;
  newAccountPts:     number;
}