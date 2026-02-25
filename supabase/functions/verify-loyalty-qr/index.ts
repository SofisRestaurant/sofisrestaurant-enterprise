
import { createClient } from "supabase";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

// Service role — for DB lookup (bypasses RLS)
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

Deno.serve(async (req: Request): Promise<Response> => {
  // ── CORS preflight ──────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  // ── Verify caller is authenticated admin ────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return respond(401, { error: "Missing authorization" });
  }

  const jwt = authHeader.slice(7);

  // Use the anon client with the caller's JWT to verify identity
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: { user }, error: authError } = await callerClient.auth.getUser();

  if (authError || !user) {
    return respond(401, { error: "Invalid token" });
  }

  // Verify admin role from profiles
  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || callerProfile?.role !== "admin") {
    return respond(403, { error: "Admin access required" });
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: { loyalty_public_id?: string };
  try {
    body = await req.json();
  } catch {
    return respond(400, { error: "Invalid JSON body" });
  }

  const { loyalty_public_id } = body;

  if (!loyalty_public_id || typeof loyalty_public_id !== "string") {
    return respond(400, { error: "loyalty_public_id is required" });
  }

  // Validate format (UUID v4 pattern)
  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!UUID_PATTERN.test(loyalty_public_id.trim())) {
    return respond(400, { error: "Invalid loyalty_public_id format" });
  }

  // ── Lookup profile by public ID ─────────────────────────────────────────
  const { data: profile, error: lookupError } = await adminClient
    .from("profiles")
    .select(
      "full_name, loyalty_tier, loyalty_points, lifetime_points, loyalty_streak, last_order_date"
    )
    .eq("loyalty_public_id", loyalty_public_id.trim())
    .maybeSingle();

  if (lookupError) {
    console.error(JSON.stringify({ event: "db_lookup_failed", error: lookupError.message }));
    return respond(500, { error: "Lookup failed" });
  }

  if (!profile) {
    return respond(404, { error: "Customer not found" });
  }

  // ── Return only display-safe fields ────────────────────────────────────
  // Deliberately NO: id, email, phone, auth details
  return respond(200, {
    full_name:       profile.full_name       ?? null,
    loyalty_tier:    profile.loyalty_tier    ?? "bronze",
    loyalty_points:  profile.loyalty_points  ?? 0,
    lifetime_points: profile.lifetime_points ?? 0,
    loyalty_streak:  profile.loyalty_streak  ?? 0,
    last_order_date: profile.last_order_date ?? null,
  });
});

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}