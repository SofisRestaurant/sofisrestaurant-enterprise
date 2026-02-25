// supabase/functions/verify-loyalty-qr/index.ts
// =============================================================================
// VERIFY LOYALTY QR — PRODUCTION GRADE
// =============================================================================
// Reads a customer profile by loyalty_public_id for display in the admin scanner.
// Returns only display-safe fields — no id, email, phone, or auth details.
//
// Auth: JWT required, role must be 'admin'.
//
// CRITICAL: Supabase Edge Function runtime lowercases ALL incoming HTTP headers.
// Always use req.headers.get("authorization") — lowercase — never "Authorization".
// =============================================================================

import { createClient } from "supabase";

// ── Env ───────────────────────────────────────────────────────────────────────
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error("Missing required environment variables");
}

// ── CORS ──────────────────────────────────────────────────────────────────────
// Origin-scoped (not wildcard) — admin tool should only be called from known origins.
const ALLOWED_ORIGINS = [
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  // Fall back to first allowed origin for non-browser calls (e.g. Supabase dashboard tests)
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function respond(
  status: number,
  body: Record<string, unknown>,
  cors: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function log(level: "info" | "warn" | "error", msg: string, data?: unknown) {
  console.log(JSON.stringify({ level, msg, data, time: new Date().toISOString() }));
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return respond(405, { error: "Method not allowed" }, cors);
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  // MUST be lowercase — Supabase Edge Function runtime lowercases all headers.
  // req.headers.get("Authorization") always returns null here.
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    log("warn", "missing_auth_header", { method: req.method });
    return respond(401, { error: "Missing authorization" }, cors);
  }

  const jwt = authHeader.slice(7);
log("info", "env_check", {
  supabase_url: SUPABASE_URL
});
  // Validate the caller's JWT via the anon client (does not bypass RLS)
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth:   { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: { user }, error: authError } = await callerClient.auth.getUser();

  if (authError || !user) {
    log("warn", "invalid_token", { error: authError?.message });
    return respond(401, { error: "Invalid token" }, cors);
  }

  // Verify admin role via service role client (bypasses RLS safely)
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || callerProfile?.role !== "admin") {
    log("warn", "non_admin_access_attempt", { userId: user.id, role: callerProfile?.role });
    return respond(403, { error: "Admin access required" }, cors);
  }

  // ── Body ────────────────────────────────────────────────────────────────
  let body: { loyalty_public_id?: string };
  try {
    body = await req.json();
  } catch {
    return respond(400, { error: "Invalid JSON body" }, cors);
  }

  const { loyalty_public_id } = body;

  if (!loyalty_public_id || typeof loyalty_public_id !== "string") {
    return respond(400, { error: "loyalty_public_id is required" }, cors);
  }

  // Strict UUID v4 pattern — QR codes always contain valid UUIDs
  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!UUID_PATTERN.test(loyalty_public_id.trim())) {
    return respond(400, { error: "Invalid loyalty_public_id format" }, cors);
  }

  // ── Lookup ──────────────────────────────────────────────────────────────
  const { data: profile, error: lookupError } = await adminClient
    .from("profiles")
    .select(
      "full_name, loyalty_tier, loyalty_points, lifetime_points, loyalty_streak, last_order_date"
    )
    .eq("loyalty_public_id", loyalty_public_id.trim())
    .maybeSingle();

  if (lookupError) {
    log("error", "db_lookup_failed", { error: lookupError.message });
    return respond(500, { error: "Lookup failed" }, cors);
  }

  if (!profile) {
    return respond(404, { error: "Customer not found" }, cors);
  }

  log("info", "customer_verified", { adminId: user.id });

  // Return only display-safe fields — deliberately excludes id, email, phone
  return respond(200, {
    full_name:       profile.full_name       ?? null,
    loyalty_tier:    profile.loyalty_tier    ?? "bronze",
    loyalty_points:  profile.loyalty_points  ?? 0,
    lifetime_points: profile.lifetime_points ?? 0,
    loyalty_streak:  profile.loyalty_streak  ?? 0,
    last_order_date: profile.last_order_date ?? null,
  }, cors);
});