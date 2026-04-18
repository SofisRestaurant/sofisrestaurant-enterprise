// =============================================================================
// supabase/functions/get-order-for-success/index.ts
// =============================================================================
// Unified order fetch for the /order-success page. Replaces two broken calls:
//   - supabase.from('orders').select() — 401 via RLS for guests and stale JWTs
//   - finalize-order — auth-only, rejects guest sessions with stripe_owner_mismatch
//
// Flow:
//   1. Client provides session_id + optional guest_token + optional Bearer
//   2. Server looks up order by stripe_session_id using service role
//   3. Not found → { pending: true } (webhook hasn't processed yet — client polls)
//   4. Found auth order → require Bearer whose user.id matches order.customer_uid
//   5. Found guest order → require guest_token that matches order.guest_token
//
// The Stripe webhook is still the single source of truth for persistence.
// This function only READS, never writes.
// =============================================================================

import { createAnonClient, createServiceClient, readBearerToken } from "../_shared/supabase.ts";
import { corsHeadersFor } from "../create-checkout/cors.ts";
import { asErr, log, prefix, sanitizeRequestId } from "../create-checkout/logging.ts";
import {
  BASE_HEADERS,
  errorResponse as _errorResponse,
  successResponse as _successResponse,
} from "../create-checkout/responses.ts";

// ─── Typed wrappers around the shared response helpers ──────────────────────
// responses.ts uses strict ErrorCode / SuccessCode union types listing only
// codes already in use by create-checkout. This function introduces its own
// codes for order lookup, so we wrap the helpers and cast at the boundary
// rather than polluting the shared union with one-off strings.

type ResponseHeaders = Record<string, string>;

function errorResponse(
  requestId: string,
  status: number,
  code: string,
  message: string,
  headers: ResponseHeaders,
): Response {
  return _errorResponse(requestId, status, code as never, message, headers);
}

function successResponse(
  requestId: string,
  code: string,
  payload: Record<string, unknown>,
  headers: ResponseHeaders,
): Response {
  return _successResponse(requestId, code as never, payload as never, headers);
}

// ─── Config ──────────────────────────────────────────────────────────────────

const MAX_BODY_BYTES = 4_096;
const MAX_SESSION_ID_LEN = 200;
const STRIPE_SESSION_RE = /^cs_(test|live)_[a-zA-Z0-9]+$/;
const MAX_GUEST_TOKEN_LEN = 128;
const GUEST_TOKEN_RE = /^[a-f0-9]{16,128}$/i;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function validateSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_SESSION_ID_LEN) return null;
  if (!STRIPE_SESSION_RE.test(normalized)) return null;
  return normalized;
}

function validateGuestToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_GUEST_TOKEN_LEN) return null;
  if (!GUEST_TOKEN_RE.test(normalized)) return null;
  return normalized;
}

// Constant-time string comparison to avoid timing side-channel on guest_token.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = sanitizeRequestId(req.headers.get("x-request-id"));

  const requestOrigin = req.headers.get("origin");
  const corsHeaders = corsHeadersFor(requestOrigin);

  // ── CORS preflight ────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    if (!corsHeaders) {
      return errorResponse(requestId, 403, "origin_not_allowed", "Origin not allowed.", {
        Vary: "Origin",
      });
    }
    return new Response(null, {
      status: 204,
      headers: { ...BASE_HEADERS, ...corsHeaders, "X-Request-Id": requestId },
    });
  }

  if (!corsHeaders) {
    return errorResponse(requestId, 403, "origin_not_allowed", "Origin not allowed.", {
      Vary: "Origin",
    });
  }

  if (req.method !== "POST") {
    return errorResponse(requestId, 405, "method_not_allowed", "Method not allowed.", corsHeaders);
  }

  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return errorResponse(
      requestId,
      415,
      "unsupported_content_type",
      "Content-Type must be application/json.",
      corsHeaders,
    );
  }

  // ── Body read + parse ─────────────────────────────────────────────────────
  let parsedBody: unknown;
  try {
    const buffer = await req.arrayBuffer();
    if (buffer.byteLength === 0) {
      return errorResponse(requestId, 400, "empty_body", "Request body is required.", corsHeaders);
    }
    if (buffer.byteLength > MAX_BODY_BYTES) {
      return errorResponse(requestId, 413, "body_too_large", "Request body too large.", corsHeaders);
    }
    const raw = new TextDecoder().decode(buffer);
    parsedBody = JSON.parse(raw);
  } catch {
    return errorResponse(requestId, 400, "invalid_json", "Invalid JSON.", corsHeaders);
  }

  if (!isRecord(parsedBody)) {
    return errorResponse(requestId, 400, "invalid_body", "Body must be an object.", corsHeaders);
  }

  // ── Validate inputs ───────────────────────────────────────────────────────
  const sessionId = validateSessionId(parsedBody.session_id ?? parsedBody.sessionId);
  if (!sessionId) {
    return errorResponse(requestId, 400, "invalid_session_id", "Invalid session id.", corsHeaders);
  }

  const providedGuestToken = validateGuestToken(parsedBody.guest_token ?? parsedBody.guestToken);
  const bearerToken = readBearerToken(req);

  // ── Service client: bypasses RLS for the read. We authorize manually. ────
  let db;
  try {
    db = createServiceClient();
  } catch (error) {
    log("error", "get_order_service_init_failed", { requestId, error: asErr(error) });
    return errorResponse(
      requestId,
      500,
      "service_unavailable",
      "Service unavailable.",
      corsHeaders,
    );
  }

  // ── Look up order ─────────────────────────────────────────────────────────
  const { data: orderRow, error: orderError } = await db
    .from("orders")
    .select("*")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (orderError) {
    log("error", "get_order_lookup_failed", {
      requestId,
      sessionId: prefix(sessionId),
      error: orderError.message,
    });
    return errorResponse(
      requestId,
      500,
      "order_lookup_failed",
      "Failed to look up order.",
      corsHeaders,
    );
  }

  // Not found: the Stripe webhook hasn't persisted the order yet.
  // Client should continue polling.
  if (!orderRow) {
    return successResponse(
      requestId,
      "order_pending",
      { order: null, pending: true },
      corsHeaders,
    );
  }

  // ── Authorize the caller against the order ────────────────────────────────
  const orderRecord = orderRow as Record<string, unknown>;
  const orderCustomerUid = readString(orderRecord.customer_uid);
  const orderGuestToken = readString(orderRecord.guest_token);

  // Auth-owned order: require Bearer JWT that resolves to the same user id.
  if (orderCustomerUid) {
    if (!bearerToken) {
      log("warn", "get_order_auth_required", {
        requestId,
        sessionId: prefix(sessionId),
        customerUid: prefix(orderCustomerUid),
      });
      return errorResponse(
        requestId,
        401,
        "authentication_required",
        "Authentication required.",
        corsHeaders,
      );
    }

    const userClient = createAnonClient(bearerToken);
    const { data: authData, error: authError } = await userClient.auth.getUser();

    if (authError || !authData?.user?.id) {
      log("warn", "get_order_invalid_token", {
        requestId,
        sessionId: prefix(sessionId),
        error: authError?.message ?? "no user",
      });
      return errorResponse(
        requestId,
        401,
        "invalid_token",
        "Invalid or expired token.",
        corsHeaders,
      );
    }

    if (authData.user.id !== orderCustomerUid) {
      log("warn", "get_order_owner_mismatch", {
        requestId,
        sessionId: prefix(sessionId),
        jwtUserId: prefix(authData.user.id),
        orderCustomerUid: prefix(orderCustomerUid),
      });
      return errorResponse(
        requestId,
        403,
        "forbidden",
        "You do not own this order.",
        corsHeaders,
      );
    }

    log("info", "get_order_auth_ok", {
      requestId,
      sessionId: prefix(sessionId),
      orderId: prefix(readString(orderRecord.id)),
    });

    return successResponse(
      requestId,
      "order_found",
      { order: orderRow, pending: false },
      corsHeaders,
    );
  }

  // Guest order: require guest_token in body matching the stored token.
  if (orderGuestToken) {
    if (!providedGuestToken) {
      log("warn", "get_order_guest_token_missing", {
        requestId,
        sessionId: prefix(sessionId),
      });
      return errorResponse(
        requestId,
        401,
        "guest_token_required",
        "Guest token required.",
        corsHeaders,
      );
    }

    if (!constantTimeEqual(providedGuestToken, orderGuestToken)) {
      log("warn", "get_order_guest_token_mismatch", {
        requestId,
        sessionId: prefix(sessionId),
      });
      return errorResponse(
        requestId,
        403,
        "forbidden",
        "Invalid guest token.",
        corsHeaders,
      );
    }

    log("info", "get_order_guest_ok", {
      requestId,
      sessionId: prefix(sessionId),
      orderId: prefix(readString(orderRecord.id)),
    });

    return successResponse(
      requestId,
      "order_found",
      { order: orderRow, pending: false },
      corsHeaders,
    );
  }

  // Defensive: order has neither customer_uid nor guest_token — should
  // never happen given the webhook always populates one of them.
  log("error", "get_order_unowned", {
    requestId,
    sessionId: prefix(sessionId),
    orderId: prefix(readString(orderRecord.id)),
  });
  return errorResponse(
    requestId,
    500,
    "order_unowned",
    "Order has no owner information.",
    corsHeaders,
  );
});