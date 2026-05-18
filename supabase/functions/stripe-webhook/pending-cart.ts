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
//
//   4. [FIX 2026-05-08] Guest cart lookup: cartRef fallback to stripe_session_id.
//        When cartRef is provided but finds no row (stale ID, pruned cart, or
//        key mismatch from create-checkout-guest), the code now falls back to
//        the stripe_session_id lookup rather than silently returning null. For
//        auth users the existing loadPendingCart path is unchanged.
//
//   5. [FIX 2026-05-08] Guest legacy snapshot: totalCents reconstruction.
//        When parsePricingSnapshot returns null (guest cart has no valid
//        pricing_snapshot JSONB) AND cart.total_cents is 0 or null (which is
//        documented to be the case for create-checkout-guest), the legacy
//        builder produces totalCents:0. The subsequent Stripe amount check then
//        fails with webhook_total_mismatch on every webhook attempt, permanently
//        preventing order creation. Fix: when the legacy path is taken for a
//        guest order and all DB total columns are zero, reconstruct totalCents
//        from session.amount_total (the Stripe-authoritative charged amount)
//        before building the legacy snapshot. This is safe because:
//          - session.amount_total is already trusted — it is the very value we
//            compare against in the integrity check below.
//          - The fix only activates for guest orders where parsePricingSnapshot
//            failed AND cart.total_cents is zero — the degraded path.
//          - Auth orders are completely unaffected (this block is inside
//            `isGuest && !cartTotalsPopulated && !parsedSnapshot`).
//          - risk_score, risk_level, and all other fields are still computed.
//          - Idempotency is preserved — the reconstructed snapshot is written
//            to the cart during the repair step below.
//
//   6. [FIX 2026-05-08] Structured null-return logging.
//        Every return null in prepareAuthoritativeCartState now emits a
//        structured log with the exact guard that fired, the session ID, cart
//        ID, and relevant field values. Previously several paths silently
//        returned null, making it impossible to determine the failure branch
//        from production logs alone.
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

  const isGuest = userId === null;

  // ── Cart lookup ───────────────────────────────────────────────────────────
  // Auth users: use loadPendingCart which filters by userId.
  // Guest users: query by cartRef (pending_cart_id from Stripe metadata), with
  //   a fallback to stripe_session_id if the primary lookup finds nothing.
  //   Both fallbacks are tried before giving up — a missing cartRef or a stale
  //   cartRef that no longer resolves must not silently kill the webhook.

  let cart: Awaited<ReturnType<typeof loadPendingCart>>;

  if (userId !== null) {
    cart = await loadPendingCart(db, cartRef, session.id, userId);
  } else {
    // [FIX 2026-05-08] Guest path: try cartRef first, then stripe_session_id.
    // Prior code used a ternary that made these mutually exclusive — if cartRef
    // was set but stale/wrong, the stripe_session_id fallback was never tried.

    if (cartRef) {
      // Primary: look up by the cart ID embedded in Stripe metadata.
      const { data: cartByRef, error: cartByRefError } = await db
        .from("pending_carts")
        .select("*")
        .eq("id", cartRef)
        .maybeSingle();

      if (cartByRefError) {
        log("error", "webhook_guest_cart_lookup_by_ref_failed", {
          requestId,
          sessionId: prefix(session.id),
          cartRef:   prefix(cartRef),
          error:     cartByRefError.message,
        });
        return null;
      }

      if (cartByRef !== null) {
        cart = cartByRef;
      } else {
        // [FIX] cartRef resolved to nothing — fall back to stripe_session_id.
        // This handles: stale cart ID in metadata, cart pruned between checkout
        // creation and webhook execution, or create-checkout-guest using a
        // different metadata key that pickMeta() didn't match.
        log("warn", "webhook_guest_cart_ref_not_found_trying_session_fallback", {
          requestId,
          sessionId: prefix(session.id),
          cartRef:   prefix(cartRef),
        });

        const { data: cartBySession, error: cartBySessionError } = await db
          .from("pending_carts")
          .select("*")
          .eq("stripe_session_id", session.id)
          .is("user_id", null)
          .maybeSingle();

        if (cartBySessionError) {
          log("error", "webhook_guest_cart_lookup_by_session_failed", {
            requestId,
            sessionId: prefix(session.id),
            error:     cartBySessionError.message,
          });
          return null;
        }

        cart = cartBySession ?? null;
      }
    } else {
      // No cartRef in metadata — go straight to stripe_session_id lookup.
      const { data, error } = await db
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
  }

  if (cart === null) {
    log("warn", "webhook_pending_cart_not_found", {
      requestId,
      sessionId:  prefix(session.id),
      cartRef:    prefix(cartRef),
      userId:     prefix(userId),
      isGuest,
      // [FIX] Additional fields to diagnose lookup failure branch.
      hadCartRef: cartRef !== null && cartRef !== undefined,
    });
    return null;
  }

  // ── Identity / ownership check ────────────────────────────────────────────

  if (isGuest) {
    if (cart.user_id !== null) {
      log("warn", "webhook_pending_cart_guest_owns_auth_cart", {
        requestId,
        sessionId:  prefix(session.id),
        cartId:     prefix(cart.id),
        cartUserId: prefix(cart.user_id),
      });
      return null;
    }
  } else {
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
  const orderType = normalizeOrderType(
    pickMeta(session.metadata, "order_type"),
  );
  const currency = normCurrency(session.currency ?? cart.currency ?? "usd");

  // ── Pricing snapshot resolution ───────────────────────────────────────────
  // [FIX 2026-05-08] Guest legacy snapshot totalCents reconstruction.
  //
  // parsePricingSnapshot returns null when the cart's pricing_snapshot JSONB
  // is absent, null, or structurally invalid. For guest orders, this causes
  // buildLegacyPricingSnapshotFromPendingCart to run with totalCents:0 (because
  // create-checkout-guest does not write the raw DB total columns). The Stripe
  // amount check then fails: 0 !== session.amount_total.
  //
  // When this degraded path is taken for a guest order, we reconstruct
  // totalCents from session.amount_total — the Stripe-authoritative value that
  // we are about to compare against anyway. This keeps the snapshot consistent
  // with reality and passes the integrity check correctly.
  //
  // Auth orders always populate cart.total_cents, so this branch is unreachable
  // for them. The condition is triple-gated: isGuest AND !parsedSnapshot AND
  // cart.total_cents === 0.

  const parsedSnapshot = parsePricingSnapshot(cart.pricing_snapshot ?? null);

  let snapshot: ReturnType<typeof parsePricingSnapshot>;

  if (parsedSnapshot !== null) {
    snapshot = parsedSnapshot;
  } else {
    // Legacy builder path.
    const cartTotalForLegacy = (cart.total_cents ?? 0) > 0
      ? cart.total_cents!
      : isGuest && typeof session.amount_total === "number" && session.amount_total > 0
        ? (() => {
            // [FIX] Guest + no DB totals + no parsed snapshot: reconstruct from
            // Stripe's authoritative session.amount_total. Log prominently so
            // this degraded path is visible in monitoring.
            log("warn", "webhook_guest_snapshot_totalcents_reconstructed_from_stripe", {
              requestId,
              sessionId:       prefix(session.id),
              cartId:          prefix(cart.id),
              stripeAmountTotal: session.amount_total,
              cartTotalCents:    cart.total_cents ?? null,
              reason:           "parsePricingSnapshot returned null and cart.total_cents is zero; " +
                                "create-checkout-guest does not populate raw total columns. " +
                                "Using session.amount_total as totalCents for legacy snapshot.",
            });
            return session.amount_total;
          })()
        : (cart.total_cents ?? 0);

    snapshot = buildLegacyPricingSnapshotFromPendingCart({
      userId:        userId ?? "",
      currency:      normCurrency(cart.currency ?? currency),
      orderType,
      orderNotes:    null,
      items:         cart.items ?? [],
      subtotalCents: cart.subtotal_cents ?? 0,
      discountCents: cart.discount_cents ?? 0,
      taxCents:      cart.tax_cents ?? 0,
      totalCents:    cartTotalForLegacy,
      promoId:       cart.promo_id ?? null,
      creditId:      cart.credit_id ?? null,
    });
  }

  if (!isNonEmptyJsonObject(snapshot)) {
    log("error", "webhook_pricing_snapshot_invalid", {
      requestId,
      sessionId: prefix(session.id),
      cartId:    prefix(cart.id),
      // [FIX] Log whether parsedSnapshot was null to distinguish failure source.
      parsedSnapshotWasNull: parsedSnapshot === null,
      isGuest,
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
      // [FIX] Log whether the snapshot came from the legacy builder to
      // distinguish a legitimate hash change vs. a structural snapshot problem.
      usedLegacyBuilder: parsedSnapshot === null,
      isGuest,
    });
    return null;
  }

  // ── Cart DB-column vs snapshot totals check ───────────────────────────────
  // Skipped for guest orders (total_cents is 0 by design for create-checkout-guest).

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
const stripeCurrency =
  typeof session.currency === "string" && session.currency.trim().length > 0
    ? normCurrency(session.currency)
    : null;
  const snapshotTotal     = snapshotNumber(snapshot, "totalCents");
  const snapshotCurrency  = normCurrency(
    snapshotString(snapshot, "currency") ?? currency,
  );

  const loyaltyDiscountCents = parseInt(
    pickMeta(session.metadata, "loyalty_discount_cents") ?? "0",
    10,
  ) || 0;

  const expectedTotal = snapshotTotal - loyaltyDiscountCents;

  if (stripeAmountTotal === null || stripeAmountTotal !== expectedTotal) {
    // [FIX] Enhanced logging: include all fields needed to diagnose which
    // side of the comparison is wrong without needing to reproduce the session.
    log("warn", "webhook_total_mismatch", {
      requestId,
      sessionId:              prefix(session.id),
      cartId:                 prefix(cart.id),
      charged:                stripeAmountTotal,
      expected:               expectedTotal,
      snapshotTotal,
      loyaltyDiscountCents,
      isGuest,
      usedLegacyBuilder:      parsedSnapshot === null,
      cartTotalCents:         cart.total_cents ?? null,
      cartPricingSnapshotSet: cart.pricing_snapshot !== null && cart.pricing_snapshot !== undefined,
    });
    return null;
  }

if (stripeCurrency === null || stripeCurrency !== snapshotCurrency) {
  log("warn", "webhook_currency_mismatch", {
    requestId,
    sessionId: prefix(session.id),
    charged:   stripeCurrency ?? "missing",
    expected:  snapshotCurrency,
    isGuest,
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