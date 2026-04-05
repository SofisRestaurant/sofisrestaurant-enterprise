import type Stripe from "stripe";
import { asErr, log, nowIso, prefix } from "../logging.ts";
import { parseCheckoutSessionEventRef, parseCents, pickMeta } from "../utils.ts";
import type { DbClient, PendingCartUpdate } from "../types.ts";

// ─── Loyalty release ──────────────────────────────────────────────────────────
//
// Restores points reserved at checkout start when the session is abandoned.
// v2_release_loyalty_reserve is idempotent — safe to call even if the cron ran first.
// Failures are logged but never thrown — the cron fallback handles any slippage.

async function releaseLoyaltyReserve(args: {
  db:            DbClient;
  session:       Stripe.Checkout.Session;
  sessionRef:    { id: string };
  requestId:     string;
}): Promise<void> {
  const { db, session, sessionRef, requestId } = args;

  const loyaltyAccountId = pickMeta(session.metadata, "loyalty_account_id");
  const preSessionKey    = pickMeta(session.metadata, "loyalty_pre_session_key");
  const loyaltyPoints    = parseCents(pickMeta(session.metadata, "loyalty_reserved_points"));

  if (loyaltyAccountId === null || loyaltyPoints <= 0 || preSessionKey === null) return;

  try {
    // Cast RPC name: v2_release_loyalty_reserve exists in DB (migration ran) but
    // won't be in the generated TS type union until `supabase gen types` is re-run.
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
        sessionId: prefix(sessionRef.id),
        accountId: prefix(loyaltyAccountId),
        points:    loyaltyPoints,
        pgCode:    error.code ?? null,
        error:     error.message,
      });
      return;
    }

    // RPC returns TABLE(released boolean, points_restored integer, new_balance integer).
    // The Supabase client returns this as an array of row objects.
    // Cast through unknown to access typed properties safely.
    type ReleaseRow = { released: boolean; points_restored: number; new_balance: number };
    const rawRow  = Array.isArray(data) ? data[0] : data;
    const row     = rawRow as unknown as ReleaseRow | null;

    const released   = row?.released === true;
    const restored   = typeof row?.points_restored === "number" ? row.points_restored : 0;
    const newBalance = typeof row?.new_balance     === "number" ? row.new_balance     : 0;

    if (released) {
      log("info", "webhook_loyalty_reserve_released", {
        requestId,
        sessionId:      prefix(sessionRef.id),
        accountId:      prefix(loyaltyAccountId),
        pointsRestored: restored,
        newBalance,
      });
    } else {
      // released=false: no reserve found, or already released/finalized — safe no-op
      log("info", "webhook_loyalty_release_no_op", {
        requestId,
        sessionId: prefix(sessionRef.id),
        accountId: prefix(loyaltyAccountId),
      });
    }
  } catch (error) {
    log("warn", "webhook_loyalty_release_exception", {
      requestId,
      sessionId: prefix(sessionRef.id),
      accountId: prefix(loyaltyAccountId),
      error:     asErr(error),
    });
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleCheckoutSessionExpired(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const sessionRef = parseCheckoutSessionEventRef(event);

  if (sessionRef === null) {
    log("warn", "webhook_session_expired_invalid_payload", {
      requestId,
      eventId: prefix(event.id),
    });
    return;
  }

  // The event payload contains the full CheckoutSession object in event.data.object.
  // Cast is safe: Stripe always sends a complete session on this event type.
  const session = event.data.object as Stripe.Checkout.Session;

  // ── Pending cart cleanup (existing logic — unchanged) ─────────────────────
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
  } catch (error) {
    log("warn", "webhook_session_expired_exception", {
      requestId,
      sessionId: prefix(sessionRef.id),
      error:     asErr(error),
    });
  }

  // ── Loyalty release ────────────────────────────────────────────────────────
  await releaseLoyaltyReserve({ db, session, sessionRef, requestId });

  log("info", "webhook_session_expired", {
    requestId,
    sessionId: prefix(sessionRef.id),
  });
}