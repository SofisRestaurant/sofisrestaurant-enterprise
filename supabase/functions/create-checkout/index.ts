// =============================================================================
// CREATE CHECKOUT — HARDENED v2
// =============================================================================
import Stripe from "stripe";
import {
  createServiceClient,
  createAnonClient,
  type SvcClient,
} from "../_shared/supabase.ts";
import type { Json } from "../_shared/database.types.ts";

// ── Env ───────────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const HASH_VERSION = "v1"; // bump when pricing schema changes to invalidate old hashes

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY || !STRIPE_SECRET_KEY) {
  throw new Error("Missing required environment variables");
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  // NOTE: This will typecheck once your Stripe SDK is upgraded to a version
  // whose typings include this Clover API version.
  apiVersion: "2026-02-25.clover",
  httpClient: Stripe.createFetchHttpClient(),
});

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
  MAX_ITEMS: 100,
  MIN_AMOUNT_CENTS: 500,
  MAX_AMOUNT_CENTS: 100_000_000,
  SESSION_EXPIRES_MINUTES: 30,
  MAX_ATTEMPTS_PER_WINDOW: 10,
  WINDOW_MINUTES: 5,
  BLOCK_MINUTES: 15,
  TAX_RATE: 0.08,
  MAX_DISCOUNT_FRACTION: 0.5,
  SAFE_MARGIN_PERCENT: 20,
} as const;

const ALLOWED_ORIGINS = [
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single validated modifier selection stored for audit/replay */
interface ValidatedModifier {
  modifier_id: string;
  modifier_group_id: string;
  name: string;
  price_adjustment_cents: number;
}

/**
 * v2 ValidatedItem — now includes full modifier audit trail + notes + pricing_hash.
 * This is what gets persisted in pending_carts.items[].
 */
interface ValidatedItem {
  id: string;
  name: string;
  base_cents: number; // base price before modifiers
  price_cents: number; // base + modifiers per unit
  quantity: number;
  modifiers: ValidatedModifier[];
  notes: string | null;
  pricing_hash: string; // deterministic per-line integrity hash
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
  max_selections: number | null; // null = no max
  active: boolean;
}

interface RawBody {
  items: RawItem[];
  email: unknown;

  // ✅ accept BOTH styles
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

// ── CORS ──────────────────────────────────────────────────────────────────────
function getCorsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-idempotency-key, x-application-name",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function log(level: "info" | "warn" | "error", msg: string, data?: unknown) {
  console.log(JSON.stringify({ level, msg, data, time: new Date().toISOString() }));
}

function json(data: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function err(message: string, cors: Record<string, string>, status = 400) {
  log("error", message);
  return json({ error: message }, cors, status);
}

function s(v: unknown, max: number): string {
  return String(v ?? "").slice(0, max).trim();
}

function n(v: unknown, min: number, max: number): number {
  const x = Number(v);
  if (Number.isNaN(x)) return min;
  return Math.max(min, Math.min(max, Math.round(x)));
}

// ── Pricing hash ──────────────────────────────────────────────────────────────
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

// ── Auth ──────────────────────────────────────────────────────────────────────
async function authenticate(
  req: Request,
): Promise<{ ok: false } | { ok: true; userId: string }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false };

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return { ok: false };

  const anonClient = createAnonClient(token);
  const { data, error } = await anonClient.auth.getUser();

  if (error || !data?.user) return { ok: false };
  return { ok: true, userId: data.user.id };
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
// IMPORTANT: this code expects checkout_rate_limits has columns:
// user_id, attempts, last_attempt_at, blocked_until
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
    log("warn", "rate_limit_read_failed", { userId, error });
    // fail-open to avoid blocking purchases due to telemetry table issues
    return { blocked: false };
  }

  const blockedUntil = data?.blocked_until ? new Date(data.blocked_until) : null;
  if (blockedUntil && blockedUntil > now) return { blocked: true };

  const lastAttemptAt = data?.last_attempt_at ? new Date(data.last_attempt_at) : null;
  const attempts =
    !data || !lastAttemptAt || lastAttemptAt < windowStart
      ? 1
      : (data.attempts ?? 0) + 1;

  const blocked = attempts > CONFIG.MAX_ATTEMPTS_PER_WINDOW;

  await svc.from("checkout_rate_limits").upsert({
    user_id: userId,
    attempts,
    last_attempt_at: now.toISOString(),
    blocked_until: blocked
      ? new Date(now.getTime() + CONFIG.BLOCK_MINUTES * 60_000).toISOString()
      : null,
  });

  return { blocked };
}

// ── Modifier groups fetch (stable, avoids nested typing pitfalls) ─────────────
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
    log("warn", "modifier_group_links_failed", { menuItemId, linkErr });
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
    log("warn", "modifier_groups_fetch_failed", { menuItemId, groupsErr });
    return groupMap;
  }

  for (const g of (groups ?? []) as ModifierGroupRow[]) groupMap.set(g.id, g);
  return groupMap;
}

// ── Item validation ───────────────────────────────────────────────────────────
async function validateItems(
  rawItems: RawItem[],
): Promise<
  | { ok: false; reason: string }
  | { ok: true; items: ValidatedItem[]; subtotalCents: number }
> {
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

  if (prodErr) return { ok: false, reason: "Failed to load products" };

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
      : { data: [] as ModifierRow[], error: null };

    if (modErr) return { ok: false, reason: "Failed to load modifiers" };

    const modifiersList: ModifierRow[] = Array.isArray(modifierData) ? (modifierData as ModifierRow[]) : [];
    const modifierDbMap = new Map<string, ModifierRow>(modifiersList.map((m) => [m.id, m]));

    const groupSelectionCount = new Map<string, number>();
    const validatedModifiers: ValidatedModifier[] = [];

    const baseCents = Math.round(Number(product.price) * 100);
    let modifierSumCents = 0;

for (const rawMod of selectedRaw) {
  const modId = s(rawMod.id, 100)

  // ✅ NEW: explicit guard for empty id (this is your current 422 cause)
  if (!modId) {
    return { ok: false, reason: `Modifier id missing (item ${itemId})` }
  }

  const mod = modifierDbMap.get(modId)

  // ✅ UPDATED message (safe: itemId is in-scope)
  if (!mod) {
    return { ok: false, reason: `Modifier not found: "${modId}" (item ${itemId})` }
  }

  // Everything below is now safe because mod is guaranteed defined
  if (!mod.available) return { ok: false, reason: `Modifier unavailable: ${mod.name}` }

  const group = groupMap.get(mod.modifier_group_id)
  if (!group) return { ok: false, reason: `Modifier "${mod.name}" does not belong to this item` }
  if (!group.active) return { ok: false, reason: `Modifier group is inactive for "${mod.name}"` }

  const currentCount = groupSelectionCount.get(mod.modifier_group_id) ?? 0
  const maxSelections = group.max_selections ?? Infinity
  if (currentCount + 1 > maxSelections) return { ok: false, reason: 'Too many selections for modifier group' }

  groupSelectionCount.set(mod.modifier_group_id, currentCount + 1)

  const adjCents = Math.round(Number(mod.price_adjustment) * 100)
  modifierSumCents += adjCents

  validatedModifiers.push({
    modifier_id: mod.id,
    modifier_group_id: mod.modifier_group_id,
    name: mod.name,
    price_adjustment_cents: adjCents,
      });
    }

    for (const [groupId, group] of groupMap.entries()) {
      const selectedCount = groupSelectionCount.get(groupId) ?? 0;
      const minSelections = group.min_selections ?? 0;

      if (group.required && selectedCount === 0) return { ok: false, reason: "Required modifier group has no selection" };
      if (selectedCount < minSelections) return { ok: false, reason: "Minimum selections not met for a modifier group" };
    }

    const unitPriceCents = baseCents + modifierSumCents;
    const lineTotalCents = unitPriceCents * qty;
    subtotalCents += lineTotalCents;

    const pricingHash = await computePricingHash(itemId, baseCents, validatedModifiers, qty);

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

// =============================================================================
// DISCOUNT MODULE A: applyPromoCode
// =============================================================================
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

// =============================================================================
// DISCOUNT MODULE B: applyUserCredit
// =============================================================================
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

// =============================================================================
// DISCOUNT MODULE C: Anti-stack ceiling
// =============================================================================
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

// =============================================================================
// Stripe Coupon helper
// =============================================================================
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

// =============================================================================
// DB idempotency helpers
// =============================================================================
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
    log("warn", "findExistingCart_error", { userId, idempotencyKey, error });
    return null;
  }
  if (!data) return null;

  return { stripe_session_id: data.stripe_session_id ?? null };
}

// =============================================================================
// MAIN
// =============================================================================
Deno.serve(async (req): Promise<Response> => {
  const cors = getCorsHeaders(req);
  if (!cors) return new Response("Origin not allowed", { status: 403 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return err("Method not allowed", cors, 405);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authResult = await authenticate(req);
  if (!authResult.ok) return err("Unauthorized", cors, 401);
  const userId = authResult.userId;

  // ── Require idempotency key ──────────────────────────────────────────────
  const idempotencyKey = req.headers.get("x-idempotency-key")?.trim();
  if (!idempotencyKey) return err("x-idempotency-key header is required", cors, 400);

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rate = await checkRateLimit(userId);
  if (rate.blocked) return err("Too many attempts. Please wait.", cors, 429);

  const svc = createServiceClient();

  // ── DB idempotency check — return existing if same key ────────────────────
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

  // ── Body ──────────────────────────────────────────────────────────────────
  let body: RawBody;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON", cors);
  }
  if (!body?.items?.length) return err("Cart is empty", cors);
// ── Redirect URL compatibility (camelCase + snake_case) ─────────────────────
const success_url = body.success_url ?? body.successUrl;
const cancel_url  = body.cancel_url  ?? body.cancelUrl;

if (!success_url || !cancel_url) {
  return err("Missing success/cancel URL", cors, 400);
}
  // ── Validate items ────────────────────────────────────────────────────────
  const validation = await validateItems(body.items);
  if (!validation.ok) return err(validation.reason, cors, 422);

  const { items, subtotalCents } = validation;

  // ── Frontend fraud signal ─────────────────────────────────────────────────
  if (typeof body.frontend_total === "number") {
    const frontendCents = Math.round(body.frontend_total * 100);
    const serverEstimate = subtotalCents + Math.round(subtotalCents * CONFIG.TAX_RATE);
    if (Math.abs(frontendCents - serverEstimate) > 10) {
      log("warn", "frontend_total_mismatch", { frontendCents, serverEstimate, userId });
    }
  }

// ── Origin validation ─────────────────────────────────────────────────────
let requestedOrigin: string;
try {
  requestedOrigin = new URL(s(success_url, 500)).origin;
} catch {
  return err("Invalid redirect URL", cors, 400);
}

if (!ALLOWED_ORIGINS.includes(requestedOrigin)) {
  return err("Invalid redirect origin", cors, 400);
}
  // ── Email ─────────────────────────────────────────────────────────────────
  const customerEmail = s(body.email, 320).toLowerCase();
  if (!customerEmail.includes("@") || customerEmail.length < 5) {
    return err("Invalid email address", cors, 400);
  }

  // =========================================================================
  // DISCOUNT PIPELINE
  // =========================================================================
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
      return err(e instanceof Error ? e.message : "Promo code invalid", cors, 422);
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
      return err(e instanceof Error ? e.message : "Credit invalid", cors, 422);
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
    return err("Order total must be greater than $0 after discounts", cors, 400);
  }
log("info", "margin_inputs", {
  subtotalCents,
  total_discount,
  discountedSubtotal,
  promoDiscountCents,
  creditDiscountCents,
  final_promo,
  final_credit,
});
// ── Margin protection (only when discounts are applied) ─────────────────────
if (total_discount > 0) {
  const { data: profitSnapshot, error: marginErr } = await svc
    .from("admin_profit_snapshot")
    .select("total_gross_profit_cents")
    .single();

  if (marginErr || !profitSnapshot) {
    if (promoResult?.promo_id) await rollbackPromo(promoResult.promo_id);
    if (creditResult?.credit_id) await rollbackCredit(creditResult.credit_id);
    return err("Margin snapshot unavailable", cors, 500);
  }

  const gross = Number(profitSnapshot.total_gross_profit_cents ?? 0);

  // If snapshot is missing/invalid, fail-open (don’t block checkout)
  if (!Number.isFinite(gross) || gross <= 0) {
    log("warn", "margin_snapshot_invalid_failopen", { gross, userId });
  } else {
    const projectedMargin =
      ((gross - total_discount) / Math.max(discountedSubtotal, 1)) * 100;

    if (projectedMargin < CONFIG.SAFE_MARGIN_PERCENT) {
      if (promoResult?.promo_id) await rollbackPromo(promoResult.promo_id);
      if (creditResult?.credit_id) await rollbackCredit(creditResult.credit_id);
      log("warn", "margin_threshold_blocked", { projectedMargin, userId });
      return err("Discount exceeds safe margin threshold", cors, 400);
    }
  }
}
  // ── Store pending cart with idempotency_key ────────────────────────────────
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
    log("error", "pending_cart_insert_failed", cartErr);
    return err("Failed to create pending cart", cors, 500);
  }

  // =========================================================================
  // STRIPE SESSION
  // =========================================================================
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
      cancel_url: `${requestedOrigin}/checkout`,
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

    // Promo redemption now correctly records checkout_session_id AFTER session exists
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

    log("error", "stripe_error", e);
    return err("Payment service unavailable. Please try again.", cors, 500);
  }
});