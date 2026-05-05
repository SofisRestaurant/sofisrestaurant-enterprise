// supabase/functions/create-checkout/trust-signals.ts
// =============================================================================
// Pre-checkout trust signal loader.
//
// TypeScript fix applied:
//   loadCountSafe() previously passed a `string` parameter to `db.from()`,
//   which Supabase's generated client rejects because it expects a literal
//   union of known table names. The fix replaces the generic string parameter
//   with a discriminated union of the two tables actually queried
//   ('checkout_risk_events' only at this time), and uses the same
//   `as unknown as { from: ... }` pattern used in challenge-token.ts and
//   telemetry.ts for tables not yet in database.types.ts.
//
//   Remove the untyped accessor once `supabase gen types typescript` has been
//   run after migration 20260505000000.
//
// Performance:
//   All DB queries run in parallel via Promise.allSettled(). Total latency ≈
//   latency of the slowest single query. Each velocity query uses a covering
//   partial index on the created_at column.
// =============================================================================

import type { DbClient } from './types.ts';
import { log, prefix } from './logging.ts';

// ─── Public interface ─────────────────────────────────────────────────────────

export interface TrustSignals {
  paidOrderCount:         number;
  accountAgeDays:         number;
  ipCheckoutAttempts:     number;
  deviceCheckoutAttempts: number;
  emailCheckoutAttempts:  number;
}

const SAFE_DEFAULTS: TrustSignals = {
  paidOrderCount:         0,
  accountAgeDays:         0,
  ipCheckoutAttempts:     0,
  deviceCheckoutAttempts: 0,
  emailCheckoutAttempts:  0,
};

const VELOCITY_WINDOW_MS = 15 * 60 * 1000;

// ─── Typed DB accessor for checkout_risk_events ───────────────────────────────
//
// checkout_risk_events is not yet in database.types.ts (run gen types to fix).
// VelocityCountBuilder models only the read chain loadRiskEventCount uses:
//   .select('id', { count: 'exact', head: true }).eq(col, val).gte(col, val)
//
// The PromiseLike resolve type { count, error } matches the exact destructuring
// in loadRiskEventCount. The interface intentionally omits .insert() and
// .update() — this file never writes to checkout_risk_events.
//
// Remove this block and replace fromRiskEvents() with db.from('checkout_risk_events')
// once `supabase gen types typescript` has been run after migration 20260505000000.

interface VelocityCountBuilder extends
  PromiseLike<{ count: number | null; error: { message: string } | null }>
{
  select(
    columns: string,
    options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean },
  ): VelocityCountBuilder;
  eq(column: string, value: unknown): VelocityCountBuilder;
  gte(column: string, value: unknown): VelocityCountBuilder;
}

interface VelocityDbClient {
  from(table: 'checkout_risk_events'): VelocityCountBuilder;
}

function fromRiskEvents(db: DbClient): VelocityCountBuilder {
  return (db as unknown as VelocityDbClient).from('checkout_risk_events');
}

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loadTrustSignals(args: {
  db:                DbClient;
  userId:            string;
  isGuest:           boolean;
  requestIp:         string | null;
  deviceFingerprint: string | null;
  guestEmail:        string | null;
  requestId:         string;
}): Promise<TrustSignals> {
  const { db, userId, isGuest, requestIp, deviceFingerprint, guestEmail, requestId } = args;

  const signals: TrustSignals = { ...SAFE_DEFAULTS };
  const windowStart = new Date(Date.now() - VELOCITY_WINDOW_MS).toISOString();

  const results = await Promise.allSettled([

    // ── Auth: paid order count + account age ──────────────────────────────
    !isGuest
      ? loadPaidOrderCount(db, userId)
          .then((result) => { Object.assign(signals, result); })
      : Promise.resolve(),

    // ── IP velocity ───────────────────────────────────────────────────────
    requestIp
      ? loadRiskEventCount(db, 'request_ip', requestIp, windowStart)
          .then((count) => { signals.ipCheckoutAttempts = count; })
      : Promise.resolve(),

    // ── Device fingerprint velocity ───────────────────────────────────────
    deviceFingerprint
      ? loadRiskEventCount(db, 'device_fingerprint', deviceFingerprint, windowStart)
          .then((count) => { signals.deviceCheckoutAttempts = count; })
      : Promise.resolve(),

    // ── Guest email velocity ──────────────────────────────────────────────
    guestEmail
      ? loadRiskEventCount(db, 'guest_email', guestEmail.toLowerCase(), windowStart)
          .then((count) => { signals.emailCheckoutAttempts = count; })
      : Promise.resolve(),

  ]);

  for (const result of results) {
    if (result.status === 'rejected') {
      log('warn', 'checkout_trust_signal_query_failed', {
        requestId,
        userId: prefix(userId),
        error:  String(result.reason),
      });
    }
  }

  return signals;
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function loadPaidOrderCount(
  db:     DbClient,
  userId: string,
): Promise<Pick<TrustSignals, 'paidOrderCount' | 'accountAgeDays'>> {
  const { data: rows, count, error } = await db
    .from('orders')
    .select('created_at', { count: 'exact' })
    .eq('customer_uid', userId)
    .eq('payment_status', 'paid')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw new Error(error.message);

  const paidOrderCount = count ?? 0;
  const accountAgeDays =
    paidOrderCount > 0 && rows?.[0]?.created_at
      ? Math.floor((Date.now() - new Date(rows[0].created_at).getTime()) / 86_400_000)
      : 0;

  return { paidOrderCount, accountAgeDays };
}

/**
 * Counts checkout_risk_events rows matching a single column value within the
 * velocity window. Uses the untyped accessor because the table is not yet in
 * the generated types.
 *
 * The column parameter is a typed union of the three columns actually queried —
 * this prevents the generic `string` problem that broke the original
 * `loadCountSafe(db, table: string, column: string, ...)` signature.
 */
async function loadRiskEventCount(
  db:      DbClient,
  column:  'request_ip' | 'device_fingerprint' | 'guest_email',
  value:   string,
  since:   string,
): Promise<number> {
  const { count, error } = await fromRiskEvents(db)
    .select('id', { count: 'exact', head: true })
    .eq(column, value)
    .gte('created_at', since);

  if (error) throw new Error(error.message ?? 'count query failed');
  return count ?? 0;
}