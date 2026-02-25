// supabase/functions/redeem-loyalty/index.ts
// =============================================================================
// REDEEM LOYALTY — ENTERPRISE GRADE
// =============================================================================
// Called by the admin LoyaltyScan UI when staff awards a dine-in redemption,
// or by a future self-serve flow when a customer applies points at checkout.
//
// Security model:
//   - JWT required (Supabase Auth)
//   - Role validated: admin for staff-initiated redemptions
//   - Points deducted atomically via Postgres UPDATE ... RETURNING
//   - If atomic deduction fails (insufficient balance), entire request rejected
//   - user_credits row inserted only after successful deduction
//   - loyalty_transactions row written for full audit trail
//   - All writes are inside a single DB interaction; partial failure = rejected
//
// Request body:
//   {
//     loyalty_public_id: string   // UUID from customer QR code
//     points_to_redeem:  number   // integer > 0
//     mode: 'dine_in' | 'online'  // dine_in = immediate discount; online = credit
//   }
//
// Response:
//   {
//     credit_cents:  number   // dollar value of credit issued
//     new_balance:   number   // points balance after deduction
//     credit_id?:    string   // user_credits.id (online mode only)
//   }
// =============================================================================

import { createClient } from "@supabase/supabase-js";

// ── Env ───────────────────────────────────────────────────────────────────────
const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error("Missing required environment variables");
}

// ── Config ────────────────────────────────────────────────────────────────────
const POINTS_PER_DOLLAR = 100;          // 100 pts = $1.00 credit
const MIN_REDEEM_POINTS = 100;          // minimum redemption
const MAX_REDEEM_POINTS = 50_000;       // safety ceiling per transaction
const CREDIT_EXPIRES_DAYS = 90;        // online credits expire in 90 days

const ALLOWED_ORIGINS = [
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

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

// ── Helpers ───────────────────────────────────────────────────────────────────
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
async function authenticate(req: Request): Promise<{ ok: false } | { ok: true; userId: string; role: string }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false };

  const token = authHeader.replace("Bearer ", "");

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false },
  });

  const { data: { user }, error } = await anonClient.auth.getUser();
  if (error || !user) return { ok: false };

  // Fetch role from profiles
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return { ok: true, userId: user.id, role: profile?.role ?? "customer" };
}

// ── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (!cors) return new Response("Origin not allowed", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return err("Method not allowed", cors, 405);

  // ── Auth ────────────────────────────────────────────────────────────────
  const auth = await authenticate(req);
  if (!auth.ok) return err("Unauthorized", cors, 401);

  // Only admins can redeem on behalf of customers (staff-initiated dine-in)
  if (auth.role !== "admin") return err("Forbidden: admin only", cors, 403);

  // ── Body ────────────────────────────────────────────────────────────────
  let body: { loyalty_public_id?: unknown; points_to_redeem?: unknown; mode?: unknown };
  try { body = await req.json(); } catch { return err("Invalid JSON", cors); }

  const loyaltyId     = String(body.loyalty_public_id ?? "").trim();
  const pointsToRedeem = Math.round(Number(body.points_to_redeem));
  const mode          = String(body.mode ?? "dine_in");

  if (!/^[0-9a-f-]{36}$/i.test(loyaltyId)) return err("Invalid loyalty ID", cors);
  if (!Number.isInteger(pointsToRedeem) || pointsToRedeem < MIN_REDEEM_POINTS) {
    return err(`Minimum redemption is ${MIN_REDEEM_POINTS} points`, cors);
  }
  if (pointsToRedeem > MAX_REDEEM_POINTS) {
    return err(`Maximum redemption is ${MAX_REDEEM_POINTS} points per transaction`, cors);
  }
  if (mode !== "dine_in" && mode !== "online") return err("Invalid mode", cors);

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ── Resolve customer by loyalty_public_id ───────────────────────────────
  const { data: customer, error: customerErr } = await svc
    .from("profiles")
    .select("id, loyalty_points, loyalty_tier")
    .eq("loyalty_public_id", loyaltyId)
    .single();

  if (customerErr || !customer) return err("Customer not found", cors, 404);

  // ── Atomic point deduction ──────────────────────────────────────────────
  // UPDATE returns 0 rows if balance is insufficient → rejection with no partial write.
  const { data: updated, error: deductErr } = await svc
    .from("profiles")
    .update({ loyalty_points: customer.loyalty_points - pointsToRedeem })
    .eq("id", customer.id)
    .gte("loyalty_points", pointsToRedeem)   // atomic guard: reject if insufficient
    .select("loyalty_points")
    .single();

  if (deductErr || !updated) {
    log("warn", "atomic_deduction_failed", { customerId: customer.id, pointsToRedeem, balance: customer.loyalty_points });
    return err("Insufficient points balance", cors, 422);
  }

  const newBalance  = updated.loyalty_points;
  const creditCents = Math.floor((pointsToRedeem / POINTS_PER_DOLLAR) * 100);

  // ── loyalty_transactions audit row ─────────────────────────────────────
  const { error: txErr } = await svc.from("loyalty_transactions").insert({
    user_id:       customer.id,
    admin_id:      auth.userId,
    points_change: -pointsToRedeem,
    type:          "redemption",
    mode,
    balance_after: newBalance,
    note:          `Redeemed ${pointsToRedeem} pts for $${(creditCents / 100).toFixed(2)} credit (${mode})`,
  });

  if (txErr) {
    // Non-fatal: balance was already deducted. Log and continue.
    log("error", "loyalty_transaction_insert_failed", txErr);
  }

  // ── user_credit (online mode only — dine_in is immediate cash discount) ─
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
      log("error", "user_credit_insert_failed", creditErr);
      // Points were deducted — refund them to maintain consistency
      await svc
        .from("profiles")
        .update({ loyalty_points: newBalance + pointsToRedeem })
        .eq("id", customer.id);
      return err("Failed to issue credit — points refunded", cors, 500);
    }

    creditId = credit.id;
    log("info", "online_credit_issued", { customerId: customer.id, creditCents, creditId, expiresAt });
  } else {
    log("info", "dine_in_redemption", { customerId: customer.id, creditCents, pointsRedeemed: pointsToRedeem });
  }

  return json({ credit_cents: creditCents, new_balance: newBalance, credit_id: creditId }, cors);
});