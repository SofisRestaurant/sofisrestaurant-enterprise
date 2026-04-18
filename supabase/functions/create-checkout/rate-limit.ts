// supabase/functions/create-checkout/rate-limit.ts
// ============================================================================
// PATCH — only the `checkGuestRateLimit` function is changed.
// The checkRateLimit (auth) function is IDENTICAL to your current version.
//
// What changed, and why:
//   Supabase PostgrestError objects don't stringify usefully via String(err).
//   You get "[object Object]" in logs instead of the real message, which is
//   how the RPC failure stayed hidden. This patch unpacks error.message,
//   error.code, error.details, error.hint explicitly — standard supabase-js
//   error shape.
//
//   Zero logic changes. Rate-limit behavior is identical. Only log output
//   changes.
// ============================================================================

import {
  RATE_LIMIT_BLOCK_MS,
  RATE_LIMIT_MAX_ATTEMPTS,
  RATE_LIMIT_WINDOW_MS,
} from "./env.ts";

import { asErr, log, nowIso, prefix } from "./logging.ts";

import type {
  CheckoutRateLimitInsert,
  CheckoutRateLimitUpdate,
  DbClient,
  RateLimitResult,
} from "./types.ts";

// ─────────────────────────────────────────────────────────────
// RPC RESPONSE TYPE
// ─────────────────────────────────────────────────────────────

type GuestRateLimitRPCResult = {
  allowed: boolean;
  reason?: string;
  retry_after_ms?: number;
};

// ─── Supabase/Postgrest error shape ─────────────────────────────────────────
// Not all fields present on all error classes, but these cover the common ones.
type SupabaseErrorLike = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

function unpackSupabaseError(err: unknown): {
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
} {
  if (err && typeof err === "object") {
    const e = err as SupabaseErrorLike;
    return {
      message: typeof e.message === "string" && e.message.length > 0
        ? e.message
        : JSON.stringify(err),
      code: typeof e.code === "string" ? e.code : null,
      details: typeof e.details === "string" ? e.details : null,
      hint: typeof e.hint === "string" ? e.hint : null,
    };
  }
  return {
    message: err instanceof Error ? err.message : String(err),
    code: null,
    details: null,
    hint: null,
  };
}

// ─────────────────────────────────────────────────────────────
// GUEST RATE LIMIT
// ─────────────────────────────────────────────────────────────

export async function checkGuestRateLimit(
  db: DbClient,
  ipHash: string,
  requestId: string,
): Promise<RateLimitResult> {
  if (!ipHash || ipHash.length !== 64) {
    log("error", "guest_rate_limit_invalid_ip_hash", {
      requestId,
      hashLen: ipHash?.length ?? 0,
    });

    return {
      allowed: false,
      reason: "invalid_ip_identifier",
      retryAfterMs: 60_000,
    };
  }

  try {
    const { data, error } = await db.rpc(
      "check_guest_rate_limit",
      { p_ip_hash: ipHash },
    ) as {
      data: GuestRateLimitRPCResult[] | GuestRateLimitRPCResult | null;
      error: unknown;
    };

    if (error) {
      // Unpack PostgrestError fields explicitly — String(error) would
      // produce "[object Object]" and hide the real reason.
      const { message, code, details, hint } = unpackSupabaseError(error);

      log("error", "guest_rate_limit_rpc_failed", {
        requestId,
        message,
        code,
        details,
        hint,
      });

      return {
        allowed: false,
        reason: "rate_limit_service_unavailable",
        retryAfterMs: 10_000,
      };
    }

    // ─── NORMALIZE SUPABASE RESPONSE ─────────────────────────────
    const result: GuestRateLimitRPCResult | null = Array.isArray(data)
      ? data[0]
      : data;

    if (!result) {
      return {
        allowed: true,
        reason: "",
        retryAfterMs: 0,
      };
    }

    return {
      allowed: result.allowed === true,
      reason: result.reason ?? "",
      retryAfterMs: result.retry_after_ms ?? 0,
    };
  } catch (err) {
    const { message, code, details, hint } = unpackSupabaseError(err);

    log("error", "guest_rate_limit_rpc_exception", {
      requestId,
      message,
      code,
      details,
      hint,
    });

    return {
      allowed: false,
      reason: "rate_limit_service_error",
      retryAfterMs: 10_000,
    };
  }
}

// ─────────────────────────────────────────────────────────────
// AUTH RATE LIMIT — UNCHANGED
// ─────────────────────────────────────────────────────────────

export async function checkRateLimit(
  db: DbClient,
  userId: string,
  ip: string | null,
  requestId: string,
): Promise<RateLimitResult> {
  try {
    const { data: row, error } = await db
      .from("checkout_rate_limits")
      .select(
        "id, attempts, blocked_until, last_attempt_at, created_at, ip, user_id",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      log("warn", "checkout_rate_limit_lookup_failed", {
        requestId,
        userId: prefix(userId),
        error: error.message,
      });

      return { allowed: true, reason: "", retryAfterMs: 0 };
    }

    const now = Date.now();

    // ─── BLOCK CHECK ────────────────────────────────────────────────
    if (row?.blocked_until) {
      const blockedUntilMs = new Date(row.blocked_until).getTime();

      if (Number.isFinite(blockedUntilMs) && blockedUntilMs > now) {
        return {
          allowed: false,
          retryAfterMs: blockedUntilMs - now,
          reason: "Too many checkout attempts. Please wait before trying again.",
        };
      }
    }

    // ─── WINDOW LOGIC ───────────────────────────────────────────────
    const inWindow = row?.last_attempt_at
      ? now - new Date(row.last_attempt_at).getTime() <= RATE_LIMIT_WINDOW_MS
      : false;

    const nextAttempts = row ? (inWindow ? row.attempts + 1 : 1) : 1;

    // ─── CREATE ROW ────────────────────────────────────────────────
    if (!row) {
      const insert: CheckoutRateLimitInsert = {
        user_id: userId,
        attempts: 1,
        blocked_until: null,
        last_attempt_at: nowIso(),
        ip,
      };

      const { error: insertError } = await db
        .from("checkout_rate_limits")
        .insert(insert);

      if (insertError) {
        log("warn", "checkout_rate_limit_insert_failed", {
          requestId,
          userId: prefix(userId),
          error: insertError.message,
        });
      }

      return { allowed: true, reason: "", retryAfterMs: 0 };
    }

    // ─── BLOCK USER ────────────────────────────────────────────────
    if (nextAttempts > RATE_LIMIT_MAX_ATTEMPTS) {
      const blockedUntil = new Date(
        now + RATE_LIMIT_BLOCK_MS,
      ).toISOString();

      const blockUpdate: CheckoutRateLimitUpdate = {
        attempts: nextAttempts,
        blocked_until: blockedUntil,
        last_attempt_at: nowIso(),
        ip,
      };

      const { error: updateError } = await db
        .from("checkout_rate_limits")
        .update(blockUpdate)
        .eq("id", row.id);

      if (updateError) {
        log("warn", "checkout_rate_limit_block_update_failed", {
          requestId,
          userId: prefix(userId),
          rowId: prefix(row.id),
          error: updateError.message,
        });
      }

      return {
        allowed: false,
        retryAfterMs: RATE_LIMIT_BLOCK_MS,
        reason: "Too many checkout attempts. Please wait before trying again.",
      };
    }

    // ─── NORMAL UPDATE ──────────────────────────────────────────────
    const normalUpdate: CheckoutRateLimitUpdate = {
      attempts: nextAttempts,
      blocked_until: null,
      last_attempt_at: nowIso(),
      ip,
    };

    const { error: updateError } = await db
      .from("checkout_rate_limits")
      .update(normalUpdate)
      .eq("id", row.id);

    if (updateError) {
      log("warn", "checkout_rate_limit_update_failed", {
        requestId,
        userId: prefix(userId),
        rowId: prefix(row.id),
        error: updateError.message,
      });
    }

    return { allowed: true, reason: "", retryAfterMs: 0 };
  } catch (error) {
    log("warn", "checkout_rate_limit_exception", {
      requestId,
      userId: prefix(userId),
      error: asErr(error),
    });

    return { allowed: true, reason: "", retryAfterMs: 0 };
  }
}