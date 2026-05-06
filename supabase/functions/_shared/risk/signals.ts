// =============================================================================
// supabase/functions/_shared/risk/signals.ts
// Pre-checkout risk engine — individual signal evaluators.
//
// CONTRACT:
//   All functions are pure. No I/O, no DB calls, no side effects.
//   Each function evaluates exactly one logical signal group.
//   Return value is always a non-negative integer point contribution.
//
// ADD NEW SIGNALS HERE:
//   1. Export a new evaluateXxxSignal() function below.
//   2. Add a corresponding WEIGHT constant in constants.ts.
//   3. Call the function in scoring.ts and include its result in the breakdown.
//   No other files need to change.
// =============================================================================

import { ORDER, RISK_THRESHOLDS, TRUST, VELOCITY, WEIGHTS } from './constants.ts';

// ─── Trust bypass ─────────────────────────────────────────────────────────────
//
// Returns true when the authenticated user qualifies for the unconditional
// allow bypass. Guests are permanently ineligible — isGuest === true always
// returns false regardless of paidOrderCount or accountAgeDays.

export function evaluateTrustBypass(
  isGuest:        boolean,
  paidOrderCount: number,
  accountAgeDays: number,
): boolean {
  return (
    !isGuest &&
    paidOrderCount >= TRUST.MIN_PAID_ORDERS &&
    accountAgeDays >= TRUST.MIN_ACCOUNT_AGE_DAYS
  );
}

// ─── Guest signal ─────────────────────────────────────────────────────────────

export function evaluateGuestSignal(isGuest: boolean): number {
  return isGuest ? WEIGHTS.GUEST : 0;
}

// ─── Order value signal ───────────────────────────────────────────────────────
//
// Three tiers — mutually exclusive, highest applies.
//
// Guest path ($100+ escalation):
//   WEIGHTS.HIGH_VALUE_GUEST replaces LARGE_ORDER for guest orders at or above
//   ORDER.HIGH_VALUE_CENTS. Combined with WEIGHTS.GUEST, this guarantees a score
//   of exactly RISK_THRESHOLDS.CHALLENGE_FLOOR — enforcing OTP on every first-
//   attempt $100+ guest order regardless of velocity or device history.
//
//   Arithmetic: GUEST(20) + HIGH_VALUE_GUEST(40) = 60 = CHALLENGE_FLOOR.
//
// The returned value is written to RiskBreakdown.largeOrderPts by scoring.ts.
// That field name is preserved for telemetry backward-compat — it carries the
// effective order-value pts for whichever tier fired.

export function evaluateOrderValueSignal(
  isGuest:         boolean,
  orderTotalCents: number,
): number {
  const safeTotal =
    Number.isFinite(orderTotalCents) && orderTotalCents >= 0
      ? orderTotalCents
      : 0;

  if (isGuest && safeTotal >= ORDER.HIGH_VALUE_CENTS) {
    return WEIGHTS.HIGH_VALUE_GUEST;
  }
  if (safeTotal >= ORDER.LARGE_CENTS) {
    return WEIGHTS.LARGE_ORDER;
  }
  if (safeTotal >= ORDER.MEDIUM_CENTS) {
    return WEIGHTS.MEDIUM_ORDER;
  }
  return 0;
}

// ─── IP velocity signal ───────────────────────────────────────────────────────

export function evaluateIpVelocitySignal(ipCheckoutAttempts: number): number {
  return (ipCheckoutAttempts ?? 0) > VELOCITY.IP_LIMIT
    ? WEIGHTS.IP_VELOCITY
    : 0;
}

// ─── Device fingerprint velocity signal ───────────────────────────────────────
//
// Only scores when a fingerprint is present. A missing fingerprint is NOT
// itself penalised — it could indicate a legitimate browser without fingerprintJS.

export function evaluateDeviceVelocitySignal(
  deviceFingerprint:      string | null,
  deviceCheckoutAttempts: number,
): number {
  return deviceFingerprint !== null &&
    (deviceCheckoutAttempts ?? 0) > VELOCITY.DEVICE_LIMIT
    ? WEIGHTS.DEVICE_VELOCITY
    : 0;
}

// ─── Guest email velocity signal ──────────────────────────────────────────────
//
// Applies to guest orders only. Auth users have per-user rate limiting enforced
// upstream by enforceRateLimit() — applying email velocity here would double-count.

export function evaluateEmailVelocitySignal(
  isGuest:               boolean,
  guestEmail:            string | null,
  emailCheckoutAttempts: number,
): number {
  return isGuest &&
    guestEmail !== null &&
    (emailCheckoutAttempts ?? 0) > VELOCITY.EMAIL_LIMIT
    ? WEIGHTS.EMAIL_VELOCITY
    : 0;
}

// ─── New auth account signal ──────────────────────────────────────────────────
//
// Applies to recently created auth accounts with no purchase history.
// Closes the "create account to bypass guest penalties" vector.

export function evaluateNewAccountSignal(
  isGuest:        boolean,
  paidOrderCount: number,
  accountAgeDays: number,
): number {
  return !isGuest &&
    paidOrderCount === 0 &&
    accountAgeDays < TRUST.MIN_ACCOUNT_AGE_DAYS
    ? WEIGHTS.NEW_ACCOUNT
    : 0;
}

// ─── Score cap ────────────────────────────────────────────────────────────────
//
// Applied after all signals are summed. Exposed here so tests can verify
// the cap without importing scoring.ts.

export const MAX_SCORE = 100;

// ─── Future signal placeholders (not yet active) ──────────────────────────────
//
// When ready to activate, implement the function body, add a WEIGHT to
// constants.ts, and add a call in scoring.ts. The placeholder signature
// documents the intended interface.

// export function evaluateDeliveryEscalationSignal(
//   isGuest:   boolean,
//   orderType: string,
// ): number { ... }
//
// export function evaluateRepeatGuestReputationSignal(
//   guestEmailHash:       string | null,
//   cleanOrderCount:      number,
//   lookbackDays:         number,
// ): number { ... }

// The RISK_THRESHOLDS import is unused in the current signal functions but is
// re-exported here so callers that only import signals.ts can also access
// thresholds without a separate constants.ts import.
export { RISK_THRESHOLDS };