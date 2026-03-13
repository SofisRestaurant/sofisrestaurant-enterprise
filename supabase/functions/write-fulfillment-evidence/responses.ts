import type { ErrorCode, ResponseBody, SuccessCode } from './types.ts';

export function jsonResponse(
  status: number,
  body: ResponseBody,
  corsHeaders: HeadersInit | null,
): Response {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });

  if (corsHeaders !== null) {
    for (const [key, value] of Object.entries(corsHeaders)) {
      headers.set(key, value);
    }
  }

  return new Response(JSON.stringify(body), { status, headers });
}

export function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  corsHeaders: HeadersInit | null,
  field?: string,
): Response {
  return jsonResponse(
    status,
    { ok: false, code, message, ...(field ? { field } : {}) },
    corsHeaders,
  );
}

export function successResponse(
  status: number,
  code: SuccessCode,
  orderId: string,
  corsHeaders: HeadersInit | null,
): Response {
  return jsonResponse(status, { ok: true, code, orderId }, corsHeaders);
}