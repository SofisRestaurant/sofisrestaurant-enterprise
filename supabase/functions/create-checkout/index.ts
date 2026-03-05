// =============================================================================
// supabase/functions/create-checkout/index.ts
// CREATE CHECKOUT — Enterprise Edge Function (Production, 2026)
// =============================================================================
// Goals:
// - Strict CORS allowlist (fail-closed; NEVER returns ACAO "null")
// - Strict request parsing (no `any`, no unsafe casts)
// - Server-truth rebuild of cart (menu_items + modifiers; ignore client price)
// - pricingHash enforced + mismatch logged (best-effort)
// - Option A anti-tamper: accept frontendTotals for mismatch telemetry
// - Promo (by ID or CODE) + credit validated server-side
// - Stripe Checkout session created with idempotency
// - pending_carts persisted (best-effort, Stripe remains source of truth)
// - Adds stable server cart reference to Stripe metadata:
//   - metadata.pending_cart_id AND metadata.cart_ref (supports new + old finalize-order)
// - requestId + structured error codes
// =============================================================================

import Stripe from "stripe";
import type { Database } from "../_shared/database.types.ts";
import type { DbClient } from "../_shared/supabase.ts";
import { createServiceClient, createAnonClient, readBearerToken } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Db = Database;
type MenuCategory = Db["public"]["Enums"]["menu_category"];
type Json = Db["public"]["Tables"]["orders"]["Row"]["cart_items"]; // Json | null

type OrderType = "pickup" | "delivery" | "dine_in";

type IncomingCartModifier = {
  id: string;
  groupId?: string;
  name?: string;
  priceAdjustment?: number;
};

type IncomingCartItem = {
  menuItemId: string;
  name?: string;
  unitPriceCents?: number; // untrusted
  imageUrl?: string | null;
  category?: MenuCategory; // untrusted (we validate)
  modifiers: IncomingCartModifier[];
  quantity: number;
  notes?: string | null;
  pricingHash?: string; // untrusted hint, but REQUIRED for tamper telemetry
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
  // ✅ support both
  promoId: string | null;
  promoCode: string | null;

  creditId: string | null;
  orderType: OrderType;
  notes: string | null;
  idempotencyKey?: string | null;

  // ✅ Option A anti-tamper telemetry
  frontendTotals: FrontendTotals | null;
};

type Totals = FrontendTotals;

type CreateCheckoutResponse =
  | {
      ok: true;
      session_id: string;
      url: string | null;
      totals: Totals;
      pending_cart_id: string;
    }
  | { ok: false; error: string; code?: string; requestId?: string };

type CanonicalModifier = {
  id: string;
  modifier_group_id: string;
  name: string;
  price_adjustment: number;
};

type CanonicalItem = {
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  category: MenuCategory;
  quantity: number;
  notes: string | null;

  unitPriceCents: number;
  modifiers: Array<{
    id: string;
    groupId: string;
    name: string;
    priceAdjustment: number;
  }>;

  lineTotalCents: number;
  pricingHash: string;
};

type JsonRecord = Record<string, unknown>;

type FraudMetadata =
  | {
      kind: "pricing_hash_mismatch";
      menuItemId: string;
      clientHash: string;
      serverHash: string;
      clientUnitPriceCents: number | null;
      serverUnitPriceCents: number;
      clientQty: number;
      serverQty: number;
    }
  | {
      kind: "totals_mismatch";
      frontendTotals: FrontendTotals;
      serverTotals: Totals;
    }
  | { kind: "menu_item_not_found"; menuItemId: string }
  | { kind: "pending_cart_upsert_failed"; message: string; session_id: string }
  | { kind: "request_invalid"; reason: string }
  | { kind: "checkout_failed"; message: string }
  | { kind: "promo_invalid"; promo: { promoId: string | null; promoCode: string | null } }
  | { kind: "credit_invalid"; creditId: string }
  | { kind: "unknown"; data?: Record<string, unknown> };

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
]);

const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-application-name, x-idempotency-key, x-request-id, x-requested-with";

function mustEnv(name: string): string {
  const v = Deno.env.get(name)?.trim() ?? "";
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

const STRIPE_SECRET_KEY = mustEnv("STRIPE_SECRET_KEY");

const APP_NAME = (Deno.env.get("APP_NAME")?.trim() ?? "sofis-restaurant-v2") as string;

const DEFAULT_TAX_RATE = Number(Deno.env.get("TAX_RATE") ?? "0.0825");
const TAX_RATE = Number.isFinite(DEFAULT_TAX_RATE) ? DEFAULT_TAX_RATE : 0.0825;

const CHECKOUT_SUCCESS_URL =
  (Deno.env.get("CHECKOUT_SUCCESS_URL")?.trim() || "http://localhost:3000/order-success") +
  "?session_id={CHECKOUT_SESSION_ID}";

const CHECKOUT_CANCEL_URL =
  (Deno.env.get("CHECKOUT_CANCEL_URL")?.trim() || "http://localhost:3000/order-canceled") +
  "?session_id={CHECKOUT_SESSION_ID}";

// If this apiVersion causes bundling issues, set STRIPE_API_VERSION env and use it.
const STRIPE_API_VERSION = (Deno.env.get("STRIPE_API_VERSION")?.trim() || "2024-06-20") as Stripe.LatestApiVersion;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION,
  httpClient: Stripe.createFetchHttpClient(),
});

// If your enum differs, update this list to match your Database enum exactly.
const MENU_CATEGORIES: ReadonlySet<MenuCategory> = new Set<MenuCategory>([
  "appetizers",
  "entrees",
  "desserts",
  "drinks",
  "lunch",
  "breakfast",
  "specials",
]);

// ─────────────────────────────────────────────────────────────────────────────
// CORS (FIXED): fail-closed + NEVER send ACAO "null"
// ─────────────────────────────────────────────────────────────────────────────

function corsHeadersFor(origin: string | null): HeadersInit | null {
  const o = (origin ?? "").trim();
  if (!o || !ALLOWED_ORIGINS.has(o)) return null;

  return {
    "Access-Control-Allow-Origin": o,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function makeRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function json(data: unknown, init: ResponseInit = {}, cors: HeadersInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  for (const [k, v] of Object.entries(cors)) headers.set(k, String(v));
  return new Response(JSON.stringify(data), { ...init, headers });
}

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNullableString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function safeId(v: unknown, maxLen = 128): string {
  const s = asString(v, "").trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function safePromoCode(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toUpperCase();
  if (!s) return null;
  return s.length > 32 ? s.slice(0, 32) : s;
}

function safeNotes(v: unknown, maxLen = 1200): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function safeImageUrl(v: unknown): string | null {
  if (v === null) return null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (s.length > 1000) return null;
  return s;
}

function safeCategory(v: unknown): MenuCategory | null {
  if (typeof v !== "string") return null;
  return MENU_CATEGORIES.has(v as MenuCategory) ? (v as MenuCategory) : null;
}

function safePricingHash(v: unknown): string {
  const s = asString(v, "").trim();
  if (!s) return "";
  return s.length > 256 ? s.slice(0, 256) : s;
}

function cents(n: unknown): number {
  const x = asNumber(n, 0);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.round(x);
}

function dollarsToCentsFromDb(price: unknown): number {
  const d = asNumber(price, 0);
  if (!Number.isFinite(d) || d < 0) return 0;
  return Math.round(d * 100);
}

function computeLineTotalCents(unitPriceCents: number, modifiers: CanonicalModifier[], qty: number): number {
  const modifierSum = modifiers.reduce((s, m) => s + cents(m.price_adjustment), 0);
  return (cents(unitPriceCents) + modifierSum) * clampInt(qty, 1, 20);
}

function computeTotals(items: CanonicalItem[], discountCents: number, creditCents: number, taxRate: number): Totals {
  const subtotalCents = items.reduce((s, i) => s + cents(i.lineTotalCents), 0);

  const discount = Math.max(0, Math.min(subtotalCents, cents(discountCents)));
  const afterDiscount = Math.max(0, subtotalCents - discount);

  const credit = Math.max(0, Math.min(afterDiscount, cents(creditCents)));
  const taxable = Math.max(0, afterDiscount - credit);

  const rate = Number.isFinite(taxRate) && taxRate >= 0 ? taxRate : 0;
  const taxCents = Math.max(0, Math.round(taxable * rate));
  const totalCents = taxable + taxCents;

  return { subtotalCents, discountCents: discount, creditCents: credit, taxCents, totalCents };
}

function buildPricingHashV1(menuItemId: string, unitPriceCents: number, qty: number): string {
  return `v1:preflight:${menuItemId}:${cents(unitPriceCents)}:${clampInt(qty, 1, 20)}`;
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function parseFrontendTotals(v: unknown): FrontendTotals | null {
  if (!isRecord(v)) return null;
  const subtotalCents = cents(v.subtotalCents);
  const discountCents = cents(v.discountCents);
  const creditCents = cents(v.creditCents);
  const taxCents = cents(v.taxCents);
  const totalCents = cents(v.totalCents);
  if (totalCents > 50_000_000) return null;
  return { subtotalCents, discountCents, creditCents, taxCents, totalCents };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation (request) — strict, supports promoId OR promoCode
// ─────────────────────────────────────────────────────────────────────────────

function parseRequest(raw: unknown): CreateCheckoutRequest | null {
  if (!isRecord(raw)) return null;

  const itemsRaw = raw.items;
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) return null;

  const orderType = asString(raw.orderType, "");
  if (orderType !== "pickup" && orderType !== "delivery" && orderType !== "dine_in") return null;

  const promoId = safeId(raw.promoId) || null;
  const promoCode = safePromoCode(raw.promoCode);
  const creditId = safeId(raw.creditId) || null;
  const frontendTotals = parseFrontendTotals(raw.frontendTotals);

  const items: IncomingCartItem[] = [];

  for (const itUnknown of itemsRaw) {
    if (!isRecord(itUnknown)) continue;

    const menuItemId = safeId(itUnknown.menuItemId);
    if (!menuItemId) continue;

    const quantity = clampInt(itUnknown.quantity, 1, 20);

    const modifiersRaw = itUnknown.modifiers;
    const modifiers: IncomingCartModifier[] = Array.isArray(modifiersRaw)
      ? modifiersRaw
          .filter(isRecord)
          .map((m) => ({
            id: safeId(m.id),
            groupId: asString(m.groupId, "").slice(0, 128),
            name: asString(m.name, "").slice(0, 120),
            priceAdjustment: asNumber(m.priceAdjustment, 0),
          }))
          .filter((m) => !!m.id)
      : [];

    const category = safeCategory(itUnknown.category);
    if (!category) continue; // fail-closed

    const pricingHash = safePricingHash(itUnknown.pricingHash);
    if (!pricingHash) continue; // fail-closed

    items.push({
      menuItemId,
      name: asString(itUnknown.name, "").slice(0, 120),
      unitPriceCents: asNumber(itUnknown.unitPriceCents, 0),
      imageUrl: safeImageUrl(itUnknown.imageUrl),
      category,
      modifiers,
      quantity,
      notes: safeNotes(itUnknown.notes),
      pricingHash,
    });
  }

  if (items.length === 0) return null;

  return {
    items,
    promoId,
    promoCode,
    creditId,
    orderType,
    notes: safeNotes(raw.notes),
    idempotencyKey: asNullableString(raw.idempotencyKey),
    frontendTotals,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Server truth rebuild (menu_items + modifiers)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchMenuItems(db: DbClient, ids: string[]) {
  const { data, error } = await db
    .from("menu_items")
    .select("id, name, category, image_url, available, price, inventory_count, low_stock_threshold")
    .in("id", ids);

  if (error) throw new Error(error.message);

  const map = new Map<string, NonNullable<typeof data>[number]>();
  for (const row of data ?? []) map.set(row.id, row);
  return map;
}

async function fetchModifiers(db: DbClient, modifierIds: string[]) {
  if (modifierIds.length === 0) return new Map<string, CanonicalModifier>();

  const { data, error } = await db
    .from("modifiers")
    .select("id, modifier_group_id, name, price_adjustment, available")
    .in("id", modifierIds);

  if (error) throw new Error(error.message);

  const map = new Map<string, CanonicalModifier>();
  for (const m of data ?? []) {
    if (m.available !== true) continue;
    map.set(m.id, {
      id: m.id,
      modifier_group_id: m.modifier_group_id,
      name: m.name,
      price_adjustment: m.price_adjustment ?? 0,
    });
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fraud logging (best-effort, never breaks checkout)
// ─────────────────────────────────────────────────────────────────────────────

function toFraudMetadataInsert(
  metadata: FraudMetadata,
): Db["public"]["Tables"]["fraud_logs"]["Insert"]["metadata"] {
  return metadata as unknown as Db["public"]["Tables"]["fraud_logs"]["Insert"]["metadata"];
}

async function logFraud(
  db: DbClient,
  userId: string,
  reason: string,
  metadata: FraudMetadata,
  frontendTotal?: number,
  serverTotal?: number,
) {
  try {
    const insertRow: Db["public"]["Tables"]["fraud_logs"]["Insert"] = {
      user_id: userId,
      reason,
      metadata: toFraudMetadataInsert(metadata),
      frontend_total: typeof frontendTotal === "number" && Number.isFinite(frontendTotal) ? frontendTotal : null,
      server_total: typeof serverTotal === "number" && Number.isFinite(serverTotal) ? serverTotal : null,
      stripe_total: typeof serverTotal === "number" && Number.isFinite(serverTotal) ? serverTotal : 0,
    };

    await db.from("fraud_logs").insert(insertRow);
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Promo resolution (id vs code)
// ─────────────────────────────────────────────────────────────────────────────

type PromoResolution =
  | { mode: "id"; value: string }
  | { mode: "code"; value: string }
  | { mode: "none"; value: "" };

function resolvePromo(promoId: string | null, promoCode: string | null): PromoResolution {
  const id = (promoId ?? "").trim();
  if (id) return { mode: "id", value: id };

  const code = (promoCode ?? "").trim().toUpperCase();
  if (code) return { mode: "code", value: code };

  return { mode: "none", value: "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Promo validation (supports promoId OR promoCode)
// ─────────────────────────────────────────────────────────────────────────────

type PromoValidationResult = { promoId: string | null; discountCents: number };

async function validatePromo(
  db: DbClient,
  promoId: string | null,
  promoCode: string | null,
  subtotalCents: number,
): Promise<PromoValidationResult> {
  const resolved = resolvePromo(promoId, promoCode);
  if (resolved.mode === "none") return { promoId: null, discountCents: 0 };

  const subtotal = Math.max(0, Math.round(subtotalCents));

  const q = db
    .from("promotions")
    .select("id, code, active, type, value, min_order_cents, starts_at, ends_at, expires_at, max_uses, current_uses");

  const { data, error } =
    resolved.mode === "id"
      ? await q.eq("id", resolved.value).maybeSingle()
      : await q.ilike("code", resolved.value).maybeSingle();

  if (error || !data) return { promoId: null, discountCents: 0 };

  const now = Date.now();
  const startsAt = data.starts_at ? new Date(data.starts_at).getTime() : null;
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : null;
  const endsAt = data.ends_at ? new Date(data.ends_at).getTime() : null;
  const exp = expiresAt ?? endsAt;

  if (data.active !== true) return { promoId: null, discountCents: 0 };
  if (startsAt !== null && Number.isFinite(startsAt) && startsAt > now) return { promoId: null, discountCents: 0 };
  if (exp !== null && Number.isFinite(exp) && exp < now) return { promoId: null, discountCents: 0 };

  const minOrder = Math.max(0, Math.round(data.min_order_cents ?? 0));
  if (subtotal < minOrder) return { promoId: null, discountCents: 0 };

  if (
    data.max_uses != null &&
    data.current_uses != null &&
    Number.isFinite(data.max_uses) &&
    Number.isFinite(data.current_uses) &&
    data.current_uses >= data.max_uses
  ) {
    return { promoId: null, discountCents: 0 };
  }

  const type = asString(data.type, "");
  const value = asNumber(data.value, 0);

  let discountCents = 0;

  if (type === "percent") {
    const pct = Math.max(0, Math.min(100, value));
    discountCents = Math.round(subtotal * (pct / 100));
  } else if (type === "fixed") {
    discountCents = Math.round(Math.max(0, value));
  }

  discountCents = Math.max(0, Math.min(subtotal, discountCents));
  return { promoId: data.id, discountCents };
}

// ─────────────────────────────────────────────────────────────────────────────
// Credit validation (user-bound, expiry, used flag)
// ─────────────────────────────────────────────────────────────────────────────

type CreditValidationResult = { creditId: string | null; creditCents: number };

async function validateCredit(
  db: DbClient,
  userId: string,
  creditId: string | null,
  maxApplicableCents: number,
): Promise<CreditValidationResult> {
  const id = (creditId ?? "").trim();
  if (!id) return { creditId: null, creditCents: 0 };

  const maxApplicable = Math.max(0, Math.round(maxApplicableCents));

  const { data, error } = await db
    .from("user_credits")
    .select("id, user_id, amount_cents, used, expires_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return { creditId: null, creditCents: 0 };
  if (data.user_id !== userId) return { creditId: null, creditCents: 0 };
  if (data.used === true) return { creditId: null, creditCents: 0 };

  if (data.expires_at) {
    const exp = new Date(data.expires_at).getTime();
    if (Number.isFinite(exp) && exp < Date.now()) return { creditId: null, creditCents: 0 };
  }

  const amt = Math.max(0, Math.round(data.amount_cents ?? 0));
  const creditCents = Math.max(0, Math.min(maxApplicable, amt));

  return { creditId: data.id, creditCents };
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical cart build (server-truth, pricingHash enforcement + mismatch log)
// ─────────────────────────────────────────────────────────────────────────────

async function buildCanonicalCart(db: DbClient, userId: string, incoming: IncomingCartItem[]): Promise<CanonicalItem[]> {
  const menuIds = uniq(incoming.map((i) => i.menuItemId));
  const menuMap = await fetchMenuItems(db, menuIds);

  const modifierIds = uniq(incoming.flatMap((i) => i.modifiers.map((m) => m.id)));
  const modifierMap = await fetchModifiers(db, modifierIds);

  const canonical: CanonicalItem[] = [];

  for (const line of incoming) {
    const row = menuMap.get(line.menuItemId);

    if (!row) {
      await logFraud(db, userId, "menu_item_not_found", { kind: "menu_item_not_found", menuItemId: line.menuItemId });
      continue;
    }

    const available = Boolean(row.available);
    const stockCount =
      row.inventory_count === null || row.inventory_count === undefined
        ? null
        : clampInt(row.inventory_count, 0, 1_000_000);

    const effectiveAvailable = available && (stockCount == null ? true : stockCount > 0);
    if (!effectiveAvailable) throw new Error(`Item unavailable: ${row.name}`);

    const qtyHard = clampInt(line.quantity, 1, 20);
    const qty = stockCount == null ? qtyHard : Math.max(1, Math.min(qtyHard, stockCount));

    const unitPriceCents = dollarsToCentsFromDb(row.price);

    const canonicalMods: CanonicalModifier[] = [];
    for (const m of line.modifiers) {
      const cm = modifierMap.get(m.id);
      if (!cm) continue;
      canonicalMods.push(cm);
    }

    const lineTotalCents = computeLineTotalCents(unitPriceCents, canonicalMods, qty);

    const serverPricingHash = buildPricingHashV1(row.id, unitPriceCents, qty);

    const clientHash = safePricingHash(line.pricingHash);
    if (clientHash && clientHash !== serverPricingHash) {
      await logFraud(db, userId, "pricing_hash_mismatch", {
        kind: "pricing_hash_mismatch",
        menuItemId: row.id,
        clientHash,
        serverHash: serverPricingHash,
        clientUnitPriceCents:
          typeof line.unitPriceCents === "number" && Number.isFinite(line.unitPriceCents)
            ? Math.round(line.unitPriceCents)
            : null,
        serverUnitPriceCents: unitPriceCents,
        clientQty: clampInt(line.quantity, 1, 20),
        serverQty: qty,
      });
    }

    canonical.push({
      menuItemId: row.id,
      name: row.name,
      imageUrl: row.image_url ?? null,
      category: row.category,
      quantity: qty,
      notes: safeNotes(line.notes),

      unitPriceCents,
      modifiers: canonicalMods.map((m) => ({
        id: m.id,
        groupId: m.modifier_group_id,
        name: m.name,
        priceAdjustment: cents(m.price_adjustment),
      })),

      lineTotalCents,
      pricingHash: serverPricingHash,
    });
  }

  if (canonical.length === 0) throw new Error("Cart is empty after server validation.");
  return canonical;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe mapping
// ─────────────────────────────────────────────────────────────────────────────

function stripeLineItemsFromCart(items: CanonicalItem[]): Stripe.Checkout.SessionCreateParams.LineItem[] {
  return items.map((i) => {
    const modSum = i.modifiers.reduce((s, m) => s + cents(m.priceAdjustment), 0);
    const unit = Math.max(0, cents(i.unitPriceCents) + modSum);

    const modNames = i.modifiers
      .map((m) => m.name)
      .filter((x) => typeof x === "string" && x.trim().length > 0);

    const desc = modNames.length ? `Modifiers: ${modNames.join(", ")}` : undefined;

    return {
      quantity: i.quantity,
      price_data: {
        currency: "usd",
        unit_amount: unit,
        product_data: {
          name: i.name,
          description: desc,
          ...(i.imageUrl ? { images: [i.imageUrl] } : {}),
          metadata: {
            menu_item_id: i.menuItemId,
            pricing_hash: i.pricingHash,
          },
        },
      },
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const requestId = makeRequestId();
  const origin = req.headers.get("origin");
  const cors = corsHeadersFor(origin);

  // ✅ Preflight (OPTIONS) must include the correct origin headers.
  if (req.method === "OPTIONS") {
    if (!cors) return new Response("Origin not allowed", { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }

  // ✅ fail closed for non-OPTIONS requests
  if (!cors) return new Response("Origin not allowed", { status: 403 });

  if (req.method !== "POST") {
    return json(
      { ok: false, error: "Method not allowed", code: "METHOD_NOT_ALLOWED", requestId } satisfies CreateCheckoutResponse,
      { status: 405 },
      cors,
    );
  }

  const jwt = readBearerToken(req);
  if (!jwt) {
    return json(
      { ok: false, error: "Unauthorized", code: "UNAUTHORIZED", requestId } satisfies CreateCheckoutResponse,
      { status: 401 },
      cors,
    );
  }

  // Require x-application-name for basic abuse resistance and client identification
  const appHeader = (req.headers.get("x-application-name") ?? "").trim();
  if (!appHeader) {
    return json(
      { ok: false, error: "Missing x-application-name", code: "MISSING_APP_HEADER", requestId } satisfies CreateCheckoutResponse,
      { status: 400 },
      cors,
    );
  }

  let body: CreateCheckoutRequest | null = null;
  try {
    const raw = await req.json().catch(() => null);
    body = parseRequest(raw);
    if (!body) {
      return json(
        { ok: false, error: "Invalid request payload", code: "BAD_REQUEST", requestId } satisfies CreateCheckoutResponse,
        { status: 400 },
        cors,
      );
    }
  } catch {
    return json(
      { ok: false, error: "Invalid JSON", code: "BAD_JSON", requestId } satisfies CreateCheckoutResponse,
      { status: 400 },
      cors,
    );
  }

  // ✅ 1) Auth client (RLS) ONLY to validate who the caller is
  const auth = createAnonClient(jwt);
  const { data: authData, error: authErr } = await auth.auth.getUser();
  const user = authData?.user ?? null;

  if (authErr || !user) {
    return json(
      { ok: false, error: "Unauthorized", code: "UNAUTHORIZED", requestId } satisfies CreateCheckoutResponse,
      { status: 401 },
      cors,
    );
  }

  const userId = user.id;

  // ✅ 2) Service client for server-truth DB work (bypasses RLS)
  const db = createServiceClient();

  const idem =
    (body.idempotencyKey && body.idempotencyKey.trim()) ||
    req.headers.get("x-idempotency-key")?.trim() ||
    `auto:${crypto.randomUUID()}`;

  try {
    // 1) Canonical cart
    const canonicalItems = await buildCanonicalCart(db, userId, body.items);

    // 2) Promo + credit (promoId OR promoCode)
    const subtotalCents = canonicalItems.reduce((s, i) => s + cents(i.lineTotalCents), 0);
    const promo = await validatePromo(db, body.promoId, body.promoCode, subtotalCents);

    const afterDiscount = Math.max(0, subtotalCents - promo.discountCents);
    const credit = await validateCredit(db, userId, body.creditId, afterDiscount);

    const totals = computeTotals(canonicalItems, promo.discountCents, credit.creditCents, TAX_RATE);

    // Option A anti-tamper mismatch log
    if (body.frontendTotals && body.frontendTotals.totalCents > 0) {
      const diff = Math.abs(body.frontendTotals.totalCents - totals.totalCents);
      if (diff >= 50) {
        await logFraud(
          db,
          userId,
          "totals_mismatch",
          {
            kind: "totals_mismatch",
            frontendTotals: body.frontendTotals,
            serverTotals: totals,
          },
          body.frontendTotals.totalCents,
          totals.totalCents,
        );
      }
    }

    // 3) Stripe session
    const lineItems = stripeLineItemsFromCart(canonicalItems);

    // ✅ generate cart id BEFORE Stripe (stable internal ref)
    const pendingCartId = crypto.randomUUID();

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      success_url: CHECKOUT_SUCCESS_URL,
      cancel_url: CHECKOUT_CANCEL_URL,
      payment_method_types: ["card"],
      line_items: lineItems,
      metadata: {
        app: APP_NAME,

        // ✅ ownership + cart lookup
        user_id: userId,
        cart_ref: pendingCartId,
        pending_cart_id: pendingCartId,

        // business fields
        order_type: body.orderType,
        promo_id: promo.promoId ?? "",
        promo_code: body.promoCode ?? "",
        credit_id: credit.creditId ?? "",
        subtotal_cents: String(totals.subtotalCents),
        discount_cents: String(totals.discountCents),
        credit_cents: String(totals.creditCents),
        tax_cents: String(totals.taxCents),
        total_cents: String(totals.totalCents),
        idempotency_key: idem,
      },
    };

    const session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey: idem });

    // 4) Persist pending cart (best-effort)
    const { error: upsertErr } = await db.from("pending_carts").upsert(
      {
        id: pendingCartId,
        user_id: userId,
        idempotency_key: idem,
        items: canonicalItems as unknown as Json,
        promo_id: promo.promoId,
        credit_id: credit.creditId,
        subtotal_cents: totals.subtotalCents,
        discount_cents: totals.discountCents,
        tax_cents: totals.taxCents,
        total_cents: totals.totalCents,
        stripe_session_id: session.id,
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (upsertErr) {
      await logFraud(
        db,
        userId,
        "pending_cart_upsert_failed",
        {
          kind: "pending_cart_upsert_failed",
          message: upsertErr.message,
          session_id: session.id,
        },
        body.frontendTotals?.totalCents ?? undefined,
        totals.totalCents,
      );
    }

    const res: CreateCheckoutResponse = {
      ok: true,
      session_id: session.id,
      url: session.url ?? null,
      totals,
      pending_cart_id: pendingCartId,
    };

    return json(res, { status: 200 }, cors);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout failed";

    // best-effort fraud log
    await logFraud(
      db,
      userId,
      "checkout_failed",
      { kind: "checkout_failed", message: msg },
      body.frontendTotals?.totalCents ?? undefined,
      undefined,
    );

    return json(
      { ok: false, error: msg, code: "CHECKOUT_FAILED", requestId } satisfies CreateCheckoutResponse,
      { status: 400 },
      cors,
    );
  }
});