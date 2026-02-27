// supabase/functions/award-loyalty-qr/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────
// Environment
// ─────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// ─────────────────────────────────────────────
// Strict CORS (Dev + Production)
// ─────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
  "http://localhost:3000",
  "http://localhost:5173",
];

function corsHeaders(origin: string | null) {
  const allowed =
    origin && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
  "authorization, x-client-info, apikey, content-type, x-application-name",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// ─────────────────────────────────────────────
// UUID Validator
// ─────────────────────────────────────────────
function isValidUUID(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// ─────────────────────────────────────────────
// Authenticate & Verify Admin Role
// ─────────────────────────────────────────────
async function authenticateAdmin(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: { user }, error } = await anon.auth.getUser();
  if (error || !user) return null;

  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") return null;

  return user.id;
}

// ─────────────────────────────────────────────
// Main Handler
// ─────────────────────────────────────────────
Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));

  try {
    // Preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers }
      );
    }

    const adminId = await authenticateAdmin(req);
    if (!adminId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers }
      );
    }

    const body = await req.json();
    const account_id = body?.account_id;
    const amount_cents = body?.amount_cents;

    if (
      !account_id ||
      !amount_cents ||
      typeof amount_cents !== "number" ||
      !isValidUUID(account_id)
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid request data" }),
        { status: 400, headers }
      );
    }

    const points = Math.floor(amount_cents / 100);
    if (points <= 0) {
      return new Response(
        JSON.stringify({ error: "Amount too small" }),
        { status: 400, headers }
      );
    }

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Get user_id from loyalty account
    const { data: account, error: accountError } = await svc
      .from("loyalty_accounts")
      .select("user_id")
      .eq("id", account_id)
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: "Account not found" }),
        { status: 404, headers }
      );
    }

    // ✅ Correct V2 Call (User-Based)
// supabase/functions/award-loyalty-qr/index.ts

const { data, error } = await svc.rpc("v2_award_points", {
  p_account_id: account_id,
  p_admin_id: adminId,
  p_amount_cents: amount_cents,
  p_idempotency_key: `admin-${account_id}-${amount_cents}-${Date.now()}`
});

if (error) {
  console.error("RPC ERROR:", error);
  return new Response(
    JSON.stringify({ error: "Award failed" }),
    { status: 500, headers }
  );
}

return new Response(
  JSON.stringify(data?.[0] ?? null),
  {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
  }
);

  } catch (err) {
    console.error("AWARD LOYALTY ERROR:", err);

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers }
    );
  }
});