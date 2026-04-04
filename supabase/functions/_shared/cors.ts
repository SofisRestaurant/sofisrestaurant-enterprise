// =============================================================================
// supabase/functions/_shared/cors.ts
// =============================================================================
// Shared CORS helper used by ALL edge functions.
//
// WHY SHARED
// ----------
// Previously each function had its own CORS allowlist and Vercel regex,
// causing drift and hardcoded project-specific strings. This file is the
// single source of truth for allowed origins.
//
// ADDING ORIGINS
// --------------
// Set EXTRA_ALLOWED_ORIGINS env var (comma-separated) in Supabase dashboard
// to allow additional origins without redeploying.
// =============================================================================

const STATIC_ORIGINS = new Set<string>([
  'https://sofislegacy.com',
  'https://www.sofislegacy.com',
  'https://sofisrestaurant-enterprise.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
]);

// Any *.vercel.app preview deployment for this project is allowed.
// Matches: sofisrestaurant-enterprise-*.vercel.app
// Does NOT match arbitrary vercel apps.
const VERCEL_PREVIEW_RE =
  /^https:\/\/sofisrestaurant-enterprise(-[a-z0-9]+)*\.vercel\.app$/;

function isAllowedOrigin(origin: string): boolean {
  if (STATIC_ORIGINS.has(origin)) return true;
  if (VERCEL_PREVIEW_RE.test(origin)) return true;

  // Optional: extra origins from environment (set in Supabase dashboard)
  const extra = (Deno.env.get('EXTRA_ALLOWED_ORIGINS') ?? '').split(',');
  return extra.map((o) => o.trim()).filter(Boolean).includes(origin);
}

const STANDARD_ALLOW_HEADERS =
  'authorization, apikey, content-type, x-client-info, x-application-name, x-request-id, x-idempotency-key';

export type CorsHeaders = Record<string, string>;

/**
 * Returns CORS headers for the given request, or null if the origin is not
 * allowed. Null means the caller should return 403 immediately.
 *
 * If there is no Origin header (server-to-server), returns minimal headers
 * so the request is not blocked.
 */
export function corsHeaders(
  req: Request,
  options: { allowHeaders?: string } = {},
): CorsHeaders | null {
  const origin = (req.headers.get('origin') ?? '').trim();

  if (!origin) {
    // No Origin = server-to-server or same-origin — allow through
    return { Vary: 'Origin' };
  }

  if (!isAllowedOrigin(origin)) return null;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': options.allowHeaders ?? STANDARD_ALLOW_HEADERS,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * Returns a 204 preflight response with CORS headers.
 * Returns 403 if origin is not allowed.
 */
export function handlePreflight(req: Request): Response {
  const headers = corsHeaders(req);
  if (!headers) return new Response('Origin not allowed', { status: 403 });
  return new Response(null, { status: 204, headers });
}