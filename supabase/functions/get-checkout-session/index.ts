// supabase/functions/get-checkout-session/index.ts
// =============================================================================
// GET CHECKOUT SESSION — PRODUCTION HARDENED (ENTERPRISE SAFE, 2026)
// =============================================================================
// Purpose:
// - Authenticated user can fetch their own Stripe Checkout Session summary
// - Strict CORS (origin allowlist) + credentials-safe
// - Rate-limited per user (reuses checkout_rate_limits table)
// - Single Stripe API call
// - Sanitized response (no secret metadata dumps)
//
// Contract (request body):
//   { sessionId?: string, session_id?: string }
//
// Response:
//   { id, status, payment_status, amount_total, amount_subtotal, currency, customer_email,
//     customer_name, line_items, created, expires_at }
//
// Notes:
// - Requires STRIPE_SECRET_KEY
// - Requires checkout_rate_limits table: user_id, attempts, last_attempt_at, blocked_until
// - create-checkout must set session.metadata.customer_uid = supabase user id
// =============================================================================

import Stripe from "stripe";
import {
  createAnonClient,
  createServiceClient,
} from "../_shared/supabase.ts";

// =============================================================================
// CONFIG
// =============================================================================
const CONFIG = {
  MAX_BODY_BYTES: 10_000, // 10KB max payload
  RATE_LIMIT_MAX: 20,
  RATE_LIMIT_WINDOW_MINUTES: 5,
  RATE_LIMIT_BLOCK_MINUTES: 10,
  SESSION_ID_MAX_LEN: 255,
} as const;

// =============================================================================
// ENV
// =============================================================================
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
if (!STRIPE_SECRET_KEY) throw new Error("Missing STRIPE_SECRET_KEY");

// =============================================================================
// CLIENTS
// =============================================================================
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover",
  httpClient: Stripe.createFetchHttpClient(),
});

// Service-role DB client (rate limiting / server-side reads)
const svc = createServiceClient();

// =============================================================================
// CORS
// =============================================================================
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
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-application-name, x-idempotency-key",
    "Vary": "Origin",
  };
}

// =============================================================================
// LOGGING
// =============================================================================
function log(level: "info" | "warn" | "error", msg: string, data?: unknown) {
  console.log(JSON.stringify({ level, msg, data, time: new Date().toISOString() }));
}

// =============================================================================
// HELPERS
// =============================================================================
function json(cors: Record<string, string>, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function err(cors: Record<string, string>, message: string, status = 400, code?: string) {
  log("error", message, { status, code });
  return json(cors, { error: message, code: code ?? `HTTP_${status}` }, status);
}

function asString(v: unknown, max = 10_000): string {
  return String(v ?? "").slice(0, max).trim();
}

function parseJsonObject(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

// Stripe checkout session ids look like: cs_test_... or cs_live_...
const SESSION_REGEX = /^cs_(test|live)_[a-zA-Z0-9]+$/;

// =============================================================================
// RATE LIMITING (reuses checkout_rate_limits)
// =============================================================================
type RateLimitRow = {
  user_id: string;
  attempts: number | null;
  last_attempt_at: string | null;
  blocked_until: string | null;
};

async function checkRateLimit(userId: string): Promise<{ blocked: boolean }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - CONFIG.RATE_LIMIT_WINDOW_MINUTES * 60_000);

const { data, error } = await svc
  .from("checkout_rate_limits")
  .select("user_id,attempts,last_attempt_at,blocked_until")
  .eq("user_id", userId)
  .order("last_attempt_at", { ascending: false })
  .limit(1)
  .maybeSingle();

  if (error) {
    // Fail closed on RL table errors (safer)
    log("error", "rate_limit_read_failed", { userId, error: error.message });
    return { blocked: true };
  }

  const row = (data ?? null) as RateLimitRow | null;

  if (row?.blocked_until && new Date(row.blocked_until) > now) {
    return { blocked: true };
  }

  if (!row) {
    const { error: insErr } = await svc.from("checkout_rate_limits").insert({
      user_id: userId,
      attempts: 1,
      last_attempt_at: now.toISOString(),
      blocked_until: null,
    });

    if (insErr) {
      log("error", "rate_limit_insert_failed", { userId, error: insErr.message });
      return { blocked: true };
    }

    return { blocked: false };
  }

  const lastAttemptAt = row.last_attempt_at ? new Date(row.last_attempt_at) : null;
  const attempts =
    !lastAttemptAt || lastAttemptAt < windowStart ? 1 : (row.attempts ?? 0) + 1;

  const blocked = attempts > CONFIG.RATE_LIMIT_MAX;
  const blockedUntil = blocked
    ? new Date(now.getTime() + CONFIG.RATE_LIMIT_BLOCK_MINUTES * 60_000).toISOString()
    : null;

  const { error: upErr } = await svc.from("checkout_rate_limits").upsert({
    user_id: userId,
    attempts,
    last_attempt_at: now.toISOString(),
    blocked_until: blockedUntil,
  });

  if (upErr) {
    log("error", "rate_limit_upsert_failed", { userId, error: upErr.message });
    return { blocked: true };
  }

  return { blocked };
}

// =============================================================================
// AUTH + SESSION FETCH (SINGLE STRIPE CALL)
// =============================================================================
async function authenticateAndAuthorize(
  req: Request,
  sessionId: string,
): Promise<
  | { ok: false; reason: string }
  | { ok: true; userId: string; session: Stripe.Checkout.Session }
> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    log("warn", "missing_auth_header");
    return { ok: false, reason: "missing_auth" };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return { ok: false, reason: "missing_token" };

  const anon = createAnonClient(token);
  const { data, error } = await anon.auth.getUser();
  if (error || !data?.user?.id) {
    log("warn", "auth_failed", { error: error?.message });
    return { ok: false, reason: "auth_failed" };
  }

  const userId = data.user.id;

  // Rate limit before Stripe call
  const rate = await checkRateLimit(userId);
  if (rate.blocked) {
    log("warn", "rate_limited", { userId });
    return { ok: false, reason: "rate_limited" };
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items", "customer", "payment_intent"],
    });

    // Ownership check: create-checkout must write customer_uid in metadata
    const sessionOwner = session.metadata?.customer_uid ?? "";
    if (sessionOwner !== userId) {
      log("warn", "session_owner_mismatch", { userId, sessionOwner, sessionId });
      return { ok: false, reason: "owner_mismatch" };
    }

    return { ok: true, userId, session };
  } catch (e) {
    log("error", "stripe_retrieve_failed", {
      sessionId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, reason: "stripe_error" };
  }
}

// =============================================================================
// MAIN
// =============================================================================
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (!cors) return new Response("Origin not allowed", { status: 403 });

  // Preflight must be 2xx and include the same CORS headers
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return err(cors, "Method not allowed", 405);
  }

  // Body size guard (best-effort)
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > CONFIG.MAX_BODY_BYTES) {
    return err(cors, "Payload too large", 413);
  }

  const requestId = crypto.randomUUID();

  // Parse body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    log("warn", "invalid_json", { requestId });
    return err(cors, "Invalid JSON", 400);
  }

  const body = parseJsonObject(rawBody);

  // Accept both camelCase + snake_case
  const sessionIdRaw = body["sessionId"] ?? body["session_id"];
  const sessionId = asString(sessionIdRaw, CONFIG.SESSION_ID_MAX_LEN);

  if (!sessionId || !SESSION_REGEX.test(sessionId)) {
    log("warn", "invalid_session_id", { requestId, sessionId });
    return err(cors, "Missing or invalid sessionId", 400);
  }

  // Auth + Stripe fetch
  const authResult = await authenticateAndAuthorize(req, sessionId);
  if (!authResult.ok) {
    // Provide safe errors; don't leak internals
    const status = authResult.reason === "rate_limited" ? 429 : 401;
    const msg =
      authResult.reason === "rate_limited"
        ? "Too many requests. Please wait and try again."
        : "Unauthorized";
    return err(cors, msg, status);
  }

  const { session, userId } = authResult;

  log("info", "checkout_session_returned", { requestId, userId, sessionId });

  // Sanitized response (no raw metadata dump)
  return json(cors, {
    id: session.id,
    status: session.status ?? null,
    payment_status: session.payment_status ?? null,
    amount_total: session.amount_total ?? null,
    amount_subtotal: session.amount_subtotal ?? null,
    currency: session.currency ?? null,
    customer_email: session.customer_details?.email ?? null,
    customer_name: session.customer_details?.name ?? null,
    line_items: session.line_items?.data ?? [],
    created: session.created ?? null,
    expires_at: session.expires_at ?? null,
  });
});