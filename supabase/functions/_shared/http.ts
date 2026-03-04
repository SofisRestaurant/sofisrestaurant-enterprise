// supabase/functions/_shared/http.ts
// =============================================================================
// CORS headers + typed response helpers for Edge Functions (2026)
// - Fail-closed origin allowlist
// - ok()/err() support optional details payload
// - clientIp helper
// =============================================================================

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL") ?? "http://localhost:5173",
  "https://sofisrestaurant.com",
  "https://www.sofisrestaurant.com",
] as const;

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin as (typeof ALLOWED_ORIGINS)[number])
    ? origin
    : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  return null;
}

export function ok(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function err(
  req: Request,
  code: string,
  message: string,
  status = 400,
  details?: unknown,
): Response {
  const body: ErrorBody = { error: { code, message } };
  if (details !== undefined) body.error.details = details;

  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Extract client IP — checks CF-Connecting-IP first (Cloudflare), then X-Forwarded-For */
export function clientIp(req: Request): string | null {
  return (
    req.headers.get("CF-Connecting-IP") ??
    req.headers.get("X-Forwarded-For")?.split(",")[0].trim() ??
    null
  );
}