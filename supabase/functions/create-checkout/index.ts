// ============================================================================
// CREATE CHECKOUT — PRODUCTION GRADE (SECURE + VALIDATED + RATE LIMITED)
// ============================================================================

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// ============================================================================
// CONFIG
// ============================================================================
const CONFIG = {
  MAX_ITEMS: 100,
  MIN_AMOUNT_CENTS: 500,
  MAX_AMOUNT_CENTS: 100_000_000,
  SESSION_EXPIRES_MINUTES: 30,

  MAX_ATTEMPTS_PER_WINDOW: 10,
  WINDOW_MINUTES: 5,
  BLOCK_MINUTES: 15,
} as const;

// ============================================================================
// ENV
// ============================================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
  throw new Error("Missing required environment variables");
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2026-01-28.clover",
  httpClient: Stripe.createFetchHttpClient(),
})
// ============================================================================
// ALLOWED ORIGINS (PRODUCTION SAFE)
// ============================================================================
const ALLOWED_ORIGINS = [
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app", // ← ADD THIS
  "http://localhost:3000",
  "http://localhost:3001",
];

// ============================================================================
// TYPES
// ============================================================================
interface RawItem {
  id: unknown;
  quantity: unknown;
  notes?: unknown;
}

interface RawBody {
  items: RawItem[];
  email: unknown;
  successUrl: unknown;
  cancelUrl: unknown;
  frontend_total?: number;
}

interface ValidatedItem {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
  notes?: string;
}

// ============================================================================
// CORS (SECURE)
// ============================================================================
function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";

  if (!ALLOWED_ORIGINS.includes(origin)) {
    return null;
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-idempotency-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// ============================================================================
// UTIL
// ============================================================================
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

function s(v: unknown, max: number) {
  return String(v ?? "").slice(0, max).trim();
}

function n(v: unknown, min: number, max: number) {
  const x = Number(v);
  if (isNaN(x)) return min;
  return Math.max(min, Math.min(max, Math.round(x)));
}

// ============================================================================
// AUTH
// ============================================================================
async function authenticate(req: Request) {
  const authHeader = req.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false };
  }

  const token = authHeader.replace("Bearer ", "");

  // 👇 USE ANON KEY TO VALIDATE USER JWT
  const anonClient = createClient(
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY")!, // make sure this exists in Edge Secrets
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: { persistSession: false },
    }
  );

  const { data: { user }, error } = await anonClient.auth.getUser();

  if (error || !user) {
    return { ok: false };
  }

  return { ok: true, userId: user.id };
}

// ============================================================================
// RATE LIMITING
// ============================================================================
async function checkRateLimit(userId: string) {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date();
  const windowStart = new Date(now.getTime() - CONFIG.WINDOW_MINUTES * 60 * 1000);

  const { data } = await supabase
    .from("checkout_rate_limits")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (data?.blocked_until && new Date(data.blocked_until) > now) {
    return { blocked: true };
  }

  const attempts =
    !data || new Date(data.last_attempt) < windowStart
      ? 1
      : data.attempts + 1;

  const blocked = attempts > CONFIG.MAX_ATTEMPTS_PER_WINDOW;

  await supabase.from("checkout_rate_limits").upsert({
    user_id: userId,
    attempts,
    last_attempt: now,
    blocked_until: blocked
      ? new Date(now.getTime() + CONFIG.BLOCK_MINUTES * 60 * 1000)
      : null,
  });

  return { blocked };
}

// ============================================================================
// PRICE VALIDATION
// ============================================================================
type ValidationResult =
  | { ok: false }
  | { ok: true; items: ValidatedItem[]; total: number };

async function validateItems(
  rawItems: RawItem[]
): Promise<ValidationResult> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (!rawItems.length || rawItems.length > CONFIG.MAX_ITEMS) {
    return { ok: false };
  }

  const ids = rawItems.map((i) => s(i.id, 100));

  const { data: products } = await supabase
    .from("menu_items")
    .select("id,name,price")
    .in("id", ids);

  if (!products || products.length !== ids.length) {
    return { ok: false };
  }

  const map = new Map(products.map((p) => [p.id, p]));

  let total = 0;
  const items: ValidatedItem[] = [];

  for (const raw of rawItems) {
    const product = map.get(s(raw.id, 100));
    if (!product) return { ok: false };

    const qty = n(raw.quantity, 1, 100);
    const cents = Math.round(Number(product.price) * 100);

    total += cents * qty;

    items.push({
      id: product.id,
      name: product.name,
      price_cents: cents,
      quantity: qty,
      notes: raw.notes ? s(raw.notes, 500) : undefined,
    });
  }

  if (
    total < CONFIG.MIN_AMOUNT_CENTS ||
    total > CONFIG.MAX_AMOUNT_CENTS
  ) {
    return { ok: false };
  }

  return { ok: true, items, total };
}
// ============================================================================
// MAIN
// ============================================================================
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (!cors) {
    return new Response("Origin not allowed", { status: 403 });
  }

  if (req.method === "OPTIONS") {
  return new Response(null, { status: 204, headers: cors });
}

  if (req.method !== "POST") {
    return err("Method not allowed", cors, 405);
  }

  // ================= AUTH =================
  const authResult = await authenticate(req);
  if (!authResult.ok) return err("Unauthorized", cors, 401);
  const userId = authResult.userId!;

  // ================= RATE LIMIT =================
  const rate = await checkRateLimit(userId);
  if (rate.blocked) return err("Too many attempts", cors, 429);

  // ================= BODY =================
  let body: RawBody;
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON", cors);
  }

  if (!body?.items?.length) {
    return err("Cart empty", cors);
  }

  // ================= VALIDATE =================
const validation = await validateItems(body.items);
if (!validation.ok) return err("Invalid cart", cors);

const { items, total: subtotalCents } = validation;

const TAX_RATE = 0.08;
const taxCents = Math.round(subtotalCents * TAX_RATE);
const grandTotalCents = subtotalCents + taxCents;

  // ================= FRONTEND FRAUD CHECK =================
  if (typeof body.frontend_total === "number") {
  const frontendCents = Math.round(body.frontend_total * 100);

  if (Math.abs(frontendCents - grandTotalCents) > 10) {
    return err("Cart mismatch", cors);
  }
}
  // ================= ORIGIN VALIDATION =================
  const requestedOrigin = new URL(String(body.successUrl)).origin;
  if (!ALLOWED_ORIGINS.includes(requestedOrigin)) {
    return err("Invalid redirect origin", cors);
  }

  // ================= STORE CART SERVER-SIDE =================
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const cartRef = crypto.randomUUID(); 

  const { error: cartInsertError } = await supabase
  .from("pending_carts")
  .insert({
    id: cartRef,
    user_id: userId,
    items,
    total_cents: grandTotalCents,
    created_at: new Date().toISOString(),
  });

if (cartInsertError) {
  log("error", "PENDING CART INSERT FAILED", cartInsertError);
  return err("Failed to create pending cart", cors, 500);
}

log("info", "Pending cart created", { cartRef, userId });

  // ================= STRIPE SESSION =================
  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
  ...items.map((i) => ({
    price_data: {
      currency: "usd",
      product_data: { name: i.name },
      unit_amount: i.price_cents,
    },
    quantity: i.quantity,
  })),
  {
    price_data: {
      currency: "usd",
      product_data: { name: "Tax" },
      unit_amount: taxCents,
    },
    quantity: 1,
  },
],
        success_url: `${requestedOrigin}/order-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${requestedOrigin}/checkout`,
        customer_email: String(body.email).toLowerCase(),
        expires_at:
          Math.floor(Date.now() / 1000) +
          CONFIG.SESSION_EXPIRES_MINUTES * 60,
        metadata: {
          customer_uid: userId,
          cart_ref: cartRef,
         server_total: String(grandTotalCents), 
          request_id: crypto.randomUUID(),
        },
      },
      {
        idempotencyKey:
          req.headers.get("x-idempotency-key") ?? crypto.randomUUID(),
      }
    );

    return json(
      {
        id: session.id,
        url: session.url,
      },
      cors
    );
  } catch (e) {
    log("error", "stripe_error", e);
    return err("Stripe failed", cors, 500);
  }
});