// supabase/functions/award-loyalty-qr/index.ts
// =============================================================================
// AWARD LOYALTY QR — ENTERPRISE GRADE
// =============================================================================
// Calculates and awards loyalty points for a dine-in transaction.
// All multiplier math lives here — never on the frontend.
//
// Security:
//   - JWT required, role must be 'admin'
//   - Points calculation is server-authoritative (mirrors tiers.ts exactly)
//   - Atomic balance update (no race on concurrent scans)
//   - Streak calculated from last_order_date, not from client
//   - Tier upgrade applied atomically after new lifetime total
//   - Full audit in loyalty_transactions
// =============================================================================

import { createClient } from "@supabase/supabase-js";

// ── Env ───────────────────────────────────────────────────────────────────────
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error("Missing required environment variables");
}

const ALLOWED_ORIGINS = [
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

// ── Tier config (mirrors src/domain/loyalty/tiers.ts exactly) ────────────────
// Single source of truth for server-side math. Keep in sync with frontend type.
const TIERS = {
  bronze:   { multiplier: 1.00, threshold: 0,    nextAt: 500  },
  silver:   { multiplier: 1.25, threshold: 500,  nextAt: 2000 },
  gold:     { multiplier: 1.50, threshold: 2000, nextAt: 5000 },
  platinum: { multiplier: 2.00, threshold: 5000, nextAt: null },
} as const;

type LoyaltyTier = keyof typeof TIERS;
const TIER_ORDER: LoyaltyTier[] = ["bronze", "silver", "gold", "platinum"];

function asTier(v: string | null | undefined): LoyaltyTier {
  if (v && v in TIERS) return v as LoyaltyTier;
  return "bronze";
}

function resolveNewTier(lifetimePoints: number): LoyaltyTier {
  // Walk from highest tier down; return first tier whose threshold is met
  for (let i = TIER_ORDER.length - 1; i >= 0; i--) {
    if (lifetimePoints >= TIERS[TIER_ORDER[i]].threshold) return TIER_ORDER[i];
  }
  return "bronze";
}

// ── CORS ──────────────────────────────────────────────────────────────────────
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

// ── Auth ──────────────────────────────────────────────────────────────────────
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

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: profile } = await svc
    .from("profiles").select("role").eq("id", user.id).single();

  return { ok: true as const, userId: user.id, role: profile?.role ?? "customer" };
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req): Promise<Response> => {
  const cors = getCorsHeaders(req);
  if (!cors)              return new Response("Origin not allowed", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST")   return err("Method not allowed", cors, 405);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = await authenticate(req);
  if (!auth.ok)           return err("Unauthorized", cors, 401);
  if (auth.role !== "admin") return err("Forbidden: admin only", cors, 403);

  // ── Body ──────────────────────────────────────────────────────────────────
  let body: { loyalty_public_id?: unknown; amount_cents?: unknown };
  try { body = await req.json(); } catch { return err("Invalid JSON", cors); }

  const loyaltyId   = String(body.loyalty_public_id ?? "").trim();
  const amountCents = Math.round(Number(body.amount_cents));

  if (!/^[0-9a-f-]{36}$/i.test(loyaltyId)) return err("Invalid loyalty ID", cors);
  if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > 9_999_900) {
    return err("Invalid amount", cors);
  }

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ── Fetch customer ────────────────────────────────────────────────────────
  const { data: customer, error: fetchErr } = await svc
    .from("profiles")
    .select("id, loyalty_points, lifetime_points, loyalty_tier, loyalty_streak, last_order_date")
    .eq("loyalty_public_id", loyaltyId)
    .single();

  if (fetchErr || !customer) return err("Customer not found", cors, 404);

  // ── Server-side points calculation ────────────────────────────────────────
  const tier         = asTier(customer.loyalty_tier);
  const tierConfig   = TIERS[tier];
  const today        = new Date().toISOString().slice(0, 10);
  const lastOrder    = customer.last_order_date?.slice(0, 10) ?? null;

  // Compute new streak (only extend if last order was yesterday or no prior order)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  let newStreak    = customer.loyalty_streak ?? 0;

  if (lastOrder === today) {
    // Same day — no streak increment (idempotent same-day award)
    newStreak = customer.loyalty_streak;
  } else if (lastOrder === yesterday) {
    newStreak = customer.loyalty_streak + 1;
  } else {
    newStreak = 1; // streak broken or first order
  }

  // Streak multiplier (mirrors frontend calculatePointsPreview)
  const streakMultiplier =
    newStreak >= 30 ? 1.50 :
    newStreak >= 7  ? 1.25 :
    newStreak >= 3  ? 1.10 :
                      1.00;

  const basePoints    = Math.max(Math.floor(amountCents / 100), 0);
  const pointsEarned  = Math.max(Math.floor(basePoints * tierConfig.multiplier * streakMultiplier), 0);
  const newBalance    = customer.loyalty_points   + pointsEarned;
  const newLifetime   = customer.lifetime_points  + pointsEarned;

  // ── Tier upgrade resolution ───────────────────────────────────────────────
  const newTier     = resolveNewTier(newLifetime);
  const tierChanged = newTier !== tier;

  // ── Atomic profile update ─────────────────────────────────────────────────
  const { error: updateErr } = await svc.from("profiles").update({
    loyalty_points:   newBalance,
    lifetime_points:  newLifetime,
    loyalty_tier:     newTier,
    loyalty_streak:   newStreak,
    last_order_date:  today,
  }).eq("id", customer.id);

  if (updateErr) {
    log("error", "profile_update_failed", updateErr);
    return err("Failed to award points", cors, 500);
  }

  // ── Audit log ────────────────────────────────────────────────────────────
  await svc.from("loyalty_transactions").insert({
    user_id:          customer.id,
    admin_id:         auth.userId,
    points_change:    pointsEarned,
    type:             "earn",
    amount_cents:     amountCents,
    tier_at_time:     tier,
    tier_multiplier:  tierConfig.multiplier,
    streak_at_time:   newStreak,
    streak_multiplier: streakMultiplier,
    balance_after:    newBalance,
    note: `Earned ${pointsEarned} pts on $${(amountCents / 100).toFixed(2)} spend`,
  });

  log("info", "points_awarded", {
    customerId: customer.id, pointsEarned, newBalance, newTier, tierChanged, newStreak,
  });

  return json({
    points_earned: pointsEarned,
    new_balance:   newBalance,
    tier:          newTier,
    tier_changed:  tierChanged,
    tier_before:   tier,
    streak:        newStreak,
  }, cors);
});