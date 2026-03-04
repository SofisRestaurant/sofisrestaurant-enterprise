// supabase/functions/finalize-order/index.ts
// =============================================================================
// FINALIZE ORDER — Enterprise Grade (2026) • Sofi's Restaurant V2
// =============================================================================
// Key guarantees:
// - ✅ NEVER writes legacy loyalty (loyalty_transactions) — V2 only.
// - ✅ Backfill is best-effort + idempotent.
// - ✅ HARD FIX: no top-level env throws (prevents opaque 502 on cold start).
// - ✅ Append-only ledger compatible: NO updates to loyalty_ledger.
// - ✅ Order-linking happens at INSERT time via v2_award_points(..., p_reference_id).
// =============================================================================

import Stripe from "stripe";
import { createServiceClient } from "../_shared/supabase.ts";
import { authenticate, AuthError } from "../_shared/auth.ts";
import type { Database, Json } from "../_shared/database.types.ts";

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  MAX_BODY_BYTES: 10_000,
  MAX_SESSION_ID_LEN: 200,

  RATE_LIMIT_MAX: 30,
  RATE_LIMIT_WINDOW_MINUTES: 5,
  RATE_LIMIT_BLOCK_MINUTES: 10,

  ALLOWED_ORIGINS: [
    "https://sofislegacy.com",
    "https://www.sofislegacy.com",
    "https://sofisrestaurant.netlify.app",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
  ] as const,

  ENABLE_REVIEW_NUDGE_EVENT: false,
  ENABLE_RETURN_INCENTIVE_EVENT: false,

  // Backfill (V2 ONLY)
  ENABLE_LOYALTY_BACKFILL_ON_EXISTING_ORDER: true,

  // Deterministic idempotency key for finalize backfill
  LOYALTY_IDEMPOTENCY_PREFIX: "finalize-backfill:",

  MAX_AWARD_AMOUNT_CENTS: 500_000,
  MAX_ORDER_TOTAL_CENTS: 500_000,

  STRICT_TOTAL_GATES: true,
  RETURN_REQUEST_ID: true,

  DEFAULT_STRIPE_API_VERSION: "2026-01-28.clover",
} as const;

const STRIPE_SESSION_RE = /^cs_(test|live)_[a-zA-Z0-9]+$/;
const DB_PAYMENT_STATUS_PAID = "paid";
const DB_ORDER_STATUS_CONFIRMED = "confirmed";

// ─────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set<string>(CONFIG.ALLOWED_ORIGINS);

function corsHeaders(req: Request): Record<string, string> | null {
  const origin = (req.headers.get("origin") ?? "").trim();
  if (!ALLOWED_ORIGINS.has(origin)) return null;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, x-client-info, content-type, x-idempotency-key, x-application-name, x-request-id",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// ─────────────────────────────────────────────────────────────
// Small utils
// ─────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;
type OrderEventInsert = Database["public"]["Tables"]["order_events"]["Insert"];

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function nowIso(): string {
  return new Date().toISOString();
}

type ErrorWithCode = { code?: unknown; message?: unknown };

function getErrorCode(e: unknown): string | null {
  if (typeof e !== "object" || e === null) return null;
  const code = (e as ErrorWithCode).code;
  return typeof code === "string" ? code : null;
}

function makeRequestId(req: Request): string {
  const headerId = (req.headers.get("x-request-id") ?? "").trim();
  if (headerId) return headerId.slice(0, 128);
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

function log(level: "info" | "warn" | "error", event: string, meta: Record<string, unknown>) {
  // Never include JWTs, emails, phones, addresses.
  console.log(JSON.stringify({ level, event, service: "finalize-order", ...meta, ts: nowIso() }));
}

function json(cors: Record<string, string>, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
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
  return json(cors, { ok: false, error: { code, message, requestId } }, status);
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
  if (!s || s.length > CONFIG.MAX_SESSION_ID_LEN || !STRIPE_SESSION_RE.test(s)) {
    throw new Error("INVALID_SESSION_ID");
  }
  return s;
}

function pickString(meta: Stripe.Metadata | null | undefined, ...keys: string[]): string {
  if (!meta) return "";
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function clampAmountCents(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  const c = Math.max(0, Math.trunc(n));
  return Math.min(c, CONFIG.MAX_AWARD_AMOUNT_CENTS);
}

function clampOrderTotalCents(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  const c = Math.max(0, Math.trunc(n));
  return Math.min(c, CONFIG.MAX_ORDER_TOTAL_CENTS);
}

function asErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

// ─────────────────────────────────────────────────────────────
// Stripe (lazy init)
// ─────────────────────────────────────────────────────────────

function isValidStripeApiVersion(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(\.[a-zA-Z0-9_-]+)?$/.test(v);
}

let STRIPE_SINGLETON: Stripe | null = null;
let STRIPE_SINGLETON_VERSION: string | null = null;

function getStripeOrThrow(): { stripe: Stripe; apiVersion: string } {
  const secret = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
  if (!secret) throw new Error("MISSING_STRIPE_SECRET_KEY");

  const envVer = (Deno.env.get("STRIPE_API_VERSION") ?? "").trim();
  const v = isValidStripeApiVersion(envVer) ? envVer : CONFIG.DEFAULT_STRIPE_API_VERSION;

  if (STRIPE_SINGLETON && STRIPE_SINGLETON_VERSION === v) return { stripe: STRIPE_SINGLETON, apiVersion: v };

  const stripe = new Stripe(secret, {
    apiVersion: v as unknown as Stripe.LatestApiVersion,
    httpClient: Stripe.createFetchHttpClient(),
  });

  STRIPE_SINGLETON = stripe;
  STRIPE_SINGLETON_VERSION = v;
  return { stripe, apiVersion: v };
}

// ─────────────────────────────────────────────────────────────
// Rate limit (fail-open)
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
    log("warn", "rate_limit_read_failed", { requestId, userId: prefix(userId), err: error.message });
    return { blocked: false };
  }

  const blockedUntil = data?.blocked_until ? new Date(data.blocked_until) : null;
  if (blockedUntil && blockedUntil > now) return { blocked: true };

  const lastAttemptAt = data?.last_attempt_at ? new Date(data.last_attempt_at) : null;
  const prevAttempts = typeof data?.attempts === "number" && Number.isFinite(data.attempts) ? data.attempts : 0;

  const attempts = !lastAttemptAt || lastAttemptAt < windowStart ? 1 : prevAttempts + 1;

  const blocked = attempts > CONFIG.RATE_LIMIT_MAX;
  const blockedUntilIso = blocked ? new Date(now.getTime() + CONFIG.RATE_LIMIT_BLOCK_MINUTES * 60_000).toISOString() : null;

  const { error: upErr } = await svc.from("checkout_rate_limits").upsert(
    { user_id: userId, attempts, last_attempt_at: now.toISOString(), blocked_until: blockedUntilIso },
    { onConflict: "user_id" },
  );

  if (upErr) log("warn", "rate_limit_upsert_failed", { requestId, userId: prefix(userId), err: upErr.message });

  return { blocked };
}

// ─────────────────────────────────────────────────────────────
// Loyalty V2 backfill (append-only safe)
// ─────────────────────────────────────────────────────────────

async function backfillLoyaltyV2IfMissing(args: {
  svc: ReturnType<typeof createServiceClient>;
  requestId: string;
  userId: string;
  orderId: string;
  amountCents: number;
}) {
  const { svc, requestId, userId, orderId } = args;
  const amountCents = clampAmountCents(args.amountCents);

  if (!CONFIG.ENABLE_LOYALTY_BACKFILL_ON_EXISTING_ORDER) return;
  if (!amountCents || amountCents <= 0) return;

  try {
    const { data: acct, error: acctErr } = await svc
      .from("loyalty_accounts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (acctErr || !acct?.id) {
      log("warn", "loyalty_backfill_account_missing", { requestId, userId: prefix(userId), code: acctErr?.code ?? null });
      return;
    }

    const accountId = String(acct.id);
    const idem = `${CONFIG.LOYALTY_IDEMPOTENCY_PREFIX}${orderId}`;

    // If already exists by idempotency or reference_id, skip
    const { data: exists, error: exErr } = await svc
      .from("loyalty_ledger")
      .select("id")
      .eq("account_id", accountId)
      .or(`reference_id.eq.${orderId},idempotency_key.eq.${idem}`)
      .limit(1)
      .maybeSingle();

    if (!exErr && exists?.id) return;

    // ✅ Call NEW overload with p_reference_id so order link is inserted, no updates required.
    const { error } = await svc.rpc("v2_award_points", {
      p_account_id: accountId,
      p_admin_id: userId,
      p_amount_cents: amountCents,
      p_idempotency_key: idem,
      p_reference_id: orderId,
    });

    if (error) {
      log("warn", "loyalty_backfill_award_failed_v2", { requestId, orderId: prefix(orderId), code: error.code ?? null });
      return;
    }

    log("info", "loyalty_backfill_awarded_v2", { requestId, orderId: prefix(orderId), accountId: prefix(accountId) });
  } catch (e) {
    log("error", "loyalty_backfill_crash", { requestId, orderId: prefix(orderId), error: asErr(e) });
  }
}

// ─────────────────────────────────────────────────────────────
// Optional growth events (best-effort)
// ─────────────────────────────────────────────────────────────

async function maybeEmitGrowthEvents(args: {
  svc: ReturnType<typeof createServiceClient>;
  requestId: string;
  orderId: string;
  userId: string;
  amountCents: number;
}) {
  const { svc, requestId, orderId, userId, amountCents } = args;
  if (!CONFIG.ENABLE_REVIEW_NUDGE_EVENT && !CONFIG.ENABLE_RETURN_INCENTIVE_EVENT) return;

  try {
    const baseData: Json = { user_id: userId, amount_cents: amountCents };
    const rows: OrderEventInsert[] = [];

    if (CONFIG.ENABLE_REVIEW_NUDGE_EVENT) rows.push({ order_id: orderId, user_id: userId, event_type: "REVIEW_NUDGE_READY", event_data: baseData });
    if (CONFIG.ENABLE_RETURN_INCENTIVE_EVENT) rows.push({ order_id: orderId, user_id: userId, event_type: "RETURN_INCENTIVE_CANDIDATE", event_data: baseData });

    if (!rows.length) return;

    const { error } = await svc.from("order_events").insert(rows);
    if (error) log("warn", "growth_events_insert_failed", { requestId, orderId: prefix(orderId), code: error.code ?? null });
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const requestId = makeRequestId(req);
  const start = Date.now();

  const cors = corsHeaders(req);
  if (!cors) return new Response("Origin not allowed", { status: 403 });

  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return errorJson(cors, requestId, "METHOD_NOT_ALLOWED", "Method not allowed", 405);

    // Stripe init (lazy)
    let stripe: Stripe;
    let stripeApiVersion: string;
    try {
      const s = getStripeOrThrow();
      stripe = s.stripe;
      stripeApiVersion = s.apiVersion;
    } catch (e) {
      log("error", "stripe_init_failed", { requestId, reason: asErr(e) });
      return errorJson(cors, requestId, "STRIPE_INIT_FAILED", "Stripe is not configured on the server", 500);
    }

    // Auth
    let user: { id: string; email: string | null };
    try {
      user = await authenticate(req);
    } catch (e) {
      const code = e instanceof AuthError ? e.code : "AUTH_ERROR";
      const status = e instanceof AuthError ? e.status : 401;
      return errorJson(cors, requestId, code, "Unauthorized", status);
    }

    const userId = user.id;
    const svc = createServiceClient();

    // Rate limit (fail-open)
    const rl = await checkRateLimit(svc, userId, requestId);
    if (rl.blocked) return errorJson(cors, requestId, "RATE_LIMITED", "Too many attempts. Please wait.", 429);

    // Body parse
    let raw: unknown;
    try {
      raw = await readJsonWithLimit(req, CONFIG.MAX_BODY_BYTES);
    } catch (e) {
      const m = e instanceof Error ? e.message : "BAD_REQUEST";
      if (m === "PAYLOAD_TOO_LARGE") return errorJson(cors, requestId, "PAYLOAD_TOO_LARGE", "Payload too large", 413);
      if (m === "UNSUPPORTED_CONTENT_TYPE") return errorJson(cors, requestId, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json", 415);
      return errorJson(cors, requestId, "INVALID_BODY", "Invalid request body", 400, { reason: m });
    }

    if (!isRecord(raw)) return errorJson(cors, requestId, "INVALID_BODY", "Request body must be a JSON object", 400);

    const sessionId = mustStripeSessionId(raw.sessionId ?? raw.session_id);

    // 1) Fast idempotent path: order exists
    {
      const { data: existing } = await svc
        .from("orders")
        .select("id,amount_total,payment_status,status")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();

      if (existing?.id) {
        const amountCents = typeof existing.amount_total === "number" ? existing.amount_total : 0;
        await backfillLoyaltyV2IfMissing({ svc, requestId, userId, orderId: existing.id, amountCents });
        await maybeEmitGrowthEvents({ svc, requestId, orderId: existing.id, userId, amountCents });

        log("info", "finalize_idempotent_return", { requestId, ms: Date.now() - start, orderId: prefix(existing.id), sessionId: prefix(sessionId) });

        return json(cors, {
          ok: true,
          ...(CONFIG.RETURN_REQUEST_ID ? { requestId } : {}),
          order_id: existing.id,
          already_finalized: true,
          payment_status: existing.payment_status ?? null,
          status: existing.status ?? null,
        });
      }
    }

    // 2) Retrieve Stripe session
    let stripeSession: Stripe.Checkout.Session;
    try {
      stripeSession = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
    } catch (e) {
      log("error", "stripe_retrieve_failed", { requestId, sessionId: prefix(sessionId), err: asErr(e) });
      return errorJson(cors, requestId, "STRIPE_UNAVAILABLE", "Unable to verify payment session", 502);
    }

    // 3) Ownership check
    const meta = stripeSession.metadata ?? {};
    const owner = pickString(meta, "user_id", "customer_uid", "uid");
    if (!owner || owner !== userId) {
      log("warn", "stripe_owner_mismatch", { requestId, sessionId: prefix(sessionId), userId: prefix(userId), owner: owner ? prefix(owner) : null });
      return errorJson(cors, requestId, "UNAUTHORIZED", "Unauthorized", 401);
    }

    // 4) Paid gate
    const paid = stripeSession.payment_status === "paid" || stripeSession.status === "complete";
    if (!paid) {
      return json(cors, {
        ok: true,
        ...(CONFIG.RETURN_REQUEST_ID ? { requestId } : {}),
        order_id: null,
        already_finalized: false,
        payment_status: stripeSession.payment_status ?? null,
        status: stripeSession.status ?? null,
        message: "Payment not confirmed yet",
      });
    }

    // 5) Load pending cart
    const cartRef = pickString(meta, "pending_cart_id", "cart_ref", "cart_id", "pendingCartId");
    if (!cartRef) return errorJson(cors, requestId, "MISSING_CART_REF", "Missing cart reference (server metadata)", 400);

    const { data: cart, error: cartErr } = await svc
      .from("pending_carts")
      .select("id,user_id,items,subtotal_cents,discount_cents,tax_cents,total_cents,promo_id,credit_id")
      .eq("id", cartRef)
      .maybeSingle();

    if (cartErr || !cart) return errorJson(cors, requestId, "PENDING_CART_NOT_FOUND", "Pending cart not found", 404);
    if (String(cart.user_id) !== userId) return errorJson(cors, requestId, "UNAUTHORIZED", "Unauthorized", 401);

    const amountTotal = clampOrderTotalCents(cart.total_cents);
    if (CONFIG.STRICT_TOTAL_GATES && (!amountTotal || amountTotal <= 0)) {
      return errorJson(cors, requestId, "INVALID_TOTAL", "Invalid cart total", 400);
    }

    // 6) Insert order (unique orders.stripe_session_id)
    const paymentIntentId =
      typeof stripeSession.payment_intent === "string" ? stripeSession.payment_intent : stripeSession.payment_intent?.id ?? null;

    const orderInsert = {
      stripe_session_id: sessionId,
      stripe_payment_intent_id: paymentIntentId,
      customer_uid: userId,
      customer_email: stripeSession.customer_details?.email ?? null,
      customer_name: stripeSession.customer_details?.name ?? null,
      customer_phone: stripeSession.customer_details?.phone ?? null,
      amount_subtotal: cart.subtotal_cents ?? 0,
      amount_tax: cart.tax_cents ?? 0,
      amount_shipping: 0,
      amount_total: amountTotal,
      currency: (stripeSession.currency ?? "usd").toLowerCase(),
      payment_status: DB_PAYMENT_STATUS_PAID,
      status: DB_ORDER_STATUS_CONFIRMED,
      cart_items: cart.items,
      metadata: {
        source: "finalize-order",
        request_id: requestId,
        cart_ref: cartRef,
        stripe_session_status: stripeSession.status ?? null,
        stripe_api_version: stripeApiVersion,
        promo_id: cart.promo_id ?? null,
        credit_id: cart.credit_id ?? null,
      },
      notes: null,
    };

    const { data: inserted, error: insErr } = await svc
      .from("orders")
      .insert(orderInsert)
      .select("id,amount_total,payment_status,status")
      .maybeSingle();

    if (!insErr && inserted?.id) {
      const amountCents = typeof inserted.amount_total === "number" ? inserted.amount_total : amountTotal;
      await backfillLoyaltyV2IfMissing({ svc, requestId, userId, orderId: inserted.id, amountCents });
      await maybeEmitGrowthEvents({ svc, requestId, orderId: inserted.id, userId, amountCents });

      log("info", "finalize_created", { requestId, ms: Date.now() - start, orderId: prefix(inserted.id), sessionId: prefix(sessionId) });

      return json(cors, {
        ok: true,
        ...(CONFIG.RETURN_REQUEST_ID ? { requestId } : {}),
        order_id: inserted.id,
        already_finalized: false,
        payment_status: stripeSession.payment_status ?? null,
        status: stripeSession.status ?? null,
      });
    }

    // Insert failed; fetch existing
    if (insErr) log("warn", "order_insert_failed", { requestId, sessionId: prefix(sessionId), err: insErr.message, code: getErrorCode(insErr) });

    const { data: existing2, error: fetchErr } = await svc
      .from("orders")
      .select("id,amount_total,payment_status,status")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();

    if (fetchErr || !existing2?.id) return errorJson(cors, requestId, "ORDER_CREATE_FAILED", "Failed to create order", 500);

    const amountCents = typeof existing2.amount_total === "number" ? existing2.amount_total : 0;
    await backfillLoyaltyV2IfMissing({ svc, requestId, userId, orderId: existing2.id, amountCents });
    await maybeEmitGrowthEvents({ svc, requestId, orderId: existing2.id, userId, amountCents });

    return json(cors, {
      ok: true,
      ...(CONFIG.RETURN_REQUEST_ID ? { requestId } : {}),
      order_id: existing2.id,
      already_finalized: true,
      payment_status: existing2.payment_status ?? null,
      status: existing2.status ?? null,
    });
  } catch (e) {
    log("error", "unhandled_exception", { requestId, err: asErr(e) });
    return errorJson(cors, requestId, "INTERNAL", "Internal server error", 500);
  }
});