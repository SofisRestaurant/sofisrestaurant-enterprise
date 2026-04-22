// =============================================================================
// supabase/functions/create-checkout/pending-cart.ts
// =============================================================================
// Complete file — auth functions (original) + guest functions (added).
// DO NOT split this into two files; both pipelines import from this one module.
//
// Auth exports:   persistPendingCart, findReusableSession, backfillCartSessionId
// Guest exports:  persistGuestPendingCart, findReusableGuestSession
//
// SECURITY (2026):
//   findReusableSession and findReusableGuestSession both enforce MIN_ORDER_CENTS
//   before returning a session. This prevents a reused session from bypassing
//   minimum order validation if the cart was modified between the original
//   creation and the reuse attempt.
// =============================================================================

import type Stripe from "stripe";
import {
  pricingSnapshotToJson,
  type PricingSnapshot,
} from "../_shared/pricing.ts";
import { log, prefix, asErr } from "./logging.ts";
import type {
  DbClient,
  PendingCartInsert,
  PendingCartUpdate,
  RequestCartItemInput,
} from "./types.ts";

// ─── Minimum order constant ───────────────────────────────────────────────────
// Single source of truth for session-reuse enforcement within this module.
// The value MUST match MIN_ORDER_CENTS in index.ts and create-checkout-guest/index.ts.
// Both index files also run the check before calling find*Session — this provides
// defense-in-depth: the guard here catches any caller that forgets the pre-check.

const MIN_ORDER_CENTS = 15_00; // $15.00

// ─── Internal row shapes ──────────────────────────────────────────────────────
// These are cast from Supabase query results. The generated types will not
// include the new guest columns until `supabase gen types` is re-run after
// the migrations are applied — the casts are intentional.

type AuthCartRow = {
  id: string;
  stripe_session_id: string | null;
  pricing_hash: string;
  idempotency_key: string;
};

type GuestCartRow = {
  id: string;
  stripe_session_id: string | null;
  pricing_hash: string;
};

// =============================================================================
// AUTH PIPELINE FUNCTIONS
// =============================================================================

// ─── persistPendingCart ───────────────────────────────────────────────────────

export type PersistPendingCartInput = {
  db: DbClient;
  userId: string;
  items: RequestCartItemInput[];
  snapshot: PricingSnapshot;
  pricingHash: string;
  promoId: string | null;
  creditId: string | null;
  idempotencyKey: string;
  requestId: string;
};

export type PersistPendingCartResult = { cartId: string } | null;

export async function persistPendingCart(
  input: PersistPendingCartInput,
): Promise<PersistPendingCartResult> {
  let pricingSnapshotJson: unknown;
  try {
    pricingSnapshotJson = pricingSnapshotToJson(input.snapshot);
  } catch (err) {
    log("error", "pending_cart_snapshot_serialize_failed", {
      requestId: input.requestId,
      userId: prefix(input.userId),
      error: asErr(err),
    });
    return null;
  }

  const insert: PendingCartInsert = {
    user_id: input.userId,
    items: JSON.parse(JSON.stringify(input.items)),
    pricing_snapshot: pricingSnapshotJson as never,
    pricing_hash: input.pricingHash,
    promo_id: input.promoId ?? null,
    credit_id: input.creditId ?? null,
    idempotency_key: input.idempotencyKey,
  };

  const { data: rawData, error } = await input.db
    .from("pending_carts")
    .insert(insert as never)
    .select("id")
    .single();

  if (error || !rawData) {
    log("error", "pending_cart_persist_failed", {
      requestId: input.requestId,
      userId: prefix(input.userId),
      error: error?.message ?? "No data returned",
    });
    return null;
  }

  const data = rawData as unknown as { id: string };
  const cartId = data.id;

  if (typeof cartId !== "string" || !cartId) {
    log("error", "pending_cart_id_missing", {
      requestId: input.requestId,
      userId: prefix(input.userId),
    });
    return null;
  }

  log("info", "pending_cart_persisted", {
    requestId: input.requestId,
    userId: prefix(input.userId),
    cartId: prefix(cartId),
  });

  return { cartId };
}

// ─── findReusableSession ──────────────────────────────────────────────────────

export type FindReusableSessionInput = {
  db: DbClient;
  stripe: Stripe;
  userId: string;
  idempotencyKey: string;
  pricingHash: string;
  totalCents: number;
  currency: string;
  requestId: string;
};

export type FindReusableSessionResult = {
  session: Stripe.Checkout.Session;
  cartId: string;
} | null;

export async function findReusableSession(
  input: FindReusableSessionInput,
): Promise<FindReusableSessionResult> {
  // ── SECURITY: minimum order enforcement ──────────────────────────────────
  // Reject reuse if the current snapshot is below minimum.
  // This is defense-in-depth — index.ts also runs this check before calling
  // here, but we enforce it at the source to protect against any future caller
  // that forgets the pre-check.
  if (input.totalCents < MIN_ORDER_CENTS) {
    log("warn", "session_reuse_blocked_below_minimum", {
      requestId: input.requestId,
      userId: prefix(input.userId),
      totalCents: input.totalCents,
      minimumCents: MIN_ORDER_CENTS,
    });
    return null;
  }

  const { data: rawData } = await input.db
    .from("pending_carts")
    .select("id, stripe_session_id, pricing_hash, idempotency_key")
    .eq("user_id", input.userId)
    .eq("idempotency_key", input.idempotencyKey)
    .is("consumed_at", null)
    .not("stripe_session_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cartRow = rawData as unknown as AuthCartRow | null;

  if (!cartRow?.stripe_session_id) {
    return null;
  }

  if (cartRow.pricing_hash !== input.pricingHash) {
    log("warn", "session_reuse_hash_mismatch", {
      requestId: input.requestId,
      userId: prefix(input.userId),
      cartId: prefix(cartRow.id),
    });
    return null;
  }

  let stripeSession: Stripe.Checkout.Session;
  try {
    stripeSession = await input.stripe.checkout.sessions.retrieve(
      cartRow.stripe_session_id,
    );
  } catch (err) {
    log("warn", "session_reuse_stripe_retrieve_failed", {
      requestId: input.requestId,
      userId: prefix(input.userId),
      cartId: prefix(cartRow.id),
      error: asErr(err),
    });
    return null;
  }

  if (stripeSession.status !== "open" || !stripeSession.url) {
    return null;
  }

  if (
    stripeSession.amount_total !== null &&
    stripeSession.amount_total !== input.totalCents
  ) {
    log("warn", "session_reuse_amount_mismatch", {
      requestId: input.requestId,
      userId: prefix(input.userId),
      cartId: prefix(cartRow.id),
      expected: input.totalCents,
      actual: stripeSession.amount_total,
    });
    return null;
  }

  log("info", "checkout_session_reused_found", {
    requestId: input.requestId,
    userId: prefix(input.userId),
    cartId: prefix(cartRow.id),
    sessionId: prefix(stripeSession.id),
  });

  return { session: stripeSession, cartId: cartRow.id };
}

// ─── backfillCartSessionId ────────────────────────────────────────────────────
// Writes the Stripe session ID back to the pending_carts row after the session
// has been created. Used by both auth and guest pipelines.

export async function backfillCartSessionId(
  db: DbClient,
  cartId: string,
  stripeSessionId: string,
  snapshot: PricingSnapshot,
  pricingHash: string,
  requestId: string,
): Promise<void> {
  let pricingSnapshotJson: unknown;
  try {
    pricingSnapshotJson = pricingSnapshotToJson(snapshot);
  } catch {
    pricingSnapshotJson = null;
  }

  const update: PendingCartUpdate = {
    stripe_session_id: stripeSessionId,
    pricing_hash: pricingHash,
    ...(pricingSnapshotJson ? { pricing_snapshot: pricingSnapshotJson as never } : {}),
  };

  const { error } = await db
    .from("pending_carts")
    .update(update as never)
    .eq("id", cartId)
    .is("stripe_session_id", null); // Only update if not already set (idempotent)

  if (error) {
    log("warn", "pending_cart_backfill_session_failed", {
      requestId,
      cartId: prefix(cartId),
      sessionId: prefix(stripeSessionId),
      error: error.message,
    });
  } else {
    log("info", "pending_cart_session_backfilled", {
      requestId,
      cartId: prefix(cartId),
      sessionId: prefix(stripeSessionId),
    });
  }
}

// =============================================================================
// GUEST PIPELINE FUNCTIONS
// =============================================================================
// All DB results are cast through `unknown` because the generated Supabase
// types will not include the new guest columns until `supabase gen types` is
// re-run after migration 001_guest_checkout.sql is applied.

// ─── persistGuestPendingCart ──────────────────────────────────────────────────

export type PersistGuestPendingCartInput = {
  db: DbClient;
  guestEmail: string;
  guestToken: string;
  items: RequestCartItemInput[];
  snapshot: PricingSnapshot;
  pricingHash: string;
  idempotencyKey: string;
  requestId: string;
};

export type PersistGuestPendingCartResult = { cartId: string } | null;

export async function persistGuestPendingCart(
  input: PersistGuestPendingCartInput,
): Promise<PersistGuestPendingCartResult> {
  let pricingSnapshotJson: unknown;
  try {
    pricingSnapshotJson = pricingSnapshotToJson(input.snapshot);
  } catch (err) {
    log("error", "guest_pending_cart_snapshot_serialize_failed", {
      requestId: input.requestId,
      error: asErr(err),
    });
    return null;
  }

  const { data: rawData, error } = await input.db
    .from("pending_carts")
    .insert({
      user_id: null,
      guest_email: input.guestEmail,
      guest_token: input.guestToken,
      items: JSON.parse(JSON.stringify(input.items)),
      pricing_snapshot: pricingSnapshotJson,
      pricing_hash: input.pricingHash,
      promo_id: null,
      credit_id: null,
      idempotency_key: input.idempotencyKey,
    } as never)
    .select("id")
    .single();

  if (error || !rawData) {
    log("error", "guest_pending_cart_persist_failed", {
      requestId: input.requestId,
      error: error?.message ?? "No data returned",
    });
    return null;
  }

  const data = rawData as unknown as { id: string };
  const cartId = data.id;

  if (typeof cartId !== "string" || !cartId) {
    log("error", "guest_pending_cart_id_missing", { requestId: input.requestId });
    return null;
  }

  log("info", "guest_pending_cart_persisted", {
    requestId: input.requestId,
    cartId: prefix(cartId),
  });

  return { cartId };
}

// ─── findReusableGuestSession ─────────────────────────────────────────────────
// Looks up an open Stripe session for this guest by:
//   1. guest_token + idempotency_key (same device, same cart)
//   2. idempotency_key only          (same email+cart+price, different device)
//
// SECURITY: enforces MIN_ORDER_CENTS before returning any session.
// Same invariant as findReusableSession — no reuse path bypasses minimum order.

export type FindReusableGuestSessionInput = {
  db: DbClient;
  stripe: Stripe;
  guestToken: string | null;
  idempotencyKey: string;
  pricingHash: string;
  totalCents: number;
  currency: string;
  requestId: string;
};

export type FindReusableGuestSessionResult = {
  session: Stripe.Checkout.Session;
  cartId: string;
} | null;

export async function findReusableGuestSession(
  input: FindReusableGuestSessionInput,
): Promise<FindReusableGuestSessionResult> {
  // ── SECURITY: minimum order enforcement ──────────────────────────────────
  // Same guard as findReusableSession. Guests cannot bypass via session reuse.
  if (input.totalCents < MIN_ORDER_CENTS) {
    log("warn", "guest_session_reuse_blocked_below_minimum", {
      requestId: input.requestId,
      totalCents: input.totalCents,
      minimumCents: MIN_ORDER_CENTS,
    });
    return null;
  }

  let cartRow: GuestCartRow | null = null;

  // Prefer token-scoped match (same device, same cart)
  if (input.guestToken) {
    const { data: rawData } = await input.db
      .from("pending_carts")
      .select("id, stripe_session_id, pricing_hash")
      .is("user_id", null)
      .eq("guest_token" as never, input.guestToken)
      .eq("idempotency_key", input.idempotencyKey)
      .is("consumed_at", null)
      .not("stripe_session_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    cartRow = rawData as unknown as GuestCartRow | null;
  }

  // Fallback: idempotency_key match without token (same cart, different device)
  if (!cartRow) {
    const { data: rawData } = await input.db
      .from("pending_carts")
      .select("id, stripe_session_id, pricing_hash")
      .is("user_id", null)
      .eq("idempotency_key", input.idempotencyKey)
      .is("consumed_at", null)
      .not("stripe_session_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    cartRow = rawData as unknown as GuestCartRow | null;
  }

  if (!cartRow?.stripe_session_id) {
    return null;
  }

  if (cartRow.pricing_hash !== input.pricingHash) {
    log("warn", "guest_session_reuse_hash_mismatch", {
      requestId: input.requestId,
      cartId: prefix(cartRow.id),
    });
    return null;
  }

  let stripeSession: Stripe.Checkout.Session;
  try {
    stripeSession = await input.stripe.checkout.sessions.retrieve(
      cartRow.stripe_session_id,
    );
  } catch (err) {
    log("warn", "guest_session_reuse_stripe_retrieve_failed", {
      requestId: input.requestId,
      cartId: prefix(cartRow.id),
      error: asErr(err),
    });
    return null;
  }

  if (stripeSession.status !== "open" || !stripeSession.url) {
    return null;
  }

  if (
    stripeSession.amount_total !== null &&
    stripeSession.amount_total !== input.totalCents
  ) {
    log("warn", "guest_session_reuse_amount_mismatch", {
      requestId: input.requestId,
      cartId: prefix(cartRow.id),
      expected: input.totalCents,
      actual: stripeSession.amount_total,
    });
    return null;
  }

  log("info", "guest_checkout_session_reused", {
    requestId: input.requestId,
    cartId: prefix(cartRow.id),
    sessionId: prefix(stripeSession.id),
  });

  return { session: stripeSession, cartId: cartRow.id };
}