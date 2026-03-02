// supabase/functions/create-checkout/index.ts
// =============================================================================
// CREATE CHECKOUT — HARDENED v2 (clean + type-safe + consistent helpers)
// =============================================================================
// Notes:
// - Auth required (Bearer access token). Uses shared authenticate().
// - CORS strict allow-list.
// - Idempotency required via x-idempotency-key.
// - Server-authoritative pricing from DB (+ modifier validation).
// - Persists validated cart to pending_carts, then creates Stripe Checkout Session.
// - Optional promo + credit with rollback on failure.
// - Rate-limit uses checkout_rate_limits (latest row wins).
// =============================================================================

import Stripe from "stripe";
import { createServiceClient, type SvcClient } from "../_shared/supabase.ts";
import type { Json } from "../_shared/database.types.ts";
import { authenticate } from "../_shared/auth.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Env
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const HASH_VERSION = "v1"; // bump to invalidate old hashes

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY || !STRIPE_SECRET_KEY) {
  throw new Error("Missing required environment variables");
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe
// ─────────────────────────────────────────────────────────────────────────────
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover",
  httpClient: Stripe.createFetchHttpClient(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  MAX_ITEMS: 100,
  MIN_AMOUNT_CENTS: 500,
  MAX_AMOUNT_CENTS: 100_000_000,
  SESSION_EXPIRES_MINUTES: 30,

  // rate limiting
  MAX_ATTEMPTS_PER_WINDOW: 10,
  WINDOW_MINUTES: 5,
  BLOCK_MINUTES: 15,

  // pricing
  TAX_RATE: 0.08,

  // discounts
  MAX_DISCOUNT_FRACTION: 0.5,
  SAFE_MARGIN_PERCENT: 20,
} as const;

const ALLOWED_ORIGINS = [
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
  "http://localhost:3000",
  "http://localhost:3001",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ValidatedModifier {
  modifier_id: string;
  modifier_group_id: string;
  name: string;
  price_adjustment_cents: number;
}

interface ValidatedItem {
  id: string;
  name: string;
  base_cents: number;
  price_cents: number;
  quantity: number;
  modifiers: ValidatedModifier[];
  notes: string | null;
  pricing_hash: string;
}

interface DiscountResult {
  discount_cents: number;
  promo_id?: string;
  promo_code?: string;
  promo_applied?: number;
  credit_id?: string;
  credit_applied?: number;
}

interface RawModifierSelection {
  id: unknown;
  notes?: unknown;
}

interface RawItem {
  id: unknown;
  quantity: unknown;
  notes?: unknown;
  modifiers?: RawModifierSelection[];
}

interface ModifierGroupRow {
  id: string;
  required: boolean;
  min_selections: number | null;
  max_selections: number | null;
  active: boolean;
}

interface RawBody {
  items: RawItem[];
  email: unknown;

  successUrl?: unknown;
  cancelUrl?: unknown;
  success_url?: unknown;
  cancel_url?: unknown;

  frontend_total?: number;
  promo_code?: unknown;
  credit_id?: unknown;
  order_notes?: unknown;
}

interface ModifierRow {
  id: string;
  modifier_group_id: string;
  name: string;
  price_adjustment: number;
  available: boolean;
}

type MenuProductRow = {
  id: string;
  name: string;
  price: number;
  available: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────
function getCorsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.includes(origin as (typeof ALLOWED_ORIGINS)[number])) return null;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-idempotency-key, x-application-name",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function json(data: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function err(cors: Record<string, string>, message: string, status = 400, extra?: unknown) {
  log(status >= 500 ? "error" : "warn", message, extra);
  return json({ error: message }, cors, status);
}

function s(v: unknown, max = 320): string {
  return String(v ?? "").slice(0, max).trim();
}

function n(v: unknown, min: number, max: number): number {
  const x = Number(v);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.round(x)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing hash
// ─────────────────────────────────────────────────────────────────────────────
async function computePricingHash(
  itemId: string,
  baseCents: number,
  modifiers: { modifier_id: string; price_adjustment_cents: number }[],
  quantity: number,
): Promise<string> {
  const sortedMods = [...modifiers]
    .sort((a, b) => a.modifier_id.localeCompare(b.modifier_id))
    .map((m) => `${m.modifier_id}:${m.price_adjustment_cents}`)
    .join(",");

  const payload = `${HASH_VERSION}|${itemId}|${baseCents}|${sortedMods}|${quantity}`;
  const encoded = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting (checkout_rate_limits)
// Columns: user_id, attempts, last_attempt_at, blocked_until
// Reads latest row safely (handles legacy duplicates).
// ─────────────────────────────────────────────────────────────────────────────
async function checkRateLimit(userId: string): Promise<{ blocked: boolean }> {
  const svc = createServiceClient();
  const now = new Date();
  const windowStart = new Date(now.getTime() - CONFIG.WINDOW_MINUTES * 60_000);

  const { data, error } = await svc
    .from("checkout_rate_limits")
    .select("user_id,attempts,last_attempt_at,blocked_until")
    .eq("user_id", userId)
    .order("last_attempt_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    log("warn", "rate_limit_read_failed", { userId, error: error.message });
    return { blocked: false }; // fail-open
  }

  const blockedUntil = data?.blocked_until ? new Date(data.blocked_until) : null;
  if (blockedUntil && blockedUntil > now) return { blocked: true };

  const lastAttemptAt = data?.last_attempt_at ? new Date(data.last_attempt_at) : null;
  const attempts =
    !data || !lastAttemptAt || lastAttemptAt < windowStart ? 1 : (data.attempts ?? 0) + 1;

  const blocked = attempts > CONFIG.MAX_ATTEMPTS_PER_WINDOW;

  const { error: upErr } = await svc.from("checkout_rate_limits").upsert({
    user_id: userId,
    attempts,
    last_attempt_at: now.toISOString(),
    blocked_until: blocked
      ? new Date(now.getTime() + CONFIG.BLOCK_MINUTES * 60_000).toISOString()
      : null,
  });

  if (upErr) log("warn", "rate_limit_upsert_failed", { userId, error: upErr.message });

  return { blocked };
}

// ─────────────────────────────────────────────────────────────────────────────
// Modifier groups fetch
// ─────────────────────────────────────────────────────────────────────────────
async function fetchModifierGroupsForItem(
  svc: SvcClient,
  menuItemId: string,
): Promise<Map<string, ModifierGroupRow>> {
  const groupMap = new Map<string, ModifierGroupRow>();

  const { data: links, error: linkErr } = await svc
    .from("menu_item_modifier_groups")
    .select("modifier_group_id")
    .eq("menu_item_id", menuItemId);

  if (linkErr) {
    log("warn", "modifier_group_links_failed", { menuItemId, error: linkErr.message });
    return groupMap;
  }

  const groupIds = (links ?? [])
    .map((r) => (r as { modifier_group_id?: string }).modifier_group_id)
    .filter((x): x is string => typeof x === "string" && x.length > 0);

  if (groupIds.length === 0) return groupMap;

  const { data: groups, error: groupsErr } = await svc
    .from("modifier_groups")
    .select("id,required,min_selections,max_selections,active")
    .in("id", groupIds);

  if (groupsErr) {
    log("warn", "modifier_groups_fetch_failed", { menuItemId, error: groupsErr.message });
    return groupMap;
  }

  for (const g of (groups ?? []) as ModifierGroupRow[]) groupMap.set(g.id, g);
  return groupMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// Item validation (server-authoritative)
// ─────────────────────────────────────────────────────────────────────────────
async function validateItems(
  rawItems: RawItem[],
): Promise<{ ok: false; reason: string } | { ok: true; items: ValidatedItem[]; subtotalCents: number }> {
  const svc = createServiceClient();

  if (!rawItems.length || rawItems.length > CONFIG.MAX_ITEMS) {
    return { ok: false, reason: "Item count out of range" };
  }

  const itemIds = rawItems.map((i) => s(i.id, 100));
  if (itemIds.some((id) => !id)) return { ok: false, reason: "Item missing id" };

  const { data: products, error: prodErr } = await svc
    .from("menu_items_admin_full")
    .select("id,name,price,available")
    .in("id", itemIds);

  if (prodErr) return { ok: false, reason: `Failed to load products: ${prodErr.message}` };

  const typedProducts = (products ?? []) as MenuProductRow[];
  if (typedProducts.length !== itemIds.length) {
    return { ok: false, reason: "One or more items not found" };
  }

  const productMap = new Map<string, MenuProductRow>(typedProducts.map((p) => [p.id, p]));

  let subtotalCents = 0;
  const items: ValidatedItem[] = [];

  for (const raw of rawItems) {
    const itemId = s(raw.id, 100);
    const product = productMap.get(itemId);
    if (!product) return { ok: false, reason: `Product not found: ${itemId}` };
    if (!product.available) return { ok: false, reason: `"${product.name}" is not available` };

    const qty = n(raw.quantity, 1, 100);
    const notes = raw.notes != null ? s(raw.notes, 500) || null : null;

    const groupMap = await fetchModifierGroupsForItem(svc, itemId);

    const selectedRaw: RawModifierSelection[] = Array.isArray(raw.modifiers) ? raw.modifiers : [];
    const modifierIds = selectedRaw.map((m) => s(m.id, 100)).filter(Boolean);

    const dedupeCheck = new Set(modifierIds);
    if (dedupeCheck.size !== modifierIds.length) {
      return { ok: false, reason: "Duplicate modifier IDs in selection" };
    }

    const { data: modifierData, error: modErr } = modifierIds.length
      ? await svc
          .from("modifiers")
          .select("id,modifier_group_id,name,price_adjustment,available")
          .in("id", modifierIds)
      : { data: [] as unknown[], error: null };

    if (modErr) return { ok: false, reason: `Failed to load modifiers: ${modErr.message}` };

    const modifiersList: ModifierRow[] = Array.isArray(modifierData) ? (modifierData as ModifierRow[]) : [];
    const modifierDbMap = new Map<string, ModifierRow>(modifiersList.map((m) => [m.id, m]));

    const groupSelectionCount = new Map<string, number>();
    const validatedModifiers: ValidatedModifier[] = [];

    const baseCents = Math.round(Number(product.price) * 100);
    let modifierSumCents = 0;

    for (const rawMod of selectedRaw) {
      const modId = s(rawMod.id, 100);

      if (!modId) return { ok: false, reason: `Modifier id missing (item ${itemId})` };

      const mod = modifierDbMap.get(modId);
      if (!mod) return { ok: false, reason: `Modifier not found: "${modId}" (item ${itemId})` };
      if (!mod.available) return { ok: false, reason: `Modifier unavailable: ${mod.name}` };

      const group = groupMap.get(mod.modifier_group_id);
      if (!group) return { ok: false, reason: `Modifier "${mod.name}" does not belong to this item` };
      if (!group.active) return { ok: false, reason: `Modifier group is inactive for "${mod.name}"` };

      const currentCount = groupSelectionCount.get(mod.modifier_group_id) ?? 0;
      const maxSelections = group.max_selections ?? Infinity;
      if (currentCount + 1 > maxSelections) {
        return { ok: false, reason: "Too many selections for modifier group" };
      }

      groupSelectionCount.set(mod.modifier_group_id, currentCount + 1);

      const adjCents = Math.round(Number(mod.price_adjustment) * 100);
      modifierSumCents += adjCents;

      validatedModifiers.push({
        modifier_id: mod.id,
        modifier_group_id: mod.modifier_group_id,
        name: mod.name,
        price_adjustment_cents: adjCents,
      });
    }

    // enforce group requirements
    for (const [groupId, group] of groupMap.entries()) {
      const selectedCount = groupSelectionCount.get(groupId) ?? 0;
      const minSelections = group.min_selections ?? 0;

      if (group.required && selectedCount === 0) {
        return { ok: false, reason: "Required modifier group has no selection" };
      }
      if (selectedCount < minSelections) {
        return { ok: false, reason: "Minimum selections not met for a modifier group" };
      }
    }

    const unitPriceCents = baseCents + modifierSumCents;
    const lineTotalCents = unitPriceCents * qty;
    subtotalCents += lineTotalCents;

    const pricingHash = await computePricingHash(
      itemId,
      baseCents,
      validatedModifiers.map((m) => ({ modifier_id: m.modifier_id, price_adjustment_cents: m.price_adjustment_cents })),
      qty,
    );

    items.push({
      id: itemId,
      name: product.name,
      base_cents: baseCents,
      price_cents: unitPriceCents,
      quantity: qty,
      modifiers: validatedModifiers,
      notes,
      pricing_hash: pricingHash,
    });
  }

  if (subtotalCents < CONFIG.MIN_AMOUNT_CENTS || subtotalCents > CONFIG.MAX_AMOUNT_CENTS) {
    return { ok: false, reason: "Order total out of allowed range" };
  }

  return { ok: true, items, subtotalCents };
}

// ─────────────────────────────────────────────────────────────────────────────
// Discount module A: Promo codes
// ─────────────────────────────────────────────────────────────────────────────
async function applyPromoCode(code: string, userId: string, subtotalCents: number): Promise<DiscountResult> {
  const svc = createServiceClient();
  const now = new Date();
  const upper = code.toUpperCase().trim();

  const { data: promo, error: promoErr } = await svc
    .from("promotions")
    .select("id,type,value,max_uses,current_uses,per_user_limit,min_order_cents,expires_at,ends_at,active,starts_at,code")
    .ilike("code", upper)
    .single();

  if (promoErr || !promo) throw new Error("Promo code not found");
  if (!promo.active) throw new Error("Promo code is inactive");
  if (promo.starts_at && new Date(promo.starts_at) > now) throw new Error("Promo code is not yet active");

  const expiry = promo.expires_at ?? promo.ends_at ?? null;
  if (expiry && new Date(expiry) < now) throw new Error("Promo code has expired");
  if (subtotalCents < promo.min_order_cents) {
    throw new Error(`Promo requires a minimum order of $${(promo.min_order_cents / 100).toFixed(2)}`);
  }

  const { count: userUseCount } = await svc
    .from("promo_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("promotion_id", promo.id)
    .eq("user_id", userId);

  if (promo.per_user_limit != null && (userUseCount ?? 0) >= promo.per_user_limit) {
    throw new Error("You have already used this promo code");
  }

  const { data: incrementResult, error: incErr } = await svc.rpc("increment_promo_usage_if_available", {
    p_promo_id: promo.id,
  });

  if (incErr) throw new Error("Failed to reserve promo code");
  if (!incrementResult) throw new Error("Promo code has reached its usage limit");

  let discountCents = 0;
  if (promo.type === "percent") discountCents = Math.round(subtotalCents * (promo.value / 100));
  else discountCents = Math.min(Math.round(promo.value * 100), subtotalCents);

  log("info", "promo_applied", { promoId: promo.id, code: upper, userId, discountCents });

  return {
    discount_cents: discountCents,
    promo_id: promo.id,
    promo_code: upper,
    promo_applied: discountCents,
  };
}

async function rollbackPromo(promoId: string) {
  const svc = createServiceClient();
  await svc.rpc("promotions_decrement_uses", { p_promo_id: promoId });
}

// ─────────────────────────────────────────────────────────────────────────────
// Discount module B: Credits
// ─────────────────────────────────────────────────────────────────────────────
async function applyUserCredit(creditId: string, userId: string, remainingTotal: number): Promise<DiscountResult> {
  const svc = createServiceClient();
  const now = new Date();

  const { data: credit, error: creditErr } = await svc
    .from("user_credits")
    .select("id,user_id,amount_cents,used,expires_at")
    .eq("id", creditId)
    .single();

  if (creditErr || !credit) throw new Error("Credit not found");
  if (credit.user_id !== userId) throw new Error("Credit does not belong to this user");
  if (credit.used) throw new Error("Credit has already been used");
  if (credit.expires_at && new Date(credit.expires_at) < now) throw new Error("Credit has expired");

  const appliedCents = Math.min(credit.amount_cents, remainingTotal);
  if (appliedCents <= 0) throw new Error("Credit cannot be applied to this order");

  const { data: consumed, error: consumeErr } = await svc
    .from("user_credits")
    .update({ used: true, used_at: now.toISOString() })
    .eq("id", creditId)
    .eq("used", false)
    .select("id")
    .single();

  if (consumeErr || !consumed) throw new Error("Credit already consumed (concurrent request)");

  log("info", "credit_applied", { creditId, userId, appliedCents });

  return {
    discount_cents: appliedCents,
    credit_id: creditId,
    credit_applied: appliedCents,
  };
}

async function rollbackCredit(creditId: string) {
  const svc = createServiceClient();
  await svc
    .from("user_credits")
    .update({ used: false, used_at: null, checkout_session_id: null })
    .eq("id", creditId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Discount module C: anti-stack ceiling
// ─────────────────────────────────────────────────────────────────────────────
function enforceDiscountCeiling(
  subtotalCents: number,
  promoCents: number,
  creditCents: number,
): { final_promo: number; final_credit: number; total_discount: number } {
  const maxDiscount = Math.floor(subtotalCents * CONFIG.MAX_DISCOUNT_FRACTION);
  const clampedPromo = Math.min(promoCents, maxDiscount);
  const remainingBudget = Math.max(0, maxDiscount - clampedPromo);
  const clampedCredit = Math.min(creditCents, remainingBudget);

  return {
    final_promo: clampedPromo,
    final_credit: clampedCredit,
    total_discount: clampedPromo + clampedCredit,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe coupon helper
// ─────────────────────────────────────────────────────────────────────────────
async function createStripeCoupon(discountCents: number, label: string): Promise<string> {
  const coupon = await stripe.coupons.create({
    name: label.slice(0, 40),
    amount_off: discountCents,
    currency: "usd",
    duration: "once",
    redeem_by: Math.floor(Date.now() / 1000) + CONFIG.SESSION_EXPIRES_MINUTES * 60,
    metadata: { generated_by: "create-checkout", label },
  });
  return coupon.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB idempotency helpers
// ─────────────────────────────────────────────────────────────────────────────
async function findExistingCart(
  svc: SvcClient,
  userId: string,
  idempotencyKey: string,
): Promise<{ stripe_session_id: string | null } | null> {
  const { data, error } = await svc
    .from("pending_carts")
    .select("stripe_session_id")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) {
    log("warn", "findExistingCart_error", { userId, idempotencyKey, error: error.message });
    return null;
  }

  if (!data) return null;
  return { stripe_session_id: data.stripe_session_id ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req): Promise<Response> => {
  const cors = getCorsHeaders(req);
  if (!cors) return new Response("Origin not allowed", { status: 403 });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return err(cors, "Method not allowed", 405);

  // Auth (shared)
  const auth = await authenticate(req);
  if (!auth.ok) return err(cors, "Unauthorized", 401);
  const userId = auth.userId;

  // Idempotency required
  const idempotencyKey = (req.headers.get("x-idempotency-key") ?? "").trim();
  if (!idempotencyKey) return err(cors, "x-idempotency-key header is required", 400);

  // Rate limit
  const rate = await checkRateLimit(userId);
  if (rate.blocked) return err(cors, "Too many attempts. Please wait.", 429);

  const svc = createServiceClient();

  // If same key already created a session, return it if still open
  const existing = await findExistingCart(svc, userId, idempotencyKey);
  if (existing?.stripe_session_id) {
    log("info", "idempotent_replay", { userId, idempotencyKey });
    try {
      const session = await stripe.checkout.sessions.retrieve(existing.stripe_session_id);
      if (session.url && session.status === "open") {
        return json({ id: session.id, url: session.url, replayed: true }, cors);
      }
    } catch {
      log("warn", "idempotent_session_expired", { sessionId: existing.stripe_session_id });
    }
  }

  // Body
  let body: RawBody;
  try {
    body = await req.json();
  } catch {
    return err(cors, "Invalid JSON", 400);
  }

  if (!body?.items?.length) return err(cors, "Cart is empty", 400);

  // Redirect URL compatibility
  const success_url = body.success_url ?? body.successUrl;
  const cancel_url = body.cancel_url ?? body.cancelUrl;

  if (!success_url || !cancel_url) return err(cors, "Missing success/cancel URL", 400);

  // Validate items (server authority)
  const validation = await validateItems(body.items);
  if (!validation.ok) return err(cors, validation.reason, 422);

  const { items, subtotalCents } = validation;

  // Origin validation (derived from success_url)
  let requestedOrigin: string;
  try {
    requestedOrigin = new URL(s(success_url, 500)).origin;
  } catch {
    return err(cors, "Invalid redirect URL", 400);
  }

  if (!ALLOWED_ORIGINS.includes(requestedOrigin as (typeof ALLOWED_ORIGINS)[number])) {
    return err(cors, "Invalid redirect origin", 400);
  }

  // Email
  const customerEmail = s(body.email, 320).toLowerCase();
  if (!customerEmail.includes("@") || customerEmail.length < 5) {
    return err(cors, "Invalid email address", 400);
  }

  // Frontend fraud signal (optional)
  if (typeof body.frontend_total === "number") {
    const frontendCents = Math.round(body.frontend_total * 100);
    const serverEstimate = subtotalCents + Math.round(subtotalCents * CONFIG.TAX_RATE);
    if (Math.abs(frontendCents - serverEstimate) > 10) {
      log("warn", "frontend_total_mismatch", { frontendCents, serverEstimate, userId });
    }
  }

  // Discounts
  let promoResult: DiscountResult | null = null;
  let creditResult: DiscountResult | null = null;
  let promoDiscountCents = 0;
  let creditDiscountCents = 0;

  const rawPromoCode = s(body.promo_code, 50);
  if (rawPromoCode) {
    try {
      promoResult = await applyPromoCode(rawPromoCode, userId, subtotalCents);
      promoDiscountCents = promoResult.discount_cents;
    } catch (e) {
      return err(cors, e instanceof Error ? e.message : "Promo code invalid", 422);
    }
  }

  const rawCreditId = s(body.credit_id, 100);
  if (rawCreditId) {
    const remainingAfterPromo = Math.max(0, subtotalCents - promoDiscountCents);
    try {
      creditResult = await applyUserCredit(rawCreditId, userId, remainingAfterPromo);
      creditDiscountCents = creditResult.discount_cents;
    } catch (e) {
      if (promoResult?.promo_id) await rollbackPromo(promoResult.promo_id);
      return err(cors, e instanceof Error ? e.message : "Credit invalid", 422);
    }
  }

  const { final_promo, final_credit, total_discount } = enforceDiscountCeiling(
    subtotalCents,
    promoDiscountCents,
    creditDiscountCents,
  );

  if (promoResult) promoResult.promo_applied = final_promo;
  if (creditResult) creditResult.credit_applied = final_credit;

  const discountedSubtotal = Math.max(0, subtotalCents - total_discount);
  const finalTaxCents = Math.round(discountedSubtotal * CONFIG.TAX_RATE);
  const grandTotalCents = discountedSubtotal + finalTaxCents;

  if (grandTotalCents <= 0) {
    if (promoResult?.promo_id) await rollbackPromo(promoResult.promo_id);
    if (creditResult?.credit_id) await rollbackCredit(creditResult.credit_id);
    return err(cors, "Order total must be greater than $0 after discounts", 400);
  }

  // Margin protection only when discounts applied
  if (total_discount > 0) {
    const { data: profitSnapshot, error: marginErr } = await svc
      .from("admin_profit_snapshot")
      .select("total_gross_profit_cents")
      .single();

    if (marginErr || !profitSnapshot) {
      if (promoResult?.promo_id) await rollbackPromo(promoResult.promo_id);
      if (creditResult?.credit_id) await rollbackCredit(creditResult.credit_id);
      return err(cors, "Margin snapshot unavailable", 500);
    }

    const gross = Number(profitSnapshot.total_gross_profit_cents ?? 0);

    if (!Number.isFinite(gross) || gross <= 0) {
      log("warn", "margin_snapshot_invalid_failopen", { gross, userId });
    } else {
      const projectedMargin = ((gross - total_discount) / Math.max(discountedSubtotal, 1)) * 100;
      if (projectedMargin < CONFIG.SAFE_MARGIN_PERCENT) {
        if (promoResult?.promo_id) await rollbackPromo(promoResult.promo_id);
        if (creditResult?.credit_id) await rollbackCredit(creditResult.credit_id);
        log("warn", "margin_threshold_blocked", { projectedMargin, userId });
        return err(cors, "Discount exceeds safe margin threshold", 400);
      }
    }
  }

  // Persist pending cart
  const cartRef = crypto.randomUUID();
  const cartPricingHash = items.map((i) => i.pricing_hash).join("|");
  const itemsJson: Json = items as unknown as Json;

  const { error: cartErr } = await svc.from("pending_carts").insert({
    id: cartRef,
    user_id: userId,
    idempotency_key: idempotencyKey,
    items: itemsJson,
    subtotal_cents: subtotalCents,
    discount_cents: total_discount,
    tax_cents: finalTaxCents,
    total_cents: grandTotalCents,
    promo_id: promoResult?.promo_id ?? null,
    credit_id: creditResult?.credit_id ?? null,
    created_at: new Date().toISOString(),
  });

  if (cartErr) {
    if (promoResult?.promo_id) await rollbackPromo(promoResult.promo_id);
    if (creditResult?.credit_id) await rollbackCredit(creditResult.credit_id);
    log("error", "pending_cart_insert_failed", { message: cartErr.message });
    return err(cors, "Failed to create pending cart", 500);
  }

  // Create Stripe Session
  try {
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      ...items.map((i) => ({
        price_data: {
          currency: "usd",
          product_data: {
            name: i.name,
            metadata: {
              menu_item_id: i.id,
              pricing_hash: i.pricing_hash,
              modifier_count: String(i.modifiers.length),
            },
          },
          unit_amount: i.price_cents,
        },
        quantity: i.quantity,
      })),
      {
        price_data: {
          currency: "usd",
          product_data: { name: `Tax (${(CONFIG.TAX_RATE * 100).toFixed(0)}%)` },
          unit_amount: finalTaxCents,
        },
        quantity: 1,
      },
    ];

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items: lineItems,
      success_url: `${requestedOrigin}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: String(cancel_url),
      customer_email: customerEmail,
      expires_at: Math.floor(Date.now() / 1000) + CONFIG.SESSION_EXPIRES_MINUTES * 60,
      metadata: {
        customer_uid: userId,
        cart_ref: cartRef,
        server_total: String(grandTotalCents),
        subtotal_cents: String(subtotalCents),
        discount_cents: String(total_discount),
        promo_code: promoResult?.promo_code ?? "",
        promo_id: promoResult?.promo_id ?? "",
        credit_id: creditResult?.credit_id ?? "",
        credit_applied: String(final_credit),
        pricing_hash: cartPricingHash,
        hash_version: HASH_VERSION,
        idempotency_key: idempotencyKey,
        request_id: crypto.randomUUID(),
      },
    };

    if (total_discount > 0) {
      const couponLabel = promoResult ? `Discount (${promoResult.promo_code})` : "Credit Applied";
      const couponId = await createStripeCoupon(total_discount, couponLabel);
      sessionParams.discounts = [{ coupon: couponId }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey });

    await svc.from("pending_carts").update({ stripe_session_id: session.id }).eq("id", cartRef);

    if (promoResult?.promo_id) {
      await svc.from("promo_redemptions").insert({
        promotion_id: promoResult.promo_id,
        user_id: userId,
        discount_cents: final_promo,
        checkout_session_id: session.id,
      });
    }

    if (creditResult?.credit_id) {
      await svc.from("user_credits").update({ checkout_session_id: session.id }).eq("id", creditResult.credit_id);
    }

    log("info", "checkout_session_created", {
      sessionId: session.id,
      userId,
      grandTotalCents,
      pricingHash: cartPricingHash,
    });

    return json({ id: session.id, url: session.url }, cors);
  } catch (e) {
    if (promoResult?.promo_id) await rollbackPromo(promoResult.promo_id);
    if (creditResult?.credit_id) await rollbackCredit(creditResult.credit_id);

    await svc.from("pending_carts").delete().eq("id", cartRef);

    log("error", "stripe_error", { message: e instanceof Error ? e.message : String(e) });
    return err(cors, "Payment service unavailable. Please try again.", 500);
  }
});