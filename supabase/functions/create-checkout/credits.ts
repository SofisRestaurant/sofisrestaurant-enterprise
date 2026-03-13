import { asErr, log, prefix } from "./logging.ts";
import type { CreditValidationResult, DbClient } from "./types.ts";

export async function validateCredit(args: {
  db: DbClient;
  creditId: string;
  userId: string;
  requestId: string;
}): Promise<CreditValidationResult> {
  const { db, creditId, userId, requestId } = args;

  try {
    const { data: credit, error } = await db
      .from("user_credits")
      .select(
        "id, user_id, amount_cents, used, used_at, expires_at, checkout_session_id, source",
      )
      .eq("id", creditId)
      .maybeSingle();

    if (error) {
      log("warn", "checkout_credit_lookup_failed", {
        requestId,
        creditId: prefix(creditId),
        error: error.message,
      });
      return { valid: false, error: "Unable to validate credit" };
    }

    if (!credit) {
      return { valid: false, error: "Credit not found" };
    }

    if (credit.user_id !== userId) {
      log("warn", "checkout_credit_user_mismatch", {
        requestId,
        creditId: prefix(creditId),
        requestUserId: prefix(userId),
        creditUserId: prefix(credit.user_id),
      });
      return { valid: false, error: "Credit not found" };
    }

    if (credit.used) {
      return { valid: false, error: "Credit has already been used" };
    }

    if (credit.expires_at && new Date(credit.expires_at) < new Date()) {
      return { valid: false, error: "Credit has expired" };
    }

    if (credit.amount_cents <= 0) {
      return { valid: false, error: "Credit has no remaining balance" };
    }

    return {
      valid: true,
      creditId: credit.id,
      creditCents: credit.amount_cents,
    };
  } catch (error) {
    log("error", "checkout_credit_exception", {
      requestId,
      userId: prefix(userId),
      creditId: prefix(creditId),
      error: asErr(error),
    });
    return { valid: false, error: "Unable to validate credit" };
  }
}
