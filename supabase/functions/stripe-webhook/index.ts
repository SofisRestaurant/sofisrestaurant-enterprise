// =============================================================================
// PATH: supabase/functions/stripe-webhook/index.ts
// =============================================================================
// stripe-webhook — Production Hardened (2026)
//
// Handles:
//   checkout.session.completed      → create/confirm order, loyalty, transactions
//   payment_intent.succeeded        → backup order confirmation + transaction upsert
//   payment_intent.payment_failed   → mark order failed, admin notification
//   payment_intent.canceled         → mark order canceled
//   charge.refunded                 → record refund, update order, admin alert
//   charge.dispute.created          → security event + admin alert
//   charge.dispute.updated          → track dispute progress
//   charge.dispute.closed           → resolve dispute outcome
//   checkout.session.expired        → clean up pending cart
//
// Security:
//   - Stripe-Signature HMAC-SHA256 verification (constructEventAsync)
//   - Configurable replay-attack tolerance window (default: 5 minutes)
//   - Strict idempotency via stripe_events (unique constraint on id)
//   - On handler exception: unclaim event + return 503 → Stripe will retry safely
//   - Service-role only; no CORS headers (server-to-server only)
//   - Zero PII in structured JSON logs
//   - Deterministic side-effect ordering with parallelization where safe
//
// Idempotency model:
//   1. Claim event by inserting into stripe_events (unique id)
//   2. On conflict → already processed → return 200 immediately
//   3. Run handler
//   4. On unhandled exception → DELETE claim + return 503 → Stripe retries
//   5. On soft failure (no order found, partial skip) → return 200, log warn
//
// All order-creation paths are idempotent via UNIQUE(stripe_session_id).
// All side-effects (loyalty, promo, credit, transactions) use per-resource
// idempotency keys so concurrent webhook + finalize-order never double-awards.
// =============================================================================

import Stripe from "stripe";
import { createServiceClient } from "../_shared/supabase.ts";
import type { Database, Json } from "../_shared/database.types.ts";
import {
  parsePricingSnapshot,
  buildLegacyPricingSnapshotFromPendingCart,
  hashPricingSnapshot,
  type OrderType,
} from "../_shared/pricing.ts";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Db = Database;
type DbClient = ReturnType<typeof createServiceClient>;
type OrderInsert = Db["public"]["Tables"]["orders"]["Insert"];
type FinancialTxInsert = Db["public"]["Tables"]["financial_transactions"]["Insert"];
type OrderEventInsert = Db["public"]["Tables"]["order_events"]["Insert"];
type AdminNotifInsert = Db["public"]["Tables"]["admin_notifications"]["Insert"];
type SecurityEventInsert = Db["public"]["Tables"]["security_events"]["Insert"];
type StripeEventInsert = Db["public"]["Tables"]["stripe_events"]["Insert"];

// Extended pending_carts for schema-lagging columns (finalize-order pattern)
type PendingCartExtended = Db["public"]["Tables"]["pending_carts"]["Row"] & {
  pricing_snapshot?: Json;
  pricing_hash?: string | null;
  consumed_at?: string | null;
  currency?: string | null
  stripe_session_id?: string | null
};

type OrderLocated = {
  id: string;
  amount_total: number;
  payment_status: string;
  status: string;
  customer_uid: string | null;
};

type RefundKind = "refund" | "partial_refund";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const WEBHOOK_TOLERANCE_SECONDS = 300; // 5-minute replay-attack window
const MAX_BODY_BYTES = 524_288; // 512 KB — Stripe events are typically < 100 KB

// MUST match finalize-order prefix → shared idempotency across both code paths
const LOYALTY_IDEMPOTENCY_PREFIX = "finalize-backfill:";
const MAX_AWARD_AMOUNT_CENTS = 500_000;

const DEFAULT_STRIPE_API_VERSION = "2026-02-25.clover";

// Canonical DB status strings
const DB_PMT_PAID = "paid";
const DB_PMT_FAILED = "failed";
const DB_PMT_REFUNDED = "refunded";
const DB_PMT_PARTIAL_REFUND = "partially_refunded";
const DB_PMT_CANCELED = "canceled";
const DB_ORD_CONFIRMED = "confirmed";
const DB_ORD_CANCELED = "canceled";

// ─────────────────────────────────────────────────────────────
// Env
// ─────────────────────────────────────────────────────────────

function mustEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v?.trim()) throw new Error(`Missing required env: ${name}`);
  return v.trim();
}

function optEnv(name: string): string | null {
  const v = Deno.env.get(name);
  return v?.trim() || null;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function prefix(value: string | null | undefined, len = 8): string | null {
  if (!value) return null;
  return value.slice(0, len);
}

function asErr(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}


function pickMeta(meta: Stripe.Metadata | null | undefined, ...keys: string[]): string | null {
  if (!meta) return null;
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function parseCents(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function normCurrency(v: unknown): string {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s || "usd";
}

function normalizeOrderType(raw: string | null | undefined): OrderType {
  if (raw === "pickup" || raw === "delivery" || raw === "dine_in") return raw;
  return "pickup";
}

function clampCents(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.min(MAX_AWARD_AMOUNT_CENTS, Math.max(0, Math.trunc(n)));
}

function log(
  level: "info" | "warn" | "error",
  event: string,
  meta: Record<string, unknown>,
): void {
  console.log(JSON.stringify({
    level, event,
    service: "stripe-webhook",
    ...meta,
    ts: nowIso(),
  }));
}

// ─────────────────────────────────────────────────────────────
// Stripe client
// ─────────────────────────────────────────────────────────────

function isValidApiVersion(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(\.[a-zA-Z0-9_-]+)?$/.test(v);
}

const _envApiVer = optEnv("STRIPE_API_VERSION") ?? "";
const STRIPE_API_VERSION = (
  isValidApiVersion(_envApiVer) ? _envApiVer : DEFAULT_STRIPE_API_VERSION
) as Stripe.LatestApiVersion;

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (_stripe) return _stripe;
  _stripe = new Stripe(mustEnv("STRIPE_SECRET_KEY"), {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });
  return _stripe;
}

// ─────────────────────────────────────────────────────────────
// Idempotency — stripe_events
// ─────────────────────────────────────────────────────────────

type ClaimResult = "claimed" | "duplicate" | "db_error";

async function claimEvent(
  db: DbClient,
  eventId: string,
  eventType: string,
): Promise<ClaimResult> {
  const row: StripeEventInsert = {
    id: eventId,
    type: eventType,
    created_at: nowIso(),
  };

  const { error } = await db.from("stripe_events").insert(row);
  if (!error) return "claimed";

  // Postgres unique-violation code
  if (error.code === "23505") return "duplicate";

  return "db_error";
}

async function unclaimEvent(db: DbClient, eventId: string): Promise<void> {
  try {
    await db.from("stripe_events").delete().eq("id", eventId);
  } catch {
    // best-effort unclaim; if this fails Stripe retries are blocked for this event
  }
}

// ─────────────────────────────────────────────────────────────
// DB reads — locate order
// ─────────────────────────────────────────────────────────────

async function findOrderBySessionId(
  db: DbClient,
  sessionId: string,
): Promise<OrderLocated | null> {
  const { data } = await db
    .from("orders")
    .select("id,amount_total,payment_status,status,customer_uid")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  return (data as OrderLocated | null) ?? null;
}

async function findOrderByPaymentIntentId(
  db: DbClient,
  paymentIntentId: string,
): Promise<OrderLocated | null> {
  const { data } = await db
    .from("orders")
    .select("id,amount_total,payment_status,status,customer_uid")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  return (data as OrderLocated | null) ?? null;
}

// ─────────────────────────────────────────────────────────────
// DB read — pending cart
// ─────────────────────────────────────────────────────────────

const CART_SELECT =
  "id,user_id,items,subtotal_cents,discount_cents,tax_cents,total_cents,promo_id,credit_id,pricing_snapshot,pricing_hash,currency,consumed_at,stripe_session_id";

async function loadPendingCart(
  db: DbClient,
  cartRef: string | null,
  sessionId: string,
  userId: string,
): Promise<PendingCartExtended | null> {
  if (cartRef) {
    const { data } = await db
      .from("pending_carts")
      .select(CART_SELECT)
      .eq("id", cartRef)
      .maybeSingle();
    if (data) return data as unknown as PendingCartExtended;
  }

  const { data } = await db
    .from("pending_carts")
    .select(CART_SELECT)
    .eq("stripe_session_id", sessionId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as unknown as PendingCartExtended) ?? null;
}

// ─────────────────────────────────────────────────────────────
// Order creation from Stripe session (idempotent)
// ─────────────────────────────────────────────────────────────

async function createOrderFromSession(args: {
  db: DbClient;
  session: Stripe.Checkout.Session;
  userId: string;
  requestId: string;
}): Promise<OrderLocated | null> {
  const { db, session, userId, requestId } = args;

  const cartRef = pickMeta(session.metadata, "pending_cart_id", "cart_ref", "cart_id");
  const cart = await loadPendingCart(db, cartRef, session.id, userId);

  if (!cart) {
    log("warn", "webhook_pending_cart_not_found", {
      requestId,
      sessionId: prefix(session.id),
      cartRef: prefix(cartRef),
      userId: prefix(userId),
    });
  }

  const orderType = normalizeOrderType(pickMeta(session.metadata, "order_type"));
  const currency = normCurrency(session.currency ?? cart?.currency ?? "usd");

  // Build authoritative pricing snapshot
  let snapshot = cart ? parsePricingSnapshot(cart.pricing_snapshot ?? null) : null;

  if (!snapshot && cart) {
    try {
      snapshot = buildLegacyPricingSnapshotFromPendingCart({
        userId,
        currency,
        orderType,
        orderNotes: null,
        items: (cart.items as Json) ?? [],
        subtotalCents: cart.subtotal_cents ?? session.amount_subtotal ?? 0,
        discountCents: cart.discount_cents ?? 0,
        taxCents: cart.tax_cents ?? session.total_details?.amount_tax ?? 0,
        totalCents: cart.total_cents ?? session.amount_total ?? 0,
        promoId: cart.promo_id ?? null,
        creditId: cart.credit_id ?? null,
      });
    } catch (err) {
      log("warn", "webhook_legacy_snapshot_failed", {
        requestId,
        error: asErr(err),
        sessionId: prefix(session.id),
      });
    }
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

  const amountTotal = session.amount_total ?? snapshot?.totalCents ?? 0;
  const amountSubtotal = session.amount_subtotal ?? snapshot?.subtotalCents ?? 0;
  const amountTax = session.total_details?.amount_tax ?? snapshot?.taxCents ?? 0;

  const promoId = pickMeta(session.metadata, "promo_id") ?? snapshot?.promoId ?? null;
  const creditId = pickMeta(session.metadata, "credit_id") ?? snapshot?.creditId ?? null;
  const appliedCampaignIds = snapshot?.appliedCampaignIds ?? [];

  let pricingHash: string | null = pickMeta(session.metadata, "pricing_hash") ?? cart?.pricing_hash ?? null;
  if (snapshot && !pricingHash) {
    try { pricingHash = await hashPricingSnapshot(snapshot); } catch { /* non-critical */ }
  }

  const orderMeta: Json = {
    source: "stripe-webhook",
    request_id: requestId,
    stripe_api_version: STRIPE_API_VERSION,
    pending_cart_id: cartRef ?? cart?.id ?? null,
    stripe_session_status: session.status ?? null,
    stripe_payment_status: session.payment_status ?? null,
    promo_id: promoId,
    credit_id: creditId,
    applied_campaign_ids: appliedCampaignIds,
    pricing_hash: pricingHash,
    pricing_snapshot: snapshot ?? null,
    stripe_amount_total: amountTotal,
    stripe_currency: currency,
  };

  const insert: OrderInsert = {
    stripe_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    order_type: "food",
    customer_uid: userId,
    customer_email: session.customer_details?.email ?? null,
    customer_name: session.customer_details?.name ?? null,
    customer_phone: session.customer_details?.phone ?? null,
    amount_subtotal: amountSubtotal,
    amount_tax: amountTax,
    amount_shipping: 0,
    amount_total: amountTotal,
    currency,
    payment_status: DB_PMT_PAID,
    status: DB_ORD_CONFIRMED,
    cart_items: (cart?.items as Json) ?? null,
    metadata: orderMeta,
    notes: snapshot?.orderNotes ?? null,
  };

  const { data: inserted, error: insertErr } = await db
    .from("orders")
    .insert(insert)
    .select("id,amount_total,payment_status,status,customer_uid")
    .maybeSingle();

  if (insertErr && insertErr.code !== "23505" /* unique_violation */) {
    log("error", "webhook_order_insert_failed", {
      requestId,
      sessionId: prefix(session.id),
      code: insertErr.code ?? null,
      message: insertErr.message,
    });
    return null;
  }

  if (inserted?.id) {
    // Mark cart consumed (best-effort)
    if (cart?.id) {
      await db
        .from("pending_carts")
        .update({ consumed_at: nowIso() } as Record<string, unknown>)
        .eq("id", cart.id)
        .is("consumed_at", null);
    }

    log("info", "webhook_order_created", {
      requestId,
      orderId: prefix(inserted.id),
      sessionId: prefix(session.id),
      amountTotal,
    });

    return inserted as OrderLocated;
  }

  // Unique conflict: race with finalize-order → read the existing row
  const existing = await findOrderBySessionId(db, session.id);
  if (existing) {
    log("info", "webhook_order_conflict_read", {
      requestId,
      orderId: prefix(existing.id),
      sessionId: prefix(session.id),
    });
  }
  return existing;
}

// ─────────────────────────────────────────────────────────────
// Side effect: financial transaction (idempotent by order + type)
// ─────────────────────────────────────────────────────────────

async function upsertPaymentTransaction(args: {
  db: DbClient;
  orderId: string;
  session: Stripe.Checkout.Session;
  requestId: string;
}): Promise<void> {
  const { db, orderId, session, requestId } = args;

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

  if (!paymentIntentId || !session.amount_total) return;

  try {
    const { data: existing } = await db
      .from("financial_transactions")
      .select("id")
      .eq("order_id", orderId)
      .eq("transaction_type", "payment")
      .limit(1)
      .maybeSingle();

    if (existing?.id) return;

    const row: FinancialTxInsert = {
      order_id: orderId,
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: null,
      transaction_type: "payment",
      amount: session.amount_total,
      currency: normCurrency(session.currency),
      metadata: {
        source: "stripe-webhook",
        request_id: requestId,
        session_id: session.id,
        session_status: session.status ?? null,
        payment_status: session.payment_status ?? null,
      } as Json,
    };

    const { error } = await db.from("financial_transactions").insert(row);
    if (error) {
      log("warn", "webhook_payment_tx_failed", {
        requestId,
        orderId: prefix(orderId),
        code: error.code ?? null,
      });
    }
  } catch (err) {
    log("warn", "webhook_payment_tx_exception", {
      requestId,
      orderId: prefix(orderId),
      error: asErr(err),
    });
  }
}

async function upsertPaymentIntentTransaction(args: {
  db: DbClient;
  orderId: string;
  pi: Stripe.PaymentIntent;
  eventId: string;
  requestId: string;
}): Promise<void> {
  const { db, orderId, pi, eventId, requestId } = args;

  try {
    const { data: existing } = await db
      .from("financial_transactions")
      .select("id")
      .eq("order_id", orderId)
      .eq("transaction_type", "payment")
      .limit(1)
      .maybeSingle();

    if (existing?.id) return;

    const latestCharge = pi.latest_charge;
    const chargeId = typeof latestCharge === "string"
      ? latestCharge
      : (latestCharge as Stripe.Charge | null)?.id ?? null;

    const row: FinancialTxInsert = {
      order_id: orderId,
      stripe_payment_intent_id: pi.id,
      stripe_charge_id: chargeId,
      transaction_type: "payment",
      amount: pi.amount_received,
      currency: normCurrency(pi.currency),
      metadata: {
        source: "stripe-webhook",
        request_id: requestId,
        event_id: eventId,
        event_type: "payment_intent.succeeded",
        charge_id: chargeId,
      } as Json,
    };

    const { error } = await db.from("financial_transactions").insert(row);
    if (error) {
      log("warn", "webhook_pi_tx_failed", {
        requestId,
        orderId: prefix(orderId),
        code: error.code ?? null,
      });
    }
  } catch (err) {
    log("warn", "webhook_pi_tx_exception", {
      requestId,
      orderId: prefix(orderId),
      error: asErr(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Side effect: loyalty backfill (idempotent via shared key)
// ─────────────────────────────────────────────────────────────

async function backfillLoyaltyIfMissing(args: {
  db: DbClient;
  userId: string;
  orderId: string;
  amountCents: number;
  requestId: string;
}): Promise<void> {
  const { db, userId, orderId, requestId } = args;
  const amountCents = clampCents(args.amountCents);
  if (amountCents <= 0) return;

  try {
    const { data: account, error: accountErr } = await db
      .from("loyalty_accounts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (accountErr || !account?.id) {
      log("warn", "webhook_loyalty_no_account", {
        requestId,
        userId: prefix(userId),
        code: accountErr?.code ?? null,
      });
      return;
    }

    // Same idempotency key as finalize-order → exactly-once across both paths
    const idempotencyKey = `${LOYALTY_IDEMPOTENCY_PREFIX}${orderId}`;

    const { data: existing } = await db
      .from("loyalty_ledger")
      .select("id")
      .eq("account_id", account.id)
      .or(`reference_id.eq.${orderId},idempotency_key.eq.${idempotencyKey}`)
      .limit(1)
      .maybeSingle();

    if (existing?.id) return;

    const { error } = await db.rpc("v2_award_points", {
      p_account_id: account.id,
      p_admin_id: userId,
      p_amount_cents: amountCents,
      p_idempotency_key: idempotencyKey,
      p_reference_id: orderId,
    });

    if (error) {
      log("warn", "webhook_loyalty_award_failed", {
        requestId,
        orderId: prefix(orderId),
        code: error.code ?? null,
        message: error.message,
      });
      return;
    }

    log("info", "webhook_loyalty_awarded", {
      requestId,
      orderId: prefix(orderId),
      accountId: prefix(account.id),
      amountCents,
    });
  } catch (err) {
    log("error", "webhook_loyalty_crash", {
      requestId,
      orderId: prefix(orderId),
      error: asErr(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Side effect: promo redemption (idempotent by session)
// ─────────────────────────────────────────────────────────────

async function recordPromoRedemptionIfMissing(args: {
  db: DbClient;
  promotionId: string | null;
  userId: string;
  sessionId: string;
  discountCents: number;
  orderTotalCents: number;
  requestId: string;
}): Promise<void> {
  const { db, promotionId, userId, sessionId, discountCents, orderTotalCents, requestId } = args;
  if (!promotionId || discountCents <= 0) return;

  try {
    const { data: existing } = await db
      .from("promo_redemptions")
      .select("id")
      .eq("promotion_id", promotionId)
      .eq("user_id", userId)
      .eq("checkout_session_id", sessionId)
      .limit(1)
      .maybeSingle();

    if (existing?.id) return;

    const { data: promo } = await db
      .from("promotions")
      .select("channel")
      .eq("id", promotionId)
      .maybeSingle();

    const { error } = await db.from("promo_redemptions").insert({
      promotion_id: promotionId,
      user_id: userId,
      checkout_session_id: sessionId,
      discount_cents: discountCents,
      order_total_cents: orderTotalCents,
      channel: promo?.channel ?? null,
    });

    if (error) {
      log("warn", "webhook_promo_redemption_failed", {
        requestId,
        promotionId: prefix(promotionId),
        code: error.code ?? null,
      });
    }
  } catch (err) {
    log("warn", "webhook_promo_redemption_exception", {
      requestId,
      promotionId: prefix(promotionId),
      error: asErr(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Side effect: credit mark used (idempotent by used flag)
// ─────────────────────────────────────────────────────────────

async function markCreditUsedIfPending(args: {
  db: DbClient;
  creditId: string | null;
  userId: string;
  sessionId: string;
  requestId: string;
}): Promise<void> {
  const { db, creditId, userId, sessionId, requestId } = args;
  if (!creditId) return;

  try {
    const { data, error } = await db
      .from("user_credits")
      .select("id,user_id,used,checkout_session_id")
      .eq("id", creditId)
      .maybeSingle();

    if (error || !data || data.user_id !== userId) return;
    if (data.used) return;

    const { error: updateErr } = await db
      .from("user_credits")
      .update({
        used: true,
        used_at: nowIso(),
        checkout_session_id: sessionId,
      })
      .eq("id", creditId)
      .eq("user_id", userId)
      .eq("used", false);

    if (updateErr) {
      log("warn", "webhook_credit_mark_failed", {
        requestId,
        creditId: prefix(creditId),
        code: updateErr.code ?? null,
      });
    }
  } catch (err) {
    log("warn", "webhook_credit_exception", {
      requestId,
      creditId: prefix(creditId),
      error: asErr(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Side effect: order events
// ─────────────────────────────────────────────────────────────

async function emitOrderEvent(
  db: DbClient,
  orderId: string,
  userId: string | null,
  eventType: string,
  eventData: Json,
  requestId: string,
): Promise<void> {
  try {
    const row: OrderEventInsert = {
      order_id: orderId,
      user_id: userId,
      event_type: eventType,
      event_data: eventData,
    };
    const { error } = await db.from("order_events").insert(row);
    if (error) {
      log("warn", "webhook_order_event_failed", {
        requestId,
        orderId: prefix(orderId),
        eventType,
        code: error.code ?? null,
      });
    }
  } catch {
    // best-effort; never throw
  }
}

// ─────────────────────────────────────────────────────────────
// Side effect: admin notifications
// ─────────────────────────────────────────────────────────────

async function notify(
  db: DbClient,
  orderId: string,
  type: string,
  message: string,
  requestId: string,
): Promise<void> {
  try {
    const row: AdminNotifInsert = {
      order_id: orderId,
      type,
      message,
      read: false,
    };
    const { error } = await db.from("admin_notifications").insert(row);
    if (error) {
      log("warn", "webhook_admin_notif_failed", {
        requestId,
        orderId: prefix(orderId),
        type,
        code: error.code ?? null,
      });
    }
  } catch {
    // best-effort
  }
}

// ─────────────────────────────────────────────────────────────
// Side effect: security events
// ─────────────────────────────────────────────────────────────

async function logSecurityEvent(
  db: DbClient,
  eventType: string,
  metadata: Json,
  requestId: string,
): Promise<void> {
  try {
    const row: SecurityEventInsert = {
      event_type: eventType,
      metadata,
    };
    const { error } = await db.from("security_events").insert(row);
    if (error) {
      log("warn", "webhook_security_event_failed", {
        requestId,
        eventType,
        code: error.code ?? null,
      });
    }
  } catch {
    // best-effort
  }
}

// ─────────────────────────────────────────────────────────────
// Handler: checkout.session.completed
// ─────────────────────────────────────────────────────────────

async function handleCheckoutSessionCompleted(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;

  // Guard: only process paid sessions
  if (session.payment_status !== "paid" && session.status !== "complete") {
    log("info", "webhook_session_not_paid", {
      requestId,
      sessionId: prefix(session.id),
      paymentStatus: session.payment_status,
      status: session.status,
    });
    return;
  }

  const userId = pickMeta(session.metadata, "user_id", "customer_uid", "uid");
  if (!userId) {
    log("warn", "webhook_session_no_user_id", {
      requestId,
      sessionId: prefix(session.id),
    });
    return;
  }

  // ── Locate or create order ───────────────────────────────────────────────

  let order = await findOrderBySessionId(db, session.id);
  let wasNewOrder = false;

  if (!order) {
    order = await createOrderFromSession({ db, session, userId, requestId });
    if (!order) {
      // Non-recoverable; throw so the event is unclaimed and Stripe retries
      throw new Error(`webhook_order_create_failed:${session.id}`);
    }
    wasNewOrder = true;
  } else if (order.payment_status !== DB_PMT_PAID) {
    // Repair stale payment status (finalize-order may have created with wrong status)
    await db
      .from("orders")
      .update({
        payment_status: DB_PMT_PAID,
        status: DB_ORD_CONFIRMED,
        updated_at: nowIso(),
      })
      .eq("id", order.id);
  }

  const orderId = order.id;
  const orderTotal = order.amount_total;

  // ── Extract discount info from session metadata ─────────────────────────

  const promoId = pickMeta(session.metadata, "promo_id") ?? null;
  const creditId = pickMeta(session.metadata, "credit_id") ?? null;
  const promoDiscountCents = parseCents(pickMeta(session.metadata, "promo_discount_cents"));
  const creditCents = parseCents(pickMeta(session.metadata, "credit_cents"));
  const totalCents = session.amount_total ?? orderTotal;

  // ── Side effects (parallelized; all best-effort except order creation) ───

  const sideEffects: Promise<void>[] = [
    upsertPaymentTransaction({ db, orderId, session, requestId }),
    backfillLoyaltyIfMissing({ db, userId, orderId, amountCents: orderTotal, requestId }),
    emitOrderEvent(db, orderId, userId, "REVIEW_NUDGE_READY", {
      amount_cents: orderTotal,
      source: "stripe-webhook",
      event_id: event.id,
    } as Json, requestId),
  ];

  if (promoId) {
    sideEffects.push(
      recordPromoRedemptionIfMissing({
        db,
        promotionId: promoId,
        userId,
        sessionId: session.id,
        discountCents: promoDiscountCents,
        orderTotalCents: totalCents,
        requestId,
      }),
    );
  }

  if (creditId) {
    sideEffects.push(
      markCreditUsedIfPending({ db, creditId, userId, sessionId: session.id, requestId }),
    );
  }

  if (wasNewOrder) {
    sideEffects.push(
      emitOrderEvent(db, orderId, userId, "ORDER_CONFIRMED_WEBHOOK", {
        event_id: event.id,
        session_id: session.id,
        source: "stripe-webhook",
        credit_cents: creditCents,
        promo_discount_cents: promoDiscountCents,
      } as Json, requestId),
      notify(db, orderId, "new_order", "New order confirmed via Stripe webhook.", requestId),
    );
  }

  await Promise.all(sideEffects);

  log("info", "webhook_checkout_completed", {
    requestId,
    orderId: prefix(orderId),
    sessionId: prefix(session.id),
    wasNewOrder,
    orderTotal,
    userId: prefix(userId),
  });
}

// ─────────────────────────────────────────────────────────────
// Handler: payment_intent.succeeded
// ─────────────────────────────────────────────────────────────

async function handlePaymentIntentSucceeded(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;

  const order = await findOrderByPaymentIntentId(db, pi.id);
  if (!order) {
    // May arrive before checkout.session.completed — log and skip (not an error)
    log("info", "webhook_pi_succeeded_no_order", {
      requestId,
      paymentIntentId: prefix(pi.id),
    });
    return;
  }

  // Repair payment status if needed
  if (order.payment_status !== DB_PMT_PAID) {
    await db
      .from("orders")
      .update({ payment_status: DB_PMT_PAID, updated_at: nowIso() })
      .eq("id", order.id);
  }

  // Ensure financial transaction exists (backup for checkout.session.completed path)
  await upsertPaymentIntentTransaction({
    db,
    orderId: order.id,
    pi,
    eventId: event.id,
    requestId,
  });

  // Ensure loyalty was awarded (backup path)
  if (order.customer_uid) {
    await backfillLoyaltyIfMissing({
      db,
      userId: order.customer_uid,
      orderId: order.id,
      amountCents: order.amount_total,
      requestId,
    });
  }

  log("info", "webhook_pi_succeeded", {
    requestId,
    orderId: prefix(order.id),
    paymentIntentId: prefix(pi.id),
    amountReceived: pi.amount_received,
  });
}

// ─────────────────────────────────────────────────────────────
// Handler: payment_intent.payment_failed
// ─────────────────────────────────────────────────────────────

async function handlePaymentIntentFailed(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;

  const order = await findOrderByPaymentIntentId(db, pi.id);
  if (!order) {
    log("info", "webhook_pi_failed_no_order", {
      requestId,
      paymentIntentId: prefix(pi.id),
    });
    return;
  }

  // Only update if not already in a terminal paid/refunded state
  if (order.payment_status !== DB_PMT_PAID && order.payment_status !== DB_PMT_REFUNDED) {
    await db
      .from("orders")
      .update({ payment_status: DB_PMT_FAILED, updated_at: nowIso() })
      .eq("id", order.id);
  }

  const failureCode = pi.last_payment_error?.code ?? null;
  const declineCode = pi.last_payment_error?.decline_code ?? null;
  const failureMessage = pi.last_payment_error?.message ?? null;
  const failureType = pi.last_payment_error?.type ?? null;

  await Promise.all([
    emitOrderEvent(db, order.id, order.customer_uid, "PAYMENT_FAILED", {
      payment_intent_id: pi.id,
      failure_code: failureCode,
      decline_code: declineCode,
      failure_type: failureType,
      failure_message: failureMessage,
      source: "stripe-webhook",
      event_id: event.id,
    } as Json, requestId),
    notify(
      db,
      order.id,
      "payment_failed",
      `Payment failed: ${declineCode ?? failureCode ?? failureMessage ?? "unknown reason"}.`,
      requestId,
    ),
  ]);

  log("warn", "webhook_payment_failed", {
    requestId,
    orderId: prefix(order.id),
    paymentIntentId: prefix(pi.id),
    failureCode,
    declineCode,
  });
}

// ─────────────────────────────────────────────────────────────
// Handler: payment_intent.canceled
// ─────────────────────────────────────────────────────────────

async function handlePaymentIntentCanceled(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const pi = event.data.object as Stripe.PaymentIntent;

  const order = await findOrderByPaymentIntentId(db, pi.id);
  if (!order) {
    log("info", "webhook_pi_canceled_no_order", {
      requestId,
      paymentIntentId: prefix(pi.id),
    });
    return;
  }

  // Only update if not in a terminal paid/refunded state
  if (order.payment_status !== DB_PMT_PAID && order.payment_status !== DB_PMT_REFUNDED) {
    await db
      .from("orders")
      .update({
        payment_status: DB_PMT_CANCELED,
        status: DB_ORD_CANCELED,
        updated_at: nowIso(),
      })
      .eq("id", order.id);

    await emitOrderEvent(db, order.id, order.customer_uid, "PAYMENT_CANCELED", {
      payment_intent_id: pi.id,
      cancellation_reason: pi.cancellation_reason ?? null,
      source: "stripe-webhook",
      event_id: event.id,
    } as Json, requestId);
  }

  log("info", "webhook_pi_canceled", {
    requestId,
    orderId: prefix(order.id),
    paymentIntentId: prefix(pi.id),
    reason: pi.cancellation_reason ?? null,
  });
}

// ─────────────────────────────────────────────────────────────
// Handler: charge.refunded
// ─────────────────────────────────────────────────────────────

async function handleChargeRefunded(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const charge = event.data.object as Stripe.Charge;

  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : (charge.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

  if (!paymentIntentId) {
    log("warn", "webhook_refund_no_pi", {
      requestId,
      chargeId: prefix(charge.id),
    });
    return;
  }

  const order = await findOrderByPaymentIntentId(db, paymentIntentId);
  if (!order) {
    log("info", "webhook_refund_no_order", {
      requestId,
      paymentIntentId: prefix(paymentIntentId),
    });
    return;
  }

  // Resolve the newest refund from the charge object
  const latestRefund = charge.refunds?.data?.[0] ?? null;
  const refundId = latestRefund?.id ?? null;
  const refundAmount = latestRefund?.amount ?? charge.amount_refunded;
  const refundCurrency = normCurrency(latestRefund?.currency ?? charge.currency);

  if (!refundAmount || refundAmount <= 0) return;

  // Idempotency: check for this specific refund already recorded
  // We store refund id in stripe_charge_id column for refund rows
  if (refundId) {
    const { data: existingRefundTx } = await db
      .from("financial_transactions")
      .select("id")
      .eq("order_id", order.id)
      .eq("stripe_charge_id", refundId)
      .limit(1)
      .maybeSingle();

    if (existingRefundTx?.id) {
      log("info", "webhook_refund_already_recorded", {
        requestId,
        orderId: prefix(order.id),
        refundId: prefix(refundId),
      });
      return;
    }
  }

  const isFullRefund = charge.amount_refunded >= charge.amount;
  const txType: RefundKind = isFullRefund ? "refund" : "partial_refund";
  const newPaymentStatus = isFullRefund ? DB_PMT_REFUNDED : DB_PMT_PARTIAL_REFUND;

  // Record refund transaction (negative amount = debit)
  const { error: txErr } = await db.from("financial_transactions").insert({
    order_id: order.id,
    stripe_payment_intent_id: paymentIntentId,
    stripe_charge_id: refundId ?? charge.id,
    transaction_type: txType,
    amount: -refundAmount,
    currency: refundCurrency,
    metadata: {
      source: "stripe-webhook",
      request_id: requestId,
      event_id: event.id,
      charge_id: charge.id,
      refund_id: refundId,
      refund_reason: latestRefund?.reason ?? null,
      refund_status: latestRefund?.status ?? null,
      total_amount_refunded: charge.amount_refunded,
      charge_amount: charge.amount,
    } as Json,
  } satisfies FinancialTxInsert);

  if (txErr) {
    log("warn", "webhook_refund_tx_failed", {
      requestId,
      orderId: prefix(order.id),
      code: txErr.code ?? null,
    });
  }

  // Update order payment status
  await db
    .from("orders")
    .update({ payment_status: newPaymentStatus, updated_at: nowIso() })
    .eq("id", order.id);

  const refundDollars = (refundAmount / 100).toFixed(2);
  const eventTypeLabel = isFullRefund ? "ORDER_REFUNDED" : "ORDER_PARTIALLY_REFUNDED";
  const notifType = isFullRefund ? "full_refund" : "partial_refund";
  const notifMsg = `${isFullRefund ? "Full" : "Partial"} refund of $${refundDollars} processed.`;

  await Promise.all([
    emitOrderEvent(db, order.id, null, eventTypeLabel, {
      refund_id: refundId,
      refund_amount: refundAmount,
      refund_reason: latestRefund?.reason ?? null,
      total_refunded: charge.amount_refunded,
      charge_amount: charge.amount,
      is_full_refund: isFullRefund,
      source: "stripe-webhook",
      event_id: event.id,
    } as Json, requestId),
    notify(db, order.id, notifType, notifMsg, requestId),
  ]);

  // NOTE: Loyalty point revocation on refund is intentionally deferred to
  // manual admin action or a separate reconciliation job. Business rules
  // for loyalty-on-refund vary (partial refund? promotional items?).
  // Use issue_loyalty_correction() RPC when needed.

  log("info", "webhook_refund_processed", {
    requestId,
    orderId: prefix(order.id),
    paymentIntentId: prefix(paymentIntentId),
    refundAmount,
    isFullRefund,
    refundId: prefix(refundId),
  });
}

// ─────────────────────────────────────────────────────────────
// Handler: charge.dispute.created
// ─────────────────────────────────────────────────────────────

async function handleDisputeCreated(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;

  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : (dispute.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

  const chargeId =
    typeof dispute.charge === "string"
      ? dispute.charge
      : (dispute.charge as Stripe.Charge | null)?.id ?? null;

  const order = paymentIntentId
    ? await findOrderByPaymentIntentId(db, paymentIntentId)
    : null;

  const disputeAmountDollars = (dispute.amount / 100).toFixed(2);

  // Security event (always, regardless of whether order is found)
  await logSecurityEvent(
    db,
    "stripe_dispute_created",
    {
      source: "stripe-webhook",
      request_id: requestId,
      event_id: event.id,
      dispute_id: dispute.id,
      dispute_amount: dispute.amount,
      dispute_reason: dispute.reason,
      dispute_status: dispute.status,
      charge_id: chargeId,
      payment_intent_id: paymentIntentId,
      order_id: order?.id ?? null,
      evidence_due_by: dispute.evidence_details?.due_by
        ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
        : null,
    } as Json,
    requestId,
  );

  if (order) {
    await Promise.all([
      emitOrderEvent(db, order.id, null, "DISPUTE_CREATED", {
        dispute_id: dispute.id,
        dispute_amount: dispute.amount,
        dispute_reason: dispute.reason,
        dispute_status: dispute.status,
        evidence_due_by: dispute.evidence_details?.due_by ?? null,
        source: "stripe-webhook",
        event_id: event.id,
      } as Json, requestId),
      notify(
        db,
        order.id,
        "dispute_created",
        `Dispute of $${disputeAmountDollars} opened — ${dispute.reason}. Evidence due: ${
          dispute.evidence_details?.due_by
            ? new Date(dispute.evidence_details.due_by * 1000).toISOString().split("T")[0]
            : "check dashboard"
        }.`,
        requestId,
      ),
    ]);
  }

  log("warn", "webhook_dispute_created", {
    requestId,
    disputeId: prefix(dispute.id),
    orderId: prefix(order?.id),
    reason: dispute.reason,
    amount: dispute.amount,
    paymentIntentId: prefix(paymentIntentId),
  });
}

// ─────────────────────────────────────────────────────────────
// Handler: charge.dispute.updated
// ─────────────────────────────────────────────────────────────

async function handleDisputeUpdated(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;

  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : (dispute.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

  const order = paymentIntentId
    ? await findOrderByPaymentIntentId(db, paymentIntentId)
    : null;

  if (!order) {
    log("info", "webhook_dispute_updated_no_order", {
      requestId,
      disputeId: prefix(dispute.id),
      paymentIntentId: prefix(paymentIntentId),
    });
    return;
  }

  await emitOrderEvent(db, order.id, null, "DISPUTE_UPDATED", {
    dispute_id: dispute.id,
    dispute_status: dispute.status,
    dispute_reason: dispute.reason,
    source: "stripe-webhook",
    event_id: event.id,
  } as Json, requestId);

  log("info", "webhook_dispute_updated", {
    requestId,
    disputeId: prefix(dispute.id),
    orderId: prefix(order.id),
    status: dispute.status,
  });
}

// ─────────────────────────────────────────────────────────────
// Handler: charge.dispute.closed
// ─────────────────────────────────────────────────────────────

async function handleDisputeClosed(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;

  const paymentIntentId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : (dispute.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

  const order = paymentIntentId
    ? await findOrderByPaymentIntentId(db, paymentIntentId)
    : null;

  if (!order) {
    log("info", "webhook_dispute_closed_no_order", {
      requestId,
      disputeId: prefix(dispute.id),
    });
    return;
  }

  // Dispute won → merchant kept the money; restore paid status if appropriate
  const disputeWon = dispute.status === "won";
  const disputeLost = dispute.status === "lost";

  if (disputeWon && order.payment_status !== DB_PMT_PAID) {
    await db
      .from("orders")
      .update({ payment_status: DB_PMT_PAID, updated_at: nowIso() })
      .eq("id", order.id);
  }

  const outcomeLabel = disputeWon ? "won" : disputeLost ? "lost" : "closed";
  const notifMsg = `Dispute ${outcomeLabel}: ${ 
    disputeWon ? "Resolved in your favor." : "Resolved against you — funds forfeited."
  }`;

  await Promise.all([
    emitOrderEvent(db, order.id, null, "DISPUTE_CLOSED", {
      dispute_id: dispute.id,
      dispute_status: dispute.status,
      dispute_won: disputeWon,
      dispute_lost: disputeLost,
      source: "stripe-webhook",
      event_id: event.id,
    } as Json, requestId),
    notify(db, order.id, `dispute_${outcomeLabel}`, notifMsg, requestId),
  ]);

  log(disputeLost ? "warn" : "info", "webhook_dispute_closed", {
    requestId,
    disputeId: prefix(dispute.id),
    orderId: prefix(order.id),
    status: dispute.status,
    disputeWon,
  });
}

// ─────────────────────────────────────────────────────────────
// Handler: checkout.session.expired
// ─────────────────────────────────────────────────────────────

async function handleCheckoutSessionExpired(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;

  // Expire pending carts that were not consumed
  try {
    const { error } = await db
      .from("pending_carts")
      .update({ expires_at: nowIso() } as Record<string, unknown>)
      .eq("stripe_session_id", session.id)
      .is("consumed_at", null);

    if (error) {
      log("warn", "webhook_session_expired_cart_cleanup_failed", {
        requestId,
        sessionId: prefix(session.id),
        code: error.code ?? null,
      });
    }
  } catch (err) {
    log("warn", "webhook_session_expired_exception", {
      requestId,
      sessionId: prefix(session.id),
      error: asErr(err),
    });
  }

  log("info", "webhook_session_expired", {
    requestId,
    sessionId: prefix(session.id),
  });
}

// ─────────────────────────────────────────────────────────────
// Event dispatcher
// ─────────────────────────────────────────────────────────────

async function dispatchEvent(
  db: DbClient,
  event: Stripe.Event,
  requestId: string,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(db, event, requestId);
      break;

    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(db, event, requestId);
      break;

    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(db, event, requestId);
      break;

    case "payment_intent.canceled":
      await handlePaymentIntentCanceled(db, event, requestId);
      break;

    case "charge.refunded":
      await handleChargeRefunded(db, event, requestId);
      break;

    case "charge.dispute.created":
      await handleDisputeCreated(db, event, requestId);
      break;

    case "charge.dispute.updated":
      await handleDisputeUpdated(db, event, requestId);
      break;

    case "charge.dispute.closed":
      await handleDisputeClosed(db, event, requestId);
      break;

    case "checkout.session.expired":
      await handleCheckoutSessionExpired(db, event, requestId);
      break;

    default:
      log("info", "webhook_unhandled_event", {
        requestId,
        eventType: event.type,
        eventId: prefix(event.id),
      });
  }
}

// ─────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────

const JSON_HEADERS: HeadersInit = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function jsonResponse(body: unknown, status: number, requestId: string): Response {
  const headers = new Headers(JSON_HEADERS);
  headers.set("X-Request-Id", requestId);
  return new Response(JSON.stringify(body), { status, headers });
}

// ─────────────────────────────────────────────────────────────
// Main serve handler
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = (req.headers.get("x-request-id") ?? crypto.randomUUID()).slice(0, 128);
  const start = Date.now();

  // ── Only accept POST ────────────────────────────────────────────────────

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405, requestId);
  }

  // ── Read raw body (Stripe requires the raw bytes for HMAC verification) ─

  let rawBody: Uint8Array;
  let rawBodyText: string;

  try {
    const buf = await req.arrayBuffer();
    rawBody = new Uint8Array(buf);

    if (rawBody.byteLength > MAX_BODY_BYTES) {
      log("warn", "webhook_body_too_large", {
        requestId,
        bytes: rawBody.byteLength,
        limit: MAX_BODY_BYTES,
      });
      return jsonResponse({ ok: false, error: "Payload too large" }, 413, requestId);
    }

    rawBodyText = new TextDecoder().decode(rawBody);
  } catch (err) {
    log("error", "webhook_body_read_failed", { requestId, error: asErr(err) });
    return jsonResponse({ ok: false, error: "Failed to read request body" }, 400, requestId);
  }

  // ── Stripe-Signature header ─────────────────────────────────────────────

  const signature = req.headers.get("stripe-signature") ?? "";
  if (!signature) {
    log("warn", "webhook_missing_signature", { requestId });
    return jsonResponse({ ok: false, error: "Missing Stripe-Signature header" }, 400, requestId);
  }

  // ── Signature verification (constructEventAsync for Deno edge) ──────────

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    const webhookSecret = mustEnv("STRIPE_WEBHOOK_SECRET");

    event = await stripe.webhooks.constructEventAsync(
      rawBodyText,
      signature,
      webhookSecret,
      WEBHOOK_TOLERANCE_SECONDS,
    );
  } catch (err) {
    log("warn", "webhook_signature_invalid", {
      requestId,
      error: asErr(err),
    });
    // 400 → Stripe will NOT retry on 4xx
    return jsonResponse({ ok: false, error: "Webhook signature verification failed" }, 400, requestId);
  }

  log("info", "webhook_received", {
    requestId,
    eventId: prefix(event.id),
    eventType: event.type,
    livemode: event.livemode,
  });

  // ── Idempotency: claim the event ────────────────────────────────────────

  const db = createServiceClient();
  const claimResult = await claimEvent(db, event.id, event.type);

  if (claimResult === "duplicate") {
    log("info", "webhook_duplicate_skipped", {
      requestId,
      eventId: prefix(event.id),
      eventType: event.type,
    });
    // 200 → Stripe stops retrying for this event ID
    return jsonResponse({ ok: true, skipped: true, reason: "duplicate" }, 200, requestId);
  }

  if (claimResult === "db_error") {
    log("error", "webhook_claim_db_error", {
      requestId,
      eventId: prefix(event.id),
      eventType: event.type,
    });
    // 503 → Stripe will retry; we did NOT claim, so next retry starts fresh
    return jsonResponse({ ok: false, error: "Database unavailable — will retry" }, 503, requestId);
  }

  // ── Dispatch & handle ───────────────────────────────────────────────────

  try {
    await dispatchEvent(db, event, requestId);

    log("info", "webhook_processed", {
      requestId,
      eventId: prefix(event.id),
      eventType: event.type,
      ms: Date.now() - start,
    });

    return jsonResponse({ ok: true, eventId: event.id }, 200, requestId);
  } catch (err) {
    // Unhandled exception → unclaim so Stripe retries with a clean slate.
    // Side effects inside handlers that already succeeded are idempotent,
    // so retries are safe (UNIQUE constraints + idempotency keys protect them).
    await unclaimEvent(db, event.id);

    log("error", "webhook_handler_exception", {
      requestId,
      eventId: prefix(event.id),
      eventType: event.type,
      error: asErr(err),
      ms: Date.now() - start,
    });

    // 503 → Stripe retries with exponential back-off
    return jsonResponse(
      { ok: false, error: "Handler failed — will retry", eventId: event.id },
      503,
      requestId,
    );
  }
});