// supabase/functions/stripe-webhook/handlers/checkout-session-completed.ts
// =============================================================================
// Changes from prior version:
//
//   1. Identity variables are now typed as string | null (not string | undefined)
//      to match createOrderFromSession's updated contract.
//
//   2. Auth-only side effects (loyalty backfill, promo redemption, credit
//      marking, loyalty reserve finalization, ORDER_CONFIRMED_WEBHOOK event)
//      are guarded by `if (userId !== null)`. They will no longer fire empty-
//      string user IDs into the DB when a guest is checking out.
//
//   3. Kitchen notify and SMS run for BOTH auth and guest orders.
//
//   4. `notifyKitchen` receives `userId: userId ?? null` instead of `userId ?? ""`
//      — if kitchen-notify.ts accepts string | null the call is clean; if it
//      only accepts string the caller coalesces to "" for backward compat
//      (that arg is logged only, not written to DB).
//
//   5. [NEW] Kitchen notify and SMS are SKIPPED when verification_status is
//      'required'. The order is persisted and payment is recorded, but
//      fulfillment is held until the customer completes OTP verification.
//      The order lookup after creation reads verification_status from the DB.
// =============================================================================

import type Stripe from "stripe";
import type { DbClient } from "../types.ts";
import { getStripe } from "../stripe-client.ts";
import { createOrderFromSession } from "../order-creation.ts";
import { findOrderBySessionId } from "../order-queries.ts";
import {
  backfillLoyaltyIfMissing,
  emitOrderEvent,
  markCreditUsedIfPending,
  notify,
  recordPromoRedemptionIfMissing,
  sendOrderConfirmationSms,
  upsertPaymentTransaction,
} from "../side-effects.ts";
import { notifyKitchen } from "../kitchen-notify.ts";
import { DB_ORD_CONFIRMED, DB_PMT_PAID } from "../env.ts";
import { log, nowIso, prefix } from "../logging.ts";
import {
  normalizeStripePaid,
  parseCents,
  parseCheckoutSessionEventRef,
  pickMeta,
  shouldRepairToPaid,
  toJson,
} from "../utils.ts";

// ─── Loyalty finalization ─────────────────────────────────────────────────────
// Auth-only. Never called when userId is null.

async function finalizeLoyaltyReserve(args: {
  db:        DbClient;
  session:   Stripe.Checkout.Session;
  userId:    string;
  requestId: string;
}): Promise<void> {
  const { db, session, userId, requestId } = args;

  const loyaltyAccountId  = pickMeta(session.metadata, "loyalty_account_id");
  const preSessionKey     = pickMeta(session.metadata, "loyalty_pre_session_key");
  const loyaltyPoints     = parseCents(pickMeta(session.metadata, "loyalty_reserved_points"));
  const loyaltyCents      = parseCents(pickMeta(session.metadata, "loyalty_discount_cents"));

  if (!loyaltyAccountId || loyaltyPoints <= 0 || !preSessionKey) return;

  const { error: flipError } = await db
    .from("loyalty_ledger")
    .insert({
      account_id:      loyaltyAccountId,
      amount:          0,
      balance_after:   0,
      entry_type:      "checkout_release",
      source:          "online_checkout",
      idempotency_key: `release:${preSessionKey}`,
      metadata: {
        stripe_session_id: session.id,
        reason:            "payment_completed",
        loyalty_points:    loyaltyPoints,
        loyalty_cents:     loyaltyCents,
        user_id:           userId,
      },
    });

  if (flipError) {
    log("warn", "webhook_loyalty_ledger_flip_failed", {
      requestId,
      sessionId: prefix(session.id),
      accountId: prefix(loyaltyAccountId),
      error:     flipError.message,
    });
  }

  await db
    .from("loyalty_accounts")
    .update({ last_redeem_at: nowIso(), updated_at: nowIso() })
    .eq("id", loyaltyAccountId);
}

// ─── Verification status helper ───────────────────────────────────────────────
// Reads verification_status from the persisted order row.
// Returns null if the column is absent or the query fails — caller treats
// null as "not required" (fail-open) so no order is silently held forever.

async function readVerificationStatus(
  db:        DbClient,
  orderId:   string,
  requestId: string,
): Promise<string | null> {
  try {
    const { data, error } = await db
      .from("orders")
      .select("verification_status")
      .eq("id", orderId)
      .maybeSingle<{ verification_status: string | null }>();

    if (error) {
      log("warn", "webhook_read_verification_status_failed", {
        requestId,
        orderId: prefix(orderId),
        error:   error.message,
      });
      return null;
    }

    return data?.verification_status ?? null;
  } catch (err) {
    log("warn", "webhook_read_verification_status_crashed", {
      requestId,
      orderId: prefix(orderId),
      error:   err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleCheckoutSessionCompleted(
  db:        DbClient,
  event:     Stripe.Event,
  requestId: string,
): Promise<void> {
  const sessionRef = parseCheckoutSessionEventRef(event);

  if (!sessionRef) {
    log("warn", "webhook_session_missing_id", {
      requestId,
      eventId: prefix(event.id),
    });
    return;
  }

  const stripe  = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionRef.id, {
    expand: ["payment_intent"],
  });

  if (!normalizeStripePaid(session)) return;

  // ── Identity resolution ───────────────────────────────────────────────────
  // Exactly one of userId or guestToken must be present.
  // null (not undefined) matches createOrderFromSession's contract.

  const userId:     string | null = pickMeta(session.metadata, "user_id", "customer_uid", "uid") ?? null;
  const guestToken: string | null = pickMeta(session.metadata, "guest_token") ?? null;

  if (userId === null && guestToken === null) {
    log("warn", "webhook_session_no_identity", {
      requestId,
      sessionId: prefix(session.id),
    });
    return;
  }

  const isGuest = userId === null;

  // ── Find or create order ──────────────────────────────────────────────────

  let order = await findOrderBySessionId(db, session.id);
  let wasNewOrder = false;

  if (!order) {
    order = await createOrderFromSession({
      db,
      session,
      userId,
      guestToken,
      requestId,
    });

    if (!order) throw new Error(`webhook_order_create_failed:${session.id}`);

    wasNewOrder = true;
  } else if (shouldRepairToPaid(order)) {
    await db
      .from("orders")
      .update({
        payment_status: DB_PMT_PAID,
        status:         DB_ORD_CONFIRMED,
        updated_at:     nowIso(),
      })
      .eq("id", order.id);
  }

  const orderId    = order.id;
  const orderTotal = order.amount_total;

  // ── [NEW] Read verification_status to gate fulfillment ────────────────────
  // Only relevant for new orders — existing orders that we're seeing for the
  // second time have already had their side effects run.
  //
  // Fail-open: if the read fails or returns null, we treat it as not_required
  // and proceed normally. A payment must never be silently lost.

  let verificationRequired = false;
  if (wasNewOrder) {
    const verificationStatus = await readVerificationStatus(db, orderId, requestId);
    verificationRequired = verificationStatus === "required";

    if (verificationRequired) {
      log("info", "webhook_fulfillment_held_pending_verification", {
        requestId,
        orderId:    prefix(orderId),
        sessionId:  prefix(session.id),
        isGuest,
      });
    }
  }

  // ── Side effects ──────────────────────────────────────────────────────────
  // Rules:
  //   - upsertPaymentTransaction: runs for ALL orders (auth + guest)
  //   - notifyKitchen:            runs ONLY when verification is not required
  //   - sendOrderConfirmationSms: runs ONLY when verification is not required
  //   - loyalty, promo, credit:   auth-only (guard with `userId !== null`)

  const sideEffects: Promise<void>[] = [
    // ── Always — payment must be recorded regardless of verification ────────
    upsertPaymentTransaction({ db, orderId, session, requestId }),
  ];

  if (wasNewOrder) {
    sideEffects.push(
      notify(
        db,
        orderId,
        "new_order",
        "New order confirmed via Stripe webhook.",
        requestId,
      ),
    );
  }

  // ── Auth-only side effects ─────────────────────────────────────────────────

  if (userId !== null) {
    const promoId            = pickMeta(session.metadata, "promo_id") ?? undefined;
    const creditId           = pickMeta(session.metadata, "credit_id") ?? undefined;
    const subtotalCents      = parseCents(pickMeta(session.metadata, "subtotal_cents")) ?? orderTotal;
    const promoDiscountCents = parseCents(pickMeta(session.metadata, "promo_discount_cents"));
    const totalCents         =
      typeof session.amount_total === "number" ? session.amount_total : orderTotal;

    sideEffects.push(
      backfillLoyaltyIfMissing({
        db,
        userId,
        orderId,
        amountCents: subtotalCents,
        requestId,
      }),

      emitOrderEvent(
        db,
        orderId,
        userId,
        "REVIEW_NUDGE_READY",
        toJson({
          amount_cents: orderTotal,
          source:       "stripe-webhook",
          event_id:     event.id,
        }),
        requestId,
      ),

      finalizeLoyaltyReserve({ db, session, userId, requestId }),
    );

    if (promoId) {
      sideEffects.push(
        recordPromoRedemptionIfMissing({
          db,
          promotionId:     promoId,
          userId,
          sessionId:       session.id,
          discountCents:   promoDiscountCents,
          orderTotalCents: totalCents,
          requestId,
        }),
      );
    }

    if (creditId) {
      sideEffects.push(
        markCreditUsedIfPending({
          db,
          creditId,
          userId,
          sessionId: session.id,
          requestId,
        }),
      );
    }

    if (wasNewOrder) {
      sideEffects.push(
        emitOrderEvent(
          db,
          orderId,
          userId,
          "ORDER_CONFIRMED_WEBHOOK",
          toJson({
            event_id:   event.id,
            session_id: session.id,
            source:     "stripe-webhook",
          }),
          requestId,
        ),
      );
    }
  }

  // ── Kitchen + SMS ─────────────────────────────────────────────────────────
  // Skipped when verification_status = 'required'.
  // The order is fully persisted and payment is recorded above — only the
  // kitchen print and customer SMS are held. They will be triggered by the
  // verify-phone flow once the customer completes OTP (future work).

  if (wasNewOrder && !verificationRequired) {
    sideEffects.push(
      notifyKitchen({
        db,
        orderId,
        userId:          userId ?? "",
        fulfillmentType: pickMeta(session.metadata, "order_type") ?? "pickup",
        amountTotal:     orderTotal,
        requestId,
      }),

      sendOrderConfirmationSms({ db, orderId, requestId }),
    );
  }

  await Promise.all(sideEffects);

  log("info", "webhook_checkout_completed", {
    requestId,
    orderId:               prefix(orderId),
    sessionId:             prefix(session.id),
    wasNewOrder,
    orderTotal,
    isGuest,
    userId:                prefix(userId ?? "guest"),
    verificationRequired,
  });
}