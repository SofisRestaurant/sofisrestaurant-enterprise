// supabase/functions/get-checkout-session/index.ts
// =============================================================================
// GET CHECKOUT SESSION — Enterprise / Production Hardened (2026) • Sofi's V2
// =============================================================================
// Purpose:
// - Return a safe subset of Stripe Checkout Session fields for the authenticated owner.
// - Prevent session scraping / ownership bypass / retry storms.
//
// Guarantees:
// - ✅ Fail-closed CORS (403 if origin not allowlisted)
// - ✅ No top-level env throws (prevents opaque cold-start 502s)
// - ✅ Strict JSON parsing + payload size cap
// - ✅ JWT required (anon client validates identity)
// - ✅ Owner check against Stripe session metadata (user_id / customer_uid / uid)
// - ✅ Rate limit using checkout_rate_limits table (blocked_until supported)
// - ✅ Structured logs (no secrets)
// - ✅ Optional geo restriction (disabled by default)
// - ✅ x-application-name required (basic abuse resistance)
//
// Notes:
// - This endpoint is read-only; it does NOT finalize orders.
// - Do NOT return sensitive Stripe objects; only return what UI needs.
// =============================================================================

import Stripe from "stripe";
import { createAnonClient, createServiceClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  MAX_BODY_BYTES: 10_000,
  SESSION_ID_MAX_LEN: 255,

  RATE_LIMIT_MAX: 20,
  RATE_LIMIT_WINDOW_MINUTES: 5,
  RATE_LIMIT_BLOCK_MINUTES: 10,

  // Require app identifier header (helps block random cross-origin callers)
  REQUIRE_APP_HEADER: true,
  APP_HEADER_NAME: "x-application-name",
  REQUEST_ID_HEADER: "x-request-id",

  // Optional geo restriction (Cloudflare style headers). Leave disabled unless you’re behind CF.
  ENABLE_GEO_RESTRICTION: false,
  ALLOWED_COUNTRIES: ["US"] as const, // ISO-3166-1 alpha-2

  // Stripe pinned version (upgrade intentionally)
  DEFAULT_STRIPE_API_VERSION: "2024-06-20",
} as const;

const STRIPE_SESSION_RE = /^cs_(test|live)_[a-zA-Z0-9]+$/;

const ALLOWED_ORIGINS = [
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
  "http://localhost:3000",
  "http://localhost:3001",
] as const;

const ALLOWED_HEADERS =
  "authorization, apikey, x-client-info, content-type, x-application-name, x-idempotency-key, x-request-id";

const ALLOWED_METHODS = "POST, OPTIONS";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;

type OkResp = {
  ok: true;
  requestId: string;
  data: {
    id: string;
    status: string | null;
    payment_status: string | null;
    amount_total: number | null;
    amount_subtotal: number | null;
    currency: string | null;
    customer_email: string | null;
    customer_name: string | null;
    line_items: unknown[];
    created: number | null;
    expires_at: number | null;
  };
};

type ErrResp = {
  ok: false;
  requestId: string;
  error: { code: string; message: string };
};

type RateLimitRow = {
  user_id: string;
  attempts: number | null;
  last_attempt_at: string | null;
  blocked_until: string | null;
};

// ─────────────────────────────────────────────────────────────
// Small utils
// ─────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function makeRequestId(req: Request): string {
  const h = (req.headers.get(CONFIG.REQUEST_ID_HEADER) ?? "").trim();
  if (h) return h.slice(0, 128);
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function prefix(id: string | null | undefined, n = 8): string | null {
  if (!id) return null;
  return id.slice(0, n);
}

function log(level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>) {
  const entry = JSON.stringify({
    level,
    event,
    service: "get-checkout-session",
    ts: nowIso(),
    ...(data ?? {}),
  });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

function corsHeaders(req: Request): Record<string, string> | null {
  const origin = (req.headers.get("origin") ?? "").trim();
  const allowed = (ALLOWED_ORIGINS as readonly string[]).includes(origin);
  if (!allowed) return null;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(cors: Record<string, string>, body: OkResp | ErrResp, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function errorJson(
  cors: Record<string, string>,
  requestId: string,
  code: string,
  message: string,
  status = 400,
  meta?: Record<string, unknown>,
): Response {
  log(status >= 500 ? "error" : "warn", "error", { requestId, code, message, ...(meta ?? {}) });
  return json(cors, { ok: false, requestId, error: { code, message } }, status);
}

async function readJsonWithLimit(req: Request, maxBytes: number): Promise<unknown> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!ct.includes("application/json")) throw new Error("UNSUPPORTED_CONTENT_TYPE");

  const ab = await req.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");

  const text = new TextDecoder().decode(ab);
  if (!text.trim()) throw new Error("EMPTY_BODY");

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function mustStripeSessionId(v: unknown): string {
  if (typeof v !== "string") throw new Error("INVALID_SESSION_ID");
  const s = v.trim();
  if (!s || s.length > CONFIG.SESSION_ID_MAX_LEN || !STRIPE_SESSION_RE.test(s)) {
    throw new Error("INVALID_SESSION_ID");
  }
  return s;
}

function isValidStripeApiVersion(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(\.[a-zA-Z0-9_-]+)?$/.test(v);
}

// ─────────────────────────────────────────────────────────────
// Stripe (lazy init — no top-level env throws)
// ─────────────────────────────────────────────────────────────

let STRIPE_SINGLETON: Stripe | null = null;
let STRIPE_SINGLETON_VERSION: string | null = null;

function getStripeOrThrow(): { stripe: Stripe; apiVersion: string } {
  const secret = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
  if (!secret) throw new Error("MISSING_STRIPE_SECRET_KEY");

  const envVer = (Deno.env.get("STRIPE_API_VERSION") ?? "").trim();
  const v = isValidStripeApiVersion(envVer) ? envVer : CONFIG.DEFAULT_STRIPE_API_VERSION;

  if (STRIPE_SINGLETON && STRIPE_SINGLETON_VERSION === v) {
    return { stripe: STRIPE_SINGLETON, apiVersion: v };
  }

  const stripe = new Stripe(secret, {
    apiVersion: v as unknown as Stripe.LatestApiVersion,
    httpClient: Stripe.createFetchHttpClient(),
  });

  STRIPE_SINGLETON = stripe;
  STRIPE_SINGLETON_VERSION = v;
  return { stripe, apiVersion: v };
}

// ─────────────────────────────────────────────────────────────
// Rate limit (block when DB says blocked; fail-open on DB errors)
// ─────────────────────────────────────────────────────────────

async function checkRateLimit(
  svc: ReturnType<typeof createServiceClient>,
  userId: string,
  requestId: string,
): Promise<{ blocked: boolean }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - CONFIG.RATE_LIMIT_WINDOW_MINUTES * 60_000);

  const { data, error } = await svc
    .from("checkout_rate_limits")
    .select("attempts,last_attempt_at,blocked_until")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    // Fail-open (don’t lock users out if DB hiccups)
    log("warn", "rate_limit_read_failed", { requestId, userId: prefix(userId), msg: error.message });
    return { blocked: false };
  }

  const row = (data ?? null) as RateLimitRow | null;

  const blockedUntil = row?.blocked_until ? new Date(row.blocked_until) : null;
  if (blockedUntil && blockedUntil > now) return { blocked: true };

  const lastAttemptAt = row?.last_attempt_at ? new Date(row.last_attempt_at) : null;
  const prevAttempts = typeof row?.attempts === "number" && Number.isFinite(row.attempts) ? row.attempts : 0;

  const attempts = !lastAttemptAt || lastAttemptAt < windowStart ? 1 : prevAttempts + 1;

  const blocked = attempts > CONFIG.RATE_LIMIT_MAX;
  const blockedUntilIso = blocked ? new Date(now.getTime() + CONFIG.RATE_LIMIT_BLOCK_MINUTES * 60_000).toISOString() : null;

  const { error: upErr } = await svc.from("checkout_rate_limits").upsert(
    { user_id: userId, attempts, last_attempt_at: now.toISOString(), blocked_until: blockedUntilIso },
    { onConflict: "user_id" },
  );

  if (upErr) log("warn", "rate_limit_upsert_failed", { requestId, userId: prefix(userId), msg: upErr.message });

  return { blocked };
}

// ─────────────────────────────────────────────────────────────
// Auth + Stripe ownership check
// ─────────────────────────────────────────────────────────────

function readBearer(req: Request): string | null {
  const raw = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!raw) return null;
  const m = raw.trim().match(/^bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  return token ? token : null;
}

function pickString(meta: Stripe.Metadata | null | undefined, ...keys: string[]): string {
  if (!meta) return "";
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

async function authenticateAndAuthorize(args: {
  req: Request;
  requestId: string;
  sessionId: string;
  svc: ReturnType<typeof createServiceClient>;
  stripe: Stripe;
}): Promise<
  | { ok: false; reason: "missing_auth" | "auth_failed" | "rate_limited" | "owner_mismatch" | "stripe_error" }
  | { ok: true; userId: string; session: Stripe.Checkout.Session }
> {
  const { req, requestId, sessionId, svc, stripe } = args;

  const token = readBearer(req);
  if (!token) return { ok: false, reason: "missing_auth" };

  const anon = createAnonClient(token);
  const { data, error } = await anon.auth.getUser();
  const userId = data?.user?.id ?? null;
  if (error || !userId) return { ok: false, reason: "auth_failed" };

  const rl = await checkRateLimit(svc, userId, requestId);
  if (rl.blocked) return { ok: false, reason: "rate_limited" };

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items", "customer", "payment_intent"],
    });

    // Support multiple metadata conventions
    const owner =
      pickString(session.metadata, "user_id", "customer_uid", "uid") ||
      ""; // force string

    if (!owner || owner !== userId) return { ok: false, reason: "owner_mismatch" };

    return { ok: true, userId, session };
  } catch (e) {
    log("warn", "stripe_retrieve_failed", { requestId, sessionId: prefix(sessionId), err: e instanceof Error ? e.message : String(e) });
    return { ok: false, reason: "stripe_error" };
  }
}

// ─────────────────────────────────────────────────────────────
// Optional geo restriction (best-effort)
// ─────────────────────────────────────────────────────────────

function geoAllowed(req: Request): boolean {
  if (!CONFIG.ENABLE_GEO_RESTRICTION) return true;

  // Common CF header: CF-IPCountry (e.g. "US"). If absent, fail-open.
  const country = (req.headers.get("cf-ipcountry") ?? req.headers.get("CF-IPCountry") ?? "").trim().toUpperCase();
  if (!country) return true;

  return (CONFIG.ALLOWED_COUNTRIES as readonly string[]).includes(country);
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const requestId = makeRequestId(req);
  const start = Date.now();

  const cors = corsHeaders(req);
  if (!cors) return new Response("Origin not allowed", { status: 403 });

  // Preflight
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (req.method !== "POST") {
    return errorJson(cors, requestId, "METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }

  if (!geoAllowed(req)) {
    return errorJson(cors, requestId, "GEO_BLOCKED", "Access not allowed from your region", 403);
  }

  if (CONFIG.REQUIRE_APP_HEADER) {
    const appName = (req.headers.get(CONFIG.APP_HEADER_NAME) ?? "").trim();
    if (!appName) {
      return errorJson(cors, requestId, "MISSING_APP_HEADER", `Missing ${CONFIG.APP_HEADER_NAME}`, 400);
    }
  }

  // Stripe init (lazy)
  let stripe: Stripe;
  let stripeApiVersion: string;
  try {
    const s = getStripeOrThrow();
    stripe = s.stripe;
    stripeApiVersion = s.apiVersion;
  } catch {
    return errorJson(cors, requestId, "STRIPE_INIT_FAILED", "Stripe is not configured on the server", 500);
  }

  // Body parse (strict)
  let raw: unknown;
  try {
    raw = await readJsonWithLimit(req, CONFIG.MAX_BODY_BYTES);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "BAD_REQUEST";
    if (msg === "PAYLOAD_TOO_LARGE") return errorJson(cors, requestId, "PAYLOAD_TOO_LARGE", "Payload too large", 413);
    if (msg === "UNSUPPORTED_CONTENT_TYPE") return errorJson(cors, requestId, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json", 415);
    if (msg === "EMPTY_BODY") return errorJson(cors, requestId, "EMPTY_BODY", "Request body is empty", 400);
    return errorJson(cors, requestId, "INVALID_JSON", "Invalid JSON", 400);
  }

  if (!isRecord(raw)) {
    return errorJson(cors, requestId, "INVALID_BODY", "Request body must be a JSON object", 400);
  }

  const sessionId = mustStripeSessionId(raw["sessionId"] ?? raw["session_id"]);

  const svc = createServiceClient();

  // Auth + owner check
  const auth = await authenticateAndAuthorize({ req, requestId, sessionId, svc, stripe });
  if (!auth.ok) {
    if (auth.reason === "rate_limited") {
      return errorJson(cors, requestId, "RATE_LIMITED", "Too many requests. Please wait and try again.", 429);
    }
    if (auth.reason === "owner_mismatch") {
      return errorJson(cors, requestId, "UNAUTHORIZED", "Unauthorized", 401);
    }
    if (auth.reason === "stripe_error") {
      return errorJson(cors, requestId, "STRIPE_UNAVAILABLE", "Unable to retrieve checkout session", 502);
    }
    return errorJson(cors, requestId, "UNAUTHORIZED", "Unauthorized", 401);
  }

  const { session } = auth;

  // Response: keep it minimal + safe
  const resp: OkResp = {
    ok: true,
    requestId,
    data: {
      id: session.id,
      status: session.status ?? null,
      payment_status: session.payment_status ?? null,
      amount_total: typeof session.amount_total === "number" ? session.amount_total : null,
      amount_subtotal: typeof session.amount_subtotal === "number" ? session.amount_subtotal : null,
      currency: typeof session.currency === "string" ? session.currency : null,
      customer_email: session.customer_details?.email ?? null,
      customer_name: session.customer_details?.name ?? null,
      line_items: session.line_items?.data ?? [],
      created: typeof session.created === "number" ? session.created : null,
      expires_at: typeof session.expires_at === "number" ? session.expires_at : null,
    },
  };

  log("info", "ok", {
    requestId,
    ms: Date.now() - start,
    sessionId: prefix(sessionId),
    stripeApiVersion,
  });

  return json(cors, resp, 200);
});