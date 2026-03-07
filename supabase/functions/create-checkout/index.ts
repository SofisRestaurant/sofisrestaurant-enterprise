// PATH: supabase/functions/create-checkout/index.ts
// =============================================================================
// create-checkout — Production Hardened (2026)
// - Server authoritative pricing (campaigns/promos/credits)
// - Canonical cart validation + fraud logging
// - Stripe Checkout session creation with idempotency
// - Persists pending_carts with pricing_snapshot + pricing_hash (audit trail)
// - Browser CORS allowlist (Origin enforced only when present)
// =============================================================================

import Stripe from "stripe";
import type { Database, Json } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase.ts";
import { createAnonClient, createServiceClient, readBearerToken } from "../_shared/supabase.ts";
import {
  type CanonicalCartItem,
  type CanonicalModifier,
  type OrderType,
  PricingValidationError,
  buildClientIntegrityHash,
  buildStripeLineItemsFromPricing,
  pricingSnapshotToJson,
  resolvePricingForCheckout,
} from "../_shared/pricing.ts";

type Db = Database;

type IncomingCartModifier = {
  id: string;
  groupId?: string;
  name?: string; // IMPORTANT: keep as string | undefined (NOT null) to match TS strictness
  priceAdjustment?: number;
};

type IncomingCartItem = {
  menuItemId: string;
  name?: string;
  unitPriceCents?: number;
  imageUrl?: string | null;
  modifiers: IncomingCartModifier[];
  quantity: number;
  notes?: string | null;
  pricingHash?: string | null;
};

type FrontendTotals = {
  subtotalCents: number;
  discountCents: number;
  creditCents: number;
  taxCents: number;
  totalCents: number;
};

type CreateCheckoutRequest = {
  items: IncomingCartItem[];
  promoId: string | null;
  promoCode: string | null;
  creditId: string | null;
  orderType: OrderType;
  notes: string | null;
  idempotencyKey: string | null;
  frontendTotals: FrontendTotals | null;
};

type CreateCheckoutResponse =
  | {
      ok: true;
      session_id: string;
      url: string | null;
      totals: FrontendTotals;
      pending_cart_id: string;
      requestId: string;
    }
  | {
      ok: false;
      error: string;
      code: string;
      requestId: string;
    };

type FraudMetadata =
  | {
      kind: "pricing_hash_mismatch";
      menuItemId: string;
      clientHash: string | null;
      serverHash: string;
      clientUnitPriceCents: number | null;
      serverUnitPriceCents: number;
      clientQty: number;
      serverQty: number;
    }
  | {
      kind: "totals_mismatch";
      frontendTotals: FrontendTotals;
      serverTotals: FrontendTotals;
    }
  | {
      kind: "menu_item_not_found";
      menuItemId: string;
    }
  | {
      kind: "pending_cart_upsert_failed";
      message: string;
      session_id: string;
    }
  | {
      kind: "checkout_failed";
      message: string;
    }
  | {
      kind: "invalid_request";
      reason: string;
    };

type JsonRecord = Record<string, unknown>;

// IMPORTANT:
// Supabase Row types represent FULL rows. Our SELECTs return PARTIAL shapes.
// Use “Lite” types that exactly match our SELECT columns to keep TS honest.
type MenuItemLite = Pick<
  Db["public"]["Tables"]["menu_items"]["Row"],
  "id" | "name" | "category" | "image_url" | "available" | "price" | "inventory_count"
>;

type ModifierLite = Pick<
  Db["public"]["Tables"]["modifiers"]["Row"],
  "id" | "modifier_group_id" | "name" | "price_adjustment" | "available"
>;

const FUNCTION_NAME = "create-checkout";
const MAX_BODY_BYTES = 25_000;
const MAX_CART_ITEMS = 50;
const MAX_ITEM_QTY = 20;
const MAX_TOTAL_CENTS = 5_000_000;
const MAX_IDEMPOTENCY_KEY_LEN = 120;

const RATE_LIMIT_MAX = 12;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_BLOCK_MS = 15 * 60 * 1000;

const ALLOWED_ORIGINS = new Set<string>([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
]);

const ALLOWED_HEADERS =
  "authorization, apikey, x-client-info, content-type, x-application-name, x-idempotency-key, x-request-id, x-requested-with";

const STRIPE_API_VERSION =
  (Deno.env.get("STRIPE_API_VERSION")?.trim() || "2026-02-25") as Stripe.LatestApiVersion;

// ─────────────────────────────────────────────────────────────
// Helpers (runtime-safe)
// ─────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clampInt(value: unknown, min: number, max: number): number {
  const parsed = asNumber(value, min);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function cents(value: unknown): number {
  return Math.max(0, clampInt(value, 0, MAX_TOTAL_CENTS));
}

function makeRequestId(req: Request): string {
  const headerId = (req.headers.get("x-request-id") ?? "").trim();
  if (headerId) return headerId.slice(0, 128);
  return crypto.randomUUID().replaceAll("-", "");
}

// CORS:
// - If Origin is present → MUST be allowlisted
// - If Origin is missing → allow (server-to-server / CLI), but do NOT set ACAO
function corsHeadersFor(origin: string | null): HeadersInit | null {
  const normalizedOrigin = (origin ?? "").trim();
  if (!normalizedOrigin) return { Vary: "Origin" };
  if (!ALLOWED_ORIGINS.has(normalizedOrigin)) return null;

  return {
    "Access-Control-Allow-Origin": normalizedOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

function withStandardHeaders(headersInit: HeadersInit, requestId: string): Headers {
  const headers = new Headers(headersInit);

  if (!headers.has("Vary")) headers.set("Vary", "Origin");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
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
  status: number,
  code: string,
  error: string,
  headersInit: HeadersInit,
  requestId: string,
  extraHeaders?: HeadersInit,
): Response {
  const merged = new Headers(headersInit);
  if (extraHeaders) {
    const extra = new Headers(extraHeaders);
    for (const [k, v] of extra.entries()) merged.set(k, v);
  }

  return jsonResponse(
    { ok: false, code, error, requestId } satisfies CreateCheckoutResponse,
    status,
    merged,
    requestId,
  );
}

function sanitizePromoCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized.slice(0, 32) : null;
}

function sanitizeNotes(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized.slice(0, 1200) : null;
}

function sanitizeId(value: unknown, maxLength = 128): string {
  const normalized = asString(value).trim();
  return normalized.slice(0, maxLength);
}

function sanitizeImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 1000) return null;
  return normalized;
}

function sanitizeIdempotencyKey(value: string | null, fallback: string): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return fallback;
  return normalized.slice(0, MAX_IDEMPOTENCY_KEY_LEN);
}

function buildDefaultIdempotencyKey(userId: string, payloadHash: string): string {
  return `checkout:${userId}:${payloadHash}`.slice(0, MAX_IDEMPOTENCY_KEY_LEN);
}

function normalizeTaxRate(): number {
  const envValue = (Deno.env.get("TAX_RATE") ?? "").trim();
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || parsed < 0) return 0.0825;
  return parsed;
}

function getCheckoutSuccessUrl(): string {
  const configured = (Deno.env.get("CHECKOUT_SUCCESS_URL") ?? "").trim();
  const base = configured || "http://localhost:3000/order-success";
  return `${base}?session_id={CHECKOUT_SESSION_ID}`;
}

function getCheckoutCancelUrl(): string {
  const configured = (Deno.env.get("CHECKOUT_CANCEL_URL") ?? "").trim();
  const base = configured || "http://localhost:3000/order-canceled";
  return `${base}?session_id={CHECKOUT_SESSION_ID}`;
}

let stripeSingleton: Stripe | null = null;
function getStripeOrThrow(): Stripe {
  const secret = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
  if (!secret) throw new Error("MISSING_STRIPE_SECRET_KEY");

  if (stripeSingleton) return stripeSingleton;

  stripeSingleton = new Stripe(secret, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });

  return stripeSingleton;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
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

function parseFrontendTotals(value: unknown): FrontendTotals | null {
  if (!isRecord(value)) return null;

  return {
    subtotalCents: cents(value.subtotalCents),
    discountCents: cents(value.discountCents),
    creditCents: cents(value.creditCents),
    taxCents: cents(value.taxCents),
    totalCents: cents(value.totalCents),
  };
}

function parseOrderType(value: unknown): OrderType | null {
  if (value === "pickup" || value === "delivery" || value === "dine_in") return value;
  return null;
}

function parseRequestBody(raw: JsonRecord): CreateCheckoutRequest | null {
  const orderType = parseOrderType(raw.orderType);
  if (!orderType) return null;

  const rawItems = raw.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > MAX_CART_ITEMS) return null;

  const items: IncomingCartItem[] = [];
  for (const rawItem of rawItems) {
    if (!isRecord(rawItem)) continue;

    const menuItemId = sanitizeId(rawItem.menuItemId);
    if (!menuItemId) continue;

    const rawModifiers = rawItem.modifiers;
    const modifiers: IncomingCartModifier[] = Array.isArray(rawModifiers)
      ? rawModifiers
          .filter(isRecord)
          .map((modifier) => ({
            id: sanitizeId(modifier.id),
            groupId: sanitizeId(modifier.groupId),
            // IMPORTANT: never return null here; IncomingCartModifier expects string | undefined
            name: asNullableString(modifier.name) ?? undefined,
            priceAdjustment: asNumber(modifier.priceAdjustment, 0),
          }))
          .filter((modifier) => modifier.id.length > 0)
      : [];

    items.push({
      menuItemId,
      name: asNullableString(rawItem.name) ?? undefined,
      unitPriceCents: typeof rawItem.unitPriceCents === "number" ? rawItem.unitPriceCents : undefined,
      imageUrl: sanitizeImageUrl(rawItem.imageUrl),
      modifiers,
      quantity: clampInt(rawItem.quantity, 1, MAX_ITEM_QTY),
      notes: sanitizeNotes(rawItem.notes),
      pricingHash: asNullableString(rawItem.pricingHash),
    });
  }

  if (items.length === 0) return null;

  return {
    items,
    promoId: sanitizeId(raw.promoId) || null,
    promoCode: sanitizePromoCode(raw.promoCode),
    creditId: sanitizeId(raw.creditId) || null,
    orderType,
    notes: sanitizeNotes(raw.notes),
    idempotencyKey: asNullableString(raw.idempotencyKey),
    frontendTotals: parseFrontendTotals(raw.frontendTotals),
  };
}

function toFraudMetadataJson(metadata: FraudMetadata): Json {
  return metadata;
}

async function logFraud(
  db: DbClient,
  userId: string,
  reason: string,
  metadata: FraudMetadata,
  frontendTotal?: number,
  serverTotal?: number,
): Promise<void> {
  const insertRow: Db["public"]["Tables"]["fraud_logs"]["Insert"] = {
    user_id: userId,
    reason,
    metadata: toFraudMetadataJson(metadata),
    frontend_total: typeof frontendTotal === "number" ? frontendTotal : null,
    server_total: typeof serverTotal === "number" ? serverTotal : null,
    stripe_total: typeof serverTotal === "number" ? serverTotal : 0,
  };

  // Best-effort (fraud logging should never break checkout)
  try {
    await db.from("fraud_logs").insert(insertRow);
  } catch {
    // ignore
  }
}

async function readUserIdFromJwt(req: Request): Promise<string> {
  const jwt = readBearerToken(req);
  if (!jwt) throw new Error("UNAUTHORIZED");

  const auth = createAnonClient(jwt);
  const {
    data: { user },
    error,
  } = await auth.auth.getUser();

  if (error || !user) throw new Error("UNAUTHORIZED");
  return user.id;
}

async function checkRateLimit(
  db: DbClient,
  userId: string,
): Promise<{ blocked: boolean; retryAfterSeconds: number }> {
  const now = Date.now();

  const { data, error } = await db
    .from("checkout_rate_limits")
    .select("attempts,last_attempt_at,blocked_until")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("RATE_LIMIT_LOOKUP_FAILED");

  const blockedUntilMs =
    typeof data?.blocked_until === "string" ? Date.parse(data.blocked_until) : NaN;

  if (Number.isFinite(blockedUntilMs) && blockedUntilMs > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((blockedUntilMs - now) / 1000)),
    };
  }

  const lastAttemptMs =
    typeof data?.last_attempt_at === "string" ? Date.parse(data.last_attempt_at) : NaN;

  const currentAttempts = typeof data?.attempts === "number" ? data.attempts : 0;
  const nextAttempts =
    Number.isFinite(lastAttemptMs) && now - lastAttemptMs < RATE_LIMIT_WINDOW_MS ? currentAttempts + 1 : 1;

  const blocked = nextAttempts > RATE_LIMIT_MAX;
  const blockedUntilIso = blocked ? new Date(now + RATE_LIMIT_BLOCK_MS).toISOString() : null;

  const upsertRow: Db["public"]["Tables"]["checkout_rate_limits"]["Insert"] = {
    user_id: userId,
    attempts: nextAttempts,
    last_attempt_at: new Date(now).toISOString(),
    blocked_until: blockedUntilIso,
  };

  const { error: upsertError } = await db
    .from("checkout_rate_limits")
    .upsert(upsertRow, { onConflict: "user_id" });

  if (upsertError) throw new Error("RATE_LIMIT_WRITE_FAILED");

  return {
    blocked,
    retryAfterSeconds: blocked ? Math.max(1, Math.ceil(RATE_LIMIT_BLOCK_MS / 1000)) : 0,
  };
}

async function fetchMenuItems(db: DbClient, ids: string[]): Promise<Map<string, MenuItemLite>> {
  const unique = [...new Set(ids)].filter((id) => id.length > 0);

  const { data, error } = await db
    .from("menu_items")
    .select("id,name,category,image_url,available,price,inventory_count")
    .in("id", unique);

  if (error) throw new Error("MENU_LOOKUP_FAILED");

  const out = new Map<string, MenuItemLite>();
  for (const row of (data ?? []) as MenuItemLite[]) {
    out.set(row.id, row);
  }
  return out;
}

async function fetchModifiers(db: DbClient, ids: string[]): Promise<Map<string, ModifierLite>> {
  const unique = [...new Set(ids)].filter((id) => id.length > 0);
  if (unique.length === 0) return new Map<string, ModifierLite>();

  const { data, error } = await db
    .from("modifiers")
    .select("id,modifier_group_id,name,price_adjustment,available")
    .in("id", unique);

  if (error) throw new Error("MODIFIER_LOOKUP_FAILED");

  const out = new Map<string, ModifierLite>();
  for (const row of (data ?? []) as ModifierLite[]) {
    if (row.available === true) out.set(row.id, row);
  }
  return out;
}

async function buildCanonicalCart(
  db: DbClient,
  userId: string,
  items: IncomingCartItem[],
): Promise<CanonicalCartItem[]> {
  const menuItemMap = await fetchMenuItems(db, items.map((item) => item.menuItemId));
  const modifierMap = await fetchModifiers(
    db,
    items.flatMap((item) => item.modifiers.map((modifier) => modifier.id)),
  );

  const canonicalItems: CanonicalCartItem[] = [];

  for (const item of items) {
    const menuItem = menuItemMap.get(item.menuItemId);

    if (!menuItem) {
      await logFraud(db, userId, "menu_item_not_found", {
        kind: "menu_item_not_found",
        menuItemId: item.menuItemId,
      });
      continue;
    }

    const inventoryCount = typeof menuItem.inventory_count === "number" ? menuItem.inventory_count : null;
    const effectiveAvailable = menuItem.available === true && (inventoryCount === null || inventoryCount > 0);

    if (!effectiveAvailable) {
      throw new PricingValidationError("ITEM_UNAVAILABLE", `Item unavailable: ${menuItem.name}`, 409);
    }

    const desiredQty = clampInt(item.quantity, 1, MAX_ITEM_QTY);
    const quantity =
      inventoryCount === null ? desiredQty : Math.max(1, Math.min(desiredQty, inventoryCount));

    const modifiers: CanonicalModifier[] = [];
    for (const rawModifier of item.modifiers) {
      const modifier = modifierMap.get(rawModifier.id);
      if (!modifier) continue;

      modifiers.push({
        id: modifier.id,
        groupId: modifier.modifier_group_id,
        name: modifier.name,
        priceAdjustmentCents: Math.round(modifier.price_adjustment),
      });
    }

    const baseUnitPriceCents = Math.round(menuItem.price * 100);
    const basePricingHash = buildClientIntegrityHash(menuItem.id, baseUnitPriceCents, modifiers, quantity);

    const clientHash = item.pricingHash?.trim() || null;
    if (clientHash && clientHash !== basePricingHash) {
      await logFraud(db, userId, "pricing_hash_mismatch", {
        kind: "pricing_hash_mismatch",
        menuItemId: menuItem.id,
        clientHash,
        serverHash: basePricingHash,
        clientUnitPriceCents:
          typeof item.unitPriceCents === "number" && Number.isFinite(item.unitPriceCents)
            ? Math.round(item.unitPriceCents)
            : null,
        serverUnitPriceCents: baseUnitPriceCents,
        clientQty: desiredQty,
        serverQty: quantity,
      });
    }

    canonicalItems.push({
      menuItemId: menuItem.id,
      name: menuItem.name,
      imageUrl: menuItem.image_url,
      category: menuItem.category,
      quantity,
      notes: item.notes ?? null,
      baseUnitPriceCents,
      modifiers,
      basePricingHash,
    });
  }

  if (canonicalItems.length === 0) {
    throw new PricingValidationError("EMPTY_CART", "Cart is empty after server validation.", 400);
  }

  return canonicalItems;
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = makeRequestId(req);
  const origin = req.headers.get("origin");
  const cors = corsHeadersFor(origin);

  if (req.method === "OPTIONS") {
    // Preflight only makes sense for browsers (Origin must exist and be allowed)
    if (!origin || !cors || !("Access-Control-Allow-Origin" in cors)) {
      return errorResponse(
        403,
        "ORIGIN_NOT_ALLOWED",
        "Origin not allowed.",
        { Vary: "Origin", "Cache-Control": "no-store" },
        requestId,
      );
    }

    return new Response(null, {
      status: 204,
      headers: withStandardHeaders(cors, requestId),
    });
  }

  // For normal requests: if Origin exists, it must be allowed.
  if (origin && !cors) {
    return errorResponse(
      403,
      "ORIGIN_NOT_ALLOWED",
      "Origin not allowed.",
      { Vary: "Origin", "Cache-Control": "no-store" },
      requestId,
    );
  }

  if (req.method !== "POST") {
    return errorResponse(
      405,
      "METHOD_NOT_ALLOWED",
      "Method not allowed.",
      cors ?? { Vary: "Origin" },
      requestId,
    );
  }

  const appHeader = (req.headers.get("x-application-name") ?? "").trim();
  if (!appHeader) {
    return errorResponse(
      400,
      "MISSING_APP_HEADER",
      "Missing x-application-name.",
      cors ?? { Vary: "Origin" },
      requestId,
    );
  }

  let rawBody: JsonRecord;
  try {
    rawBody = await readJsonObjectBody(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : "INVALID_JSON_BODY";

    if (message === "UNSUPPORTED_CONTENT_TYPE") {
      return errorResponse(
        415,
        "UNSUPPORTED_CONTENT_TYPE",
        "Content-Type must be application/json.",
        cors ?? { Vary: "Origin" },
        requestId,
      );
    }
    if (message === "BODY_TOO_LARGE") {
      return errorResponse(
        413,
        "BODY_TOO_LARGE",
        "Request body is too large.",
        cors ?? { Vary: "Origin" },
        requestId,
      );
    }
    if (message === "EMPTY_BODY") {
      return errorResponse(
        400,
        "EMPTY_BODY",
        "Request body is required.",
        cors ?? { Vary: "Origin" },
        requestId,
      );
    }

    return errorResponse(
      400,
      "INVALID_JSON_BODY",
      "Request body must be valid JSON.",
      cors ?? { Vary: "Origin" },
      requestId,
    );
  }

  const body = parseRequestBody(rawBody);
  if (!body) {
    return errorResponse(
      400,
      "BAD_REQUEST",
      "Invalid request payload.",
      cors ?? { Vary: "Origin" },
      requestId,
    );
  }

  let stripe: Stripe;
  try {
    stripe = getStripeOrThrow();
  } catch {
    return errorResponse(
      503,
      "STRIPE_INIT_FAILED",
      "Stripe is not configured on the server.",
      cors ?? { Vary: "Origin" },
      requestId,
    );
  }

  let userId: string;
  try {
    userId = await readUserIdFromJwt(req);
  } catch {
    return errorResponse(
      401,
      "UNAUTHORIZED",
      "Unauthorized.",
      cors ?? { Vary: "Origin" },
      requestId,
    );
  }

  const db = createServiceClient();

  try {
    const rateLimit = await checkRateLimit(db, userId);
    if (rateLimit.blocked) {
      return errorResponse(
        429,
        "RATE_LIMITED",
        "Too many checkout attempts. Please try again later.",
        cors ?? { Vary: "Origin" },
        requestId,
        { "Retry-After": String(rateLimit.retryAfterSeconds) },
      );
    }
  } catch {
    return errorResponse(
      503,
      "RATE_LIMIT_LOOKUP_FAILED",
      "Service unavailable.",
      cors ?? { Vary: "Origin" },
      requestId,
    );
  }

  try {
    const canonicalItems = await buildCanonicalCart(db, userId, body.items);
    const taxRate = normalizeTaxRate();

    const pricing = await resolvePricingForCheckout({
      svc: db,
      userId,
      items: canonicalItems,
      promoId: body.promoId,
      promoCode: body.promoCode,
      creditId: body.creditId,
      orderType: body.orderType,
      orderNotes: body.notes,
      taxRate,
    });

    const totals: FrontendTotals = {
      subtotalCents: pricing.snapshot.subtotalCents,
      discountCents: pricing.snapshot.campaignDiscountCents + pricing.snapshot.promoDiscountCents,
      creditCents: pricing.snapshot.creditCents,
      taxCents: pricing.snapshot.taxCents,
      totalCents: pricing.snapshot.totalCents,
    };

    // Soft mismatch detection (never blocks, logs for review)
    if (body.frontendTotals) {
      const diff = Math.abs(body.frontendTotals.totalCents - totals.totalCents);
      if (diff >= 50) {
        await logFraud(
          db,
          userId,
          "totals_mismatch",
          { kind: "totals_mismatch", frontendTotals: body.frontendTotals, serverTotals: totals },
          body.frontendTotals.totalCents,
          totals.totalCents,
        );
      }
    }

    // Hard caps
    if (pricing.snapshot.totalCents > MAX_TOTAL_CENTS) {
      throw new PricingValidationError("TOTAL_TOO_LARGE", "Total exceeds allowed limit.", 400);
    }

    const pendingCartId = crypto.randomUUID();

    const payloadHash = await sha256Hex(
      JSON.stringify({
        fn: FUNCTION_NAME,
        userId,
        orderType: body.orderType,
        promoId: body.promoId,
        promoCode: body.promoCode,
        creditId: body.creditId,
        items: canonicalItems.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          basePricingHash: item.basePricingHash,
        })),
        pricingHash: pricing.pricingHash,
      }),
    );

    const idempotencyKey = sanitizeIdempotencyKey(
      body.idempotencyKey ?? req.headers.get("x-idempotency-key"),
      buildDefaultIdempotencyKey(userId, payloadHash.slice(0, 24)),
    );

    const lineItems = buildStripeLineItemsFromPricing(pricing.snapshot);
    if (lineItems.length === 0 || pricing.snapshot.totalCents <= 0) {
      throw new PricingValidationError("NO_CHARGEABLE_AMOUNT", "Cart total must be greater than zero.", 400);
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      success_url: getCheckoutSuccessUrl(),
      cancel_url: getCheckoutCancelUrl(),
      payment_method_types: ["card"],
      line_items: lineItems,
      metadata: {
        app: appHeader.slice(0, 64),
        user_id: userId,
        cart_ref: pendingCartId,
        pending_cart_id: pendingCartId,
        order_type: body.orderType,
        promo_id: pricing.snapshot.promoId ?? "",
        promo_code: pricing.snapshot.promoCode ?? "",
        credit_id: pricing.snapshot.creditId ?? "",
        pricing_hash: pricing.pricingHash,
        subtotal_cents: String(pricing.snapshot.subtotalCents),
        campaign_discount_cents: String(pricing.snapshot.campaignDiscountCents),
        promo_discount_cents: String(pricing.snapshot.promoDiscountCents),
        credit_cents: String(pricing.snapshot.creditCents),
        tax_cents: String(pricing.snapshot.taxCents),
        total_cents: String(pricing.snapshot.totalCents),
        applied_campaign_ids: pricing.snapshot.appliedCampaignIds.join(",").slice(0, 500),
        idempotency_key: idempotencyKey,
        request_id: requestId,
      },
    };

    const session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey });

    type PendingCartInsertExtended = Db["public"]["Tables"]["pending_carts"]["Insert"] & JsonRecord;

    const pendingCartInsert: PendingCartInsertExtended = {
      id: pendingCartId,
      user_id: userId,
      idempotency_key: idempotencyKey,
      items: canonicalItems as Json, // canonical (new)
      promo_id: pricing.snapshot.promoId,
      credit_id: pricing.snapshot.creditId,
      subtotal_cents: pricing.snapshot.subtotalCents,
      discount_cents: pricing.snapshot.campaignDiscountCents + pricing.snapshot.promoDiscountCents,
      tax_cents: pricing.snapshot.taxCents,
      total_cents: pricing.snapshot.totalCents,
      stripe_session_id: session.id,
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      pricing_snapshot: pricingSnapshotToJson(pricing.snapshot),
      pricing_hash: pricing.pricingHash,
      currency: pricing.snapshot.currency,
    };

    const { error: pendingCartError } = await db
      .from("pending_carts")
      .upsert(pendingCartInsert, { onConflict: "id" });

    if (pendingCartError) {
      await logFraud(
        db,
        userId,
        "pending_cart_upsert_failed",
        { kind: "pending_cart_upsert_failed", message: pendingCartError.message, session_id: session.id },
        body.frontendTotals?.totalCents,
        pricing.snapshot.totalCents,
      );
      // Do NOT fail checkout — Stripe session already exists.
    }

    return jsonResponse(
      {
        ok: true,
        session_id: session.id,
        url: session.url ?? null,
        totals,
        pending_cart_id: pendingCartId,
        requestId,
      } satisfies CreateCheckoutResponse,
      200,
      cors ?? { Vary: "Origin" },
      requestId,
    );
  } catch (error) {
    // Normalize known pricing errors
    if (error instanceof PricingValidationError) {
      await logFraud(
        db,
        userId,
        "checkout_failed",
        { kind: "checkout_failed", message: `${error.code}:${error.message}` },
        body.frontendTotals?.totalCents,
        undefined,
      );

      return errorResponse(
        clampInt(error.status, 400, 503),
        error.code,
        error.message,
        cors ?? { Vary: "Origin" },
        requestId,
      );
    }

    const message = error instanceof Error ? error.message : "Checkout failed";

    // Allow structured errors (code/status) thrown as plain objects
    const code =
      isRecord(error) && typeof (error as JsonRecord).code === "string"
        ? String((error as JsonRecord).code)
        : "CHECKOUT_FAILED";
    const status =
      isRecord(error) && typeof (error as JsonRecord).status === "number"
        ? clampInt((error as JsonRecord).status, 400, 503)
        : 400;

    await logFraud(
      db,
      userId,
      "checkout_failed",
      { kind: "checkout_failed", message },
      body.frontendTotals?.totalCents,
      undefined,
    );

    return errorResponse(
      status,
      code,
      message,
      cors ?? { Vary: "Origin" },
      requestId,
    );
  }
});