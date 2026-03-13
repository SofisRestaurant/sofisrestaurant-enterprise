import type { Json } from "../_shared/database.types.ts";
import type { ErrorCode, JsonObject, SuccessCode } from "./types.ts";

export const BASE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

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

export function errorResponse(
  requestId: string,
  status: number,
  code: ErrorCode,
  error: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return jsonResponse(
    {
      ok: false,
      code,
      error,
      requestId,
    },
    status,
    requestId,
    extraHeaders,
  );
}

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
