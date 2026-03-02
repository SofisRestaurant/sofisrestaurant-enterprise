// supabase/functions/award-loyalty-qr/index.ts
// =============================================================================
// AWARD LOYALTY QR — V2 (ADMIN ONLY)
// =============================================================================
// - Strict CORS allowlist
// - Auth required (JWT)
// - Admin gate via profiles.role
// - Uses service RPC v2_award_points with idempotency key
// =============================================================================

import { createAnonClient, createServiceClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────
// Strict CORS (Dev + Production)
// ─────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
  "http://localhost:3000",
  "http://localhost:5173",
] as const;

function corsHeaders(origin: string | null) {
  const allowedOrigins: readonly string[] = ALLOWED_ORIGINS;

  const allowed =
    origin && allowedOrigins.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-application-name",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  } as const;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function isValidUUID(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function json(body: unknown, headers: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function getBearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!h.startsWith("Bearer ")) return null;
  const t = h.slice("Bearer ".length).trim();
  return t || null;
}

// ─────────────────────────────────────────────
// Auth + Admin Gate
// ─────────────────────────────────────────────
async function authenticateAdmin(req: Request): Promise<string | null> {
  const jwt = getBearer(req);
  if (!jwt) return null;

  // 1) Identify caller using anon client (RLS-bound)
  const anon = createAnonClient(jwt);
  const { data: authData, error: authErr } = await anon.auth.getUser();
  if (authErr || !authData?.user) return null;

  const userId = authData.user.id;

  // 2) Check admin role using service client (authoritative)
  const svc = createServiceClient();
  const { data: profile, error: profileErr } = await svc
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr || !profile) return null;
  if (profile.role !== "admin") return null;

  return userId;
}

// ─────────────────────────────────────────────
// Main Handler
// ─────────────────────────────────────────────
export default Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));

  try {
    // Preflight
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, headers, 405);

    const adminId = await authenticateAdmin(req);
    if (!adminId) return json({ error: "Unauthorized" }, headers, 401);

    const body = await req.json().catch(() => null) as
      | { account_id?: unknown; amount_cents?: unknown }
      | null;

    const account_id = typeof body?.account_id === "string" ? body.account_id : null;
    const amount_cents =
      typeof body?.amount_cents === "number" && Number.isFinite(body.amount_cents)
        ? Math.floor(body.amount_cents)
        : null;

    if (!account_id || !isValidUUID(account_id) || amount_cents == null || amount_cents <= 0) {
      return json({ error: "Invalid request data" }, headers, 400);
    }

    // Enforce minimum award (example: $1 -> 100 cents -> 1 point)
    const points = Math.floor(amount_cents / 100);
    if (points <= 0) return json({ error: "Amount too small" }, headers, 400);

    const svc = createServiceClient();

    // Ensure account exists (optional but helpful for cleaner errors)
    const { data: account, error: accountError } = await svc
      .from("loyalty_accounts")
      .select("id")
      .eq("id", account_id)
      .maybeSingle();

    if (accountError) return json({ error: "Failed to verify account" }, headers, 500);
    if (!account) return json({ error: "Account not found" }, headers, 404);

    // ✅ V2 Award (idempotent)
    const idempotencyKey = `admin-award:${account_id}:${amount_cents}:${crypto.randomUUID()}`;

    const { data, error } = await svc.rpc("v2_award_points", {
      p_account_id: account_id,
      p_admin_id: adminId,
      p_amount_cents: amount_cents,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      console.error("v2_award_points RPC error:", error);
      return json({ error: "Award failed" }, headers, 500);
    }

    // RPC returns array per your generated types
    return json(data?.[0] ?? null, headers, 200);
  } catch (err) {
    console.error("AWARD LOYALTY ERROR:", err);
    return json({ error: "Internal server error" }, headers, 500);
  }
});