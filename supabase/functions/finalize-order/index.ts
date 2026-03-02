// supabase/functions/finalize-order/index.ts
// =============================================================================
// FINALIZE ORDER — Production Hardened (2026) (fixed + consistent)
// =============================================================================
// Purpose:
// - Called from /order-success to ensure an order exists even if webhook is delayed.
// - Auth required (Bearer access token) via shared authenticate().
// - Ownership enforced via Stripe session metadata.customer_uid.
// - Idempotent: safe to call repeatedly; returns existing order when present.
// - Uses pending_carts (created by create-checkout) to build authoritative order payload.
//
// Required Stripe metadata (set in create-checkout):
//   customer_uid, cart_ref
//
// Tables expected:
//   pending_carts: { id, user_id, items, subtotal_cents, discount_cents, tax_cents, total_cents, stripe_session_id? }
//   orders: must include UNIQUE(stripe_session_id) recommended
// =============================================================================

import Stripe from "stripe";
import { createServiceClient } from "../_shared/supabase.ts";
import { authenticate } from "../_shared/auth.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  MAX_BODY_BYTES: 10_000,
  MAX_SESSION_ID_LEN: 200,

  // finalize should be permissive; it’s called on success page refresh
  RATE_LIMIT_MAX: 30,
  RATE_LIMIT_WINDOW_MINUTES: 5,
  RATE_LIMIT_BLOCK_MINUTES: 10,
} as const;

const SESSION_REGEX = /^cs_(test|live)_[a-zA-Z0-9]+$/;

// ─────────────────────────────────────────────────────────────────────────────
// Env
// ─────────────────────────────────────────────────────────────────────────────
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
if (!STRIPE_SECRET_KEY) throw new Error("Missing STRIPE_SECRET_KEY");

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover",
  httpClient: Stripe.createFetchHttpClient(),
});

// Service role DB client
const svc = createServiceClient();

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
  "http://localhost:3000",
  "http://localhost:3001",
]);

function getCorsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return null;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, x-client-info, content-type, x-idempotency-key, x-application-name",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function log(level: "info" | "warn" | "error", msg: string, data?: unknown) {
  console.log(JSON.stringify({ level, msg, data, time: new Date().toISOString() }));
}

function json(cors: Record<string, string>, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function err(cors: Record<string, string>, message: string, status = 400, extra?: unknown) {
  log(status >= 500 ? "error" : "warn", message, extra);
  return json(cors, { error: message }, status);
}

function s(v: unknown, max: number): string {
  return String(v ?? "").slice(0, max).trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limit (checkout_rate_limits)
// Columns: user_id, attempts, last_attempt_at, blocked_until
// NOTE: If duplicates exist, we read the latest row safely.
// ─────────────────────────────────────────────────────────────────────────────
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
    log("warn", "rate_limit_read_failed", { userId, error: error.message });
    // fail-open for finalize (don't brick success page)
    return { blocked: false };
  }

  const blockedUntil = data?.blocked_until ? new Date(data.blocked_until) : null;
  if (blockedUntil && blockedUntil > now) return { blocked: true };

  const lastAttemptAt = data?.last_attempt_at ? new Date(data.last_attempt_at) : null;
  const attempts =
    !data || !lastAttemptAt || lastAttemptAt < windowStart ? 1 : (data.attempts ?? 0) + 1;

  const blocked = attempts > CONFIG.RATE_LIMIT_MAX;

  const { error: upErr } = await svc.from("checkout_rate_limits").upsert({
    user_id: userId,
    attempts,
    last_attempt_at: now.toISOString(),
    blocked_until: blocked
      ? new Date(now.getTime() + CONFIG.RATE_LIMIT_BLOCK_MINUTES * 60_000).toISOString()
      : null,
  });

  if (upErr) log("warn", "rate_limit_upsert_failed", { userId, error: upErr.message });

  return { blocked };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (!cors) return new Response("Origin not allowed", { status: 403 });

  // Preflight must always succeed
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return err(cors, "Method not allowed", 405);

  // Size guard
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > CONFIG.MAX_BODY_BYTES) {
    return err(cors, "Payload too large", 413);
  }

  const idem = (req.headers.get("x-idempotency-key") ?? "").trim();

  // Auth (shared)
  const auth = await authenticate(req);
  if (!auth.ok) {
    log("warn", "finalize_unauthorized", { reason: auth.reason, hasIdem: !!idem });
    return err(cors, "Unauthorized", 401);
  }
  const userId = auth.userId;

  // Rate limit (light)
  const rate = await checkRateLimit(userId);
  if (rate.blocked) return err(cors, "Too many attempts. Please wait.", 429);

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(cors, "Invalid JSON", 400);
  }

  const sessionIdRaw = isRecord(body) ? (body["session_id"] ?? body["sessionId"] ?? null) : null;
  const sessionId = s(sessionIdRaw, CONFIG.MAX_SESSION_ID_LEN);

  if (!sessionId || !SESSION_REGEX.test(sessionId)) {
    return err(cors, "Missing or invalid session_id", 400, { sessionId });
  }

  // 1) If order already exists, return it (idempotent)
  {
    const { data: existing, error } = await svc
      .from("orders")
      .select("id,stripe_session_id,payment_status,status")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();

    if (error) {
      log("warn", "orders_lookup_failed", { sessionId, error: error.message });
    } else if (existing?.id) {
      return json(cors, {
        ok: true,
        order_id: existing.id,
        already_finalized: true,
        payment_status: existing.payment_status ?? null,
        status: existing.status ?? null,
      });
    }
  }

  // 2) Retrieve Stripe session (single call)
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent", "customer"],
    });
  } catch (e) {
    log("error", "stripe_retrieve_failed", {
      sessionId,
      msg: e instanceof Error ? e.message : String(e),
    });
    return err(cors, "Unable to verify payment session", 502);
  }

  // Ownership check
  const owner = session.metadata?.customer_uid ?? "";
  if (!owner || owner !== userId) {
    log("warn", "session_owner_mismatch", { userId, owner, sessionId });
    return err(cors, "Unauthorized", 401);
  }

  // Paid check
  const paid = session.payment_status === "paid" || session.status === "complete";
  if (!paid) {
    return json(cors, {
      ok: true,
      order_id: null,
      already_finalized: false,
      payment_status: session.payment_status ?? null,
      status: session.status ?? null,
      message: "Payment not confirmed yet",
    });
  }

  // 3) Load pending cart (authoritative payload)
  const cartRef = session.metadata?.cart_ref ?? "";
  if (!cartRef) {
    log("error", "missing_cart_ref_metadata", { sessionId });
    return err(cors, "Missing cart reference (server metadata)", 500);
  }

  const { data: cart, error: cartErr } = await svc
    .from("pending_carts")
    .select(
      "id,user_id,items,subtotal_cents,discount_cents,tax_cents,total_cents,promo_id,credit_id,stripe_session_id",
    )
    .eq("id", cartRef)
    .maybeSingle();

  if (cartErr || !cart) {
    log("error", "pending_cart_not_found", { cartRef, sessionId, cartErr: cartErr?.message });
    return err(cors, "Pending cart not found", 404);
  }

  if (cart.user_id !== userId) {
    log("warn", "pending_cart_owner_mismatch", { cartRef, userId, cartUser: cart.user_id });
    return err(cors, "Unauthorized", 401);
  }

  // Link pending cart to stripe session if missing (best-effort)
  if (!cart.stripe_session_id) {
    const { error: linkErr } = await svc
      .from("pending_carts")
      .update({ stripe_session_id: sessionId })
      .eq("id", cartRef);
    if (linkErr) log("warn", "pending_cart_link_failed", { cartRef, sessionId, error: linkErr.message });
  }

  // 4) Insert order (idempotent via UNIQUE(stripe_session_id))
  // IMPORTANT: match these enum strings to your DB exactly.
  // If your DB expects lowercase enums, change to "paid"/"confirmed".
  const orderInsert = {
    stripe_session_id: sessionId,
    stripe_payment_intent_id:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,

    customer_uid: userId,
    customer_email: session.customer_details?.email ?? null,
    customer_name: session.customer_details?.name ?? null,
    customer_phone: session.customer_details?.phone ?? null,

    amount_subtotal: cart.subtotal_cents ?? 0,
    amount_tax: cart.tax_cents ?? 0,
    amount_shipping: 0,
    amount_total: cart.total_cents ?? 0,

    currency: (session.currency ?? "usd").toLowerCase(),
    payment_status: "PAID",
    status: "CONFIRMED",

    cart_items: cart.items,
    metadata: {
      source: "finalize-order",
      idempotency_key: idem || null,
      cart_ref: cartRef,
    },
    notes: null,
  };

  const { data: inserted, error: insErr } = await svc
    .from("orders")
    .insert(orderInsert)
    .select("id")
    .maybeSingle();

  if (!insErr && inserted?.id) {
    return json(cors, {
      ok: true,
      order_id: inserted.id,
      already_finalized: false,
      payment_status: session.payment_status ?? null,
      status: session.status ?? null,
    });
  }

  // If insert failed (often due to conflict), fetch existing
  const { data: existing, error: fetchErr } = await svc
    .from("orders")
    .select("id")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();

  if (fetchErr || !existing?.id) {
    log("error", "order_insert_failed", {
      sessionId,
      insErr: insErr?.message,
      fetchErr: fetchErr?.message,
    });
    return err(cors, "Failed to create order", 500);
  }

  return json(cors, {
    ok: true,
    order_id: existing.id,
    already_finalized: true,
    payment_status: session.payment_status ?? null,
    status: session.status ?? null,
  });
});