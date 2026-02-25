
import { createClient } from "supabase";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

const MAX_AMOUNT_CENTS = 999_900; // $9,999 — safety cap

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  // ── Verify admin JWT ────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return respond(401, { error: "Missing authorization" });
  }

  const jwt = authHeader.slice(7);
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: { user }, error: authError } = await callerClient.auth.getUser();

  if (authError || !user) {
    return respond(401, { error: "Invalid token" });
  }

  const { data: callerProfile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (callerProfile?.role !== "admin") {
    return respond(403, { error: "Admin access required" });
  }

  // ── Parse + validate body ───────────────────────────────────────────────
  let body: { loyalty_public_id?: string; amount_cents?: number };
  try {
    body = await req.json();
  } catch {
    return respond(400, { error: "Invalid JSON" });
  }

  const { loyalty_public_id, amount_cents } = body;

  if (!loyalty_public_id || typeof loyalty_public_id !== "string") {
    return respond(400, { error: "loyalty_public_id is required" });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(loyalty_public_id.trim())) {
    return respond(400, { error: "Invalid loyalty_public_id format" });
  }

  if (!amount_cents || typeof amount_cents !== "number" || !Number.isInteger(amount_cents)) {
    return respond(400, { error: "amount_cents must be a positive integer" });
  }

  if (amount_cents <= 0 || amount_cents > MAX_AMOUNT_CENTS) {
    return respond(400, { error: `amount_cents must be between 1 and ${MAX_AMOUNT_CENTS}` });
  }

  // ── Resolve loyalty_public_id → internal user UUID ──────────────────────
  // This is the only place the internal UUID is used — it never leaves this function.
  const { data: profile, error: lookupError } = await adminClient
    .from("profiles")
    .select("id") // internal UUID — service role only, never returned to client
    .eq("loyalty_public_id", loyalty_public_id.trim())
    .maybeSingle();

  if (lookupError) {
    console.error(JSON.stringify({ event: "lookup_failed", error: lookupError.message }));
    return respond(500, { error: "Lookup failed" });
  }

  if (!profile) {
    return respond(404, { error: "Customer not found" });
  }

  // ── Call award_loyalty_points Postgres function ─────────────────────────
  // p_order_id is null for in-person QR awards (no Stripe order involved)
  const { data: result, error: rpcError } = await adminClient.rpc(
    "award_loyalty_points",
    {
      p_user_id:      profile.id,
      p_order_id:     null,
      p_amount_cents: amount_cents,
    }
  );

  if (rpcError) {
    console.error(JSON.stringify({
      event:   "award_rpc_failed",
      error:   rpcError.message,
      adminId: user.id,
    }));
    return respond(500, { error: "Failed to award points" });
  }

  // Log the award for audit trail
  console.log(JSON.stringify({
    event:        "qr_points_awarded",
    adminId:      user.id,
    publicId:     loyalty_public_id.slice(0, 8) + "...",
    amountCents:  amount_cents,
    pointsEarned: (result as Record<string, number>).points_earned,
  }));

  // Return result to admin UI — no internal IDs included
  const r = result as Record<string, unknown>;
  return respond(200, {
    points_earned: r.points_earned,
    new_balance:   r.new_balance,
    new_lifetime:  r.new_lifetime,
    tier:          r.tier,
    tier_changed:  r.tier_changed,
    tier_before:   r.tier_before,
    streak:        r.streak,
  });
});

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}