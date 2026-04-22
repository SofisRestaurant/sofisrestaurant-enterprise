// supabase/functions/create-checkout/responses.ts
// =============================================================================
// Canonical response helpers for ALL checkout endpoints.
//
// ERROR CONTRACT (enforced here, never inline):
//
//   {
//     ok:    false,
//     error: {
//       code:      string,   // machine-readable ErrorCode
//       message:   string,   // user-facing or operator-facing string
//       requestId: string    // correlation ID for log tracing
//     }
//   }
//
// SUCCESS CONTRACT:
//
//   {
//     ok:        true,
//     code:      SuccessCode,
//     requestId: string,
//     ...body                // endpoint-specific fields
//   }
//
// WHY NESTED error OBJECT
//   - Frontend mapCheckoutError reads json?.error?.code and json?.error?.message.
//     A flat shape forces the mapper to juggle two lookup paths; a nested shape
//     has a single authoritative location for both fields.
//   - requestId inside the error object means a single JSON payload is fully
//     self-contained for log correlation — no need to cross-reference the
//     X-Request-Id header separately.
// =============================================================================

import type { Json } from "../_shared/database.types.ts";
import type { ErrorCode, JsonObject, SuccessCode } from "./types.ts";

// ─── Shared response headers ──────────────────────────────────────────────────

export const BASE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

// ─── Low-level JSON serializer ────────────────────────────────────────────────

export function jsonResponse(
  body: Json,
  status: number,
  requestId: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers(BASE_HEADERS);
  headers.set("X-Request-Id", requestId);

  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value);
  }

  return new Response(JSON.stringify(body), { status, headers });
}

// ─── Error response ───────────────────────────────────────────────────────────
//
// ALL error paths in every checkout function MUST go through this helper.
// Never construct an error payload inline — doing so bypasses the contract
// and breaks the frontend mapper.
//
// Shape emitted:
//   {
//     ok:    false,
//     error: { code, message, requestId }
//   }
//
// Note: `message` (not `error`) is the parameter name to avoid shadowing the
// nested `error` key in the emitted JSON.

export function errorResponse(
  requestId: string,
  status: number,
  code: ErrorCode,
  message: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse(
    {
      ok: false,
      error: {
        code,
        message,
        requestId,
      },
    },
    status,
    requestId,
    extraHeaders,
  );
}

// ─── Success response ─────────────────────────────────────────────────────────
//
// Shape emitted:
//   { ok: true, code, requestId, ...body }

export function successResponse(
  requestId: string,
  code: SuccessCode,
  body: JsonObject,
  extraHeaders: Record<string, string>,
): Response {
  return jsonResponse(
    {
      ok: true,
      code,
      requestId,
      ...body,
    },
    200,
    requestId,
    extraHeaders,
  );
}