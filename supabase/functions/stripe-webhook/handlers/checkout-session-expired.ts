import type Stripe from "stripe";
import { asErr, log, nowIso, prefix } from "../logging.ts";
import { parseCheckoutSessionEventRef } from "../utils.ts";
import type { DbClient, PendingCartUpdate } from "../types.ts";

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
        code: error.code ?? null,
      });
    }
  } catch (error) {
    log("warn", "webhook_session_expired_exception", {
      requestId,
      sessionId: prefix(sessionRef.id),
      error: asErr(error),
    });
  }

  log("info", "webhook_session_expired", {
    requestId,
    sessionId: prefix(sessionRef.id),
  });
}
