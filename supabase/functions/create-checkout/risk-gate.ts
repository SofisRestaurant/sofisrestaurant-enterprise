// supabase/functions/create-checkout/risk-gate.ts
// =============================================================================
// PATCHES applied (3):
//
// [1] RiskGateOutcome `passed: true` branch now carries riskScore, riskLevel,
//     and verificationStatus. These are threaded by index.ts into Stripe session
//     metadata so the webhook can write them to the order row on creation.
//
// [2] insertRiskEventAsync → insertRiskEvent (awaited). The old `void` pattern
//     abandoned the insert before it completed. Now awaited with try/catch.
//
// [3] console.log statements added at every significant decision point.
//     Remove after confirming expected behaviour in production logs.
// =============================================================================

import { computePreCheckoutRisk } from '../_shared/pre-checkout-risk.ts';
import type { RiskTier }           from '../_shared/pre-checkout-risk.ts';
import { buildIdentityKey }         from '../_shared/crypto.ts';
import { loadTrustSignals }         from './trust-signals.ts';
import {
  verifyChallengeToken,
  buildChallengePayload,
} from './challenge-token.ts';
import {
  logRiskEvaluation,
  logTrustBypass,
  logChallengeIssued,
  logChallengeAccepted,
  logChallengeRejected,
  logCheckoutBlocked,
  insertRiskEvent,           // ← renamed from insertRiskEventAsync
} from './telemetry.ts';
import type { DbClient, ErrorCode } from './types.ts';

// ─── Public types ─────────────────────────────────────────────────────────────
//
// CHANGED: `passed: true` branch now carries the three risk fields required
// for session metadata and order persistence. `verificationStatus` is either
// 'not_required' (low-risk allow) or 'verified' (challenge passed with OTP).

export type VerificationStatus = 'not_required' | 'verified';

export type RiskGateOutcome =
  | {
      passed:             true;
      riskScore:          number;
      riskLevel:          RiskTier;
      verificationStatus: VerificationStatus;
    }
  | {
      passed:      false;
      httpStatus:  number;
      code:        ErrorCode;
      message:     string;
      otpPayload?: { nonce: string; expiresAt: string };
    };

// ─── Gate entry point ─────────────────────────────────────────────────────────

export async function enforcePreCheckoutRisk(args: {
  db:                DbClient;
  userId:            string;
  isGuest:           boolean;
  requestIp:         string | null;
  deviceFingerprint: string | null;
  guestEmail:        string | null;
  orderTotalCents:   number;
  challengeToken:    string | undefined;
  requestId:         string;
}): Promise<RiskGateOutcome> {
  const {
    db, userId, isGuest, requestIp, deviceFingerprint,
    guestEmail, orderTotalCents, challengeToken, requestId,
  } = args;

  // TEMPORARY diagnostic log — confirms the gate is being called with the
  // correct parameters. Remove after confirming execution in production.
  console.log('[RISK_GATE_EXECUTED]', {
    requestId,
    isGuest,
    orderTotalCents,
    hasDeviceFingerprint: deviceFingerprint !== null,
    hasChallengeToken:    !!challengeToken,
    guestEmail:           guestEmail ? `${guestEmail.slice(0, 3)}…` : null,
  });

  // ── Load trust signals (parallel DB queries) ───────────────────────────────
  const signals = await loadTrustSignals({
    db,
    userId,
    isGuest,
    requestIp,
    deviceFingerprint,
    guestEmail,
    requestId,
  });

  // ── Compute risk score ─────────────────────────────────────────────────────
  const risk = computePreCheckoutRisk({
    isGuest,
    orderTotalCents,
    deviceFingerprint,
    requestIp,
    guestEmail,
    paidOrderCount:         signals.paidOrderCount,
    accountAgeDays:         signals.accountAgeDays,
    ipCheckoutAttempts:     signals.ipCheckoutAttempts,
    deviceCheckoutAttempts: signals.deviceCheckoutAttempts,
    emailCheckoutAttempts:  signals.emailCheckoutAttempts,
  });

  logRiskEvaluation({ requestId, userId, risk });

  // TEMPORARY: surface score breakdown in logs. Remove after confirming.
  console.log('[RISK_RESULT]', {
    requestId,
    score:      risk.score,
    tier:       risk.tier,
    action:     risk.action,
    bypass:     risk.bypass,
    breakdown:  risk.breakdown,
    signals: {
      paidOrderCount:         signals.paidOrderCount,
      accountAgeDays:         signals.accountAgeDays,
      ipCheckoutAttempts:     signals.ipCheckoutAttempts,
      deviceCheckoutAttempts: signals.deviceCheckoutAttempts,
      emailCheckoutAttempts:  signals.emailCheckoutAttempts,
    },
  });

  // ── Write velocity event (AWAITED — fixes telemetry persistence) ───────────
  // Must complete before any return so every checkout attempt has a row.
  // Errors are caught inside insertRiskEvent and never fail checkout.
  await insertRiskEvent(db, {
    userId:            isGuest ? null : userId,
    requestIp,
    deviceFingerprint,
    guestEmail,
    score:             risk.score,
    action:            risk.action,
    requestId,
  });

  // ── Trusted bypass ─────────────────────────────────────────────────────────
  if (risk.bypass) {
    logTrustBypass({
      requestId,
      userId,
      paidOrderCount: signals.paidOrderCount,
      accountAgeDays: signals.accountAgeDays,
    });
    return {
      passed:             true,
      riskScore:          0,
      riskLevel:          'low',
      verificationStatus: 'not_required',
    };
  }

  // ── ALLOW ──────────────────────────────────────────────────────────────────
  if (risk.action === 'allow') {
    return {
      passed:             true,
      riskScore:          risk.score,
      riskLevel:          risk.tier,
      verificationStatus: 'not_required',
    };
  }

  // ── BLOCK ──────────────────────────────────────────────────────────────────
  if (risk.action === 'block') {
    logCheckoutBlocked({
      requestId,
      userId,
      score:     risk.score,
      breakdown: risk.breakdown,
    });
    return {
      passed:     false,
      httpStatus: 403,
      code:       'checkout_blocked',
      message:
        'This order could not be processed. ' +
        'Please contact support if you believe this is an error.',
    };
  }

  // ── CHALLENGE ──────────────────────────────────────────────────────────────
  if (challengeToken) {
    const identityKey = await buildIdentityKey(
      isGuest ? null : userId,
      guestEmail,
    );

    if (!identityKey) {
      return issueFreshChallenge(requestId, userId, risk.score, risk.tier);
    }

    const verify = await verifyChallengeToken({
      db,
      challengeToken,
      identityKey,
      requestId,
    });

    if (verify.ok) {
      logChallengeAccepted({ requestId, userId, nonce: verify.nonce });
      // OTP was completed — verificationStatus = 'verified'.
      return {
        passed:             true,
        riskScore:          risk.score,
        riskLevel:          risk.tier,
        verificationStatus: 'verified',
      };
    }

    logChallengeRejected({ requestId, userId, reason: verify.reason });
    // Token invalid/expired — issue a fresh challenge.
  }

  return issueFreshChallenge(requestId, userId, risk.score, risk.tier);
}

// ─── Fresh challenge helper ───────────────────────────────────────────────────

function issueFreshChallenge(
  requestId: string,
  userId:    string,
  score:     number,
  _tier:     RiskTier,   // reserved: will carry tier into challenge payload telemetry
): RiskGateOutcome {
  const { nonce, expiresAt } = buildChallengePayload();
  logChallengeIssued({ requestId, userId, nonce, score });

  return {
    passed:     false,
    httpStatus: 403,
    code:       'otp_required',
    message:    'Phone verification is required to complete this order.',
    otpPayload: { nonce, expiresAt },
  };
}