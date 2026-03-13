import Stripe from "stripe";

import {
  type PricingSnapshot,
  pricingSnapshotToJson,
} from "../_shared/pricing.ts";
import { CART_TTL_MS } from "./env.ts";
import { asErr, log, prefix } from "./logging.ts";
import {
  isRecord,
  normalizeString,
  normCurrency,
  pickMeta,
  serializeToJson,
} from "./request-validation.ts";
import type {
  DbClient,
  PendingCartInsert,
  PendingCartUpdate,
  RequestCartItemInput,
  ReusablePendingCartRow,
} from "./types.ts";

export function parseReusablePendingCartRow(
  value: unknown,
): ReusablePendingCartRow | null {
  if (!isRecord(value)) return null;

  const id = normalizeString(value["id"]);
  const stripeSessionId = normalizeString(value["stripe_session_id"]);
  if (!id || !stripeSessionId) return null;

  const expiresAtRaw = value["expires_at"];
  const pricingHashRaw = value["pricing_hash"];
  const currencyRaw = value["currency"];

  return {
    id,
    stripeSessionId,
    expiresAt: typeof expiresAtRaw === "string" && expiresAtRaw.trim()
      ? expiresAtRaw.trim()
      : null,
    pricingHash: typeof pricingHashRaw === "string" && pricingHashRaw.trim()
      ? pricingHashRaw.trim()
      : null,
    currency: typeof currencyRaw === "string" && currencyRaw.trim()
      ? currencyRaw.trim()
      : null,
  };
}

export async function findReusableSession(args: {
  db: DbClient;
  stripe: Stripe;
  userId: string;
  idempotencyKey: string;
  pricingHash: string;
  totalCents: number;
  currency: string;
  requestId: string;
}): Promise<{ cartId: string; session: Stripe.Checkout.Session } | null> {
  const {
    db,
    stripe,
    userId,
    idempotencyKey,
    pricingHash,
    totalCents,
    currency,
    requestId,
  } = args;

  try {
    const { data, error } = await db
      .from("pending_carts")
      .select("id, stripe_session_id, expires_at, pricing_hash, currency")
      .eq("user_id", userId)
      .eq("idempotency_key", idempotencyKey)
      .not("stripe_session_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      log("warn", "checkout_reuse_lookup_failed", {
        requestId,
        userId: prefix(userId),
        error: error.message,
      });
      return null;
    }

    const row = parseReusablePendingCartRow(data);
    if (!row) {
      return null;
    }

    if (row.expiresAt && new Date(row.expiresAt) <= new Date()) {
      return null;
    }

    const session = await stripe.checkout.sessions.retrieve(
      row.stripeSessionId,
      {
        expand: ["payment_intent"],
      },
    );

    if (session.status !== "open" || !session.url) {
      return null;
    }

    if (
      typeof session.expires_at === "number" &&
      session.expires_at * 1000 <= Date.now()
    ) {
      return null;
    }

    const owner = pickMeta(session.metadata, "user_id", "customer_uid", "uid");
    if (!owner || owner !== userId) {
      return null;
    }

    const sessionCartId = pickMeta(
      session.metadata,
      "pending_cart_id",
      "cart_ref",
      "cart_id",
    );
    if (!sessionCartId || sessionCartId !== row.id) {
      return null;
    }

    const sessionPricingHash = pickMeta(session.metadata, "pricing_hash");
    if (!sessionPricingHash || sessionPricingHash !== pricingHash) {
      return null;
    }

    if (row.pricingHash && row.pricingHash !== pricingHash) {
      return null;
    }

    const sessionAmountTotal = typeof session.amount_total === "number"
      ? session.amount_total
      : null;
    if (sessionAmountTotal === null || sessionAmountTotal !== totalCents) {
      return null;
    }

    if (normCurrency(session.currency) !== normCurrency(currency)) {
      return null;
    }

    if (row.currency && normCurrency(row.currency) !== normCurrency(currency)) {
      return null;
    }

    return {
      cartId: row.id,
      session,
    };
  } catch (error) {
    log("warn", "checkout_reuse_lookup_exception", {
      requestId,
      userId: prefix(userId),
      error: asErr(error),
    });
    return null;
  }
}

export async function persistPendingCart(args: {
  db: DbClient;
  userId: string;
  items: RequestCartItemInput[];
  snapshot: PricingSnapshot;
  pricingHash: string;
  promoId: string | null;
  creditId: string | null;
  idempotencyKey: string;
  requestId: string;
}): Promise<{ cartId: string } | null> {
  const {
    db,
    userId,
    items,
    snapshot,
    pricingHash,
    promoId,
    creditId,
    idempotencyKey,
    requestId,
  } = args;

  try {
    const cartId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + CART_TTL_MS).toISOString();
    const snapshotJson = pricingSnapshotToJson(snapshot);

    const insert: PendingCartInsert = {
      id: cartId,
      user_id: userId,
      items: serializeToJson(items),
      subtotal_cents: snapshot.subtotalCents,
      discount_cents: (snapshot.promoDiscountCents ?? 0) +
        (snapshot.campaignDiscountCents ?? 0) +
        (snapshot.creditCents ?? 0),
      tax_cents: snapshot.taxCents,
      total_cents: snapshot.totalCents,
      promo_id: promoId,
      credit_id: creditId,
      expires_at: expiresAt,
      stripe_session_id: null,
      idempotency_key: idempotencyKey,
      pricing_snapshot: snapshotJson,
      pricing_hash: pricingHash,
      currency: snapshot.currency,
    };

    const { data, error } = await db
      .from("pending_carts")
      .insert(insert)
      .select("id")
      .single();

    if (error) {
      log("error", "checkout_pending_cart_insert_failed", {
        requestId,
        userId: prefix(userId),
        error: error.message,
      });
      return null;
    }

    return { cartId: data.id };
  } catch (error) {
    log("error", "checkout_pending_cart_insert_exception", {
      requestId,
      userId: prefix(userId),
      error: asErr(error),
    });
    return null;
  }
}

export async function backfillCartSessionId(
  db: DbClient,
  cartId: string,
  stripeSessionId: string,
  snapshot: PricingSnapshot,
  pricingHash: string,
  requestId: string,
): Promise<void> {
  try {
    const update: PendingCartUpdate = {
      stripe_session_id: stripeSessionId,
      pricing_snapshot: pricingSnapshotToJson(snapshot),
      pricing_hash: pricingHash,
      currency: snapshot.currency,
    };

    const { error } = await db
      .from("pending_carts")
      .update(update)
      .eq("id", cartId)
      .is("stripe_session_id", null);

    if (error) {
      log("warn", "checkout_pending_cart_backfill_failed", {
        requestId,
        cartId: prefix(cartId),
        error: error.message,
      });
    }
  } catch (error) {
    log("warn", "checkout_pending_cart_backfill_exception", {
      requestId,
      cartId: prefix(cartId),
      error: asErr(error),
    });
  }
}
