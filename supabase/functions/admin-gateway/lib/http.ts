// =============================================================================
// PATH: supabase/functions/admin-gateway/lib/http.ts
// =============================================================================
// Response envelope types and HTTP response factories.
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// Envelope types
// ─────────────────────────────────────────────────────────────────────────────

export type Meta = {
  requestedBy: string;
  requestId: string;
  ts: number;
};

type Ok<T> = {
  data: T;
  meta: Meta;
};

type Err = {
  error: { code: string; message: string; details?: unknown };
  meta: Meta;
};

// ─────────────────────────────────────────────────────────────────────────────
// Header factory
// ─────────────────────────────────────────────────────────────────────────────

export function withStandardHeaders(headersInit: HeadersInit, requestId: string): Headers {
  const h = new Headers(headersInit);
  if (!h.has('Vary')) h.set('Vary', 'Origin');
  h.set('Content-Type', 'application/json; charset=utf-8');
  h.set('Cache-Control', 'no-store');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Request-Id', requestId);
  return h;
}

// ─────────────────────────────────────────────────────────────────────────────
// Response factories
// ─────────────────────────────────────────────────────────────────────────────

export function json(
  body: unknown,
  headers: HeadersInit,
  requestId: string,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withStandardHeaders(headers, requestId),
  });
}

export function ok<T>(
  data: T,
  meta: Meta,
  headers: HeadersInit,
  requestId: string,
  status = 200,
): Response {
  return json({ data, meta } satisfies Ok<T>, headers, requestId, status);
}

export function fail(
  code: string,
  message: string,
  meta: Meta,
  headers: HeadersInit,
  requestId: string,
  status: number,
  details?: unknown,
): Response {
  return json(
    { error: { code, message, details }, meta } satisfies Err,
    headers,
    requestId,
    status,
  );
}