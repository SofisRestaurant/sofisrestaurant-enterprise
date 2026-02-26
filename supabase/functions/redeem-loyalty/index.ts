// supabase/functions/redeem-loyalty/index.ts
// =============================================================================
// REDEEM LOYALTY — V2 (LOYALTY_ACCOUNTS ARCHITECTURE)
// =============================================================================
// Thin HTTP wrapper for v2_redeem_points() SQL function.
//
// V2 Changes:
//   - Calls v2_redeem_points(p_account_id, ...) not redeem_loyalty_points_atomic(p_user_id, ...)
//   - Uses account_id from scanner (not profile user_id)
//   - Idempotency via p_idempotency_key
//   - Returns was_duplicate flag
//
// All financial logic lives in SQL:
//   ✔ Account row lock (FOR UPDATE)
//   ✔ Balance read from ledger
//   ✔ Insufficient balance rejection
//   ✔ Ledger append of negative delta
//   ✔ Trigger-synced cache
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error("Missing required environment variables");
}

const POINTS_PER_DOLLAR   = 100;
const MIN_REDEEM_POINTS   = 100;
const MAX_REDEEM_POINTS   = 50_000;
const CREDIT_EXPIRES_DAYS = 90;

const ALLOWED_ORIGINS = [
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
];

function getCorsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.includes(origin)) {
    const allowedOrigin = ALLOWED_ORIGINS[0];
    return {
      "Access-Control-Allow-Origin":  allowedOrigin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
  }
  return {
    "Access-Control-Allow-Origin":  origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function log(level: "info" | "warn" | "error", msg: string, data?: unknown) {
  console.log(JSON.stringify({ level, msg, data, time: new Date().toISOString() }));
}

function json(data: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function err(message: string, cors: Record<string, string>, status = 400) {
  log("error", message);
  return json({ error: message }, cors, status);
}

async function authenticate(
  req: Request
): Promise<{ ok: false } | { ok: true; userId: string; role: string }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false };

  const token = authHeader.replace("Bearer ", "");
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false },
  });

  const { data: { user }, error } = await anonClient.auth.getUser();
  if (error || !user) return { ok: false };

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: profile } = await svc
    .from("profiles").select("role").eq("id", user.id).single();

  return { ok: true, userId: user.id, role: profile?.role ?? "customer" };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (!cors)                    return new Response("Origin not allowed", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST")    return err("Method not allowed", cors, 405);

  const auth = await authenticate(req);
  if (!auth.ok)              return err("Unauthorized", cors, 401);
  if (auth.role !== "admin") return err("Forbidden: admin only", cors, 403);

  let body: { 
    account_id?: unknown;         // ✅ V2: account_id required
    points_to_redeem?: unknown; 
    mode?: unknown;
    idempotency_key?: unknown;    // ✅ V2: idempotency support
  };
  try { body = await req.json(); } catch { return err("Invalid JSON", cors); }

  const accountId      = String(body.account_id ?? "").trim();
  const pointsToRedeem = Math.round(Number(body.points_to_redeem));
  const mode           = String(body.mode ?? "dine_in");
  const idempotencyKey = body.idempotency_key 
    ? String(body.idempotency_key).trim()
    : `admin_redeem:${Date.now()}:${crypto.randomUUID()}`;

  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return err("Invalid account ID", cors);
  if (!Number.isInteger(pointsToRedeem) || pointsToRedeem < MIN_REDEEM_POINTS) {
    return err(`Minimum redemption is ${MIN_REDEEM_POINTS} points`, cors);
  }
  if (pointsToRedeem > MAX_REDEEM_POINTS) {
    return err(`Maximum redemption is ${MAX_REDEEM_POINTS} points per transaction`, cors);
  }
  if (mode !== "dine_in" && mode !== "online") return err("Invalid mode", cors);

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ── Get user_id for user_credits insert ───────────────────────────────────
  const { data: account, error: accountErr } = await svc
    .from("loyalty_accounts")
    .select("user_id")
    .eq("id", accountId)
    .single();

  if (accountErr || !account) return err("Account not found", cors, 404);

  // ── ✅ V2: Atomic redemption via RPC with idempotency ──────────────────────
const { data: redeemData, error: redeemErr } = await svc.rpc(
  "v2_redeem_points",
  {
    p_account_id: accountId,
    p_amount: pointsToRedeem,
    p_admin_id: auth.userId,
    p_reference_id: null,
    p_idempotency_key: idempotencyKey,
  }
);

  if (redeemErr) {
    const isInsufficient =
      redeemErr.code === "23514" ||
      redeemErr.message?.toLowerCase().includes("insufficient balance");

    log(
      isInsufficient ? "warn" : "error",
      isInsufficient ? "insufficient_balance" : "redeem_rpc_failed",
      { error: redeemErr, accountId, pointsToRedeem }
    );

    return isInsufficient
      ? err("Insufficient points balance", cors, 422)
      : err("Redemption failed", cors, 500);
  }

  if (!redeemData?.[0]) {
    log("error", "redeem_rpc_no_data", { accountId });
    return err("Redemption failed", cors, 500);
  }

  const row = redeemData[0] as {
    new_balance:   number;
    was_duplicate: boolean;  // ✅ V2: idempotency detection
  };

  if (row.was_duplicate) {
    log("info", "redeem_duplicate_ignored", { accountId, idempotencyKey });
    return json({
      credit_cents: 0,
      new_balance: row.new_balance,
      was_duplicate: true,
    }, cors);
  }

  const creditCents = Math.floor((pointsToRedeem / POINTS_PER_DOLLAR) * 100);

  // ── user_credits (online mode only) ──────────────────────────────────────
  let creditId: string | undefined;

  if (mode === "online") {
    const expiresAt = new Date(Date.now() + CREDIT_EXPIRES_DAYS * 86_400_000).toISOString();

    const { data: credit, error: creditErr } = await svc
      .from("user_credits")
      .insert({
        user_id:      account.user_id,
        amount_cents: creditCents,
        source:       "loyalty_redemption",
        expires_at:   expiresAt,
      })
      .select("id")
      .single();

    if (creditErr || !credit) {
      // Redemption committed — issue corrective reversal
      log("error", "user_credit_insert_failed — issuing correction", creditErr);

      const { error: correctionErr } = await svc.rpc("v2_issue_correction", {
        p_account_id: accountId,
        p_points:     pointsToRedeem,
        p_admin_id:   auth.userId,
        p_reason:     "user_credits_insert_failed",
      });

      if (correctionErr) {
        log("error", "CRITICAL: correction_rpc_also_failed", {
          accountId,
          pointsToRedeem,
          correctionErr,
        });
      }

      return err("Failed to issue credit — points refunded", cors, 500);
    }

    creditId = credit.id;
    log("info", "online_credit_issued", {
      accountId, creditCents, creditId, expiresAt,
    });
  } else {
    log("info", "dine_in_redemption", {
      accountId, creditCents, pointsRedeemed: pointsToRedeem,
    });
  }

  return json({ 
    credit_cents: creditCents, 
    new_balance: row.new_balance, 
    credit_id: creditId,
    was_duplicate: false,
  }, cors);
});