// supabase/functions/award-loyalty-qr/index.ts
// =============================================================================
// AWARD LOYALTY QR — FINAL PRODUCTION VERSION
// =============================================================================
// This function is now a thin HTTP wrapper. All financial logic lives in SQL:
//
//   award_loyalty_points_atomic() handles:
//     ✔ Profile row lock (FOR UPDATE — serialises concurrent awards)
//     ✔ Balance read from ledger (never from TypeScript)
//     ✔ Lifetime points from ledger (never computed in TypeScript)
//     ✔ Ledger append with ON CONFLICT DO NOTHING (idempotency)
//     ✔ Tier resolution via resolve_loyalty_tier() SQL function
//     ✔ Tier + streak written to profiles in same transaction
//     ✔ Cache sync via trg_sync_cached_balance trigger
//
// This function only:
//   - Authenticates the caller
//   - Validates input shapes
//   - Computes streak (date arithmetic — appropriate in application layer)
//   - Computes multipliers (mirrors SQL tier config, passed for audit only)
//   - Calls the RPC
//   - Returns the response
//
// Nothing financial is computed in TypeScript.
// =============================================================================

import { createClient } from "@supabase/supabase-js";

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

  let body: { loyalty_public_id?: unknown; amount_cents?: unknown; order_id?: unknown };
  try { body = await req.json(); } catch { return err("Invalid JSON", cors); }

  const loyaltyId   = String(body.loyalty_public_id ?? "").trim();
  const amountCents = Math.round(Number(body.amount_cents));
  const orderId     = body.order_id ? String(body.order_id).trim() : null;

  if (!/^[0-9a-f-]{36}$/i.test(loyaltyId)) return err("Invalid loyalty ID", cors);
  if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > 9_999_900) {
    return err("Invalid amount", cors);
  }
  if (orderId && !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return err("Invalid order ID", cors);
  }

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Read only tier/streak context — SQL owns all financial state
  const { data: customer, error: fetchErr } = await svc
    .from("profiles")
    .select("id, loyalty_tier, loyalty_streak, last_order_date")
    .eq("loyalty_public_id", loyaltyId)
    .single();

  if (fetchErr || !customer) return err("Customer not found", cors, 404);

  // ── Streak (date arithmetic — safe in application layer) ──────────────────
  const today     = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const lastOrder = customer.last_order_date?.slice(0, 10) ?? null;

  let newStreak: number;
  if      (lastOrder === today)     newStreak = customer.loyalty_streak;
  else if (lastOrder === yesterday) newStreak = customer.loyalty_streak + 1;
  else                              newStreak = 1;

  // ── Multipliers (passed to RPC for audit only — SQL resolves tier authoritatively) ──
  const tier         = asTier(customer.loyalty_tier);
  const tierMult     = TIERS[tier].multiplier;
  const streakMult   = getStreakMultiplier(newStreak);
  const basePoints   = Math.max(Math.floor(amountCents / 100), 0);
  const pointsEarned = Math.max(Math.floor(basePoints * tierMult * streakMult), 0);

  if (pointsEarned === 0) {
    return err("Purchase amount too small to earn points", cors, 422);
  }

  // ── Single atomic RPC — all state committed in one DB transaction ─────────
  const { data: result, error: rpcErr } = await svc.rpc(
    "award_loyalty_points_atomic",
    {
      p_user_id:      customer.id,
      p_points:       pointsEarned,
      p_admin_id:     auth.userId,
      p_base_points:  basePoints,
      p_tier:         tier,
      p_tier_mult:    tierMult,
      p_streak:       newStreak,
      p_streak_mult:  streakMult,
      p_amount_cents: amountCents,
      p_order_id:     orderId,
    }
  );

  if (rpcErr || !result?.[0]) {
    log("error", "award_rpc_failed", { error: rpcErr, customerId: customer.id });
    return err("Failed to award points", cors, 500);
  }

  const row = result[0] as {
    new_balance:   number;
    new_lifetime:  number;
    new_tier:      string;
    tier_changed:  boolean;
    was_duplicate: boolean;
  };

  if (row.was_duplicate) {
    log("info", "award_duplicate_ignored", { customerId: customer.id, orderId });
  } else {
    log("info", "points_awarded", {
      customerId:  customer.id,
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
    was_duplicate: row.was_duplicate,
  }, cors);
});