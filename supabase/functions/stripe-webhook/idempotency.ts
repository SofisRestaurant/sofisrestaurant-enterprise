import { log, nowIso, prefix } from "./logging.ts";
import type { ClaimResult, DbClient, StripeEventInsert } from "./types.ts";

export async function claimEvent(
  db: DbClient,
  eventId: string,
  eventType: string,
): Promise<ClaimResult> {
  const row: StripeEventInsert = {
    id: eventId,
    type: eventType,
    created_at: nowIso(),
  };

  const { error } = await db.from("stripe_events").insert(row);

  if (error === null) {
    return { kind: "claimed" };
  }

  if (error.code === "23505") {
    return { kind: "duplicate" };
  }

  log("error", "webhook_claim_insert_failed", {
    eventId: prefix(eventId),
    eventType,
    code: error.code ?? null,
    message: error.message,
  });

  return {
    kind: "db_error",
    code: error.code ?? null,
    message: error.message,
  };
}

export async function unclaimEvent(
  db: DbClient,
  eventId: string,
): Promise<void> {
  try {
    await db.from("stripe_events").delete().eq("id", eventId);
  } catch {
    // best effort
  }
}
