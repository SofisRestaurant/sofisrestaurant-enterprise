// supabase/functions/stripe-webhook/handlers/checkout-session-completed.ts
// =============================================================================
// [PATCH] Two targeted changes for idempotency hardening:
//   1. Import markEventCompleted from idempotency.ts
//   2. After successful Promise.all, call markEventCompleted (status→completed)
//   3. Pass handler error message to releaseIdempotencyClaim for observability
//
// All other logic is UNCHANGED from the prior version.
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
import {
  checkEventIdempotency,
  markEventCompleted,         // [PATCH] new import
  releaseIdempotencyClaim,
} from "../shared/idempotency.ts";

// ─── Loyalty finalization ─────────────────────────────────────────────────────

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

// ─── Abandoned cart recovery ──────────────────────────────────────────────────

async function markAbandonedCartRecovered(args: {
  db:            DbClient;
  pendingCartId: string | null;
  requestId:     string;
  sessionId:     string;
}): Promise<void> {
  const { db, pendingCartId, requestId, sessionId } = args;

  if (!pendingCartId || pendingCartId.trim().length === 0) {
    log("warn", "webhook_abandoned_cart_recovery_no_cart_id", {
      requestId,
      sessionId: prefix(sessionId),
    });
    return;
  }

  try {
    const { error } = await db
      .from("abandoned_cart_sessions")
      .update({ recovered: true })
      .eq("id", pendingCartId)
      .eq("recovered", false);

    if (error) {
      log("warn", "webhook_abandoned_cart_recovery_update_failed", {
        requestId,
        sessionId:     prefix(sessionId),
        pendingCartId: prefix(pendingCartId),
        error:         error.message,
      });
      return;
    }

    log("info", "webhook_abandoned_cart_recovered", {
      requestId,
      sessionId:     prefix(sessionId),
      pendingCartId: prefix(pendingCartId),
    });
  } catch (err) {
    log("warn", "webhook_abandoned_cart_recovery_crashed", {
      requestId,
      sessionId:     prefix(sessionId),
      pendingCartId: prefix(pendingCartId),
      error:         err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Guest SMS consent ────────────────────────────────────────────────────────

const E164_US_PHONE_RE = /^\+1[2-9]\d{9}$/;

function extractGuestSmsConsent(
  session:   Stripe.Checkout.Session,
  requestId: string,
): { smsOptIn: boolean; phoneE164: string | null } {
  const pi = session.payment_intent;

  const piMeta: Stripe.Metadata | null =
    typeof pi !== "string" && pi !== null ? pi.metadata : null;

  const effectiveMeta: Stripe.Metadata = piMeta ?? session.metadata ?? {};

  if (effectiveMeta["guest_sms_opt_in"] !== "true") {
    return { smsOptIn: false, phoneE164: null };
  }

  const rawPhone: string = effectiveMeta["guest_phone_e164"] ?? "";
  if (!E164_US_PHONE_RE.test(rawPhone)) {
    log("warn", "webhook_guest_phone_invalid_in_metadata", {
      requestId,
      sessionId: prefix(session.id),
    });
    return { smsOptIn: false, phoneE164: null };
  }

  return { smsOptIn: true, phoneE164: rawPhone };
}

async function persistGuestSmsConsent(args: {
  db:         DbClient;
  orderId:    string;
  phoneE164:  string;
  requestId:  string;
}): Promise<void> {
  const { db, orderId, phoneE164, requestId } = args;
  try {
    const { error } = await db
      .from("orders")
      .update({ sms_opt_in: true, guest_phone_e164: phoneE164 })
      .eq("id", orderId);

    if (error) {
      log("warn", "webhook_guest_sms_consent_persist_failed", {
        requestId,
        orderId: prefix(orderId),
        error:   error.message,
      });
    }
  } catch (err) {
    log("warn", "webhook_guest_sms_consent_persist_crashed", {
      requestId,
      orderId: prefix(orderId),
      error:   err instanceof Error ? err.message : String(err),
    });
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

  // ── Steps 2–6 wrapped in try/catch ────────────────────────────────────────
  try {

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
  const metaResult = parseCheckoutMetadata(session.metadata, requestId);
  if (!metaResult.ok) {
    log("error", "webhook_checkout_metadata_invalid_paid_session", {
      requestId,
      sessionId: prefix(session.id),
      code:      metaResult.code,
      message:   metaResult.message,
    });
    throw new Error(
      `webhook_checkout_metadata_invalid:${session.id}:${metaResult.code}`,
    );
  }
  const meta = metaResult.value;

  const userId:     string | null = meta.userId;
  const guestToken: string | null = meta.guestToken;
  const isGuest = userId === null;

  const pendingCartId: string | null = meta.pendingCartId;

  // ── 3b. Guest SMS consent extraction ──────────────────────────────────────
  const guestSmsConsent = extractGuestSmsConsent(session, requestId);

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

    sideEffects.push(
      markAbandonedCartRecovered({
        db,
        pendingCartId,
        requestId,
        sessionId: session.id,
      }),
    );
  }

  if (guestSmsConsent.smsOptIn && guestSmsConsent.phoneE164 !== null) {
    sideEffects.push(
      persistGuestSmsConsent({
        db,
        orderId,
        phoneE164: guestSmsConsent.phoneE164,
        requestId,
      }),
    );
  }

  if (userId !== null) {
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

  if (wasNewOrder && !verificationRequired) {
    sideEffects.push(
      notifyKitchen({
        db,
        orderId,
        userId:          userId ?? "",
        fulfillmentType: meta.orderType,
        amountTotal:     orderTotal,
        requestId,
      }),

      sendOrderConfirmationSms({ db, orderId, requestId }),
    );
  }

  await Promise.all(sideEffects);

  // ── [PATCH] Mark idempotency record as completed ──────────────────────────
  // Best-effort. If this fails, the row still exists with status='processing'
  // which correctly prevents re-processing on retry.
  await markEventCompleted(db, event.id, requestId);

  log("info", "webhook_checkout_completed", {
    requestId,
    orderId:              prefix(orderId),
    sessionId:            prefix(session.id),
    wasNewOrder,
    orderTotal,
    isGuest,
    userId:               prefix(userId ?? "guest"),
    verificationRequired,
    pendingCartId:        prefix(pendingCartId ?? "none"),
    guestSmsOptIn:        guestSmsConsent.smsOptIn,
  });

  } catch (err) {
    // [PATCH] Pass error message for observability in stripe_webhook_events.
    const errMsg = err instanceof Error ? err.message : String(err);
    await releaseIdempotencyClaim(db, event.id, requestId, errMsg);
    throw err;
  }
}