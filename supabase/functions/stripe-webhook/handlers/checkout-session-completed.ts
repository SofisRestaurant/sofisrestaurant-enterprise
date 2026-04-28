// supabase/functions/stripe-webhook/handlers/checkout-session-completed.ts
// =============================================================================
// Phase 2 hardened — all direct metadata access replaced by
// parseCheckoutMetadata(). checkEventIdempotency() is the first statement;
// DB errors cause a hard throw so Stripe retries the event.
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
  parseCheckoutSessionEventRef,
  shouldRepairToPaid,
  toJson,
} from "../utils.ts";
import {
  parseCheckoutMetadata,
  type ParsedCheckoutMetadata,
} from "../shared/metadata.ts";
import { checkEventIdempotency } from "../shared/idempotency.ts";

// ─── Loyalty finalization ─────────────────────────────────────────────────────
// Auth-only. Never called when userId is null.

async function finalizeLoyaltyReserve(args: {
  db:        DbClient;
  sessionId: string;
  userId:    string;
  meta:      ParsedCheckoutMetadata;
  requestId: string;
}): Promise<void> {
  const { db, sessionId, userId, meta, requestId } = args;
  const {
    loyaltyAccountId,
    loyaltyPreSessionKey,
    loyaltyReservedPoints,
    loyaltyDiscountCents,
  } = meta;

  if (
    loyaltyAccountId === null ||
    loyaltyPreSessionKey === null ||
    (loyaltyReservedPoints ?? 0) <= 0
  ) {
    return;
  }

  const { error: flipError } = await db
    .from("loyalty_ledger")
    .insert({
      account_id:      loyaltyAccountId,
      amount:          0,
      balance_after:   0,
      entry_type:      "checkout_release",
      source:          "online_checkout",
      idempotency_key: `release:${loyaltyPreSessionKey}`,
      metadata: {
        stripe_session_id: sessionId,
        reason:            "payment_completed",
        loyalty_points:    loyaltyReservedPoints,
        loyalty_cents:     loyaltyDiscountCents,
        user_id:           userId,
      },
    });

  if (flipError) {
    log("warn", "webhook_loyalty_ledger_flip_failed", {
      requestId,
      sessionId: prefix(sessionId),
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
  // ── 1. Idempotency guard — MUST be first ──────────────────────────────────
  const idempotency = await checkEventIdempotency(
    db,
    event.id,
    event.type,
    requestId,
  );
  if (idempotency.alreadyProcessed) return;
  if (idempotency.dbError) {
    throw new Error(`webhook_idempotency_failed:${event.id} — ${idempotency.error}`);
  }

  // ── 2. Resolve session reference ──────────────────────────────────────────
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

  // ── 3. Parse and validate all metadata in one place ───────────────────────
  // No handler code below this point may access session.metadata directly.
  const metaResult = parseCheckoutMetadata(session.metadata, requestId);
  if (!metaResult.ok) {
    log("warn", "webhook_checkout_metadata_invalid", {
      requestId,
      sessionId: prefix(session.id),
      code:      metaResult.code,
      message:   metaResult.message,
    });
    // Hard return — do not process an event with unvalidated metadata.
    // Stripe will not retry a 200 response; the event is effectively dropped.
    // This is intentional: malformed metadata indicates a checkout bug, not
    // a transient failure. Log and alert on this in prod.
    return;
  }
  const meta = metaResult.value;

  // Identity — sourced ONLY from ParsedCheckoutMetadata, never raw metadata.
  const userId:     string | null = meta.userId;
  const guestToken: string | null = meta.guestToken;
  const isGuest = userId === null;

  // ── 4. Find or create order ───────────────────────────────────────────────
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

  // ── 5. Read verification_status to gate fulfillment ───────────────────────
  let verificationRequired = false;
  if (wasNewOrder) {
    const verificationStatus = await readVerificationStatus(db, orderId, requestId);
    verificationRequired = verificationStatus === "required";

    if (verificationRequired) {
      log("info", "webhook_fulfillment_held_pending_verification", {
        requestId,
        orderId:   prefix(orderId),
        sessionId: prefix(session.id),
        isGuest,
      });
    }
  }

  // ── 6. Side effects ───────────────────────────────────────────────────────
  // Rules:
  //   upsertPaymentTransaction  → all orders (auth + guest)
  //   new_order notify          → all new orders
  //   loyalty / promo / credit  → auth-only (userId !== null)
  //   notifyKitchen + SMS       → new orders where verification is not required

  const sideEffects: Promise<void>[] = [
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

  // ── Auth-only ──────────────────────────────────────────────────────────────
  if (userId !== null) {
    // subtotalCents: use validated metadata value; fall back to order total
    // only as a last resort (should never happen if metadata is complete).
    const subtotalCents = meta.subtotalCents ?? orderTotal;

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

      finalizeLoyaltyReserve({
        db,
        sessionId: session.id,
        userId,
        meta,
        requestId,
      }),
    );

    if (meta.promoId !== null) {
      sideEffects.push(
        recordPromoRedemptionIfMissing({
          db,
          promotionId:     meta.promoId,
          userId,
          sessionId:       session.id,
          discountCents:   meta.promoDiscountCents ?? 0,
          orderTotalCents: meta.totalCents ?? orderTotal,
          requestId,
        }),
      );
    }

    if (meta.creditId !== null) {
      sideEffects.push(
        markCreditUsedIfPending({
          db,
          creditId:  meta.creditId,
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
  if (wasNewOrder && !verificationRequired) {
    sideEffects.push(
      notifyKitchen({
        db,
        orderId,
        // notifyKitchen logs userId for observability only — not written to DB.
        // Guest orders pass "" for backward compat with the existing function
        // signature (which accepts string, not string | null).
        userId:          userId ?? "",
        fulfillmentType: meta.orderType,
        amountTotal:     orderTotal,
        requestId,
      }),

      sendOrderConfirmationSms({ db, orderId, requestId }),
    );
  }

  await Promise.all(sideEffects);

  log("info", "webhook_checkout_completed", {
    requestId,
    orderId:              prefix(orderId),
    sessionId:            prefix(session.id),
    wasNewOrder,
    orderTotal,
    isGuest,
    userId:               prefix(userId ?? "guest"),
    verificationRequired,
  });
}