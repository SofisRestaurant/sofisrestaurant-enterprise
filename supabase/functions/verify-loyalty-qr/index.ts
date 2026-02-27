// supabase/functions/verify-loyalty-qr/index.ts

import { createClient } from "supabase";

// ─────────────────────────────────────────────
// Environment
// ─────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// ─────────────────────────────────────────────
// Allowed Origins (Strict CORS)
// ─────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

// ─────────────────────────────────────────────
// CORS Helper
// ─────────────────────────────────────────────
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
// Authenticate & Verify Admin
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

  // Verify admin role
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
// UUID Validator
// ─────────────────────────────────────────────
function isValidUUID(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

    // Authenticate Admin
    const adminId = await authenticateAdmin(req);
    if (!adminId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers }
      );
    }

    // Parse Body
    const body = await req.json();
    const loyalty_public_id = body?.loyalty_public_id;

    if (
  !loyalty_public_id ||
  typeof loyalty_public_id !== "string" ||
  !isValidUUID(loyalty_public_id)
) {
  return new Response(
    JSON.stringify({ error: "Invalid loyalty_public_id format" }),
    { status: 400, headers }
  );
}

    const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Lookup profile
    const { data: profile, error: profileError } = await svc
      .from("profiles")
      .select("id, full_name")
      .eq("loyalty_public_id", loyalty_public_id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Customer not found" }),
        { status: 404, headers }
      );
    }

    // Lookup loyalty account
    const { data: account, error: accountError } = await svc
     .from("v2_account_summary")
     .select("id, balance, lifetime_earned, tier, streak")
     .eq("user_id", profile.id)
     .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: "Loyalty account not found" }),
        { status: 404, headers }
      );
    }

    return new Response(
      JSON.stringify({
        account_id: account.id,
        profile_id: profile.id,
        full_name: profile.full_name,
        balance: account.balance,
        lifetime_earned: account.lifetime_earned,
        tier: account.tier,
        streak: account.streak,
      }),
      {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
      }
    );

  } catch (err) {
    console.error("VERIFY LOYALTY QR ERROR:", err);

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers,
      }
    );
  }
});