// supabase/functions/stripe-webhook/pending-cart.ts
// =============================================================================
// Changes from prior version:
//
//   1. prepareAuthoritativeCartState now accepts:
//        userId:     string | null   (null for guest checkouts)
//        guestToken: string | null   (non-null for guest checkouts)
//
//   2. Ownership check is now identity-aware:
//        Auth  → cart.user_id must match userId
//        Guest → cart.user_id must be null (no auth owner)
//
//   3. Cart DB total columns check is now guarded by whether those columns
//      were actually populated. create-checkout-guest does NOT write
//      subtotal_cents / tax_cents / total_cents (it stores amounts only in
//      the pricing_snapshot JSONB). When those columns are all zero/null the
//      intermediate check was always failing for guest orders, producing the
//      webhook_pending_cart_total_mismatch log. The Stripe-amount vs snapshot
//      check immediately below is the authoritative integrity gate; the DB-
//      column check is only an early-exit optimisation for auth flows that do
//      populate the columns.
// =============================================================================

import Stripe from "stripe";
import {
  buildLegacyPricingSnapshotFromPendingCart,
  hashPricingSnapshot,
  parsePricingSnapshot,
} from "../_shared/pricing.ts";
import { asErr, log, nowIso, prefix } from "./logging.ts";
import { loadPendingCart } from "./order-queries.ts";
import {
  isNonEmptyJsonObject,
  normalizeOrderType,
  normCurrency,
  pickMeta,
  snapshotNumber,
  snapshotString,
  toJson,
} from "./utils.ts";
import type {
  DbClient,
  PendingCartUpdate,
  PreparedCartState,
} from "./types.ts";

// REPLACE WITH:
export async function prepareAuthoritativeCartState(args: {
  db:          DbClient;
  session:     Stripe.Checkout.Session;
  userId:      string | null;
  _guestToken: string | null;   // reserved for future token-based lookup
  requestId:   string;
}): Promise<PreparedCartState | null> {
  const { db, session, userId, requestId } = args;

  const cartRef = pickMeta(
    session.metadata,
    "pending_cart_id",
    "cart_ref",
    "cart_id",
  );

  // For auth users: use loadPendingCart which filters by userId.
  // For guests: query pending_carts directly by cart id / session id —
  // loadPendingCart expects string userId and would not find guest carts
  // (which have user_id IS NULL) if passed "" or a wrong value.
  let cart: Awaited<ReturnType<typeof loadPendingCart>>;

  if (userId !== null) {
    cart = await loadPendingCart(db, cartRef, session.id, userId);
  } else {
    // Guest path: look up by pending_cart_id from metadata (cartRef),
    // falling back to stripe_session_id match.
    const { data, error } = cartRef
      ? await db
          .from("pending_carts")
          .select("*")
          .eq("id", cartRef)
          .maybeSingle()
      : await db
          .from("pending_carts")
          .select("*")
          .eq("stripe_session_id", session.id)
          .is("user_id", null)
          .maybeSingle();

    if (error) {
      log("error", "webhook_guest_cart_lookup_failed", {
        requestId,
        sessionId: prefix(session.id),
        cartRef:   prefix(cartRef),
        error:     error.message,
      });
      return null;
    }

    cart = data ?? null;
  }

  if (cart === null) {
    log("warn", "webhook_pending_cart_not_found", {
      requestId,
      sessionId:  prefix(session.id),
      cartRef:    prefix(cartRef),
      userId:     prefix(userId),
      isGuest:    userId === null,
    });
    return null;
  }

  // ── Identity / ownership check ────────────────────────────────────────────
  // Auth:  the cart's user_id must match the authenticated user.
  // Guest: the cart's user_id must be null (created by create-checkout-guest).
  //        We do not check the guestToken here — that was already validated
  //        by the webhook handler before reaching this function.

  const isGuest = userId === null;

  if (isGuest) {
    // Guest carts must have no auth owner.
    if (cart.user_id !== null) {
      log("warn", "webhook_pending_cart_guest_owns_auth_cart", {
        requestId,
        sessionId: prefix(session.id),
        cartId:    prefix(cart.id),
        cartUserId: prefix(cart.user_id),
      });
      return null;
    }
  } else {
    // Auth carts must belong to the authenticated user.
    if (cart.user_id !== userId) {
      log("warn", "webhook_pending_cart_owner_mismatch", {
        requestId,
        sessionId:  prefix(session.id),
        cartId:     prefix(cart.id),
        cartUserId: prefix(cart.user_id),
        userId:     prefix(userId),
      });
      return null;
    }
  }

  // orderType = fulfillment type ('pickup' | 'delivery' | 'dine_in').
  // create-checkout stores this in Stripe metadata as 'order_type' (legacy name).
  const orderType = normalizeOrderType(
    pickMeta(session.metadata, "order_type"),
  );
  const currency = normCurrency(session.currency ?? cart.currency ?? "usd");

  const parsedSnapshot = parsePricingSnapshot(cart.pricing_snapshot ?? null);
  const snapshot = parsedSnapshot ??
    buildLegacyPricingSnapshotFromPendingCart({
      userId:       userId ?? "",
      currency:     normCurrency(cart.currency ?? currency),
      orderType,
      orderNotes:   null,
      items:        cart.items ?? [],
      subtotalCents: cart.subtotal_cents ?? 0,
      discountCents: cart.discount_cents ?? 0,
      taxCents:      cart.tax_cents ?? 0,
      totalCents:    cart.total_cents ?? 0,
      promoId:       cart.promo_id ?? null,
      creditId:      cart.credit_id ?? null,
    });

  if (!isNonEmptyJsonObject(snapshot)) {
    log("error", "webhook_pricing_snapshot_invalid", {
      requestId,
      sessionId: prefix(session.id),
      cartId:    prefix(cart.id),
    });
    return null;
  }

  let pricingHash: string;
  try {
    pricingHash = await hashPricingSnapshot(snapshot);
  } catch (error) {
    log("error", "webhook_pricing_hash_failed", {
      requestId,
      sessionId: prefix(session.id),
      cartId:    prefix(cart.id),
      error:     asErr(error),
    });
    return null;
  }

  if (pricingHash.trim().length < 16) {
    log("error", "webhook_pricing_hash_invalid", {
      requestId,
      sessionId: prefix(session.id),
      cartId:    prefix(cart.id),
    });
    return null;
  }

  if (
    cart.pricing_hash !== null &&
    cart.pricing_hash !== undefined &&
    cart.pricing_hash !== pricingHash
  ) {
    log("warn", "webhook_pricing_hash_mismatch", {
      requestId,
      sessionId:        prefix(session.id),
      cartId:           prefix(cart.id),
      storedHash:       prefix(cart.pricing_hash, 16),
      recalculatedHash: prefix(pricingHash, 16),
    });
    return null;
  }

  // ── Cart DB-column vs snapshot totals check ───────────────────────────────
  // This check validates that the raw numeric DB columns (subtotal_cents etc.)
  // match what the pricing snapshot says. It is an early-exit optimisation for
  // auth checkouts where create-checkout always writes those columns.
  //
  // create-checkout-GUEST does NOT write subtotal_cents / tax_cents / total_cents
  // (it only writes them into the pricing_snapshot JSONB). When total_cents is
  // 0 or NULL we skip this check and rely solely on the Stripe-amount vs
  // snapshot check below, which is the authoritative integrity gate anyway.

  const cartTotalsPopulated = (cart.total_cents ?? 0) > 0;

  if (cartTotalsPopulated) {
    const expectedDiscountCents =
      snapshotNumber(snapshot, "campaignDiscountCents") +
      snapshotNumber(snapshot, "promoDiscountCents");

    if (
      (cart.subtotal_cents ?? 0) !== snapshotNumber(snapshot, "subtotalCents") ||
      (cart.discount_cents ?? 0) !== expectedDiscountCents ||
      (cart.tax_cents ?? 0)      !== snapshotNumber(snapshot, "taxCents")      ||
      (cart.total_cents ?? 0)    !== snapshotNumber(snapshot, "totalCents")
    ) {
      log("warn", "webhook_pending_cart_total_mismatch", {
        requestId,
        sessionId:        prefix(session.id),
        cartId:           prefix(cart.id),
        subtotal:         cart.subtotal_cents ?? null,
        discount:         cart.discount_cents ?? null,
        tax:              cart.tax_cents ?? null,
        total:            cart.total_cents ?? null,
        expectedSubtotal: snapshotNumber(snapshot, "subtotalCents"),
        expectedDiscount: expectedDiscountCents,
        expectedTax:      snapshotNumber(snapshot, "taxCents"),
        expectedTotal:    snapshotNumber(snapshot, "totalCents"),
      });
      return null;
    }
  }

  // ── Stripe amount vs snapshot total (definitive integrity check) ──────────

  const stripeAmountTotal = typeof session.amount_total === "number"
    ? session.amount_total
    : null;
  const stripeCurrency    = normCurrency(session.currency ?? "usd");
  const snapshotTotal     = snapshotNumber(snapshot, "totalCents");
  const snapshotCurrency  = normCurrency(
    snapshotString(snapshot, "currency") ?? currency,
  );

  // When loyalty points are redeemed a Stripe coupon reduces the charged
  // amount below snapshot.totalCents. Read the discount from metadata so
  // the comparison accounts for it correctly.
  const loyaltyDiscountCents = parseInt(
    pickMeta(session.metadata, "loyalty_discount_cents") ?? "0",
    10,
  ) || 0;

  const expectedTotal = snapshotTotal - loyaltyDiscountCents;

  if (stripeAmountTotal === null || stripeAmountTotal !== expectedTotal) {
    log("warn", "webhook_total_mismatch", {
      requestId,
      sessionId:           prefix(session.id),
      charged:             stripeAmountTotal,
      expected:            expectedTotal,
      snapshotTotal,
      loyaltyDiscountCents,
      isGuest,
    });
    return null;
  }

  if (stripeCurrency !== snapshotCurrency) {
    log("warn", "webhook_currency_mismatch", {
      requestId,
      sessionId: prefix(session.id),
      charged:   stripeCurrency,
      expected:  snapshotCurrency,
    });
    return null;
  }

  // ── Repair stale cart fields if needed ───────────────────────────────────

  const needsRepair =
    !isNonEmptyJsonObject(cart.pricing_snapshot ?? null) ||
    typeof cart.pricing_hash !== "string" ||
    cart.pricing_hash.trim().length < 16 ||
    cart.stripe_session_id !== session.id;

  if (needsRepair) {
    const repairPatch: PendingCartUpdate = {
      pricing_snapshot:  toJson(snapshot),
      pricing_hash:      pricingHash,
      stripe_session_id: session.id,
    };

    const { error } = await db
      .from("pending_carts")
      .update(repairPatch)
      .eq("id", cart.id);

    if (error !== null) {
      log("error", "webhook_pending_cart_repair_failed", {
        requestId,
        sessionId: prefix(session.id),
        cartId:    prefix(cart.id),
        code:      error.code ?? null,
        message:   error.message,
      });
      return null;
    }
  }

  // ── Mark cart consumed (idempotent — only updates if consumed_at IS NULL) ─

  const consumePatch: PendingCartUpdate = {
    consumed_at:       nowIso(),
    stripe_session_id: session.id,
    pricing_snapshot:  toJson(snapshot),
    pricing_hash:      pricingHash,
  };

  const { data: consumeRows, error: consumeError } = await db
    .from("pending_carts")
    .update(consumePatch)
    .eq("id", cart.id)
    .is("consumed_at", null)
    .select("id")
    .returns<Array<{ id: string }>>();

  if (consumeError !== null) {
    log("error", "webhook_pending_cart_consume_failed", {
      requestId,
      sessionId: prefix(session.id),
      cartId:    prefix(cart.id),
      code:      consumeError.code ?? null,
      message:   consumeError.message,
    });
    return null;
  }

  return {
    cart,
    snapshot,
    pricingHash,
    orderType,
    currency:    snapshotCurrency,
    consumedNow: Array.isArray(consumeRows) && consumeRows.length > 0,
  };
}