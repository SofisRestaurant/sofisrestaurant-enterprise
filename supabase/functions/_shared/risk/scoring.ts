// =============================================================================
// supabase/functions/_shared/risk/scoring.ts
// Pre-checkout risk engine — score aggregation and action resolution.
//
// computePreCheckoutRisk() is the sole public entry point.
// It orchestrates signal evaluation from signals.ts and resolves
// the final tier and action from constants.ts.
//
// This file intentionally contains no magic numbers. All thresholds
// and weights are defined in constants.ts and imported here.
// =============================================================================

import type { PreCheckoutRiskInput, PreCheckoutRiskResult, RiskAction, RiskTier } from './types.ts';
import { RISK_THRESHOLDS } from './constants.ts';
import {
  evaluateDeviceVelocitySignal,
  evaluateEmailVelocitySignal,
  evaluateGuestSignal,
  evaluateIpVelocitySignal,
  evaluateNewAccountSignal,
  evaluateOrderValueSignal,
  evaluateTrustBypass,
  MAX_SCORE,
} from './signals.ts';

// ─── Tier resolution ──────────────────────────────────────────────────────────
//
// Maps a numeric score to a human-readable risk tier for telemetry and logging.
// Tier boundaries are co-located with action thresholds in RISK_THRESHOLDS so
// they never drift apart.

function resolveRiskTier(score: number): RiskTier {
  if (score >= RISK_THRESHOLDS.BLOCK_FLOOR)     return 'critical';
  if (score >= RISK_THRESHOLDS.CHALLENGE_FLOOR) return 'high';
  if (score >= RISK_THRESHOLDS.MEDIUM_FLOOR)    return 'medium';
  return 'low';
}

// ─── Action resolution ────────────────────────────────────────────────────────

function resolveRiskAction(score: number): RiskAction {
  if (score >= RISK_THRESHOLDS.BLOCK_FLOOR)     return 'block';
  if (score >= RISK_THRESHOLDS.CHALLENGE_FLOOR) return 'challenge';
  return 'allow';
}

// ─── Main scoring function ────────────────────────────────────────────────────

export function computePreCheckoutRisk(
  input: PreCheckoutRiskInput,
): PreCheckoutRiskResult {
  const { isGuest, paidOrderCount, accountAgeDays } = input;

  // ── Trusted user bypass ────────────────────────────────────────────────────
  // Authenticated users with established purchase history bypass all scoring.
  // paidOrderCount and accountAgeDays are DB-authoritative — never from client.
  if (evaluateTrustBypass(isGuest, paidOrderCount, accountAgeDays)) {
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

  // ── Signal evaluation ──────────────────────────────────────────────────────
  // Each evaluator is independent and testable in isolation.
  const guestPts          = evaluateGuestSignal(isGuest);
  const largeOrderPts     = evaluateOrderValueSignal(isGuest, input.orderTotalCents);
  const ipVelocityPts     = evaluateIpVelocitySignal(input.ipCheckoutAttempts);
  const deviceVelocityPts = evaluateDeviceVelocitySignal(
    input.deviceFingerprint, input.deviceCheckoutAttempts,
  );
  const emailVelocityPts  = evaluateEmailVelocitySignal(
    isGuest, input.guestEmail, input.emailCheckoutAttempts,
  );
  const newAccountPts     = evaluateNewAccountSignal(isGuest, paidOrderCount, accountAgeDays);

  // ── Score aggregation ──────────────────────────────────────────────────────
  const score = Math.min(
    guestPts + largeOrderPts + ipVelocityPts +
    deviceVelocityPts + emailVelocityPts + newAccountPts,
    MAX_SCORE,
  );

  return {
    score,
    tier:   resolveRiskTier(score),
    action: resolveRiskAction(score),
    bypass: false,
    breakdown: {
      guestPts,
      largeOrderPts,    // carries HIGH_VALUE_GUEST pts (40) for $100+ guest orders
      ipVelocityPts,
      deviceVelocityPts,
      emailVelocityPts,
      newAccountPts,
    },
  };
}