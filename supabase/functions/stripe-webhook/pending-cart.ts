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
  db: DbClient;
  session: Stripe.Checkout.Session;
  userId: string;
  requestId: string;
}): Promise<PreparedCartState | null> {
  const { db, session, userId, requestId } = args;

  const cartRef = pickMeta(
    session.metadata,
    "pending_cart_id",
    "cart_ref",
    "cart_id",
  );
  const cart = await loadPendingCart(db, cartRef, session.id, userId);

  if (cart === null) {
    log("warn", "webhook_pending_cart_not_found", {
      requestId,
      sessionId: prefix(session.id),
      cartRef: prefix(cartRef),
      userId: prefix(userId),
    });
    return null;
  }

  if (cart.user_id !== userId) {
    log("warn", "webhook_pending_cart_owner_mismatch", {
      requestId,
      sessionId: prefix(session.id),
      cartId: prefix(cart.id),
      cartUserId: prefix(cart.user_id),
      userId: prefix(userId),
    });
    return null;
  }

  const orderType = normalizeOrderType(
    pickMeta(session.metadata, "order_type"),
  );
  const currency = normCurrency(session.currency ?? cart.currency ?? "usd");

  const parsedSnapshot = parsePricingSnapshot(cart.pricing_snapshot ?? null);
  const snapshot = parsedSnapshot ??
    buildLegacyPricingSnapshotFromPendingCart({
      userId,
      currency: normCurrency(cart.currency ?? currency),
      orderType,
      orderNotes: null,
      items: cart.items ?? [],
      subtotalCents: cart.subtotal_cents ?? 0,
      discountCents: cart.discount_cents ?? 0,
      taxCents: cart.tax_cents ?? 0,
      totalCents: cart.total_cents ?? 0,
      promoId: cart.promo_id ?? null,
      creditId: cart.credit_id ?? null,
    });

  if (!isNonEmptyJsonObject(snapshot)) {
    log("error", "webhook_pricing_snapshot_invalid", {
      requestId,
      sessionId: prefix(session.id),
      cartId: prefix(cart.id),
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
      cartId: prefix(cart.id),
      error: asErr(error),
    });
    return null;
  }

  if (pricingHash.trim().length < 16) {
    log("error", "webhook_pricing_hash_invalid", {
      requestId,
      sessionId: prefix(session.id),
      cartId: prefix(cart.id),
    });
    return null;
  }

  if (
    cart.pricing_hash !== null && cart.pricing_hash !== undefined &&
    cart.pricing_hash !== pricingHash
  ) {
    log("warn", "webhook_pricing_hash_mismatch", {
      requestId,
      sessionId: prefix(session.id),
      cartId: prefix(cart.id),
      storedHash: prefix(cart.pricing_hash, 16),
      recalculatedHash: prefix(pricingHash, 16),
    });
    return null;
  }

  const expectedDiscountCents =
    snapshotNumber(snapshot, "campaignDiscountCents") +
    snapshotNumber(snapshot, "promoDiscountCents");

  if (
    (cart.subtotal_cents ?? 0) !== snapshotNumber(snapshot, "subtotalCents") ||
    (cart.discount_cents ?? 0) !== expectedDiscountCents ||
    (cart.tax_cents ?? 0) !== snapshotNumber(snapshot, "taxCents") ||
    (cart.total_cents ?? 0) !== snapshotNumber(snapshot, "totalCents")
  ) {
    log("warn", "webhook_pending_cart_total_mismatch", {
      requestId,
      sessionId: prefix(session.id),
      cartId: prefix(cart.id),
      subtotal: cart.subtotal_cents ?? null,
      discount: cart.discount_cents ?? null,
      tax: cart.tax_cents ?? null,
      total: cart.total_cents ?? null,
      expectedSubtotal: snapshotNumber(snapshot, "subtotalCents"),
      expectedDiscount: expectedDiscountCents,
      expectedTax: snapshotNumber(snapshot, "taxCents"),
      expectedTotal: snapshotNumber(snapshot, "totalCents"),
    });
    return null;
  }

  const stripeAmountTotal = typeof session.amount_total === "number"
    ? session.amount_total
    : null;
  const stripeCurrency = normCurrency(session.currency ?? "usd");
  const snapshotTotal = snapshotNumber(snapshot, "totalCents");
  const snapshotCurrency = normCurrency(
    snapshotString(snapshot, "currency") ?? currency,
  );

  if (stripeAmountTotal === null || stripeAmountTotal !== snapshotTotal) {
    log("warn", "webhook_total_mismatch", {
      requestId,
      sessionId: prefix(session.id),
      charged: stripeAmountTotal,
      expected: snapshotTotal,
    });
    return null;
  }

  if (stripeCurrency !== snapshotCurrency) {
    log("warn", "webhook_currency_mismatch", {
      requestId,
      sessionId: prefix(session.id),
      charged: stripeCurrency,
      expected: snapshotCurrency,
    });
    return null;
  }

  const needsRepair = !isNonEmptyJsonObject(cart.pricing_snapshot ?? null) ||
    typeof cart.pricing_hash !== "string" ||
    cart.pricing_hash.trim().length < 16 ||
    cart.stripe_session_id !== session.id;

  if (needsRepair) {
    const repairPatch: PendingCartUpdate = {
      pricing_snapshot: toJson(snapshot),
      pricing_hash: pricingHash,
      stripe_session_id: session.id,
    };

    const { error } = await db.from("pending_carts").update(repairPatch).eq(
      "id",
      cart.id,
    );

    if (error !== null) {
      log("error", "webhook_pending_cart_repair_failed", {
        requestId,
        sessionId: prefix(session.id),
        cartId: prefix(cart.id),
        code: error.code ?? null,
        message: error.message,
      });
      return null;
    }
  }

  const consumePatch: PendingCartUpdate = {
    consumed_at: nowIso(),
    stripe_session_id: session.id,
    pricing_snapshot: toJson(snapshot),
    pricing_hash: pricingHash,
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
      cartId: prefix(cart.id),
      code: consumeError.code ?? null,
      message: consumeError.message,
    });
    return null;
  }

  return {
    cart,
    snapshot,
    pricingHash,
    orderType,
    currency: snapshotCurrency,
    consumedNow: Array.isArray(consumeRows) && consumeRows.length > 0,
  };
}
