// supabase/functions/redeem-loyalty/index.ts
// =============================================================================
// REDEEM LOYALTY — V2 PRODUCTION
// =============================================================================
// Calls v2_redeem_points() — exact signature confirmed from live DB:
//
//   v2_redeem_points(
//     p_account_id      uuid,
//     p_amount          integer,     ← points (not cents)
//     p_admin_id        uuid,
//     p_reference_id    uuid DEFAULT NULL,
//     p_idempotency_key text DEFAULT NULL
//   ) RETURNS TABLE(new_balance integer, was_duplicate boolean)
//
// DB handles: FOR UPDATE lock, idempotency check, balance validation,
//             ledger insert, all accounting. Zero financial logic here.
//
// Response fields match LoyaltyScan RedeemResult exactly:
//   new_balance, credit_cents, was_duplicate
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  // ── Parse + validate body ──────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, headers, 400); }

  const accountId = typeof body.account_id === "string" ? body.account_id.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) {
    return json({ error: "Invalid or missing account_id" }, headers, 400);
  }

  const points = Math.round(Number(body.points_to_redeem));
  if (!Number.isFinite(points) || points < 100 || points > 50_000) {
    return json({ error: "points_to_redeem must be between 100 and 50000" }, headers, 400);
  }

  // Stable idempotency key — caller may supply one for retry safety
  const idempotencyKey =
    typeof body.idempotency_key === "string" && body.idempotency_key.trim()
      ? body.idempotency_key.trim()
      : `redeem:${accountId}:${points}:${Date.now()}:${crypto.randomUUID()}`;

  const referenceId =
    typeof body.reference_id === "string" && body.reference_id.trim()
      ? body.reference_id.trim()
      : null;

  log("info", "redeem_request", { accountId, points, idempotencyKey });

  // ── Call v2_redeem_points ──────────────────────────────────────────────────
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: rows, error: rpcErr } = await svc.rpc("v2_redeem_points", {
    p_account_id:      accountId,
    p_amount:          points,       // integer points — matches DB signature exactly
    p_admin_id:        auth.userId,
    p_reference_id:    referenceId,
    p_idempotency_key: idempotencyKey,
  });

  // ── Error handling ─────────────────────────────────────────────────────────
  if (rpcErr) {
    if (rpcErr.code === "23514" || rpcErr.message?.toLowerCase().includes("insufficient")) {
      log("warn", "insufficient_balance", { accountId, points });
      return json({ error: "Insufficient points balance" }, headers, 422);
    }
    if (rpcErr.message?.toLowerCase().includes("not found")) {
      return json({ error: "Account not found" }, headers, 404);
    }
    log("error", "rpc_failed", { error: rpcErr, accountId });
    return json({ error: "Redemption failed" }, headers, 500);
  }

  if (!rows || rows.length === 0) {
    log("error", "rpc_empty", { accountId });
    return json({ error: "Redemption failed — no result" }, headers, 500);
  }

  const row = rows[0] as { new_balance: number; was_duplicate: boolean };

  if (row.was_duplicate) {
    log("info", "duplicate_ignored", { accountId, idempotencyKey });
    // ✅ Return new_balance so UI can still update optimistically if needed
    return json({ new_balance: row.new_balance, credit_cents: 0, was_duplicate: true }, headers);
  }

  // 1 point = $0.01 → credit_cents = points
  const creditCents = points;
  log("info", "redeemed", { accountId, points, creditCents, newBalance: row.new_balance });

  // ✅ Response matches LoyaltyScan RedeemResult exactly
  return json({
    new_balance:   row.new_balance,
    credit_cents:  creditCents,
    was_duplicate: false,
  }, headers);
});