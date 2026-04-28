// supabase/functions/stripe-webhook/handlers/checkout-session-expired.ts
// =============================================================================
// Phase 2 hardened:
//   - checkEventIdempotency() is first; DB errors throw (Stripe will retry).
//   - Metadata is parsed via parseCheckoutMetadata().
//   - Loyalty release uses validated ParsedCheckoutMetadata fields.
//   - Cart cleanup runs regardless of metadata parse outcome (the cart must
//     be expired even if metadata is malformed; loyalty release is skipped).
// =============================================================================

import type Stripe from "stripe";
import { asErr, log, nowIso, prefix } from "../logging.ts";
import { parseCheckoutSessionEventRef } from "../utils.ts";
import type { DbClient, PendingCartUpdate } from "../types.ts";
import { parseCheckoutMetadata } from "../shared/metadata.ts";
import { checkEventIdempotency } from "../shared/idempotency.ts";

// ─── Loyalty release ──────────────────────────────────────────────────────────
// Called only when all three loyalty fields are present and valid.
// v2_release_loyalty_reserve is idempotent — safe to call even if the cron ran first.

async function releaseLoyaltyReserve(args: {
  db:            DbClient;
  sessionId:     string;
  preSessionKey: string;
  accountId:     string;
  points:        number;
  requestId:     string;
}): Promise<void> {
  const { db, sessionId, preSessionKey, accountId, points, requestId } = args;

  try {
    const { data, error } = await db.rpc(
      "v2_release_loyalty_reserve" as never,
      {
        p_stripe_session_id: preSessionKey,
        p_reason:            "checkout_session_expired",
      } as never,
    );

    if (error !== null) {
      log("warn", "webhook_loyalty_release_rpc_failed", {
        requestId,
        sessionId: prefix(sessionId),
        accountId: prefix(accountId),
        points,
        pgCode:    error.code ?? null,
        error:     error.message,
      });
      return;
    }

    type ReleaseRow = {
      released:        boolean;
      points_restored: number;
      new_balance:     number;
    };
    const rawRow  = Array.isArray(data) ? data[0] : data;
    const row     = rawRow as unknown as ReleaseRow | null;

    const released   = row?.released === true;
    const restored   = typeof row?.points_restored === "number" ? row.points_restored : 0;
    const newBalance = typeof row?.new_balance      === "number" ? row.new_balance     : 0;

    if (released) {
      log("info", "webhook_loyalty_reserve_released", {
        requestId,
        sessionId:      prefix(sessionId),
        accountId:      prefix(accountId),
        pointsRestored: restored,
        newBalance,
      });
    } else {
      // released=false: no reserve found, or already released/finalized — safe no-op.
      log("info", "webhook_loyalty_release_no_op", {
        requestId,
        sessionId: prefix(sessionId),
        accountId: prefix(accountId),
      });
    }
  } catch (err) {
    log("warn", "webhook_loyalty_release_exception", {
      requestId,
      sessionId: prefix(sessionId),
      accountId: prefix(accountId),
      error:     asErr(err),
    });
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleCheckoutSessionExpired(
  db:        DbClient,
  event:     Stripe.Event,
  requestId: string,
): Promise<void> {
  // ── 1. Idempotency guard — MUST be first ──────────────────────────────────
  const idempotency = await checkEventIdempotency(
    db,
    event.id,
    event.type,
    requestId,
  );
  if (idempotency.alreadyProcessed) return;
  if (idempotency.dbError) {
    throw new Error(`webhook_idempotency_failed:${event.id} — ${idempotency.error}`);
  }

  // ── 2. Session reference ───────────────────────────────────────────────────
  const sessionRef = parseCheckoutSessionEventRef(event);
  if (sessionRef === null) {
    log("warn", "webhook_session_expired_invalid_payload", {
      requestId,
      eventId: prefix(event.id),
    });
    return;
  }

  // Stripe always provides the full CheckoutSession object on this event type.
  const session = event.data.object as Stripe.Checkout.Session;

  // ── 3. Parse metadata ──────────────────────────────────────────────────────
  // Parse before any side effects so loyalty decisions use validated data.
  // Cart cleanup (below) runs even on parse failure — the cart must expire.
  const metaResult = parseCheckoutMetadata(session.metadata, requestId);

  // ── 4. Pending cart cleanup ────────────────────────────────────────────────
  // Runs regardless of metadata parse outcome.
  try {
    const { error } = await db
      .from("pending_carts")
      .update({ expires_at: nowIso() } satisfies PendingCartUpdate)
      .eq("stripe_session_id", sessionRef.id)
      .is("consumed_at", null);

    if (error !== null) {
      log("warn", "webhook_session_expired_cart_cleanup_failed", {
        requestId,
        sessionId: prefix(sessionRef.id),
        code:      error.code ?? null,
      });
    }
  } catch (err) {
    log("warn", "webhook_session_expired_exception", {
      requestId,
      sessionId: prefix(sessionRef.id),
      error:     asErr(err),
    });
  }

  // ── 5. Loyalty release ─────────────────────────────────────────────────────
  // Skipped when metadata is invalid — we can't safely identify which reserve
  // to release without all three required loyalty fields.
  if (metaResult.ok) {
    const meta = metaResult.value;
    const {
      loyaltyAccountId,
      loyaltyPreSessionKey,
      loyaltyReservedPoints,
    } = meta;

    if (
      loyaltyAccountId     !== null &&
      loyaltyPreSessionKey !== null &&
      (loyaltyReservedPoints ?? 0) > 0
    ) {
      await releaseLoyaltyReserve({
        db,
        sessionId:     sessionRef.id,
        preSessionKey: loyaltyPreSessionKey,
        accountId:     loyaltyAccountId,
        points:        loyaltyReservedPoints ?? 0,
        requestId,
      });
    }
  } else {
    log("info", "webhook_session_expired_loyalty_release_skipped", {
      requestId,
      sessionId: prefix(sessionRef.id),
      reason:    metaResult.message,
    });
  }

  log("info", "webhook_session_expired", {
    requestId,
    sessionId: prefix(sessionRef.id),
  });
}