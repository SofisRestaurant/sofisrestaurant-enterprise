// supabase/functions/stripe-webhook/shared/idempotency.ts
// =============================================================================
// Idempotency guard for all webhook handlers.
//
// CONTRACT:
//   checkEventIdempotency() MUST be called as the very first statement in
//   every handler that mutates state. Handlers must not proceed if the result
//   is alreadyProcessed: true or dbError: true.
//
// Failure modes:
//   alreadyProcessed: true  → event was seen before; return immediately.
//   dbError: true           → DB is unavailable or misconfigured; the handler
//                             must throw so Stripe retries. Do NOT proceed —
//                             proceeding without a claim risks double execution
//                             if the DB recovers mid-flight.
//   alreadyProcessed: false, dbError: false → claim taken; proceed normally.
//
// Why fail hard on DB errors (vs. the earlier fail-open design):
//   Fail-open means a transient DB outage can result in duplicate side-effects
//   (double orders, double loyalty redemptions, double kitchen prints). The
//   cost of a missed idempotency claim is higher than a Stripe retry. Stripe
//   retries are free; duplicate orders are not.
//
// Storage:
//   stripe_webhook_events table — event_id is the PRIMARY KEY.
//   Duplicate INSERT → 23505 unique-violation → alreadyProcessed: true.
//   Any other error  → dbError: true.
//
// Required migration (run once, idempotent):
//   CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
//     event_id     TEXT        PRIMARY KEY,
//     event_type   TEXT        NOT NULL,
//     processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
//   );
// =============================================================================

import type { DbClient } from "../types.ts";
import { log, nowIso, prefix } from "../logging.ts";

const PG_UNIQUE_VIOLATION = "23505";

// ─── Result type ──────────────────────────────────────────────────────────────
// Three-way discriminated union — callers must handle all three cases.

export type IdempotencyCheckResult =
  | { alreadyProcessed: true;  dbError: false }
  | { alreadyProcessed: false; dbError: false }
  | { alreadyProcessed: false; dbError: true;  error: string };

/**
 * Attempt to claim the event ID in stripe_webhook_events.
 *
 * Callers MUST:
 *   if (result.alreadyProcessed) return;
 *   if (result.dbError) throw new Error(result.error);
 *   // only now proceed with handler logic
 */
export async function checkEventIdempotency(
  db: DbClient,
  eventId: string,
  eventType: string,
  requestId: string,
): Promise<IdempotencyCheckResult> {
  try {
    const { error } = await db
      .from("stripe_webhook_events")
      .insert({
        event_id:     eventId,
        event_type:   eventType,
        processed_at: nowIso(),
      });

    if (error === null) {
      // Row inserted — claim taken, first-time processing.
      return { alreadyProcessed: false, dbError: false };
    }

    if (error.code === PG_UNIQUE_VIOLATION) {
      log("info", "webhook_event_already_processed", {
        requestId,
        eventId:   prefix(eventId),
        eventType,
      });
      return { alreadyProcessed: true, dbError: false };
    }

    // Any other DB error — fail hard. Do NOT proceed.
    const msg = `idempotency_insert_failed: ${error.message} (code=${error.code ?? "unknown"})`;
    log("error", "webhook_idempotency_insert_failed", {
      requestId,
      eventId:   prefix(eventId),
      eventType,
      code:      error.code ?? null,
      error:     error.message,
    });
    return { alreadyProcessed: false, dbError: true, error: msg };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("error", "webhook_idempotency_check_exception", {
      requestId,
      eventId:   prefix(eventId),
      eventType,
      error:     msg,
    });
    return { alreadyProcessed: false, dbError: true, error: `idempotency_check_exception: ${msg}` };
  }
}