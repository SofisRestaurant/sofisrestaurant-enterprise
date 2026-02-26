// supabase/functions/award-loyalty-qr/index.ts
// =============================================================================
// AWARD LOYALTY QR — V2 (LOYALTY_ACCOUNTS ARCHITECTURE)
// =============================================================================
// Thin HTTP wrapper for v2_award_points() SQL function.
//
// V2 Changes:
//   - Calls v2_award_points(p_account_id, ...) not award_loyalty_points_atomic(p_user_id, ...)
//   - Uses account_id from scanner (not profile user_id)
//   - Idempotency via p_idempotency_key
//   - Returns was_duplicate flag for UI handling
//
// All financial logic lives in SQL:
//   ✔ Ledger append with idempotency
//   ✔ Account balance/tier/streak update
//   ✔ Trigger-synced cache
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error("Missing required environment variables");
}

const TIERS = {
  bronze:   { multiplier: 1.00 },
  silver:   { multiplier: 1.25 },
  gold:     { multiplier: 1.50 },
  platinum: { multiplier: 2.00 },
} as const;
type LoyaltyTier = keyof typeof TIERS;

function asTier(v: string | null | undefined): LoyaltyTier {
  if (v && v in TIERS) return v as LoyaltyTier;
  return "bronze";
}

function getStreakMultiplier(streak: number): number {
  if (streak >= 30) return 1.50;
  if (streak >= 7)  return 1.25;
  if (streak >= 3)  return 1.10;
  return 1.00;
}

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

async function authenticate(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false as const };

  const token = authHeader.replace("Bearer ", "");
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false },
  });

  const { data: { user }, error } = await anonClient.auth.getUser();
  if (error || !user) return { ok: false as const };

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: profile } = await svc
    .from("profiles").select("role").eq("id", user.id).single();

  return { ok: true as const, userId: user.id, role: profile?.role ?? "customer" };
}

Deno.serve(async (req): Promise<Response> => {
  const cors = getCorsHeaders(req);
  if (!cors)                    return new Response("Origin not allowed", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST")    return err("Method not allowed", cors, 405);

  const auth = await authenticate(req);
  if (!auth.ok)              return err("Unauthorized", cors, 401);
  if (auth.role !== "admin") return err("Forbidden: admin only", cors, 403);

  let body: { 
    account_id?: unknown;      // ✅ V2: account_id required
    amount_cents?: unknown; 
    order_id?: unknown;
    idempotency_key?: unknown; // ✅ V2: idempotency support
  };
  try { body = await req.json(); } catch { return err("Invalid JSON", cors); }

  const accountId  = String(body.account_id ?? "").trim();
  const amountCents = Math.round(Number(body.amount_cents));
  const orderId     = body.order_id ? String(body.order_id).trim() : null;
  const idempotencyKey = body.idempotency_key 
    ? String(body.idempotency_key).trim() 
    : orderId 
      ? `admin_scan:${orderId}` 
      : `admin_scan:${Date.now()}:${crypto.randomUUID()}`;

  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return err("Invalid account ID", cors);
  if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > 9_999_900) {
    return err("Invalid amount", cors);
  }

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // ── Read account context ───────────────────────────────────────────────────
  const { data: account, error: fetchErr } = await svc
    .from("loyalty_accounts")
    .select("tier, streak, last_activity")
    .eq("id", accountId)
    .single();

  if (fetchErr || !account) return err("Account not found", cors, 404);

  // ── Streak calculation (date arithmetic) ──────────────────────────────────
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const lastOrder = account.last_activity?.slice(0, 10) ?? null;

  let newStreak: number;
  if      (lastOrder === today)     newStreak = account.streak;
  else if (lastOrder === yesterday) newStreak = account.streak + 1;
  else                              newStreak = 1;

  // ── Multipliers (for audit metadata only) ─────────────────────────────────
  const tier         = asTier(account.tier);
  const tierMult     = TIERS[tier].multiplier;
  const streakMult   = getStreakMultiplier(newStreak);
  const basePoints   = Math.max(Math.floor(amountCents / 100), 0);
  const pointsEarned = Math.max(Math.floor(basePoints * tierMult * streakMult), 0);

  if (pointsEarned === 0) {
    return err("Purchase amount too small to earn points", cors, 422);
  }

  // ── ✅ V2: Single atomic RPC with idempotency ──────────────────────────────
  const { data: result, error: rpcErr } = await svc.rpc(
    "v2_award_points",
    {
      p_account_id:      accountId,          // ✅ V2: account_id not user_id
      p_points:          pointsEarned,
      p_admin_id:        auth.userId,
      p_base_points:     basePoints,
      p_tier:            tier,
      p_tier_mult:       tierMult,
      p_streak:          newStreak,
      p_streak_mult:     streakMult,
      p_amount_cents:    amountCents,
      p_order_id:        orderId,
      p_idempotency_key: idempotencyKey,    // ✅ V2: idempotency
    }
  );

  if (rpcErr || !result?.[0]) {
    log("error", "award_rpc_failed", { error: rpcErr, accountId });
    return err("Failed to award points", cors, 500);
  }

  const row = result[0] as {
    new_balance:   number;
    new_lifetime:  number;
    new_tier:      string;
    tier_changed:  boolean;
    was_duplicate: boolean;  // ✅ V2: idempotency detection
  };

  if (row.was_duplicate) {
    log("info", "award_duplicate_ignored", { accountId, orderId, idempotencyKey });
  } else {
    log("info", "points_awarded", {
      accountId,
      pointsEarned,
      newBalance:  row.new_balance,
      newTier:     row.new_tier,
      tierChanged: row.tier_changed,
      newStreak,
    });
  }

  return json({
    points_earned: row.was_duplicate ? 0 : pointsEarned,
    new_balance:   row.new_balance,
    new_lifetime:  row.new_lifetime,
    tier:          row.new_tier,
    tier_changed:  row.tier_changed,
    tier_before:   tier,
    streak:        newStreak,
    was_duplicate: row.was_duplicate,  // ✅ V2: Frontend can show "already awarded"
  }, cors);
});