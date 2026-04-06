import Stripe from "stripe";
import { LOYALTY_IDEMPOTENCY_PREFIX } from "./env.ts";
import { asErr, log, nowIso, prefix } from "./logging.ts";
import { clampCents, normCurrency, toJson } from "./utils.ts";
import type {
  AdminNotifInsert,
  DbClient,
  FinancialTxInsert,
  OrderEventInsert,
  PaymentIntentEventPayload,
  SecurityEventInsert,
} from "./types.ts";

export async function upsertPaymentTransaction(args: {
  db: DbClient;
  orderId: string;
  session: Stripe.Checkout.Session;
  requestId: string;
}): Promise<void> {
  const { db, orderId, session, requestId } = args;

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  if (paymentIntentId === null || typeof session.amount_total !== "number") {
    return;
  }

  try {
    const { data: existing } = await db
      .from("financial_transactions")
      .select("id")
      .eq("order_id", orderId)
      .eq("transaction_type", "payment")
      .returns<Array<{ id: string }>>()
      .maybeSingle();

    if (existing !== null) {
      return;
    }

    const row: FinancialTxInsert = {
      order_id: orderId,
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: null,
      transaction_type: "payment",
      amount: session.amount_total,
      currency: normCurrency(session.currency),
      metadata: toJson({
        source: "stripe-webhook",
        request_id: requestId,
        session_id: session.id,
        session_status: session.status ?? null,
        payment_status: session.payment_status ?? null,
      }),
    };

    const { error } = await db.from("financial_transactions").insert(row);

    if (error !== null) {
      log("warn", "webhook_payment_tx_failed", {
        requestId,
        orderId: prefix(orderId),
        code: error.code ?? null,
      });
    }
  } catch (error) {
    log("warn", "webhook_payment_tx_exception", {
      requestId,
      orderId: prefix(orderId),
      error: asErr(error),
    });
  }
}

export async function upsertPaymentIntentTransaction(args: {
  db: DbClient;
  orderId: string;
  paymentIntent: PaymentIntentEventPayload;
  eventId: string;
  requestId: string;
}): Promise<void> {
  const { db, orderId, paymentIntent, eventId, requestId } = args;

  try {
    const { data: existing } = await db
      .from("financial_transactions")
      .select("id")
      .eq("order_id", orderId)
      .eq("transaction_type", "payment")
      .returns<Array<{ id: string }>>()
      .maybeSingle();

    if (existing !== null) {
      return;
    }

    const row: FinancialTxInsert = {
      order_id: orderId,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_charge_id: paymentIntent.latestChargeId,
      transaction_type: "payment",
      amount: paymentIntent.amountReceived,
      currency: normCurrency(paymentIntent.currency),
      metadata: toJson({
        source: "stripe-webhook",
        request_id: requestId,
        event_id: eventId,
        event_type: "payment_intent.succeeded",
        charge_id: paymentIntent.latestChargeId,
      }),
    };

    const { error } = await db.from("financial_transactions").insert(row);

    if (error !== null) {
      log("warn", "webhook_pi_tx_failed", {
        requestId,
        orderId: prefix(orderId),
        code: error.code ?? null,
      });
    }
  } catch (error) {
    log("warn", "webhook_pi_tx_exception", {
      requestId,
      orderId: prefix(orderId),
      error: asErr(error),
    });
  }
}

// ── Tier multipliers — must match LOYALTY_TIERS in src/domain/loyalty/tiers.ts ──
const WEBHOOK_TIER_MULTIPLIERS: Record<string, number> = {
  bronze:   1.0,
  silver:   1.25,
  gold:     1.5,
  platinum: 2.0,
};

function resolveWebhookTierMultiplier(tier: string): number {
  return WEBHOOK_TIER_MULTIPLIERS[tier.toLowerCase()] ?? 1.0;
}

function resolveWebhookStreakMultiplier(streak: number): number {
  const nextStreak = streak + 1;
  if (nextStreak >= 30) return 1.5;
  if (nextStreak >= 7)  return 1.25;
  if (nextStreak >= 3)  return 1.1;
  return 1.0;
}

export async function backfillLoyaltyIfMissing(args: {
  db: DbClient;
  userId: string;
  orderId: string;
  amountCents: number;
  requestId: string;
}): Promise<void> {
  const { db, userId, orderId, requestId } = args;
  const amountCents = clampCents(args.amountCents);
  if (amountCents <= 0) {
    return;
  }
  try {
    const { data: account, error: accountError } = await db
      .from("loyalty_accounts")
      .select("id, tier, streak")
      .eq("user_id", userId)
      .returns<Array<{ id: string; tier: string; streak: number }>>()
      .maybeSingle();

    if (accountError !== null || account === null) {
      log("warn", "webhook_loyalty_no_account", {
        requestId,
        userId: prefix(userId),
        code: accountError?.code ?? null,
      });
      return;
    }

    const idempotencyKey = `${LOYALTY_IDEMPOTENCY_PREFIX}${orderId}`;

    const { data: existing } = await db
      .from("loyalty_ledger")
      .select("id")
      .eq("account_id", account.id)
      .or(`reference_id.eq.${orderId},idempotency_key.eq.${idempotencyKey}`)
      .returns<Array<{ id: string }>>()
      .maybeSingle();

    if (existing !== null) {
      return;
    }

    // Compute multipliers from DB-authoritative tier + streak.
    const tier           = typeof account.tier   === "string" ? account.tier   : "bronze";
    const streak         = typeof account.streak === "number" ? account.streak : 0;
    const tierMultiplier = resolveWebhookTierMultiplier(tier);
    const streakMult     = resolveWebhookStreakMultiplier(streak);
    const basePoints     = Math.max(Math.floor(amountCents / 100), 0);
    const finalPoints    = Math.max(Math.floor(basePoints * tierMultiplier * streakMult), 0);
    const newStreak      = streak + 1;

    if (finalPoints <= 0) {
      return;
    }

    const { error } = await db.rpc("v2_award_points", {
      p_account_id:      account.id,
      p_admin_id:        userId,
      p_amount:          finalPoints,
      p_base_points:     basePoints,
      p_tier_at_time:    tier,
      p_tier_mult:       tierMultiplier,
      p_streak:          newStreak,
      p_streak_mult:     streakMult,
      p_amount_cents:    amountCents,
      p_idempotency_key: idempotencyKey,
      p_reference_id:    orderId,
    } as never);

    if (error !== null) {
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
      orderId:    prefix(orderId),
      accountId:  prefix(account.id),
      tier,
      streak:     newStreak,
      base:       basePoints,
      tierMult:   tierMultiplier,
      streakMult: streakMult,
      final:      finalPoints,
    });
  } catch (error) {
    log("error", "webhook_loyalty_crash", {
      requestId,
      orderId: prefix(orderId),
      error: asErr(error),
    });
  }
}

export async function recordPromoRedemptionIfMissing(args: {
  db: DbClient;
  promotionId: string | null;
  userId: string;
  sessionId: string;
  discountCents: number;
  orderTotalCents: number;
  requestId: string;
}): Promise<void> {
  const {
    db,
    promotionId,
    userId,
    sessionId,
    discountCents,
    orderTotalCents,
    requestId,
  } = args;

  if (promotionId === null || discountCents <= 0) {
    return;
  }

  try {
    const { data: existing } = await db
      .from("promo_redemptions")
      .select("id")
      .eq("promotion_id", promotionId)
      .eq("user_id", userId)
      .eq("checkout_session_id", sessionId)
      .returns<Array<{ id: string }>>()
      .maybeSingle();

    if (existing !== null) {
      return;
    }

    const { data: promotion } = await db
      .from("promotions")
      .select("channel")
      .eq("id", promotionId)
      .returns<Array<{ channel: string | null }>>()
      .maybeSingle();

    const { error: insertError } = await db.from("promo_redemptions").insert({
      promotion_id: promotionId,
      user_id: userId,
      checkout_session_id: sessionId,
      discount_cents: discountCents,
      order_total_cents: orderTotalCents,
      channel: promotion?.channel ?? null,
    });

    if (insertError !== null) {
      log("warn", "webhook_promo_redemption_failed", {
        requestId,
        promotionId: prefix(promotionId),
        code: insertError.code ?? null,
      });
      return;
    }

    const { data: incremented, error: updateError } = await db.rpc(
      "increment_promo_usage_if_available",
      { p_promo_id: promotionId },
    );

    if (updateError !== null) {
      log("warn", "webhook_promo_usage_increment_failed", {
        requestId,
        promotionId: prefix(promotionId),
        code: updateError.code ?? null,
      });
    } else if (incremented !== true) {
      log("warn", "webhook_promo_usage_increment_skipped", {
        requestId,
        promotionId: prefix(promotionId),
        reason: "promo_at_capacity_or_missing",
      });
    }
  } catch (error) {
    log("warn", "webhook_promo_redemption_exception", {
      requestId,
      promotionId: prefix(promotionId),
      error: asErr(error),
    });
  }
}

export async function markCreditUsedIfPending(args: {
  db: DbClient;
  creditId: string | null;
  userId: string;
  sessionId: string;
  requestId: string;
}): Promise<void> {
  const { db, creditId, userId, sessionId, requestId } = args;

  if (creditId === null) {
    return;
  }

  try {
    const { data, error } = await db
      .from("user_credits")
      .select("id,user_id,used,checkout_session_id")
      .eq("id", creditId)
      .returns<
        Array<
          {
            id: string;
            user_id: string;
            used: boolean;
            checkout_session_id: string | null;
          }
        >
      >()
      .maybeSingle();

    if (
      error !== null || data === null || data.user_id !== userId || data.used
    ) {
      return;
    }

    const { error: updateError } = await db
      .from("user_credits")
      .update({
        used: true,
        used_at: nowIso(),
        checkout_session_id: sessionId,
      })
      .eq("id", creditId)
      .eq("user_id", userId)
      .eq("used", false);

    if (updateError !== null) {
      log("warn", "webhook_credit_mark_failed", {
        requestId,
        creditId: prefix(creditId),
        code: updateError.code ?? null,
      });
    }
  } catch (error) {
    log("warn", "webhook_credit_exception", {
      requestId,
      creditId: prefix(creditId),
      error: asErr(error),
    });
  }
}

export async function emitOrderEvent(
  db: DbClient,
  orderId: string,
  userId: string | null,
  eventType: string,
  eventData: ReturnType<typeof toJson>,
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

    if (error !== null) {
      log("warn", "webhook_order_event_failed", {
        requestId,
        orderId: prefix(orderId),
        eventType,
        code: error.code ?? null,
      });
    }
  } catch {
    // best effort
  }
}

export async function notify(
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

    if (error !== null) {
      log("warn", "webhook_admin_notif_failed", {
        requestId,
        orderId: prefix(orderId),
        type,
        code: error.code ?? null,
      });
    }
  } catch {
    // best effort
  }
}

export async function logSecurityEvent(
  db: DbClient,
  eventType: string,
  metadata: ReturnType<typeof toJson>,
  requestId: string,
): Promise<void> {
  try {
    const row: SecurityEventInsert = {
      event_type: eventType,
      metadata,
    };

    const { error } = await db.from("security_events").insert(row);

    if (error !== null) {
      log("warn", "webhook_security_event_failed", {
        requestId,
        eventType,
        code: error.code ?? null,
      });
    }
  } catch {
    // best effort
  }
}