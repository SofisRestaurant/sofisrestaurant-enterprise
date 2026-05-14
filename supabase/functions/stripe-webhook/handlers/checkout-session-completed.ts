// supabase/functions/stripe-webhook/handlers/checkout-session-completed.ts
// =============================================================================
// Phase 2 hardened — all direct metadata access replaced by
// parseCheckoutMetadata(). checkEventIdempotency() is the first statement;
// DB errors cause a hard throw so Stripe retries the event.
//
// CHANGE FROM PRIOR VERSION:
//   Added markAbandonedCartRecovered() as a side effect in step 6.
//   (unchanged — see prior changelog)
//
// [FIX 2026-05-10] Idempotency claim released on handler failure.
//   (unchanged — see prior changelog)
//
// [HARDEN] Invalid metadata on a paid session now throws instead of returning.
//   (unchanged — see prior changelog)
//
// [SMS] Guest SMS consent persistence added to step 6.
//
//   WHAT:
//   After order creation/lookup (step 4), extractGuestSmsConsent() reads
//   guest_sms_opt_in and guest_phone_e164 from Payment Intent metadata
//   (preferred, bound to the payment event) or session metadata (fallback).
//   If the guest opted in and the phone passes E.164 validation, a non-fatal
//   UPDATE writes sms_opt_in = true and guest_phone_e164 to the orders row.
//
//   WHY PI METADATA:
//   The PI was created with metadata = sessionMetadata inside
//   create-checkout-guest/index.ts (payment_intent_data: { metadata }).
//   The session is retrieved with expand: ["payment_intent"] in step 2,
//   so pi.metadata is available at the same point as session.metadata and
//   carries the same values — but is durably bound to the payment event.
//
//   TYPE SAFETY:
//   session.payment_intent: string | Stripe.PaymentIntent | null.
//   After `typeof pi !== "string" && pi !== null`, TypeScript narrows to
//   Stripe.PaymentIntent. pi.metadata is then Stripe.Metadata (= { [name:
//   string]: string }) — no cast required at any site.
//
//   IDEMPOTENCY:
//   The UPDATE is not gated on wasNewOrder. On a webhook retry after a
//   partial first run, wasNewOrder is false (order already exists), but the
//   SMS columns may not have been written yet. Running an idempotent UPDATE
//   again is safe and repairs the row.
//
//   NON-FATAL:
//   persistGuestSmsConsent catches all errors internally. Failure here never
//   rolls back the order, never rejects the Promise.all, and never releases
//   the idempotency claim.
//
//   PRIVACY:
//   The phone value is not written to any log line.
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
  releaseIdempotencyClaim,
} from "../shared/idempotency.ts";

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
//
// These three declarations are the only additions made by the SMS feature.
// All other functions and the handler body are unchanged.

// Matches the exact format stored by PhoneNumberInput for a complete US entry
// and validated by create-checkout-guest/index.ts before writing to metadata.
const E164_US_PHONE_RE = /^\+1[2-9]\d{9}$/;

/**
 * Extracts and re-validates guest SMS consent from Stripe metadata.
 *
 * Reads from Payment Intent metadata (preferred — set at session-creation time
 * and bound to the payment event) falling back to session metadata.
 *
 * No cast is used anywhere. session.payment_intent is typed by the Stripe SDK
 * as `string | Stripe.PaymentIntent | null`. The `typeof !== "string" &&
 * !== null` guard narrows it to `Stripe.PaymentIntent`, whose `.metadata`
 * property is `Stripe.Metadata` (= `{ [name: string]: string }`). The
 * piMeta variable is explicitly widened to `Stripe.Metadata | null` so the
 * nullish-coalescing chain that follows compiles cleanly for all SDK versions.
 *
 * Returns `{ smsOptIn: false, phoneE164: null }` when the guest did not opt
 * in or when the stored phone fails the E.164 check.
 */
function extractGuestSmsConsent(
  session:   Stripe.Checkout.Session,
  requestId: string,
): { smsOptIn: boolean; phoneE164: string | null } {
  const pi = session.payment_intent;

  // Explicit | null widening keeps the nullish chain typed as Stripe.Metadata
  // regardless of whether the SDK types pi.metadata as nullable or not.
  const piMeta: Stripe.Metadata | null =
    typeof pi !== "string" && pi !== null ? pi.metadata : null;

  const effectiveMeta: Stripe.Metadata = piMeta ?? session.metadata ?? {};

  // Stripe.Metadata = { [name: string]: string }; values are always strings.
  if (effectiveMeta["guest_sms_opt_in"] !== "true") {
    return { smsOptIn: false, phoneE164: null };
  }

  // The fallback "" handles noUncheckedIndexedAccess tsconfig variants.
  const rawPhone: string = effectiveMeta["guest_phone_e164"] ?? "";
  if (!E164_US_PHONE_RE.test(rawPhone)) {
    // Metadata says opted-in but phone is invalid. Log without the value (PII).
    log("warn", "webhook_guest_phone_invalid_in_metadata", {
      requestId,
      sessionId: prefix(session.id),
    });
    return { smsOptIn: false, phoneE164: null };
  }

  return { smsOptIn: true, phoneE164: rawPhone };
}

/**
 * Persists guest SMS consent to the orders row.
 *
 * Non-fatal best-effort: all errors are caught internally and logged as warn.
 * The function never rejects so it is safe to add to the Promise.all in step 6.
 * The UPDATE is idempotent — safe to re-run on webhook retry.
 * The phone value is deliberately not written to any log line.
 */
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
        // phoneE164 deliberately omitted — PII.
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
  // If anything throws after the idempotency claim is taken, we release the
  // claim before re-throwing so Stripe's retry can reprocess the event.
  // See module header for full safety analysis.
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
  // [HARDEN] Invalid metadata on a paid session must throw, not return.
  // Returning would send HTTP 200 to Stripe, permanently acknowledging the
  // event and preventing any retry. Throwing here causes the outer catch to
  // release the idempotency claim so Stripe retries and the event is not lost.
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
  // Reads guest_sms_opt_in / guest_phone_e164 from Payment Intent metadata
  // (preferred) or session metadata (fallback). Re-validates E.164 format as
  // defence-in-depth. Returns { smsOptIn: false, phoneE164: null } when the
  // guest did not opt in or when the phone fails validation.
  // extractGuestSmsConsent uses only TypeScript structural narrowing — no casts.
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

  // Persist guest SMS consent unconditionally (not gated on wasNewOrder) so
  // webhook retries can repair rows from a partial first run. The UPDATE is
  // idempotent. persistGuestSmsConsent never rejects — all errors are caught
  // internally. The phone value is not written to any log.
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
    // smsOptIn boolean logged; phone deliberately omitted.
    guestSmsOptIn:        guestSmsConsent.smsOptIn,
  });

  } catch (err) {
    // Release the idempotency claim so Stripe's retry can reprocess.
    // Re-throw so Stripe receives a non-2xx and schedules the retry.
    await releaseIdempotencyClaim(db, event.id, requestId);
    throw err;
  }
}