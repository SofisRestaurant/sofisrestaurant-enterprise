// ============================================================================
// GET CHECKOUT SESSION — PRODUCTION HARDENED (ENTERPRISE SAFE)
// ============================================================================

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// ============================================================================
// CONFIG
// ============================================================================
const CONFIG = {
  MAX_BODY_BYTES: 10_000, // 10KB max payload
  RATE_LIMIT_MAX: 20,
  RATE_LIMIT_WINDOW_MINUTES: 5,
  RATE_LIMIT_BLOCK_MINUTES: 10,
};

// ============================================================================
// ENV
// ============================================================================
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables");
}

// ============================================================================
// CLIENTS
// ============================================================================
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ============================================================================
// CORS
// ============================================================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
  "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================================================
// LOGGING
// ============================================================================
function log(level: "info" | "warn" | "error", msg: string, data?: unknown) {
  console.log(
    JSON.stringify({
      level,
      msg,
      data,
      time: new Date().toISOString(),
    })
  );
}

// ============================================================================
// HELPERS
// ============================================================================
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  log("error", message);
  return json({ error: message }, status);
}

const SESSION_REGEX = /^cs_(test|live)_[a-zA-Z0-9]+$/;

// ============================================================================
// RATE LIMITING
// Reuses checkout_rate_limits table
// ============================================================================
async function checkRateLimit(userId: string) {
  const now = new Date();
  const windowStart = new Date(
    now.getTime() - CONFIG.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000
  );

  const { data } = await supabase
    .from("checkout_rate_limits")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.blocked_until && new Date(data.blocked_until) > now) {
    return { blocked: true };
  }

  if (!data) {
    await supabase.from("checkout_rate_limits").insert({
      user_id: userId,
      attempts: 1,
      last_attempt: now,
    });
    return { blocked: false };
  }

  const attempts =
    new Date(data.last_attempt) < windowStart ? 1 : data.attempts + 1;

  const blocked = attempts > CONFIG.RATE_LIMIT_MAX;

  await supabase.from("checkout_rate_limits").upsert({
    user_id: userId,
    attempts,
    last_attempt: now,
    blocked_until: blocked
      ? new Date(
          now.getTime() + CONFIG.RATE_LIMIT_BLOCK_MINUTES * 60 * 1000
        )
      : null,
  });

  return { blocked };
}

// ============================================================================
// AUTH + SESSION FETCH (SINGLE STRIPE CALL)
// ============================================================================
async function authenticateAndAuthorize(
  req: Request,
  sessionId: string
): Promise<
  | { ok: false }
  | { ok: true; userId: string; session: Stripe.Checkout.Session }
> {
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    log("error", "Missing or invalid auth header");
    return { ok: false };
  }

  const token = authHeader.replace("Bearer ", "");

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData } = await client.auth.getUser();

  if (!userData?.user) {
    log("error", "Invalid token");
    return { ok: false };
  }

  const userId = userData.user.id;

  // 🔥 SINGLE STRIPE FETCH
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items", "customer", "payment_intent"],
    });

    if (!session) {
      log("warn", "Session not found", { sessionId });
      return { ok: false };
    }

    if (session.metadata?.customer_uid !== userId) {
      log("error", "Session ownership mismatch", {
        userId,
        sessionUserId: session.metadata?.customer_uid,
        sessionId,
      });
      return { ok: false };
    }

    return { ok: true, userId, session };
  } catch (err) {
    log("error", "Stripe retrieval failed", {
      error: err instanceof Error ? err.message : String(err),
      sessionId,
    });
    return { ok: false };
  }
}

// ============================================================================
// MAIN
// ============================================================================
Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return err("Method not allowed", 405);
  }

  // ==========================================================
  // BODY SIZE VALIDATION
  // ==========================================================
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > CONFIG.MAX_BODY_BYTES) {
    return err("Payload too large", 413);
  }

  // ==========================================================
  // PARSE BODY
  // ==========================================================
  let body: { sessionId?: string };

  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON");
  }

  const sessionId = body.sessionId;

  if (!sessionId || typeof sessionId !== "string") {
    return err("Missing or invalid sessionId");
  }

  // ==========================================================
  // SESSION FORMAT VALIDATION
  // ==========================================================
  if (!SESSION_REGEX.test(sessionId)) {
    log("warn", "Invalid session format", { sessionId });
    return err("Invalid session format", 400);
  }

  // ==========================================================
  // AUTH + FETCH
  // ==========================================================
  const authResult = await authenticateAndAuthorize(req, sessionId);

  if (!authResult.ok) {
    return err("Unauthorized", 401);
  }

  const { session, userId } = authResult;

  // ==========================================================
  // RATE LIMIT
  // ==========================================================
  const rate = await checkRateLimit(userId);
  if (rate.blocked) {
    return err("Too many requests", 429);
  }

  log("info", "Authorized session retrieval", {
    requestId,
    userId,
    sessionId,
  });

  // ==========================================================
  // RETURN SANITIZED DATA
  // ==========================================================
  return json({
    id: session.id,
    status: session.status,
    payment_status: session.payment_status,
    amount_total: session.amount_total,
    amount_subtotal: session.amount_subtotal,
    currency: session.currency,
    customer_email: session.customer_details?.email,
    customer_name: session.customer_details?.name,
    line_items: session.line_items?.data,
    created: session.created,
    expires_at: session.expires_at,
  });
});