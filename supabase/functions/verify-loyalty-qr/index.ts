// supabase/functions/verify-loyalty-qr/index.ts
// =============================================================================
// VERIFY LOYALTY QR — V2 (LOYALTY_ACCOUNTS ARCHITECTURE)
// =============================================================================
// Reads a customer's loyalty account by loyalty_public_id for display in scanner.
// Returns account balance, tier, streak from loyalty_accounts (source of truth).
//
// V2 Changes:
//   - Queries loyalty_accounts table (not profiles cache)
//   - Returns account_id (required for award/redeem operations)
//   - Balance from ledger-backed view, not profiles.loyalty_points
//
// Auth: JWT required, role must be 'admin'.
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
const ALLOWED_ORIGINS = [
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
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
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    log("warn", "missing_auth_header", { method: req.method });
    return respond(401, { error: "Missing authorization" }, cors);
  }

  const jwt = authHeader.slice(7);

  // Validate caller's JWT
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth:   { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: { user }, error: authError } = await callerClient.auth.getUser();

  if (authError || !user) {
    log("warn", "invalid_token", { error: authError?.message });
    return respond(401, { error: "Invalid token" }, cors);
  }

  // Verify admin role
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

  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!UUID_PATTERN.test(loyalty_public_id.trim())) {
    return respond(400, { error: "Invalid loyalty_public_id format" }, cors);
  }

  // ── V2 Lookup ───────────────────────────────────────────────────────────
  // Query loyalty_accounts table (source of truth) with profile join
  const { data: account, error: lookupError } = await adminClient
    .from("loyalty_accounts")
    .select(`
      id,
      balance,
      lifetime_earned,
      tier,
      streak,
      last_order_date,
      profiles!inner (
        id,
        loyalty_public_id,
        full_name
      )
    `)
    .eq("profiles.loyalty_public_id", loyalty_public_id.trim())
    .maybeSingle();

  if (lookupError) {
    log("error", "db_lookup_failed", { error: lookupError.message });
    return respond(500, { error: "Lookup failed" }, cors);
  }

  if (!account || !account.profiles) {
    return respond(404, { error: "Customer not found" }, cors);
  }

  log("info", "customer_verified", { 
    adminId: user.id,
    accountId: account.id 
  });
// Extract profile safely (Supabase returns relations as arrays)
const profile = account.profiles?.[0];

if (!profile) {
  return respond(500, {
    error: "Data integrity error: loyalty account missing profile"
  }, cors);
}

// Return account data + profile info
return respond(200, {
  account_id:      account.id,
  balance:         account.balance,
  lifetime_earned: account.lifetime_earned,
  tier:            account.tier ?? "bronze",
  streak:          account.streak ?? 0,
  last_order_date: account.last_order_date ?? null,
  full_name:       profile.full_name ?? null,
  profile_id:      profile.id,   // Kept for reference
}, cors)})