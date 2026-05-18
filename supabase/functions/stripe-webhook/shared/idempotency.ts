// supabase/functions/stripe-webhook/shared/idempotency.ts
// =============================================================================
// Idempotency guard for all webhook handlers.
//
// [PATCH] Now uses stripe_webhook_events.status and handler_error columns:
//   - Claim:    INSERT with status='processing'
//   - Success:  UPDATE to status='completed' via markEventCompleted()
//   - Failure:  UPDATE to status='failed' + handler_error, then DELETE
//               (delete preserves retry behavior; the status/error write
//               is for observability in case the delete itself fails)
//
// CONTRACT:
//   checkEventIdempotency() MUST be called as the very first statement in
//   every handler that mutates state. Handlers must not proceed if the result
//   is alreadyProcessed: true or dbError: true.
//
// Failure modes:
//   alreadyProcessed: true  → event was seen before; return immediately.
//   dbError: true           → DB is unavailable or misconfigured; the handler
//                             must throw so Stripe retries.
//   alreadyProcessed: false, dbError: false → claim taken; proceed normally.
//
// Storage:
//   stripe_webhook_events table — event_id is the PRIMARY KEY.
//   Duplicate INSERT → 23505 unique-violation → alreadyProcessed: true.
// =============================================================================

import type { DbClient } from "../types.ts";
import { log, nowIso, prefix } from "../logging.ts";

const PG_UNIQUE_VIOLATION = "23505";

// ─── Result type ──────────────────────────────────────────────────────────────

export type IdempotencyCheckResult =
  | { alreadyProcessed: true;  dbError: false }
  | { alreadyProcessed: false; dbError: false }
  | { alreadyProcessed: false; dbError: true;  error: string };

/**
 * Attempt to claim the event ID in stripe_webhook_events.
 *
 * [PATCH] Inserts with status='processing'. On handler success, the caller
 * must call markEventCompleted() to flip to 'completed'.
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
        status:       "processing",
      });

    if (error === null) {
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

/**
 * Mark an event as successfully completed.
 *
 * [PATCH] New function. Called after all side effects succeed.
 * Updates status from 'processing' to 'completed'. Best-effort — failure
 * here does not affect correctness (the row exists, preventing re-processing).
 */
export async function markEventCompleted(
  db: DbClient,
  eventId: string,
  requestId: string,
): Promise<void> {
  try {
    const { error } = await db
      .from("stripe_webhook_events")
      .update({
        status:       "completed",
        processed_at: nowIso(),
      })
      .eq("event_id", eventId);

    if (error) {
      log("warn", "webhook_idempotency_complete_failed", {
        requestId,
        eventId: prefix(eventId),
        code:    error.code ?? null,
        error:   error.message,
      });
    }
  } catch (err) {
    log("warn", "webhook_idempotency_complete_exception", {
      requestId,
      eventId: prefix(eventId),
      error:   err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Release an idempotency claim so Stripe's retry can reprocess the event.
 *
 * [PATCH] Now writes status='failed' + handler_error BEFORE deleting.
 * If the delete fails, the status/error columns provide observability into
 * what happened. If the delete succeeds, the row is gone and Stripe can retry.
 *
 * WHEN TO CALL:
 *   Only from a catch block, after checkEventIdempotency returned
 *   { alreadyProcessed: false, dbError: false } and the handler threw.
 *   Always re-throw after calling this.
 */
export async function releaseIdempotencyClaim(
  db: DbClient,
  eventId: string,
  requestId: string,
  handlerError?: string,
): Promise<void> {
  try {
    // Write the failure status first — survives if the DELETE below fails.
    await db
      .from("stripe_webhook_events")
      .update({
        status:        "failed",
        handler_error: (handlerError ?? "unknown").slice(0, 2000),
      })
      .eq("event_id", eventId);

    // Delete the row so Stripe's retry can reprocess.
    const { error } = await db
      .from("stripe_webhook_events")
      .delete()
      .eq("event_id", eventId);

    if (error) {
      log("warn", "webhook_idempotency_release_failed", {
        requestId,
        eventId: prefix(eventId),
        code:    error.code ?? null,
        error:   error.message,
      });
      return;
    }

    log("info", "webhook_idempotency_released", {
      requestId,
      eventId: prefix(eventId),
    });
  } catch (err) {
    log("warn", "webhook_idempotency_release_exception", {
      requestId,
      eventId: prefix(eventId),
      error:   err instanceof Error ? err.message : String(err),
    });
  }
}