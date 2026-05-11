// FILE: supabase/functions/get-order-status/index.ts
// =============================================================================
// Secure order-status read for customer-facing tracking page.
//
// Accepts:
//   POST { order_id: string, guest_token?: string }
//   Authorization: Bearer <jwt>  (authenticated users — sent automatically
//                                  by invokeEdge via supabase.auth.getSession)
//
// Auth rules:
//   - Authenticated order  → Bearer JWT must resolve to the owning user.
//   - Guest order          → guest_token in body must match order.guest_token
//                            (constant-time compare).
//   - Neither              → 401.
//   - Wrong token / wrong owner → 403.
//
// Returns only safe tracking fields — no Stripe IDs, no risk/verification
// data, no admin metadata, no guest_token, no customer_uid.
// =============================================================================

import {
  createAnonClient,
  createServiceClient,
  readBearerToken,
} from "../_shared/supabase.ts";
import { corsHeadersFor } from "../create-checkout/cors.ts";
import {
  asErr,
  log,
  prefix,
  sanitizeRequestId,
} from "../create-checkout/logging.ts";
import {
  BASE_HEADERS,
  errorResponse as _errorResponse,
  successResponse as _successResponse,
} from "../create-checkout/responses.ts";

// ─── Typed wrappers (same pattern as get-order-for-success) ──────────────────

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
const MAX_GUEST_TOKEN_LEN = 128;
const GUEST_TOKEN_RE = /^[a-f0-9]{16,128}$/i;
// Standard UUID v4 pattern — order IDs are Postgres gen_random_uuid() values.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only these columns are fetched from the DB. customer_uid and guest_token are
// needed for the authorization check but are stripped before the response.
const SAFE_SELECT_COLUMNS = [
  "id",
  "order_number",
  "status",
  "payment_status",
  "created_at",
  "updated_at",
  "amount_total",
  "amount_subtotal",
  "amount_tax",
  "amount_shipping",
  "fulfillment_type",
  "pickup_time",
  "customer_name",
  "cart_items",
  "notes",
  // Authorization-only — stripped before returning to client:
  "customer_uid",
  "guest_token",
].join(", ");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function validateOrderId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!UUID_RE.test(normalized)) return null;
  return normalized;
}

function validateGuestToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_GUEST_TOKEN_LEN) return null;
  if (!GUEST_TOKEN_RE.test(normalized)) return null;
  return normalized;
}

/** Constant-time string compare — prevents timing side-channel on guest_token. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Strip authorization-only and sensitive fields before sending to the client.
 * This is the single gate — adding a field here requires a deliberate decision.
 */
function sanitizeOrderForTracking(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: row.id,
    order_number: row.order_number ?? null,
    status: row.status,
    payment_status: row.payment_status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    amount_total: row.amount_total,
    amount_subtotal: row.amount_subtotal ?? 0,
    amount_tax: row.amount_tax ?? 0,
    amount_shipping: row.amount_shipping ?? 0,
    fulfillment_type: row.fulfillment_type ?? null,
    pickup_time: row.pickup_time ?? null,
    customer_name: row.customer_name ?? null,
    cart_items: row.cart_items ?? null,
    notes: row.notes ?? null,
    // Intentionally omitted:
    //   customer_uid, guest_token, stripe_session_id,
    //   stripe_payment_intent_id, risk_score, risk_level,
    //   verification_status, verified_at, metadata,
    //   assigned_to, shipping_*, source, order_type, currency,
    //   and all admin/dispute fields.
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = sanitizeRequestId(req.headers.get("x-request-id"));
  const requestOrigin = req.headers.get("origin");
  const corsHeaders = corsHeadersFor(requestOrigin);

  // ── CORS preflight ──────────────────────────────────────────────────────
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
    return errorResponse(
      requestId,
      405,
      "method_not_allowed",
      "Method not allowed.",
      corsHeaders,
    );
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

  // ── Body read + parse ───────────────────────────────────────────────────
  let parsedBody: unknown;
  try {
    const buffer = await req.arrayBuffer();
    if (buffer.byteLength === 0) {
      return errorResponse(
        requestId,
        400,
        "empty_body",
        "Request body is required.",
        corsHeaders,
      );
    }
    if (buffer.byteLength > MAX_BODY_BYTES) {
      return errorResponse(
        requestId,
        413,
        "body_too_large",
        "Request body too large.",
        corsHeaders,
      );
    }
    parsedBody = JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    return errorResponse(requestId, 400, "invalid_json", "Invalid JSON.", corsHeaders);
  }

  if (!isRecord(parsedBody)) {
    return errorResponse(
      requestId,
      400,
      "invalid_body",
      "Body must be an object.",
      corsHeaders,
    );
  }

  // ── Validate inputs ─────────────────────────────────────────────────────
  const orderId = validateOrderId(parsedBody.order_id ?? parsedBody.orderId);
  if (!orderId) {
    return errorResponse(
      requestId,
      400,
      "invalid_order_id",
      "Invalid order id.",
      corsHeaders,
    );
  }

  const providedGuestToken = validateGuestToken(
    parsedBody.guest_token ?? parsedBody.guestToken,
  );
  const bearerToken = readBearerToken(req);

  // At least one credential must be present.
  if (!bearerToken && !providedGuestToken) {
    return errorResponse(
      requestId,
      401,
      "authentication_required",
      "Authentication required.",
      corsHeaders,
    );
  }

  // ── Service client: bypasses RLS; we authorize manually ────────────────
  let db;
  try {
    db = createServiceClient();
  } catch (error) {
    log("error", "get_order_status_service_init_failed", {
      requestId,
      error: asErr(error),
    });
    return errorResponse(
      requestId,
      500,
      "service_unavailable",
      "Service unavailable.",
      corsHeaders,
    );
  }

  // ── Fetch order ─────────────────────────────────────────────────────────
  const { data: orderRow, error: orderError } = await db
    .from("orders")
    .select(SAFE_SELECT_COLUMNS)
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    log("error", "get_order_status_lookup_failed", {
      requestId,
      orderId: prefix(orderId),
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

  if (!orderRow) {
    return errorResponse(
      requestId,
      404,
      "order_not_found",
      "Order not found.",
      corsHeaders,
    );
  }

  // Cast through unknown: SAFE_SELECT_COLUMNS is a runtime string (not a
  // string-literal type), so Supabase's generic collapses to GenericStringError
  // and the direct cast would fail. unknown → Record is the correct pattern
  // (same as get-order-for-success).
  const orderRecord = orderRow as unknown as Record<string, unknown>;
  const orderCustomerUid = readString(orderRecord.customer_uid);
  const orderGuestToken = readString(orderRecord.guest_token);

  // ── Authorize — authenticated path ──────────────────────────────────────
  if (orderCustomerUid) {
    if (!bearerToken) {
      log("warn", "get_order_status_auth_required", {
        requestId,
        orderId: prefix(orderId),
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
      log("warn", "get_order_status_invalid_token", {
        requestId,
        orderId: prefix(orderId),
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
      log("warn", "get_order_status_owner_mismatch", {
        requestId,
        orderId: prefix(orderId),
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

    log("info", "get_order_status_auth_ok", {
      requestId,
      orderId: prefix(orderId),
    });

    return successResponse(
      requestId,
      "order_found",
      { order: sanitizeOrderForTracking(orderRecord) },
      corsHeaders,
    );
  }

  // ── Authorize — guest path ───────────────────────────────────────────────
  if (orderGuestToken) {
    if (!providedGuestToken) {
      log("warn", "get_order_status_guest_token_missing", {
        requestId,
        orderId: prefix(orderId),
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
      log("warn", "get_order_status_guest_token_mismatch", {
        requestId,
        orderId: prefix(orderId),
      });
      return errorResponse(
        requestId,
        403,
        "forbidden",
        "Invalid guest token.",
        corsHeaders,
      );
    }

    log("info", "get_order_status_guest_ok", {
      requestId,
      orderId: prefix(orderId),
    });

    return successResponse(
      requestId,
      "order_found",
      { order: sanitizeOrderForTracking(orderRecord) },
      corsHeaders,
    );
  }

  // Defensive: order has neither owner field — data integrity problem.
  log("error", "get_order_status_unowned", {
    requestId,
    orderId: prefix(orderId),
  });
  return errorResponse(
    requestId,
    500,
    "order_unowned",
    "Order has no owner information.",
    corsHeaders,
  );
});