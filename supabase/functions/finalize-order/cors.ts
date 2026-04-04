// =============================================================================
// supabase/functions/finalize-order/cors.ts
// =============================================================================
// Re-exports from shared CORS helper + adds standard response headers.
// All origin logic lives in _shared/cors.ts — do not duplicate it here.
// =============================================================================

export { corsHeaders } from '../_shared/cors.ts';
export type { CorsHeaders } from '../_shared/cors.ts';

export function withStandardHeaders(headersInit: HeadersInit, requestId: string): Headers {
  const headers = new Headers(headersInit);
  if (!headers.has('Vary')) headers.set('Vary', 'Origin');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Request-Id', requestId);
  return headers;
}