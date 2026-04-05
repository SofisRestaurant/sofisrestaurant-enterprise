// supabase/functions/create-checkout/loyalty.ts
// =============================================================================
// LOYALTY CHECKOUT — Server-side validation, capping, and atomic reservation
// =============================================================================
// Invariants enforced here (never on the frontend):
//   1. Live balance fetched fresh from DB — frontend value is ignored entirely.
//   2. Ownership: loyalty_accounts.user_id must match the JWT userId.
//      Mismatch logged at ERROR level — it's a privilege escalation attempt.
//   3. Points capped to min(requested, live_balance, floor(subtotal→pts), MAX).
//      Math.floor on subtotal conversion — never over-allocate.
//   4. Reserve is atomic: FOR UPDATE lock + idempotency_key in the RPC.
//   5. On any failure: applied=false → checkout proceeds at full price.
//      Every skip reason is logged for observability via skip().
//   6. subtotalCents <= 0 is rejected early — no discount on a free order.
// =============================================================================

import type { DbClient } from "./types.ts";
import { log, asErr, prefix } from "./logging.ts";

// ─── Config ───────────────────────────────────────────────────────────────────

const POINTS_PER_DOLLAR: number = (() => {
  const env = Deno.env.get("LOYALTY_POINTS_PER_DOLLAR");
  if (env) {
    const n = Number(env);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 100; // 100 pts = $1.00
})();

const MAX_POINTS_PER_ORDER: number = (() => {
  const env = Deno.env.get("LOYALTY_MAX_POINTS_PER_ORDER");
  if (env) {
    const n = Number(env);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return 10_000; // hard ceiling: ~$100 off per order
})();

// ─── Types ────────────────────────────────────────────────────────────────────

export type LoyaltyIntent = {
  applyPoints:      boolean;
  pointsToRedeem:   number;  // frontend-supplied, untrusted
  loyaltyAccountId: string;  // loyalty_accounts.id (NOT auth.users.id)
};

export type LoyaltyReservation = {
  applied:        true;
  reservedPoints: number;
  discountCents:  number;
  accountId:      string;
  newBalance:     number;
  wasDuplicate:   boolean;
};

export type LoyaltySkipped = {
  applied: false;
  reason:  string;
};

export type LoyaltyResult = LoyaltyReservation | LoyaltySkipped;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert points → cents. Floor: never give more than integer-dollar value. */
function pointsToCents(points: number): number {
  return Math.floor((points / POINTS_PER_DOLLAR) * 100);
}

/**
 * Convert subtotal cents → max redeemable points.
 * Floor: never cap to more points than the subtotal strictly justifies.
 * Example: $10.01 subtotal → floor(10.01 * 100) = 1001 pts cap (not ceil=1001,
 * but for $10.005 → floor=1000 vs ceil=1001 — floor is correct).
 */
function subtotalToMaxPoints(subtotalCents: number): number {
  return Math.floor((subtotalCents / 100) * POINTS_PER_DOLLAR);
}

type ReserveRow = {
  reserved_points: number;
  reserved_cents:  number;
  new_balance:     number;
  was_duplicate:   boolean;
};

function normalizeReserveRow(raw: unknown): ReserveRow | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;

  const reserved_points = typeof r.reserved_points === "number" ? r.reserved_points : 0;
  const reserved_cents  = typeof r.reserved_cents  === "number" ? r.reserved_cents  : 0;
  const new_balance     = typeof r.new_balance     === "number" ? r.new_balance     : 0;

  if (reserved_points <= 0) return null;

  return {
    reserved_points,
    reserved_cents,
    new_balance,
    was_duplicate: r.was_duplicate === true,
  };
}

/**
 * Unified skip: logs every decline with its reason so all paths are observable.
 */
function skip(
  reason: string,
  requestId: string,
  extra?: Record<string, unknown>,
): LoyaltySkipped {
  log("info", "loyalty_checkout_skipped", { requestId, reason, ...extra });
  return { applied: false, reason };
}

// ─── Live balance fetch ───────────────────────────────────────────────────────

async function fetchLiveBalance(args: {
  db:        DbClient;
  accountId: string;
  userId:    string;
  requestId: string;
}): Promise<{ balance: number } | null> {
  const { db, accountId, userId, requestId } = args;

  const { data, error } = await db
    .from("loyalty_accounts")
    .select("id, balance, user_id, status")
    .eq("id", accountId)
    .maybeSingle();

  if (error) {
    log("warn", "loyalty_balance_fetch_failed", {
      requestId, accountId: prefix(accountId), error: error.message,
    });
    return null;
  }

  if (!data) {
    log("warn", "loyalty_account_not_found", {
      requestId, accountId: prefix(accountId),
    });
    return null;
  }

  // Ownership check — logged at ERROR because mismatches are privilege escalation.
  if (data.user_id !== userId) {
    log("error", "loyalty_security_violation_ownership_mismatch", {
      requestId,
      accountId:     prefix(accountId),
      requestUserId: prefix(userId),
    });
    return null;
  }

  if (data.status && data.status !== "active") {
    log("info", "loyalty_account_inactive", {
      requestId, accountId: prefix(accountId), status: data.status,
    });
    return null;
  }

  const balance = typeof data.balance === "number" ? data.balance : 0;
  return { balance };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function applyLoyaltyToCheckout(args: {
  intent:          LoyaltyIntent;
  userId:          string;
  subtotalCents:   number;   // server-computed, after credits — authoritative
  stripeSessionId: string;   // pre-session key — idempotency key in ledger
  db:              DbClient;
  requestId:       string;
}): Promise<LoyaltyResult> {
  const { intent, userId, subtotalCents, stripeSessionId, db, requestId } = args;

  // ── Gate 1: Intent ─────────────────────────────────────────────────────────
  if (!intent.applyPoints)        return skip("not_requested",         requestId);
  if (!intent.loyaltyAccountId)   return skip("missing_account_id",    requestId);
  if (intent.pointsToRedeem <= 0) return skip("zero_points_requested", requestId);
  if (!stripeSessionId)           return skip("missing_session_id",    requestId);

  // ── Gate 2: Subtotal sanity ────────────────────────────────────────────────
  if (subtotalCents <= 0) {
    return skip("subtotal_zero_or_negative", requestId, { subtotalCents });
  }

  // ── Gate 3: Live balance ───────────────────────────────────────────────────
  const account = await fetchLiveBalance({
    db, accountId: intent.loyaltyAccountId, userId, requestId,
  });

  if (!account)             return skip("account_unavailable", requestId);
  if (account.balance <= 0) return skip("zero_balance",        requestId);

  // ── Gate 4: Three-way cap ─────────────────────────────────────────────────
  const cappedToBalance = Math.min(intent.pointsToRedeem, account.balance);
  const maxForSubtotal  = subtotalToMaxPoints(subtotalCents);
  const maxForOrder     = Math.min(maxForSubtotal, MAX_POINTS_PER_ORDER);
  const pointsToReserve = Math.min(cappedToBalance, maxForOrder);

  if (pointsToReserve <= 0) {
    return skip("no_eligible_points_after_capping", requestId, {
      requested: intent.pointsToRedeem, balance: account.balance, maxForSubtotal, maxForOrder,
    });
  }

  if (pointsToCents(pointsToReserve) <= 0) {
    return skip("points_below_minimum_conversion", requestId, { pointsToReserve });
  }

  // ── Reserve atomically ─────────────────────────────────────────────────────
  // Cast the RPC name to `never` to bypass the generated type union — the two
  // new RPCs (v2_reserve_loyalty_points, v2_release_loyalty_reserve) exist in
  // the database after the migration but won't be in the generated TS types
  // until `supabase gen types` is re-run. The cast is safe: the DB has the
  // function and the parameter names match exactly.
  try {
    const { data, error } = await db.rpc(
      "v2_reserve_loyalty_points" as never,
      {
        p_account_id:        intent.loyaltyAccountId,
        p_user_id:           userId,
        p_points:            pointsToReserve,
        p_stripe_session_id: stripeSessionId,
        p_points_per_dollar: POINTS_PER_DOLLAR,
      } as never,
    );

    if (error) {
      log("warn", "loyalty_reserve_rpc_failed", {
        requestId,
        accountId: prefix(intent.loyaltyAccountId),
        points:    pointsToReserve,
        pgCode:    error.code ?? null,
        msg:       error.message,
      });

      // check_violation (23514) = insufficient balance race — not our bug
      if (
        error.code === "23514" ||
        (error.message ?? "").includes("Insufficient")
      ) {
        return skip("insufficient_balance_at_reserve_time", requestId, {
          points: pointsToReserve, balance: account.balance,
        });
      }
      return skip("reserve_rpc_error", requestId, { pgCode: error.code });
    }

    const row = normalizeReserveRow(data);
    if (!row) {
      log("warn", "loyalty_reserve_bad_shape", { requestId, rawType: typeof data });
      return skip("reserve_response_invalid", requestId);
    }

    if (row.was_duplicate) {
      log("info", "loyalty_duplicate_reserve_detected", {
        requestId,
        accountId:  prefix(intent.loyaltyAccountId),
        points:     row.reserved_points,
        newBalance: row.new_balance,
      });
    }

    log("info", "loyalty_reserve_committed", {
      requestId,
      accountId:     prefix(intent.loyaltyAccountId),
      points:        row.reserved_points,
      discountCents: row.reserved_cents,
      newBalance:    row.new_balance,
      wasDuplicate:  row.was_duplicate,
    });

    return {
      applied:        true,
      reservedPoints: row.reserved_points,
      discountCents:  row.reserved_cents,
      accountId:      intent.loyaltyAccountId,
      newBalance:     row.new_balance,
      wasDuplicate:   row.was_duplicate,
    };
  } catch (err) {
    log("error", "loyalty_reserve_exception", { requestId, error: asErr(err) });
    return skip("reserve_exception", requestId);
  }
}