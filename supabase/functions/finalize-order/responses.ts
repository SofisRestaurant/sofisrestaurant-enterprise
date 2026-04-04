// =============================================================================
// supabase/functions/finalize-order/responses.ts
// =============================================================================

import type { FinalizeSuccessBody } from './types.ts';
import { withStandardHeaders } from './cors.ts';
import { log } from './utils.ts';

export function jsonResponse(
  body: unknown,
  status: number,
  headersInit: HeadersInit,
  requestId: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withStandardHeaders(headersInit, requestId),
  });
}

export function errorResponse(
  cors: HeadersInit,
  requestId: string,
  code: string,
  message: string,
  status: number,
  meta?: Record<string, unknown>,
): Response {
  log(status >= 500 ? 'error' : 'warn', 'error', {
    requestId,
    code,
    message,
    ...(meta ?? {}),
  });

  return jsonResponse({ ok: false, error: { code, message, requestId } }, status, cors, requestId);
}

export function successResponse(
  cors: HeadersInit,
  requestId: string,
  body: FinalizeSuccessBody,
): Response {
  return jsonResponse(body, 200, cors, requestId);
}