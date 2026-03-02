// supabase/functions/redeem-loyalty/index.ts

import { createServiceClient, createAnonClient, type SvcClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────
// Strict CORS (Dev + Prod)
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

function isValidUUID(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// ─────────────────────────────────────────────
// Authenticate Admin
// ─────────────────────────────────────────────
async function authenticateAdmin(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  // 1) Identify caller using anon client + JWT
  const anon = createAnonClient(token);
  const { data, error } = await anon.auth.getUser();
  if (error || !data?.user) return null;

  const userId = data.user.id;

  // 2) Confirm admin role using service role client
  const svc: SvcClient = createServiceClient();
  const { data: profile, error: profErr } = await svc
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profErr || !profile || profile.role !== "admin") return null;

  return userId;
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
const rawPoints = body?.points ?? body?.points_to_redeem;
const points = Number(rawPoints);

    if (
  !account_id ||
  !isValidUUID(account_id) ||
  !points ||
  Number.isNaN(points) ||
  points <= 0
) {
  return new Response(
    JSON.stringify({ error: "Invalid request data" }),
    { status: 400, headers }
  );
}

    const svc: SvcClient = createServiceClient();

    const { data, error } = await svc.rpc("v2_redeem_points", {
      p_account_id: account_id,
      p_amount: points,
      p_admin_id: adminId,
      p_reference_id: crypto.randomUUID(),
      p_idempotency_key: `${account_id}-${points}-${Date.now()}`,
    });

    if (error) {
      console.error("RPC ERROR:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
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
    console.error("REDEEM ERROR:", err);

    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers }
    );
  }
});