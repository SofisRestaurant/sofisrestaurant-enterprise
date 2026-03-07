// =============================================================================
// PATH: supabase/functions/finalize-order/index.ts
// =============================================================================
// finalize-order — Production Hardened (2026)
// - CORS allowlist enforcement (Origin strict if present; permissive if missing)
// - Auth required (customer ownership enforced)
// - Retrieves Stripe Checkout Session, verifies payment
// - Locates pending_carts row (from Stripe metadata; fallback by stripe_session_id)
// - Ensures pending_carts has NON-EMPTY pricing_snapshot + pricing_hash (repairs if needed)
// - Consumes pending cart safely via consumed_at (atomic conditional update)
// - Inserts orders with DB uniqueness guard (stripe_session_id unique)
// - Idempotent under race: insert -> if conflict -> read existing and return
// =============================================================================

import Stripe from "stripe";
import { authenticate, AuthError } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import type { Database, Json } from "../_shared/database.types.ts";
import {
  buildLegacyPricingSnapshotFromPendingCart,
  hashPricingSnapshot,
  parsePricingSnapshot,
} from "../_shared/pricing.ts";

type JsonRecord = Record<string, unknown>;
type Db = Database;
type OrderEventInsert = Db["public"]["Tables"]["order_events"]["Insert"];

// Your generated Database types may lag schema changes.
// We extend PendingCart Update to include new columns used by this function.
// (No `any`, and still type-safe enough for our usage.)
type PendingCartUpdate = Db["public"]["Tables"]["pending_carts"]["Update"] & {
  pricing_snapshot?: Json;
  pricing_hash?: string | null;
  stripe_session_id?: string | null;
  consumed_at?: string | null;
};

const MAX_BODY_BYTES = 10_000;
const MAX_SESSION_ID_LEN = 200;

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_BLOCK_MS = 10 * 60 * 1000;

// NOTE: If you want to split rate limits, create finalize_rate_limits
// and change FINALIZE_RATE_LIMIT_TABLE to "finalize_rate_limits".
const FINALIZE_RATE_LIMIT_TABLE = "checkout_rate_limits";

const LOYALTY_IDEMPOTENCY_PREFIX = "finalize-backfill:";
const MAX_AWARD_AMOUNT_CENTS = 500_000;
const MAX_ORDER_TOTAL_CENTS = 500_000;

const ALLOWED_ORIGINS = new Set<string>([
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
]);

const STRIPE_SESSION_RE = /^cs_(test|live)_[a-zA-Z0-9]+$/;
const DB_PAYMENT_STATUS_PAID = "paid";
const DB_ORDER_STATUS_CONFIRMED = "confirmed";

// ─────────────────────────────────────────────────────────────
// Stripe (2026-only versioning; NO fallback to 2024)
// ─────────────────────────────────────────────────────────────

function mustEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || !v.trim()) throw new Error(`Missing ${name}`);
  return v.trim();
}

// Your project uses a 2026 Stripe API version (including suffix like ".clover").
const DEFAULT_STRIPE_API_VERSION = "2026-02-25.clover";

function isValidStripeApiVersion(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(\.[a-zA-Z0-9_-]+)?$/.test(v);
}

const STRIPE_SECRET_KEY = mustEnv("STRIPE_SECRET_KEY");

const ENV_STRIPE_API_VERSION = (Deno.env.get("STRIPE_API_VERSION") ?? "").trim();
const STRIPE_API_VERSION = (isValidStripeApiVersion(ENV_STRIPE_API_VERSION)
  ? ENV_STRIPE_API_VERSION
  : DEFAULT_STRIPE_API_VERSION) as Stripe.LatestApiVersion;

let stripeSingleton: Stripe | null = null;
function getStripeOrThrow(): { stripe: Stripe; apiVersion: string } {
  if (stripeSingleton) return { stripe: stripeSingleton, apiVersion: STRIPE_API_VERSION };

  stripeSingleton = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });

  return { stripe: stripeSingleton, apiVersion: STRIPE_API_VERSION };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeRequestId(req: Request): string {
  const headerId = (req.headers.get("x-request-id") ?? "").trim();
  if (headerId) return headerId.slice(0, 128);
  return crypto.randomUUID();
}

function prefix(value: string | null | undefined, length = 8): string | null {
  if (!value) return null;
  return value.slice(0, length);
}

function asErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function clampAmountCents(value: unknown): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(MAX_AWARD_AMOUNT_CENTS, Math.max(0, Math.trunc(parsed)));
}

function clampOrderTotalCents(value: unknown): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(MAX_ORDER_TOTAL_CENTS, Math.max(0, Math.trunc(parsed)));
}

function log(
  level: "info" | "warn" | "error",
  event: string,
  meta: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      level,
      event,
      service: "finalize-order",
      ...meta,
      ts: nowIso(),
    }),
  );
}

function readString(rec: JsonRecord, key: string): string | null {
  const v = rec[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readNumber(rec: JsonRecord, key: string): number | null {
  const v = rec[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function readJson(rec: JsonRecord, key: string): Json | null {
  const v = rec[key];
  // Json in generated types is a union; runtime validation is best-effort.
  return (v as Json) ?? null;
}

// Ensure safe string currency (lowercase), default usd.
function normalizeCurrency(v: unknown): string {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s || "usd";
}

// ─────────────────────────────────────────────────────────────
// CORS (create-checkout style)
// - If Origin present -> must allowlist, set ACAO
// - If Origin missing/empty -> allow, but no ACAO (still Vary: Origin)
// ─────────────────────────────────────────────────────────────

function corsHeadersFor(req: Request): Record<string, string> | null {
  const origin = (req.headers.get("origin") ?? "").trim();

  // No Origin header (or empty) => allow request, do NOT set ACAO
  if (!origin) {
    return { Vary: "Origin" };
  }

  // Origin present => must be allowlisted
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

function withStandardHeaders(headersInit: HeadersInit, requestId: string): Headers {
  const headers = new Headers(headersInit);
  if (!headers.has("Vary")) headers.set("Vary", "Origin");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Request-Id", requestId);
  return headers;
}

function jsonResponse(
  body: unknown,
  status: number,
  headersInit: HeadersInit,
  requestId: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withStandardHeaders(headersInit, requestId),
  });
}

function errorResponse(
  cors: HeadersInit,
  requestId: string,
  code: string,
  message: string,
  status: number,
  meta?: Record<string, unknown>,
): Response {
  log(status >= 500 ? "error" : "warn", "error", {
    requestId,
    code,
    message,
    ...(meta ?? {}),
  });

  return jsonResponse(
    { ok: false, error: { code, message, requestId } },
    status,
    cors,
    requestId,
  );
}

async function readJsonObjectBody(req: Request): Promise<JsonRecord> {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) throw new Error("UNSUPPORTED_CONTENT_TYPE");

  const rawBody = await req.text();
  if (!rawBody.trim()) throw new Error("EMPTY_BODY");

  const bodyBytes = new TextEncoder().encode(rawBody).length;
  if (bodyBytes > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error("INVALID_JSON_BODY");
  }

  if (!isRecord(parsed)) throw new Error("INVALID_JSON_BODY");
  return parsed;
}

function mustStripeSessionId(value: unknown): string {
  if (typeof value !== "string") throw new Error("INVALID_SESSION_ID");
  const normalized = value.trim();

  if (!normalized || normalized.length > MAX_SESSION_ID_LEN || !STRIPE_SESSION_RE.test(normalized)) {
    throw new Error("INVALID_SESSION_ID");
  }

  return normalized;
}

function pickString(meta: Stripe.Metadata | null | undefined, ...keys: string[]): string {
  if (!meta) return "";
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function isNonEmptyJsonObject(v: unknown): boolean {
  if (!isRecord(v)) return false;
  return Object.keys(v).length > 0;
}

function normalizeStripePaid(session: Stripe.Checkout.Session): boolean {
  return session.payment_status === "paid" || session.status === "complete";
}

// ─────────────────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────────────────

async function checkRateLimit(
  db: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<{ blocked: boolean; retryAfterSeconds: number }> {
  const now = Date.now();

  const { data, error } = await db
    .from(FINALIZE_RATE_LIMIT_TABLE)
    .select("attempts,last_attempt_at,blocked_until")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("RATE_LIMIT_LOOKUP_FAILED");

  const blockedUntilMs = typeof data?.blocked_until === "string" ? Date.parse(data.blocked_until) : NaN;
  if (Number.isFinite(blockedUntilMs) && blockedUntilMs > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((blockedUntilMs - now) / 1000)),
    };
  }

  const lastAttemptMs = typeof data?.last_attempt_at === "string" ? Date.parse(data.last_attempt_at) : NaN;

  const previousAttempts = typeof data?.attempts === "number" ? data.attempts : 0;
  const nextAttempts =
    Number.isFinite(lastAttemptMs) && now - lastAttemptMs < RATE_LIMIT_WINDOW_MS
      ? previousAttempts + 1
      : 1;

  const blocked = nextAttempts > RATE_LIMIT_MAX;
  const blockedUntilIso = blocked ? new Date(now + RATE_LIMIT_BLOCK_MS).toISOString() : null;

  const upsertRow: Db["public"]["Tables"]["checkout_rate_limits"]["Insert"] = {
    user_id: userId,
    attempts: nextAttempts,
    last_attempt_at: new Date(now).toISOString(),
    blocked_until: blockedUntilIso,
  };

  const { error: upsertError } = await db
    .from(FINALIZE_RATE_LIMIT_TABLE)
    .upsert(upsertRow, { onConflict: "user_id" });

  if (upsertError) throw new Error("RATE_LIMIT_WRITE_FAILED");

  return {
    blocked,
    retryAfterSeconds: blocked ? Math.max(1, Math.ceil(RATE_LIMIT_BLOCK_MS / 1000)) : 0,
  };
}

// ─────────────────────────────────────────────────────────────
// Side effects (best-effort)
// ─────────────────────────────────────────────────────────────

async function backfillLoyaltyV2IfMissing(args: {
  db: ReturnType<typeof createServiceClient>;
  requestId: string;
  userId: string;
  orderId: string;
  amountCents: number;
}): Promise<void> {
  const { db, requestId, userId, orderId } = args;
  const amountCents = clampAmountCents(args.amountCents);
  if (amountCents <= 0) return;

  try {
    const { data: account, error: accountError } = await db
      .from("loyalty_accounts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (accountError || !account?.id) {
      log("warn", "loyalty_backfill_account_missing", {
        requestId,
        userId: prefix(userId),
        code: accountError?.code ?? null,
      });
      return;
    }

    const idempotencyKey = `${LOYALTY_IDEMPOTENCY_PREFIX}${orderId}`;

    const { data: existingLedger, error: ledgerError } = await db
      .from("loyalty_ledger")
      .select("id")
      .eq("account_id", account.id)
      .or(`reference_id.eq.${orderId},idempotency_key.eq.${idempotencyKey}`)
      .limit(1)
      .maybeSingle();

    if (!ledgerError && existingLedger?.id) return;

    const { error } = await db.rpc("v2_award_points", {
      p_account_id: account.id,
      p_admin_id: userId,
      p_amount_cents: amountCents,
      p_idempotency_key: idempotencyKey,
      p_reference_id: orderId,
    });

    if (error) {
      log("warn", "loyalty_backfill_award_failed_v2", {
        requestId,
        orderId: prefix(orderId),
        code: error.code ?? null,
      });
      return;
    }

    log("info", "loyalty_backfill_awarded_v2", {
      requestId,
      orderId: prefix(orderId),
      accountId: prefix(account.id),
    });
  } catch (error) {
    log("error", "loyalty_backfill_crash", {
      requestId,
      orderId: prefix(orderId),
      error: asErrorMessage(error),
    });
  }
}

async function maybeEmitGrowthEvents(args: {
  db: ReturnType<typeof createServiceClient>;
  requestId: string;
  orderId: string;
  userId: string;
  amountCents: number;
}): Promise<void> {
  const { db, requestId, orderId, userId, amountCents } = args;

  const rows: OrderEventInsert[] = [];
  const baseData: Json = { user_id: userId, amount_cents: amountCents };

  rows.push({
    order_id: orderId,
    user_id: userId,
    event_type: "REVIEW_NUDGE_READY",
    event_data: baseData,
  });

  try {
    const { error } = await db.from("order_events").insert(rows);
    if (error) {
      log("warn", "growth_events_insert_failed", {
        requestId,
        orderId: prefix(orderId),
        code: error.code ?? null,
      });
    }
  } catch {
    // best effort only
  }
}

async function markCreditUsedBestEffort(args: {
  db: ReturnType<typeof createServiceClient>;
  requestId: string;
  creditId: string | null;
  userId: string;
  stripeSessionId: string;
}): Promise<void> {
  const { db, requestId, creditId, userId, stripeSessionId } = args;
  if (!creditId) return;

  try {
    const { data, error } = await db
      .from("user_credits")
      .select("id,user_id,used,checkout_session_id")
      .eq("id", creditId)
      .maybeSingle();

    if (error || !data || data.user_id !== userId) {
      log("warn", "credit_finalize_lookup_failed", {
        requestId,
        creditId: prefix(creditId),
      });
      return;
    }

    if (data.used === true) {
      if (data.checkout_session_id === stripeSessionId) return;

      log("warn", "credit_finalize_already_used_elsewhere", {
        requestId,
        creditId: prefix(creditId),
        stripeSessionId: prefix(stripeSessionId),
      });
      return;
    }

    const { error: updateError } = await db
      .from("user_credits")
      .update({
        used: true,
        used_at: nowIso(),
        checkout_session_id: stripeSessionId,
      })
      .eq("id", creditId)
      .eq("user_id", userId)
      .eq("used", false);

    if (updateError) {
      log("warn", "credit_finalize_update_failed", {
        requestId,
        creditId: prefix(creditId),
        code: updateError.code ?? null,
      });
    }
  } catch (error) {
    log("warn", "credit_finalize_exception", {
      requestId,
      creditId: prefix(creditId),
      error: asErrorMessage(error),
    });
  }
}

async function recordPromoRedemptionBestEffort(args: {
  db: ReturnType<typeof createServiceClient>;
  requestId: string;
  promotionId: string | null;
  userId: string;
  checkoutSessionId: string;
  discountCents: number;
  orderTotalCents: number;
}): Promise<void> {
  const { db, requestId, promotionId, userId, checkoutSessionId, discountCents, orderTotalCents } =
    args;

  if (!promotionId || discountCents <= 0) return;

  try {
    const { data: existing, error: existingError } = await db
      .from("promo_redemptions")
      .select("id")
      .eq("promotion_id", promotionId)
      .eq("user_id", userId)
      .eq("checkout_session_id", checkoutSessionId)
      .limit(1)
      .maybeSingle();

    if (!existingError && existing?.id) return;

    const { data: promotion } = await db
      .from("promotions")
      .select("channel")
      .eq("id", promotionId)
      .maybeSingle();

    const insertRow: Db["public"]["Tables"]["promo_redemptions"]["Insert"] = {
      promotion_id: promotionId,
      user_id: userId,
      checkout_session_id: checkoutSessionId,
      discount_cents: discountCents,
      order_total_cents: orderTotalCents,
      channel: promotion?.channel ?? null,
    };

    const { error } = await db.from("promo_redemptions").insert(insertRow);
    if (error) {
      log("warn", "promo_redemption_insert_failed", {
        requestId,
        promotionId: prefix(promotionId),
        code: error.code ?? null,
      });
    }
  } catch (error) {
    log("warn", "promo_redemption_exception", {
      requestId,
      promotionId: prefix(promotionId),
      error: asErrorMessage(error),
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Pending cart parsing (matches your schema)
// ─────────────────────────────────────────────────────────────

function parsePendingCartRecord(value: unknown): {
  id: string;
  userId: string;
  items: Json;
  promoId: string | null;
  creditId: string | null;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  pricingHash: string | null;
  pricingSnapshotRaw: unknown;
  consumedAt: string | null;
  stripeSessionId: string | null;
} | null {
  if (!isRecord(value)) return null;

  const id = readString(value, "id");
  const userId = readString(value, "user_id");
  if (!id || !userId) return null;

  const items = readJson(value, "items");
  if (items == null) return null;

  return {
    id,
    userId,
    items,
    promoId: readString(value, "promo_id"),
    creditId: readString(value, "credit_id"),
    subtotalCents: clampOrderTotalCents(readNumber(value, "subtotal_cents") ?? 0),
    discountCents: clampOrderTotalCents(readNumber(value, "discount_cents") ?? 0),
    taxCents: clampOrderTotalCents(readNumber(value, "tax_cents") ?? 0),
    totalCents: clampOrderTotalCents(readNumber(value, "total_cents") ?? 0),
    currency: normalizeCurrency(value["currency"]),
    pricingHash: readString(value, "pricing_hash"),
    pricingSnapshotRaw: value["pricing_snapshot"],
    consumedAt: readString(value, "consumed_at"),
    stripeSessionId: readString(value, "stripe_session_id"),
  };
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = makeRequestId(req);
  const start = Date.now();

  const cors = corsHeadersFor(req);
  if (!cors) {
    return new Response("Origin not allowed", {
      status: 403,
      headers: withStandardHeaders({ Vary: "Origin" }, requestId),
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: withStandardHeaders(cors, requestId),
    });
  }

  if (req.method !== "POST") {
    return errorResponse(cors, requestId, "METHOD_NOT_ALLOWED", "Method not allowed.", 405);
  }

  // Stripe init (2026)
  let stripe: Stripe;
  let stripeApiVersion: string;
  try {
    const loaded = getStripeOrThrow();
    stripe = loaded.stripe;
    stripeApiVersion = loaded.apiVersion;
  } catch (error) {
    log("error", "stripe_init_failed", { requestId, error: asErrorMessage(error) });
    return errorResponse(
      cors,
      requestId,
      "STRIPE_INIT_FAILED",
      "Stripe is not configured on the server.",
      503,
    );
  }

  // Auth
  let user: { id: string; email: string | null };
  try {
    user = await authenticate(req);
  } catch (error) {
    const code = error instanceof AuthError ? error.code : "AUTH_ERROR";
    const status = error instanceof AuthError ? error.status : 401;
    return errorResponse(cors, requestId, code, "Unauthorized", status);
  }

  const db = createServiceClient();

  // Rate limit
  try {
    const rl = await checkRateLimit(db, user.id);
    if (rl.blocked) {
      const headers = new Headers(withStandardHeaders(cors, requestId));
      headers.set("Retry-After", String(rl.retryAfterSeconds));
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait.", requestId },
        }),
        { status: 429, headers },
      );
    }
  } catch (error) {
    return errorResponse(
      cors,
      requestId,
      "RATE_LIMIT_LOOKUP_FAILED",
      "Service unavailable.",
      503,
      { error: asErrorMessage(error) },
    );
  }

  // Body
  let rawBody: JsonRecord;
  try {
    rawBody = await readJsonObjectBody(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_JSON_BODY";
    if (message === "UNSUPPORTED_CONTENT_TYPE") {
      return errorResponse(
        cors,
        requestId,
        "UNSUPPORTED_CONTENT_TYPE",
        "Content-Type must be application/json.",
        415,
      );
    }
    if (message === "BODY_TOO_LARGE") {
      return errorResponse(cors, requestId, "BODY_TOO_LARGE", "Request body is too large.", 413);
    }
    if (message === "EMPTY_BODY") {
      return errorResponse(cors, requestId, "EMPTY_BODY", "Request body is required.", 400);
    }
    return errorResponse(cors, requestId, "INVALID_JSON_BODY", "Request body must be valid JSON.", 400);
  }

  // Session id
  let sessionId: string;
  try {
    sessionId = mustStripeSessionId(rawBody.sessionId ?? rawBody.session_id);
  } catch {
    return errorResponse(cors, requestId, "INVALID_SESSION_ID", "Invalid session id.", 400);
  }

  try {
    // 0) Fast idempotent return (order already exists)
    const { data: existingOrder } = await db
      .from("orders")
      .select("id,amount_total,payment_status,status")
      .eq("stripe_session_id", sessionId)
      .maybeSingle();

    if (existingOrder?.id) {
      await backfillLoyaltyV2IfMissing({
        db,
        requestId,
        userId: user.id,
        orderId: existingOrder.id,
        amountCents: existingOrder.amount_total,
      });

      log("info", "finalize_idempotent_return", {
        requestId,
        orderId: prefix(existingOrder.id),
        sessionId: prefix(sessionId),
        ms: Date.now() - start,
      });

      return jsonResponse(
        {
          ok: true,
          requestId,
          order_id: existingOrder.id,
          already_finalized: true,
          payment_status: existingOrder.payment_status,
          status: existingOrder.status,
        },
        200,
        cors,
        requestId,
      );
    }

    // 1) Stripe session retrieve
    const stripeSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });

    // Ownership check (metadata-based)
    const owner = pickString(stripeSession.metadata ?? {}, "user_id", "customer_uid", "uid");
    if (!owner || owner !== user.id) {
      log("warn", "stripe_owner_mismatch", {
        requestId,
        sessionId: prefix(sessionId),
        owner: prefix(owner),
        userId: prefix(user.id),
      });
      return errorResponse(cors, requestId, "UNAUTHORIZED", "Unauthorized.", 401);
    }

    // Payment confirmed?
    if (!normalizeStripePaid(stripeSession)) {
      return jsonResponse(
        {
          ok: true,
          requestId,
          order_id: null,
          already_finalized: false,
          payment_status: stripeSession.payment_status ?? null,
          status: stripeSession.status ?? null,
          message: "Payment not confirmed yet",
        },
        200,
        cors,
        requestId,
      );
    }

    // 2) Locate pending cart
    const cartRef = pickString(
      stripeSession.metadata ?? {},
      "pending_cart_id",
      "cart_ref",
      "cart_id",
      "pendingCartId",
    );

    let cartRow: unknown = null;

    if (cartRef) {
      const { data, error } = await db
        .from("pending_carts")
        .select(
          "id,user_id,items,subtotal_cents,discount_cents,tax_cents,total_cents,promo_id,credit_id,pricing_snapshot,pricing_hash,currency,consumed_at,stripe_session_id",
        )
        .eq("id", cartRef)
        .maybeSingle();

      if (error) {
        return errorResponse(
          cors,
          requestId,
          "PENDING_CART_LOOKUP_FAILED",
          "Pending cart lookup failed.",
          503,
          { code: error.code ?? null },
        );
      }
      cartRow = data ?? null;
    }

    if (!cartRow) {
      const { data, error } = await db
        .from("pending_carts")
        .select(
          "id,user_id,items,subtotal_cents,discount_cents,tax_cents,total_cents,promo_id,credit_id,pricing_snapshot,pricing_hash,currency,consumed_at,stripe_session_id",
        )
        .eq("stripe_session_id", sessionId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return errorResponse(
          cors,
          requestId,
          "PENDING_CART_LOOKUP_FAILED",
          "Pending cart lookup failed.",
          503,
          { code: error.code ?? null },
        );
      }
      cartRow = data ?? null;
    }

    if (!cartRow) {
      return errorResponse(cors, requestId, "PENDING_CART_NOT_FOUND", "Pending cart not found.", 404);
    }

    const pendingCart = parsePendingCartRecord(cartRow);
    if (!pendingCart) {
      return errorResponse(cors, requestId, "PENDING_CART_INVALID", "Pending cart is invalid.", 500);
    }

    if (pendingCart.userId !== user.id) {
      return errorResponse(cors, requestId, "UNAUTHORIZED", "Unauthorized.", 401);
    }

    // 3) Build authoritative snapshot (never {})
    const orderTypeMeta = pickString(stripeSession.metadata ?? {}, "order_type");
    const orderType =
      orderTypeMeta === "pickup" || orderTypeMeta === "delivery" || orderTypeMeta === "dine_in"
        ? orderTypeMeta
        : "pickup";

    const parsed = parsePricingSnapshot(pendingCart.pricingSnapshotRaw);
    const snapshot =
      parsed ??
      buildLegacyPricingSnapshotFromPendingCart({
        userId: user.id,
        currency: pendingCart.currency,
        orderType,
        orderNotes: null,
        items: pendingCart.items,
        subtotalCents: pendingCart.subtotalCents,
        discountCents: pendingCart.discountCents,
        taxCents: pendingCart.taxCents,
        totalCents: pendingCart.totalCents,
        promoId: pendingCart.promoId,
        creditId: pendingCart.creditId,
      });

    if (!isNonEmptyJsonObject(snapshot)) {
      return errorResponse(cors, requestId, "PRICING_SNAPSHOT_INVALID", "Pricing snapshot is invalid.", 500);
    }

    const recalculatedHash = await hashPricingSnapshot(snapshot);
    if (!recalculatedHash || recalculatedHash.trim().length < 16) {
      return errorResponse(cors, requestId, "PRICING_HASH_INVALID", "Pricing hash is invalid.", 500);
    }

    // Hash integrity check when present
    if (pendingCart.pricingHash && pendingCart.pricingHash !== recalculatedHash) {
      return errorResponse(cors, requestId, "PRICING_HASH_MISMATCH", "Pricing snapshot failed verification.", 409);
    }

    // Repair snapshot/hash if missing/empty (prevents {} issues under DB constraints)
    const needsSnapshotRepair =
      !isNonEmptyJsonObject(pendingCart.pricingSnapshotRaw) ||
      !pendingCart.pricingHash ||
      pendingCart.pricingHash.trim().length < 16;

    if (needsSnapshotRepair) {
      const repairPatch: PendingCartUpdate = {
        pricing_snapshot: snapshot as unknown as Json,
        pricing_hash: recalculatedHash,
      };

      const { error: repairError } = await db
        .from("pending_carts")
        .update(repairPatch)
        .eq("id", pendingCart.id);

      if (repairError) {
        return errorResponse(
          cors,
          requestId,
          "PENDING_CART_REPAIR_FAILED",
          "Failed to repair pending cart pricing snapshot.",
          500,
          { code: repairError.code ?? null, message: repairError.message },
        );
      }
    }

    // Totals consistency (DB vs snapshot)
    const expectedDiscountCents = snapshot.campaignDiscountCents + snapshot.promoDiscountCents;
    if (
      pendingCart.subtotalCents !== snapshot.subtotalCents ||
      pendingCart.discountCents !== expectedDiscountCents ||
      pendingCart.taxCents !== snapshot.taxCents ||
      pendingCart.totalCents !== snapshot.totalCents
    ) {
      return errorResponse(cors, requestId, "PENDING_CART_TOTAL_MISMATCH", "Pending cart totals do not match snapshot.", 409);
    }

    // Stripe charged amount must match snapshot totals
    const stripeAmountTotal = typeof stripeSession.amount_total === "number" ? stripeSession.amount_total : null;
    const stripeCurrency = normalizeCurrency(stripeSession.currency ?? "usd");

    if (stripeAmountTotal === null || stripeAmountTotal !== snapshot.totalCents) {
      return errorResponse(
        cors,
        requestId,
        "TOTAL_MISMATCH",
        "Charged total does not match authoritative pricing.",
        409,
        { charged: stripeAmountTotal, expected: snapshot.totalCents },
      );
    }

    if (stripeCurrency !== snapshot.currency) {
      return errorResponse(cors, requestId, "CURRENCY_MISMATCH", "Charged currency does not match authoritative pricing.", 409);
    }

    const paymentIntentId =
      typeof stripeSession.payment_intent === "string"
        ? stripeSession.payment_intent
        : stripeSession.payment_intent?.id ?? null;

    // 4) Atomic consume pending cart + backfill stripe_session_id + snapshot/hash
    const consumePatch: PendingCartUpdate = {
      consumed_at: nowIso(),
      stripe_session_id: sessionId,
      pricing_snapshot: snapshot as unknown as Json,
      pricing_hash: recalculatedHash,
    };

    const { data: consumeRows, error: consumeError } = await db
      .from("pending_carts")
      .update(consumePatch)
      .eq("id", pendingCart.id)
      .is("consumed_at", null)
      .select("id");

    if (consumeError) {
      return errorResponse(
        cors,
        requestId,
        "PENDING_CART_CONSUME_FAILED",
        "Failed to consume pending cart.",
        500,
        { code: consumeError.code ?? null, message: consumeError.message },
      );
    }

    const consumedNow = Array.isArray(consumeRows) && consumeRows.length > 0;

    // 5) Insert order (race-safe via UNIQUE(stripe_session_id))
    const orderMetadata: Json = {
      source: "finalize-order",
      request_id: requestId,
      pending_cart_id: pendingCart.id,
      stripe_session_status: stripeSession.status ?? null,
      stripe_payment_status: stripeSession.payment_status ?? null,
      stripe_api_version: stripeApiVersion,
      promo_id: snapshot.promoId,
      credit_id: snapshot.creditId,
      applied_campaign_ids: snapshot.appliedCampaignIds,
      pricing_hash: recalculatedHash,
      pricing_snapshot: snapshot,
      stripe_amount_total: stripeAmountTotal,
      stripe_currency: stripeCurrency,
      pending_cart_consumed_now: consumedNow,
    };

    const orderInsert: Db["public"]["Tables"]["orders"]["Insert"] = {
      stripe_session_id: sessionId,
      stripe_payment_intent_id: paymentIntentId,
      order_type: "food",
      customer_uid: user.id,
      customer_email: stripeSession.customer_details?.email ?? user.email ?? null,
      customer_name: stripeSession.customer_details?.name ?? null,
      customer_phone: stripeSession.customer_details?.phone ?? null,
      amount_subtotal: snapshot.subtotalCents,
      amount_tax: snapshot.taxCents,
      amount_shipping: 0,
      amount_total: snapshot.totalCents,
      currency: snapshot.currency,
      payment_status: DB_PAYMENT_STATUS_PAID,
      status: DB_ORDER_STATUS_CONFIRMED,
      cart_items: pendingCart.items,
      metadata: orderMetadata,
      notes: snapshot.orderNotes,
    };

    // Try insert first. If conflict (unique), we read and return the existing order.
    const { data: insertedOrder, error: insertError } = await db
      .from("orders")
      .insert(orderInsert)
      .select("id,amount_total,payment_status,status")
      .maybeSingle();

    if (insertError) {
      log("warn", "order_insert_failed", {
        requestId,
        sessionId: prefix(sessionId),
        code: insertError.code ?? null,
        message: insertError.message,
      });
    }

    const { data: finalOrder, error: finalOrderError } = insertedOrder?.id
      ? { data: insertedOrder, error: null }
      : await db
        .from("orders")
        .select("id,amount_total,payment_status,status")
        .eq("stripe_session_id", sessionId)
        .maybeSingle();

    if (finalOrderError || !finalOrder?.id) {
      return errorResponse(cors, requestId, "ORDER_CREATE_FAILED", "Failed to create order.", 500, {
        code: finalOrderError?.code ?? null,
      });
    }

    // 6) Best-effort side effects
    await Promise.all([
      backfillLoyaltyV2IfMissing({
        db,
        requestId,
        userId: user.id,
        orderId: finalOrder.id,
        amountCents: finalOrder.amount_total,
      }),
      maybeEmitGrowthEvents({
        db,
        requestId,
        orderId: finalOrder.id,
        userId: user.id,
        amountCents: finalOrder.amount_total,
      }),
      markCreditUsedBestEffort({
        db,
        requestId,
        creditId: snapshot.creditId,
        userId: user.id,
        stripeSessionId: sessionId,
      }),
      recordPromoRedemptionBestEffort({
        db,
        requestId,
        promotionId: snapshot.promoId,
        userId: user.id,
        checkoutSessionId: sessionId,
        discountCents: snapshot.promoDiscountCents,
        orderTotalCents: snapshot.totalCents,
      }),
    ]);

    log("info", "finalize_ok", {
      requestId,
      orderId: prefix(finalOrder.id),
      sessionId: prefix(sessionId),
      consumedNow,
      ms: Date.now() - start,
    });

    return jsonResponse(
      {
        ok: true,
        requestId,
        order_id: finalOrder.id,
        already_finalized: insertedOrder?.id ? false : true,
        payment_status: finalOrder.payment_status,
        status: finalOrder.status,
      },
      200,
      cors,
      requestId,
    );
  } catch (error) {
    log("error", "unhandled_exception", {
      requestId,
      error: asErrorMessage(error),
    });

    return errorResponse(cors, requestId, "INTERNAL", "Internal server error.", 500);
  }
});