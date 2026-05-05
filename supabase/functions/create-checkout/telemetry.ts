// supabase/functions/create-checkout/telemetry.ts
// =============================================================================
// Structured logging and telemetry for the pre-checkout risk gate.
//
// TypeScript fix applied:
//   checkout_risk_events was added by migration 20260505000000 but
//   database.types.ts has not been regenerated yet. db.from() rejects the
//   table name and the insert payload because neither exists in the type union.
//
//   Fix: use fromRiskEvents() accessor which casts through unknown to allow
//   access to the new table. Remove once types are regenerated.
//
// Telemetry contract:
//   insertRiskEvent() is AWAITED at the call site in risk-gate.ts.
//   It is NOT fire-and-forget — doing so would abandon the Promise in the Deno
//   edge runtime before the handler returns a Response.
// =============================================================================

import type { DbClient } from './types.ts';
import { log, prefix } from './logging.ts';
import type {
  PreCheckoutRiskResult,
  RiskBreakdown,
} from '../_shared/pre-checkout-risk.ts';

// ─── Typed DB accessor for checkout_risk_events ───────────────────────────────
//
// checkout_risk_events is not yet in database.types.ts (run gen types to fix).
// RiskEventsInsertBuilder models only the insert operation this file performs.
// RiskEventRow matches the exact column set written by insertRiskEvent() below.
//
// The interface extends PromiseLike so the builder is directly awaitable,
// matching the Supabase query-builder's thenable contract.
//
// Remove this block and replace fromRiskEvents() with db.from('checkout_risk_events')
// once `supabase gen types typescript` has been run after migration 20260505000000.

interface RiskEventRow {
  user_id:            string | null;
  request_ip:         string | null;
  device_fingerprint: string | null;
  guest_email:        string | null;
  risk_score:         number;
  risk_action:        string;
  created_at:         string;
}

interface RiskEventsInsertBuilder extends
  PromiseLike<{ error: { message: string } | null }>
{
  insert(values: RiskEventRow): RiskEventsInsertBuilder;
}

interface RiskEventsDbClient {
  from(table: 'checkout_risk_events'): RiskEventsInsertBuilder;
}

function fromRiskEvents(db: DbClient): RiskEventsInsertBuilder {
  return (db as unknown as RiskEventsDbClient).from('checkout_risk_events');
}

// ─── Risk evaluation ──────────────────────────────────────────────────────────

export function logRiskEvaluation(args: {
  requestId: string;
  userId:    string;
  risk:      PreCheckoutRiskResult;
}): void {
  log('info', 'checkout_risk_evaluated', {
    requestId: args.requestId,
    userId:    prefix(args.userId),
    score:     args.risk.score,
    tier:      args.risk.tier,
    action:    args.risk.action,
    bypass:    args.risk.bypass,
    breakdown: args.risk.breakdown,
  });
}

// ─── Trust bypass ─────────────────────────────────────────────────────────────

export function logTrustBypass(args: {
  requestId:      string;
  userId:         string;
  paidOrderCount: number;
  accountAgeDays: number;
}): void {
  log('info', 'checkout_trust_bypass', {
    requestId:      args.requestId,
    userId:         prefix(args.userId),
    paidOrderCount: args.paidOrderCount,
    accountAgeDays: args.accountAgeDays,
  });
}

// ─── Challenge lifecycle ──────────────────────────────────────────────────────

export function logChallengeIssued(args: {
  requestId: string;
  userId:    string;
  nonce:     string;
  score:     number;
}): void {
  log('info', 'checkout_challenge_issued', {
    requestId: args.requestId,
    userId:    prefix(args.userId),
    nonce:     args.nonce.slice(0, 8),
    score:     args.score,
  });
}

export function logChallengeAccepted(args: {
  requestId: string;
  userId:    string;
  nonce:     string;
}): void {
  log('info', 'checkout_challenge_accepted', {
    requestId: args.requestId,
    userId:    prefix(args.userId),
    nonce:     args.nonce.slice(0, 8),
  });
}

export function logChallengeRejected(args: {
  requestId: string;
  userId:    string;
  reason:    string;
  nonce?:    string;
}): void {
  log('warn', 'checkout_challenge_rejected', {
    requestId: args.requestId,
    userId:    prefix(args.userId),
    reason:    args.reason,
    ...(args.nonce ? { nonce: args.nonce.slice(0, 8) } : {}),
  });
}

export function logCheckoutBlocked(args: {
  requestId: string;
  userId:    string;
  score:     number;
  breakdown: RiskBreakdown;
}): void {
  log('warn', 'checkout_blocked_by_risk', {
    requestId: args.requestId,
    userId:    prefix(args.userId),
    score:     args.score,
    breakdown: args.breakdown,
  });
}

// ─── Velocity event write (must be awaited — see contract above) ──────────────

export async function insertRiskEvent(
  db: DbClient,
  args: {
    userId:            string | null;
    requestIp:         string | null;
    deviceFingerprint: string | null;
    guestEmail:        string | null;
    score:             number;
    action:            string;
    requestId:         string;
  },
): Promise<void> {
  const { requestId, ...row } = args;

  try {
    const { error } = await fromRiskEvents(db).insert({
      user_id:            row.userId,
      request_ip:         row.requestIp,
      device_fingerprint: row.deviceFingerprint,
      guest_email:        row.guestEmail,
      risk_score:         row.score,
      risk_action:        row.action,
      created_at:         new Date().toISOString(),
    });

    if (error) {
      log('warn', 'checkout_risk_event_insert_failed', {
        requestId,
        error: error.message,
      });
      return;
    }

    // TEMPORARY — remove after confirming rows appear in checkout_risk_events.
    console.log('[TELEMETRY_WRITTEN]', {
      requestId,
      score:   row.score,
      action:  row.action,
      isGuest: row.userId === null,
    });
  } catch (err) {
    log('warn', 'checkout_risk_event_insert_exception', {
      requestId,
      error: String(err),
    });
  }
} 