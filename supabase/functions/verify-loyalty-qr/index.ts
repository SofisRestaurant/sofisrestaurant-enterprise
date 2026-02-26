// supabase/functions/verify-loyalty-qr/index.ts
// =============================================================================
// VERIFY LOYALTY QR — V2 PRODUCTION
// =============================================================================
// Returns field names that match LoyaltyScan CustomerProfile exactly:
//   account_id, full_name, tier, balance, lifetime_earned, streak, last_activity
// =============================================================================

import { createClient } from "supabase";

// ── Environment ───────────────────────────────────────────────────────────────
const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
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

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin":  ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  };
}

function json(data: unknown, headers: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function log(level: "info" | "warn" | "error", msg: string, data?: unknown) {
  console.log(JSON.stringify({ level, msg, data, ts: new Date().toISOString() }));
}

// ── Auth: validate JWT + re-verify admin from DB ──────────────────────────────
async function authenticate(req: Request): Promise<{ ok: true; userId: string } | { ok: false }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false };

  const token = authHeader.slice(7);

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    auth:   { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await caller.auth.getUser();
  if (error || !user) return { ok: false };

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    log("warn", "non_admin_attempt", { userId: user.id });
    return { ok: false };
  }

  return { ok: true, userId: user.id };
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  const headers = corsHeaders(req);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, headers, 405);

  const auth = await authenticate(req);
  if (!auth.ok) return json({ error: "Unauthorized" }, headers, 401);

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { loyalty_public_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, headers, 400); }

  const loyalty_public_id = body.loyalty_public_id?.trim() ?? "";
  if (!loyalty_public_id) {
    return json({ error: "loyalty_public_id is required" }, headers, 400);
  }

  // Must be a v4 UUID
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(loyalty_public_id)) {
    return json({ error: "Invalid loyalty_public_id format" }, headers, 400);
  }

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ── Step 1: Profile lookup ─────────────────────────────────────────────────
  const { data: profile, error: profileErr } = await svc
    .from("profiles")
    .select("id, full_name")
    .eq("loyalty_public_id", loyalty_public_id)
    .maybeSingle();

  if (profileErr) {
    log("error", "profile_lookup_failed", profileErr.message);
    return json({ error: "Lookup failed" }, headers, 500);
  }
  if (!profile) {
    return json({ error: "Customer not found" }, headers, 404);
  }

  // ── Step 2: Loyalty account lookup ────────────────────────────────────────
  const { data: account, error: accountErr } = await svc
    .from("loyalty_accounts")
    .select("id, balance, lifetime_earned, tier, streak, last_activity, status")
    .eq("user_id", profile.id)
    .maybeSingle();

  if (accountErr) {
    log("error", "account_lookup_failed", accountErr.message);
    return json({ error: "Lookup failed" }, headers, 500);
  }
  if (!account) {
    return json({ error: "Loyalty account not found" }, headers, 404);
  }

  // Suspended / closed accounts cannot be scanned
  if (account.status === "suspended" || account.status === "closed") {
    log("warn", "suspended_account_scan", { accountId: account.id, status: account.status });
    return json({ error: `Account is ${account.status}` }, headers, 403);
  }

  log("info", "customer_verified", { adminId: auth.userId, accountId: account.id });

  // ── Response — V2 field names match LoyaltyScan CustomerProfile exactly ────
  return json({
    // Identity
    account_id:      account.id,               // ✅ used by award-loyalty-qr + redeem-loyalty
    profile_id:      profile.id,

    // ✅ V2: exact CustomerProfile field names
    full_name:       profile.full_name    ?? null,
    tier:            account.tier         ?? "bronze",
    balance:         account.balance      ?? 0,
    lifetime_earned: account.lifetime_earned ?? 0,
    streak:          account.streak       ?? 0,
    last_activity:   account.last_activity ?? null,

    // Status (for UI awareness)
    account_status:  account.status       ?? "active",
  }, headers);
});