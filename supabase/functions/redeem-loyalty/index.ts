// supabase/functions/redeem-loyalty/index.ts
// =============================================================================
// REDEEM LOYALTY — FINAL PRODUCTION VERSION
// =============================================================================
// Thin HTTP wrapper. All financial logic lives in SQL:
//
//   redeem_loyalty_points_atomic() handles:
//     ✔ Profile row lock (FOR UPDATE — prevents concurrent double-spend)
//     ✔ Balance read from ledger (not from profiles cache)
//     ✔ Insufficient balance rejection (raises check_violation, auto-rollback)
//     ✔ Ledger append of negative delta
//     ✔ Cache sync via trg_sync_cached_balance trigger
//
//   issue_loyalty_correction() handles:
//     ✔ Compensating reversal when downstream write fails
//     ✔ correction:true in metadata — distinguishable in audit trail
//
// This function only:
//   - Authenticates the caller
//   - Validates input shapes
//   - Calls the redemption RPC
//   - Inserts user_credits (online mode)
//   - Calls correction RPC if user_credits insert fails
// =============================================================================

import { createClient } from "@supabase/supabase-js";

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
];

function getCorsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.includes(origin)) return null;
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

  let body: { loyalty_public_id?: unknown; points_to_redeem?: unknown; mode?: unknown };
  try { body = await req.json(); } catch { return err("Invalid JSON", cors); }

  const loyaltyId      = String(body.loyalty_public_id ?? "").trim();
  const pointsToRedeem = Math.round(Number(body.points_to_redeem));
  const mode           = String(body.mode ?? "dine_in");

  if (!/^[0-9a-f-]{36}$/i.test(loyaltyId)) return err("Invalid loyalty ID", cors);
  if (!Number.isInteger(pointsToRedeem) || pointsToRedeem < MIN_REDEEM_POINTS) {
    return err(`Minimum redemption is ${MIN_REDEEM_POINTS} points`, cors);
  }
  if (pointsToRedeem > MAX_REDEEM_POINTS) {
    return err(`Maximum redemption is ${MAX_REDEEM_POINTS} points per transaction`, cors);
  }
  if (mode !== "dine_in" && mode !== "online") return err("Invalid mode", cors);

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: customer, error: customerErr } = await svc
    .from("profiles")
    .select("id")
    .eq("loyalty_public_id", loyaltyId)
    .single();

  if (customerErr || !customer) return err("Customer not found", cors, 404);

  // ── Atomic redemption via RPC ─────────────────────────────────────────────
  // Locks profile row → reads ledger balance → rejects if insufficient →
  // appends negative delta → trigger syncs cache → returns new balance.
  const { data: redeemData, error: redeemErr } = await svc.rpc(
    "redeem_loyalty_points_atomic",
    {
      p_user_id:  customer.id,
      p_points:   pointsToRedeem,
      p_admin_id: auth.userId,
      p_mode:     mode,
    }
  );

  if (redeemErr) {
    const isInsufficient =
      redeemErr.code === "23514" ||
      redeemErr.message?.toLowerCase().includes("insufficient balance");

    log(
      isInsufficient ? "warn" : "error",
      isInsufficient ? "insufficient_balance" : "redeem_rpc_failed",
      { error: redeemErr, customerId: customer.id, pointsToRedeem }
    );

    return isInsufficient
      ? err("Insufficient points balance", cors, 422)
      : err("Redemption failed", cors, 500);
  }

  if (!redeemData?.[0]) {
    log("error", "redeem_rpc_no_data", { customerId: customer.id });
    return err("Redemption failed", cors, 500);
  }

  const newBalance  = redeemData[0].new_balance as number;
  const creditCents = Math.floor((pointsToRedeem / POINTS_PER_DOLLAR) * 100);

  // ── user_credits (online mode only) ──────────────────────────────────────
  let creditId: string | undefined;

  if (mode === "online") {
    const expiresAt = new Date(Date.now() + CREDIT_EXPIRES_DAYS * 86_400_000).toISOString();

    const { data: credit, error: creditErr } = await svc
      .from("user_credits")
      .insert({
        user_id:      customer.id,
        amount_cents: creditCents,
        source:       "loyalty_redemption",
        expires_at:   expiresAt,
      })
      .select("id")
      .single();

    if (creditErr || !credit) {
      // Redemption committed — issue a named corrective reversal.
      // correction:true in metadata makes this distinguishable from normal earns.
      log("error", "user_credit_insert_failed — issuing correction", creditErr);

      const { error: correctionErr } = await svc.rpc("issue_loyalty_correction", {
        p_user_id:  customer.id,
        p_points:   pointsToRedeem,
        p_admin_id: auth.userId,
        p_reason:   "user_credits_insert_failed",
      });

      if (correctionErr) {
        // Correction also failed — this is a critical incident requiring manual review
        log("error", "CRITICAL: correction_rpc_also_failed", {
          customerId: customer.id,
          pointsToRedeem,
          correctionErr,
        });
      }

      return err("Failed to issue credit — points refunded", cors, 500);
    }

    creditId = credit.id;
    log("info", "online_credit_issued", {
      customerId: customer.id, creditCents, creditId, expiresAt,
    });
  } else {
    log("info", "dine_in_redemption", {
      customerId: customer.id, creditCents, pointsRedeemed: pointsToRedeem,
    });
  }

  return json({ credit_cents: creditCents, new_balance: newBalance, credit_id: creditId }, cors);
});