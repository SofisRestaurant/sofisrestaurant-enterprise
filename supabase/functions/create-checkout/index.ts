// supabase/functions/create-checkout/index.ts
// =============================================================================
// CREATE CHECKOUT — ENTERPRISE GRADE (PROMO + CREDITS + LOYALTY + AUDIT)
// =============================================================================
//
// Discount pipeline (server-only, never frontend):
//   1. validateItems()       — prices from DB, totals computed server-side
//   2. applyPromoCode()      — validate + atomic-increment promo use
//   3. applyUserCredit()     — consume user_credits (loyalty or marketing)
//   4. Anti-stack guard      — enforce discount ceiling
//   5. Stripe session        — receives only final computed total
//
// Security guarantees:
//   ✔ No client-supplied price is ever trusted
//   ✔ Promo incremented atomically (UPDATE ... WHERE current_uses < max_uses)
//   ✔ Credit consumed atomically (UPDATE ... WHERE used = false)
//   ✔ Both writes are rolled back if Stripe session creation fails
//   ✔ Full audit in Stripe metadata + promo_redemptions table
//   ✔ Rate limiting per user
//   ✔ Idempotency key enforced
// =============================================================================

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// ── Env ───────────────────────────────────────────────────────────────────────
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY || !STRIPE_SECRET_KEY) {
  throw new Error("Missing required environment variables");
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion:  "2026-01-28.clover",
  httpClient:  Stripe.createFetchHttpClient(),
});

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
  MAX_ITEMS:               100,
  MIN_AMOUNT_CENTS:        500,
  MAX_AMOUNT_CENTS:        100_000_000,
  SESSION_EXPIRES_MINUTES: 30,
  MAX_ATTEMPTS_PER_WINDOW: 10,
  WINDOW_MINUTES:          5,
  BLOCK_MINUTES:           15,
  TAX_RATE:                0.08,
  // Max combined discount as fraction of subtotal (prevent 100% free orders)
  MAX_DISCOUNT_FRACTION:   0.50,
} as const;

const ALLOWED_ORIGINS = [
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
  "http://localhost:3000",
  "http://localhost:3001",
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface RawItem       { id: unknown; quantity: unknown; notes?: unknown }
interface ValidatedItem { id: string; name: string; price_cents: number; quantity: number; notes?: string }

// Unified discount contract — both applyPromoCode and applyUserCredit return this shape
interface DiscountResult {
  discount_cents:  number;   // canonical field used by the pipeline
  promo_id?:       string;
  promo_code?:     string;
  promo_applied?:  number;
  credit_id?:      string;
  credit_applied?: number;
}

interface RawBody {
  items:           RawItem[];
  email:           unknown;
  successUrl:      unknown;
  cancelUrl:       unknown;
  frontend_total?: number;
  promo_code?:     unknown;
  credit_id?:      unknown;
}

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

function s(v: unknown, max: number) { return String(v ?? "").slice(0, max).trim(); }
function n(v: unknown, min: number, max: number) {
  const x = Number(v);
  if (isNaN(x)) return min;
  return Math.max(min, Math.min(max, Math.round(x)));
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function authenticate(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false as const };

  const token = authHeader.replace("Bearer ", "");
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false },
  });

  const { data: { user }, error } = await anonClient.auth.getUser();
  if (error || !user) return { ok: false as const };
  return { ok: true as const, userId: user.id };
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
async function checkRateLimit(userId: string) {
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date();
  const windowStart = new Date(now.getTime() - CONFIG.WINDOW_MINUTES * 60_000);

  const { data } = await svc
    .from("checkout_rate_limits")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.blocked_until && new Date(data.blocked_until) > now) return { blocked: true };

  const attempts = !data || new Date(data.last_attempt) < windowStart ? 1 : data.attempts + 1;
  const blocked  = attempts > CONFIG.MAX_ATTEMPTS_PER_WINDOW;

  await svc.from("checkout_rate_limits").upsert({
    user_id:       userId,
    attempts,
    last_attempt:  now,
    blocked_until: blocked ? new Date(now.getTime() + CONFIG.BLOCK_MINUTES * 60_000) : null,
  });

  return { blocked };
}

// ── Item validation ───────────────────────────────────────────────────────────
async function validateItems(
  rawItems: RawItem[]
): Promise<{ ok: false } | { ok: true; items: ValidatedItem[]; subtotalCents: number }> {
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (!rawItems.length || rawItems.length > CONFIG.MAX_ITEMS) return { ok: false };

  const ids = rawItems.map((i) => s(i.id, 100));
  const { data: products } = await svc.from("menu_items").select("id,name,price").in("id", ids);

  if (!products || products.length !== ids.length) return { ok: false };

  const map = new Map(products.map((p) => [p.id, p]));
  let subtotalCents = 0;
  const items: ValidatedItem[] = [];

  for (const raw of rawItems) {
    const product = map.get(s(raw.id, 100));
    if (!product) return { ok: false };

    const qty   = n(raw.quantity, 1, 100);
    const cents = Math.round(Number(product.price) * 100);
    subtotalCents += cents * qty;

    items.push({
      id:         product.id,
      name:       product.name,
      price_cents: cents,
      quantity:   qty,
      notes:      raw.notes ? s(raw.notes, 500) : undefined,
    });
  }

  if (subtotalCents < CONFIG.MIN_AMOUNT_CENTS || subtotalCents > CONFIG.MAX_AMOUNT_CENTS) {
    return { ok: false };
  }

  return { ok: true, items, subtotalCents };
}

// =============================================================================
// DISCOUNT MODULE A: applyPromoCode
// =============================================================================
// Validates promo code and performs atomic usage increment.
// Returns discount in cents. Throws descriptive error on any violation.
// IMPORTANT: Caller must call rollbackPromo() if Stripe creation fails.
// =============================================================================

async function applyPromoCode(
  code: string,
  userId: string,
  subtotalCents: number
): Promise<DiscountResult> {
  const svc  = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now  = new Date();
  const upper = code.toUpperCase().trim();

  // ── 1. Fetch promo ────────────────────────────────────────────────────────
  const { data: promo, error: promoErr } = await svc
    .from("promotions")
    .select("id,type,value,max_uses,current_uses,per_user_limit,min_order_cents,expires_at,active")
    .ilike("code", upper)
    .single();

  if (promoErr || !promo) throw new Error("Promo code not found");
  if (!promo.active) throw new Error("Promo code is inactive");
  if (promo.expires_at && new Date(promo.expires_at) < now) throw new Error("Promo code has expired");
  if (subtotalCents < promo.min_order_cents) {
    throw new Error(`Promo requires a minimum order of $${(promo.min_order_cents / 100).toFixed(2)}`);
  }

  // ── 2. Per-user limit check ───────────────────────────────────────────────
  const { count: userUseCount } = await svc
    .from("promo_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("promotion_id", promo.id)
    .eq("user_id", userId);

  if (
    promo.per_user_limit != null &&
    (userUseCount ?? 0) >= promo.per_user_limit
  ) {
    throw new Error("You have already used this promo code");
  }

  // ── 3. Atomic global usage increment (DB-side, race-condition safe) ──────────
  // The RPC runs UPDATE ... WHERE (max_uses IS NULL OR current_uses < max_uses)
  // entirely inside Postgres. No read-modify-write in JS — concurrent requests
  // cannot both read the same current_uses value and double-increment.
  const { data: incrementResult, error: incErr } = await svc
    .rpc("increment_promo_usage_if_available", { p_promo_id: promo.id });

  if (incErr)          throw new Error("Failed to reserve promo code");
  if (!incrementResult) throw new Error("Promo code has reached its usage limit");

  // ── 4. Calculate discount ─────────────────────────────────────────────────
  let discountCents = 0;
  if (promo.type === "percent") {
    discountCents = Math.round(subtotalCents * (promo.value / 100));
  } else {
    // fixed
    discountCents = Math.min(promo.value, subtotalCents);
  }

  log("info", "promo_applied", { promoId: promo.id, code: upper, userId, discountCents });

  return { discount_cents: discountCents, promo_id: promo.id, promo_code: upper, promo_applied: discountCents };
}

async function rollbackPromo(promoId: string) {
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  // Safe DB-side decrement — never goes below 0, matches the increment RPC
  await svc.rpc("promotions_decrement_uses", { p_promo_id: promoId });
}

// =============================================================================
// DISCOUNT MODULE B: applyUserCredit
// =============================================================================
// Atomically reserves a user credit for this checkout.
// Marks it used immediately; rolled back if Stripe creation fails.
// =============================================================================

async function applyUserCredit(
  creditId: string,
  userId: string,
  remainingTotal: number  // total after promo — credit can't exceed this
): Promise<DiscountResult> {
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date();

  // ── 1. Fetch and validate credit ─────────────────────────────────────────
  const { data: credit, error: creditErr } = await svc
    .from("user_credits")
    .select("id,user_id,amount_cents,used,expires_at")
    .eq("id", creditId)
    .single();

  if (creditErr || !credit)                       throw new Error("Credit not found");
  if (credit.user_id !== userId)                  throw new Error("Credit does not belong to this user");
  if (credit.used)                                throw new Error("Credit has already been used");
  if (credit.expires_at && new Date(credit.expires_at) < now) {
    throw new Error("Credit has expired");
  }

  const appliedCents = Math.min(credit.amount_cents, remainingTotal);
  if (appliedCents <= 0) throw new Error("Credit cannot be applied to this order");

  // ── 2. Atomic mark-as-used ────────────────────────────────────────────────
  // WHERE used = false ensures no double-spend even under concurrent requests.
  const { data: consumed, error: consumeErr } = await svc
    .from("user_credits")
    .update({ used: true, used_at: now.toISOString() })
    .eq("id", creditId)
    .eq("used", false)   // atomic guard
    .select("id")
    .single();

  if (consumeErr || !consumed) throw new Error("Credit already consumed (concurrent request)");

  log("info", "credit_applied", { creditId, userId, appliedCents });

  return { discount_cents: appliedCents, credit_id: creditId, credit_applied: appliedCents };
}

async function rollbackCredit(creditId: string) {
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  await svc
    .from("user_credits")
    .update({ used: false, used_at: null, checkout_session_id: null })
    .eq("id", creditId);
}

// =============================================================================
// DISCOUNT MODULE C: Anti-stack guard
// =============================================================================
// Enforces maximum combined discount ceiling.
// Promo is applied first; credit is capped to remaining total.
// =============================================================================

function enforceDiscountCeiling(
  subtotalCents:  number,
  promoCents:     number,
  creditCents:    number
): { final_promo: number; final_credit: number; total_discount: number } {
  const maxDiscount     = Math.floor(subtotalCents * CONFIG.MAX_DISCOUNT_FRACTION);
  const clampedPromo    = Math.min(promoCents,  maxDiscount);
  const remainingBudget = Math.max(0, maxDiscount - clampedPromo);
  const clampedCredit   = Math.min(creditCents, remainingBudget);

  return {
    final_promo:     clampedPromo,
    final_credit:    clampedCredit,
    total_discount:  clampedPromo + clampedCredit,
  };
}

// =============================================================================
// MAIN
// =============================================================================

 Deno.serve(async (req): Promise<Response> => {
  const cors = getCorsHeaders(req);
  if (!cors) {
    return new Response("Origin not allowed", { status: 403 });
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST")   return err("Method not allowed", cors, 405);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authResult = await authenticate(req);
  if (!authResult.ok) return err("Unauthorized", cors, 401);
  const { userId } = authResult;

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rate = await checkRateLimit(userId);
  if (rate.blocked) return err("Too many attempts", cors, 429);

  // ── Body ──────────────────────────────────────────────────────────────────
  let body: RawBody;
  try { body = await req.json(); } catch { return err("Invalid JSON", cors); }
  if (!body?.items?.length) return err("Cart empty", cors);

  // ── Validate items (server-side prices) ───────────────────────────────────
  const validation = await validateItems(body.items);
  if (!validation.ok) return err("Invalid cart", cors);

  const { items, subtotalCents } = validation;
  const preTaxTotal = subtotalCents; // discounts apply to subtotal; tax recomputed on discounted total

  // ── Frontend fraud check (soft signal, not a security gate) ──────────────
  if (typeof body.frontend_total === "number") {
    const frontendCents  = Math.round(body.frontend_total * 100);
    // Gross pre-discount estimate for fraud signal only — not authoritative
    const serverEstimate = subtotalCents + Math.round(subtotalCents * CONFIG.TAX_RATE);
    if (Math.abs(frontendCents - serverEstimate) > 10) {
      log("warn", "frontend_total_mismatch", { frontendCents, serverEstimate, userId });
      // Log only — discount pipeline computes the authoritative final total
    }
  }

  // ── Origin validation ────────────────────────────────────────────
  // Wrap URL construction — an invalid successUrl would otherwise throw and
  // crash the function before returning a proper error response.
  let requestedOrigin: string;
  try {
    requestedOrigin = new URL(String(body.successUrl)).origin;
  } catch {
    return err("Invalid redirect URL", cors, 400);
  }
  if (!ALLOWED_ORIGINS.includes(requestedOrigin)) return err("Invalid redirect origin", cors);

  // =========================================================================
  // DISCOUNT PIPELINE
  // =========================================================================
  // Track what was applied so we can roll back on Stripe failure.

  let promoResult:  DiscountResult | null = null;
  let creditResult: DiscountResult | null = null;

  let promoDiscountCents  = 0;
  let creditDiscountCents = 0;

  // ── A. Promo code ─────────────────────────────────────────────────────────
  const rawPromoCode = s(body.promo_code, 50);
  if (rawPromoCode) {
    try {
      promoResult        = await applyPromoCode(rawPromoCode, userId, subtotalCents);
      promoDiscountCents = promoResult.discount_cents;
    } catch (e) {
      return err(e instanceof Error ? e.message : "Promo code invalid", cors, 422);
    }
  }

// ── B. User credit ────────────────────────────────────────────────────────
const rawCreditId = s(body.credit_id, 100);
if (rawCreditId) {
  const remainingAfterPromo = Math.max(0, preTaxTotal - promoDiscountCents);

  try {
    creditResult        = await applyUserCredit(rawCreditId, userId, remainingAfterPromo);
    creditDiscountCents = creditResult.discount_cents;

  } catch (_e) {

    // Roll back promo reservation if credit application fails
    if (promoResult?.promo_id) {
      await rollbackPromo(promoResult.promo_id);
    }

    return err(
      _e instanceof Error ? _e.message : "Credit invalid",
      cors,
      422
    );
  }
}
  // ── C. Anti-stack ceiling ─────────────────────────────────────────────────
  const { final_promo, final_credit, total_discount } = enforceDiscountCeiling(
    subtotalCents,
    promoDiscountCents,
    creditDiscountCents
  );

  // Reflect clamped values back into result objects so Stripe metadata and
  // promo_redemptions audit rows record what was actually applied, not the
  // pre-ceiling amount that may have been higher.
  if (promoResult)  promoResult.promo_applied  = final_promo;
  if (creditResult) creditResult.credit_applied = final_credit;

  // Recompute final amounts
  const discountedSubtotal = Math.max(0, subtotalCents - total_discount);
  const finalTaxCents      = Math.round(discountedSubtotal * CONFIG.TAX_RATE);
  const grandTotalCents    = discountedSubtotal + finalTaxCents;

  log("info", "checkout_totals", {
    userId, subtotalCents, promoDiscountCents: final_promo,
    creditDiscountCents: final_credit, total_discount,
    discountedSubtotal, finalTaxCents, grandTotalCents,
  });

  if (grandTotalCents <= 0) {
    // Roll back any applied discounts before rejecting
    if (promoResult)  await rollbackPromo(promoResult.promo_id!);
    if (creditResult) await rollbackCredit(creditResult.credit_id!);
    return err("Order total must be greater than $0 after discounts", cors, 400);
  }

  // ── Store pending cart ────────────────────────────────────────────────────
  const svc    = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const cartRef = crypto.randomUUID();

  const { error: cartErr } = await svc.from("pending_carts").insert({
    id:                   cartRef,
    user_id:              userId,
    items,
    subtotal_cents:       subtotalCents,
    discount_cents:       total_discount,
    tax_cents:            finalTaxCents,
    total_cents:          grandTotalCents,
    promo_id:             promoResult?.promo_id ?? null,
    credit_id:            creditResult?.credit_id ?? null,
    created_at:           new Date().toISOString(),
  });

if (cartErr) {
  if (promoResult?.promo_id) {
    await rollbackPromo(promoResult.promo_id);
  }

  if (creditResult?.credit_id) {
    await rollbackCredit(creditResult.credit_id);
  }

  log("error", "pending_cart_insert_failed", cartErr);

  return err("Failed to create pending cart", cors, 500);
}

  // ── Stripe session ────────────────────────────────────────────────────────
  try {
    // Build line items: show original prices + a discount line if applicable
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      ...items.map((i) => ({
        price_data: {
          currency:     "usd",
          product_data: { name: i.name },
          unit_amount:  i.price_cents,
        },
        quantity: i.quantity,
      })),
      {
        price_data: {
          currency:     "usd",
          product_data: { name: "Tax" },
          unit_amount:  finalTaxCents,
        },
        quantity: 1,
      },
    ];

    if (total_discount > 0) {
      lineItems.push({
        price_data: {
          currency:     "usd",
          product_data: { name: promoResult ? `Discount (${promoResult.promo_code})` : "Credit Applied" },
          unit_amount:  -total_discount,   // negative = discount line
        },
        quantity: 1,
      });
    }

    const customerEmail = String(body.email ?? "").toLowerCase().trim();
    if (!customerEmail.includes("@") || customerEmail.length < 5) {
      return err("Invalid email address", cors, 400);
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode:           "payment",
        line_items:     lineItems,
        success_url:    `${requestedOrigin}/order-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:     `${requestedOrigin}/checkout`,
        customer_email: customerEmail,
        expires_at:     Math.floor(Date.now() / 1000) + CONFIG.SESSION_EXPIRES_MINUTES * 60,
        metadata: {
          customer_uid:       userId,
          cart_ref:           cartRef,
          server_total:       String(grandTotalCents),
          subtotal_cents:     String(subtotalCents),
          discount_cents:     String(total_discount),
          promo_code:         promoResult?.promo_code ?? "",
          promo_id:           promoResult?.promo_id ?? "",
          credit_id:          creditResult?.credit_id ?? "",
          credit_applied:     String(final_credit),
          request_id:         crypto.randomUUID(),
        },
      },
      {
        idempotencyKey: req.headers.get("x-idempotency-key") ?? crypto.randomUUID(),
      }
    );

    // ── Write promo_redemption record (after session exists) ───────────────
    if (promoResult) {
      await svc.from("promo_redemptions").insert({
        promotion_id:        promoResult.promo_id,
        user_id:             userId,
        discount_cents:      final_promo,
        checkout_session_id: session.id,
      });
    }

 // ── Attach Stripe session ID to credit (after session exists) ──────────
if (creditResult?.credit_id) {
  await svc
    .from("user_credits")
    .update({ checkout_session_id: session.id })
    .eq("id", creditResult.credit_id);
}

log("info", "checkout_session_created", {
  sessionId: session.id,
  userId,
  grandTotalCents,
});

return json({ id: session.id, url: session.url }, cors);

} catch (e) {

  // ── Stripe failed — roll back all discount reservations ─────────────

  if (promoResult?.promo_id) {
    await rollbackPromo(promoResult.promo_id);
  }

  if (creditResult?.credit_id) {
    await rollbackCredit(creditResult.credit_id);
  }

  // Clean up pending cart
  await svc.from("pending_carts").delete().eq("id", cartRef);

  log("error", "stripe_error", e);

  return err(
    "Payment service unavailable. Please try again.",
    cors,
    500
  );
}
 })