import Stripe from "stripe";
import { createServiceClient } from "../_shared/supabase.ts";
import type { Json } from "../_shared/database.types.ts";
// ─── Constants ───────────────────────────────────────────────────────────────

const WEBHOOK_TIMEOUT_MS = 25_000;
const EXPECTED_CURRENCY  = "usd";

// ─── Env vars ────────────────────────────────────────────────────────────────

const STRIPE_SECRET_KEY     = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

// ─── Stripe client (Deno-compatible) ─────────────────────────────────────────

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover",
  httpClient: Stripe.createFetchHttpClient(),
});

// ─── Supabase SERVICE ROLE client (bypasses RLS) ─────────────────────────────

const supabase = createServiceClient();

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  log("info", "webhook_received", { requestId, method: req.method });

  // ── Only allow POST ──────────────────────────────────────────────────────
  if (req.method !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  // ── Read raw body (required for signature verification) ──────────────────
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (err) {
    log("error", "body_read_failed", { requestId, error: String(err) });
    return respond(400, { error: "Failed to read request body" });
  }

  // ── Stripe signature verification ────────────────────────────────────────
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    log("warn", "missing_signature", { requestId });
    return respond(400, { error: "Missing stripe-signature header" });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    log("warn", "signature_verification_failed", {
      requestId,
      error: String(err),
    });
    return respond(400, { error: "Webhook signature verification failed" });
  }

  log("info", "event_verified", {
    requestId,
    eventId:   event.id,
    eventType: event.type,
  });

  // ── ATOMIC replay lock ────────────────────────────────────────────────────
  // INSERT into stripe_events FIRST — do not check first.
  // Success         → lock acquired → safe to process.
  // Unique violation (23505) → already processed → skip cleanly.
  // Eliminates the check-then-insert race condition entirely.
  let lockAcquired: boolean;
  try {
    lockAcquired = await acquireEventLock(event.id, event.type);
  } catch (err) {
    log("error", "replay_lock_error", {
      requestId,
      eventId: event.id,
      error:   String(err),
    });
    // DB unavailable — return 200 to avoid Stripe piling up retries
    return respond(200, { received: true, error: "replay_lock_unavailable" });
  }

  if (!lockAcquired) {
    log("info", "replay_detected", { requestId, eventId: event.id });
    return respond(200, { received: true, skipped: "duplicate" });
  }

  // ── Event router ─────────────────────────────────────────────────────────
  try {
    const timeout = new Promise<Response>((_, reject) =>
      setTimeout(
        () => reject(new Error("Handler timeout")),
        WEBHOOK_TIMEOUT_MS,
      )
    );

    const handler = (async (): Promise<Response> => {
      switch (event.type) {
        case "checkout.session.completed":
          return await handleCheckoutCompleted(
            event.data.object as Stripe.Checkout.Session,
            event.id,
            requestId,
          );

        case "payment_intent.payment_failed":
          return await handlePaymentFailed(
            event.data.object as Stripe.PaymentIntent,
            event.id,
            requestId,
          );

        case "charge.refunded":
          return await handleRefund(
            event.data.object as Stripe.Charge,
            event.id,
            requestId,
          );

        case "charge.dispute.created":
          return await handleDisputeCreated(
            event.data.object as Stripe.Dispute,
            event.id,
            requestId,
          );

        case "charge.dispute.closed":
          return await handleDisputeClosed(
            event.data.object as Stripe.Dispute,
            event.id,
            requestId,
          );

        default:
          log("info", "event_ignored", { requestId, eventType: event.type });
          return respond(200, { received: true, skipped: "unhandled_event" });
      }
    })();

    const result = await Promise.race([handler, timeout]);

    log("info", "webhook_complete", {
      requestId,
      elapsed: Date.now() - startTime,
    });

    return result;

  } catch (err) {
    log("error", "handler_error", {
      requestId,
      eventId:   event.id,
      eventType: event.type,
      error:     String(err),
      elapsed:   Date.now() - startTime,
    });
    // ⚠️ Still 200 — prevents Stripe retry storm. Investigate via structured logs.
    return respond(200, { received: true, error: "internal_handler_error" });
  }
});

// ============================================================================
// HANDLER: checkout.session.completed
// ============================================================================

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  eventId: string,
  requestId: string,
): Promise<Response> {

  log("info", "checkout_session_started", {
    requestId,
    sessionId:     session.id,
    paymentStatus: session.payment_status,
    currency:      session.currency,
    amountTotal:   session.amount_total,
  });

  // ── 1. Payment status gate ────────────────────────────────────────────────
  if (session.payment_status !== "paid") {
    log("warn", "payment_not_paid", {
      requestId,
      sessionId:     session.id,
      paymentStatus: session.payment_status,
    });
    return respond(200, { received: true, skipped: "payment_not_paid" });
  }

  // ── 2. Currency gate ──────────────────────────────────────────────────────
  if (session.currency?.toLowerCase() !== EXPECTED_CURRENCY) {
    log("warn", "unexpected_currency", {
      requestId,
      sessionId: session.id,
      currency:  session.currency,
    });
    return respond(200, { received: true, skipped: "unexpected_currency" });
  }

  // ── 3. Extract metadata ───────────────────────────────────────────────────
  const metadata    = session.metadata ?? {};
  const customerUid = metadata.customer_uid ?? null;
  const orderType   = metadata.order_type ?? "food";
  const cartId      = metadata.cart_id    ?? null;

  // ── 4. Retrieve payment intent → capture charge ID now ───────────────────
  // Storing stripe_charge_id at checkout means dispute handlers need zero
  // extra Stripe API calls later — pure DB lookup.
  let paymentIntentId: string | null = null;
  let stripeChargeId:  string | null = null;

  if (session.payment_intent && typeof session.payment_intent === "string") {
    paymentIntentId = session.payment_intent;
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      stripeChargeId = paymentIntent.latest_charge
        ? String(paymentIntent.latest_charge)
        : null;

      log("info", "payment_intent_verified", {
        requestId,
        paymentIntentId,
        status:        paymentIntent.status,
        stripeChargeId,
      });
    } catch (err) {
      log("warn", "payment_intent_fetch_failed", {
        requestId,
        paymentIntentId,
        error: String(err),
      });
    }
  }

    // ── 5. Load pending cart ──────────────────────────────────────────────────
  let cartItems: CartItem[] = [];
  let pendingTotalCents: number | null = null;

  if (cartId) {
    const { data, error } = await supabase
      .from("pending_carts")
      .select("items, total_cents")
      .eq("id", cartId)
      .maybeSingle();

    if (error) {
      log("error", "pending_cart_fetch_failed", {
        requestId,
        cartId,
        error: error.message,
      });
    } else if (data) {
      pendingTotalCents = data.total_cents ?? null;

      // SAFE parse Json → CartItem[]
      cartItems = parsePendingCartItems(data.items);

      if (data.items && cartItems.length === 0) {
        log("warn", "pending_cart_items_unexpected_shape", { requestId, cartId });
      }
    }
  }

  // ── 6. Server-side total revalidation ────────────────────────────────────
  let serverTotal = 0;

  if (cartItems.length > 0 && orderType === "food") {
    const itemIds = cartItems.map((i) => i.id);

    const { data: menuItems, error: menuError } = await supabase
      .from("menu_items_admin_full")
      .select("id, price")
      .in("id", itemIds);

    if (menuError || !menuItems) {
      log("error", "menu_items_fetch_failed", {
        requestId,
        error: menuError?.message,
      });
    } else {
      const priceMap = new Map(menuItems.map((m) => [m.id, m.price]));

      for (const item of cartItems) {
        const unitPrice = priceMap.get(item.id);
        if (unitPrice !== undefined) {
          serverTotal +=
            Math.round(Number(unitPrice) * 100) * (item.quantity ?? 1);
        }
      }

      const stripeTotal = session.amount_total ?? 0;
      const tolerance   = 1; // 1 cent — covers floating point rounding

      if (Math.abs(stripeTotal - serverTotal) > tolerance) {
        log("warn", "total_mismatch_detected", {
          requestId,
          sessionId:   session.id,
          stripeTotal,
          serverTotal,
          diff: stripeTotal - serverTotal,
        });

        // Log the anomaly — never block a Stripe-authorized payment.
        // Stripe already moved the money. Flag for audit, not rejection.
        await supabase.from("fraud_logs").insert({
          user_id:        customerUid,
          reason:         "total_mismatch",
          frontend_total: pendingTotalCents,
          server_total:   serverTotal,
          stripe_total:   stripeTotal,
          metadata: {
            session_id: session.id,
            cart_id:    cartId,
            event_id:   eventId,
          },
        });
      }
    }
  }

  // ── 7. Build shipping details ─────────────────────────────────────────────
  type SessionWithShipping = Stripe.Checkout.Session & {
    shipping_details?: {
      name?:  string | null;
      phone?: string | null;
      address?: {
        line1?:       string | null;
        line2?:       string | null;
        city?:        string | null;
        state?:       string | null;
        postal_code?: string | null;
        country?:     string | null;
      } | null;
    } | null;
  };

 const shipping = getShippingDetails(session);

const shippingAddress = shipping?.address
  ? {
      line1: shipping.address.line1 ?? null,
      line2: shipping.address.line2 ?? null,
      city: shipping.address.city ?? null,
      state: shipping.address.state ?? null,
      postal_code: shipping.address.postal_code ?? null,
      country: shipping.address.country ?? null,
    }
  : null;

  // ── 8. Insert order (service role → bypasses RLS) ────────────────────────
  
const cartItemsJson: Json | null =
  cartItems.length > 0 ? (cartItems as unknown as Json) : null;

const { data: newOrder, error: orderError } = await supabase
  .from("orders")
  .insert({
    stripe_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    order_type: orderType,
    customer_uid: customerUid,
    customer_email: session.customer_details?.email ?? null,
    customer_name: session.customer_details?.name ?? null,
    customer_phone: session.customer_details?.phone ?? null,
    amount_subtotal: session.amount_subtotal ?? 0,
    amount_tax: session.total_details?.amount_tax ?? 0,
    amount_shipping: session.total_details?.amount_shipping ?? 0,
    amount_total: session.amount_total ?? 0,
    currency: EXPECTED_CURRENCY,
    payment_status: "paid",
    status: "confirmed",
    shipping_name: shipping?.name ?? null,
    shipping_address: shippingAddress,
    shipping_phone: session.customer_details?.phone ?? null,
    cart_items: cartItemsJson,
    metadata: {
      cart_id: cartId,
      stripe_event_id: eventId,
      stripe_charge_id: stripeChargeId,
      server_total_cents: serverTotal || null,
    },
  })
  .select("id, order_number")
  .single();

  if (orderError) {
    log("error", "order_insert_failed", {
      requestId,
      sessionId: session.id,
      error:     orderError.message,
      code:      orderError.code,
    });

    // Unique violation = order already exists (parallel Stripe delivery edge case)
    // The atomic lock catches this first, but UNIQUE is a final safety net.
    if (orderError.code === "23505") {
      log("info", "order_already_exists_safety_net", {
        requestId,
        sessionId: session.id,
      });
      return respond(200, { received: true, skipped: "order_already_exists" });
    }

    return respond(200, { received: true, error: "order_insert_failed" });
  }

  log("info", "order_inserted", {
    requestId,
    orderId:     newOrder.id,
    orderNumber: newOrder.order_number,
    sessionId:   session.id,
  });

  // ── 9. Financial ledger entry ─────────────────────────────────────────────
  const { error: ledgerError } = await supabase
    .from("financial_transactions")
    .insert({
      order_id:                 newOrder.id,
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id:         stripeChargeId,
      transaction_type:         "payment",
      amount:                   session.amount_total ?? 0,
      currency:                 EXPECTED_CURRENCY,
      metadata: {
        session_id: session.id,
        event_id:   eventId,
        cart_id:    cartId,
      },
    });

  if (ledgerError) {
    log("error", "ledger_insert_failed", {
      requestId,
      orderId: newOrder.id,
      error:   ledgerError.message,
    });
    // Non-fatal — order exists. Ledger reconcilable from Stripe dashboard.
  } else {
    log("info", "ledger_entry_created", { requestId, orderId: newOrder.id });
  }

  // ── 10. Loyalty points — award, tier, streak ─────────────────────────────
  // Only awarded to authenticated customers (not guest checkouts).
  // Called as a Postgres function so tier recalculation, streak tracking,
  // and the loyalty ledger insert are all atomic in a single DB transaction.
  // No frontend involvement. No race conditions. Tamper-proof.
  if (customerUid && session.amount_total && session.amount_total > 0) {
    await awardLoyaltyPoints({
      customerUid,
      orderId:     newOrder.id,
      amountCents: session.amount_total,
      requestId,
    });
  } else {
    log("info", "loyalty_skipped", {
      requestId,
      reason:      customerUid ? "zero_amount" : "guest_checkout",
      orderId:     newOrder.id,
    });
  }

  // ── 11. Delete pending cart ───────────────────────────────────────────────
  if (cartId) {
    const { error: cartError } = await supabase
      .from("pending_carts")
      .delete()
      .eq("id", cartId);

    if (cartError) {
      log("warn", "pending_cart_delete_failed", {
        requestId,
        cartId,
        error: cartError.message,
      });
    } else {
      log("info", "pending_cart_deleted", { requestId, cartId });
    }
  }

  log("info", "checkout_completed_success", {
    requestId,
    orderId:     newOrder.id,
    orderNumber: newOrder.order_number,
    amountTotal: session.amount_total,
  });

  return respond(200, {
    received:    true,
    orderId:     newOrder.id,
    orderNumber: newOrder.order_number,
  });
}

// ============================================================================
// HANDLER: payment_intent.payment_failed
// ============================================================================

async function handlePaymentFailed(
  paymentIntent: Stripe.PaymentIntent,
  eventId: string,
  requestId: string,
): Promise<Response> {

  log("info", "payment_failed", {
    requestId,
    paymentIntentId: paymentIntent.id,
    lastError:       paymentIntent.last_payment_error?.message,
  });

  const { error } = await supabase
    .from("orders")
    .update({
      payment_status: "failed",
      metadata: {
        failure_reason: paymentIntent.last_payment_error?.message ?? "unknown",
        failure_code:   paymentIntent.last_payment_error?.code    ?? null,
        event_id:       eventId,
      },
    })
    .eq("stripe_payment_intent_id", paymentIntent.id);

  if (error) {
    // Not necessarily a real error — order may not exist for failed intents
    // (customer abandoned before checkout.session.completed ever fired)
    log("warn", "payment_failed_order_update_skipped", {
      requestId,
      paymentIntentId: paymentIntent.id,
      error:           error.message,
    });
  }

  return respond(200, { received: true });
}

// ============================================================================
// HANDLER: charge.refunded
// ============================================================================

async function handleRefund(
  charge: Stripe.Charge,
  eventId: string,
  requestId: string,
): Promise<Response> {

  log("info", "refund_received", {
    requestId,
    chargeId:        charge.id,
    paymentIntentId: charge.payment_intent,
    amountRefunded:  charge.amount_refunded,
  });

  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : null;

  if (!paymentIntentId) {
    log("warn", "refund_no_payment_intent", { requestId, chargeId: charge.id });
    return respond(200, { received: true, skipped: "no_payment_intent" });
  }

  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, amount_total, customer_uid")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (fetchError || !order) {
    log("warn", "refund_order_not_found", {
      requestId,
      paymentIntentId,
      error: fetchError?.message,
    });
    return respond(200, { received: true, skipped: "order_not_found" });
  }

  await supabase
    .from("orders")
    .update({ payment_status: "refunded" })
    .eq("id", order.id);

  // Negative amount = money leaving the business
  await supabase.from("financial_transactions").insert({
    order_id:         order.id,
    stripe_charge_id: charge.id,
    transaction_type: "refund",
    amount:           -(charge.amount_refunded),
    currency:         charge.currency ?? EXPECTED_CURRENCY,
    metadata: {
      charge_id:     charge.id,
      event_id:      eventId,
      refund_reason: charge.refunds?.data?.[0]?.reason ?? null,
    },
  });

  log("info", "refund_processed", {
    requestId,
    orderId:        order.id,
    amountRefunded: charge.amount_refunded,
  });

  return respond(200, { received: true });
}

// ============================================================================
// HANDLER: charge.dispute.created
// ============================================================================

async function handleDisputeCreated(
  dispute: Stripe.Dispute,
  eventId: string,
  requestId: string,
): Promise<Response> {

  log("warn", "dispute_created", {
    requestId,
    disputeId: dispute.id,
    chargeId:  dispute.charge,
    amount:    dispute.amount,
    reason:    dispute.reason,
    status:    dispute.status,
  });

  const chargeId = typeof dispute.charge === "string"
    ? dispute.charge
    : (dispute.charge as Stripe.Charge)?.id ?? null;

  const order = await findOrderByChargeId(chargeId, requestId);

  if (!order) {
    log("warn", "dispute_order_not_found", {
      requestId,
      chargeId,
      disputeId: dispute.id,
    });
    return respond(200, { received: true, skipped: "order_not_found" });
  }

  await supabase
    .from("orders")
    .update({ payment_status: "disputed" })
    .eq("id", order.id);

  // Negative amount = funds held by Stripe pending dispute outcome
  await supabase.from("financial_transactions").insert({
    order_id:         order.id,
    stripe_charge_id: chargeId,
    transaction_type: "dispute",
    amount:           -(dispute.amount),
    currency:         dispute.currency ?? EXPECTED_CURRENCY,
    metadata: {
      dispute_id: dispute.id,
      reason:     dispute.reason,
      status:     dispute.status,
      event_id:   eventId,
    },
  });

  log("info", "dispute_created_processed", {
    requestId,
    orderId:   order.id,
    disputeId: dispute.id,
  });

  return respond(200, { received: true });
}

// ============================================================================
// HANDLER: charge.dispute.closed
// ============================================================================

async function handleDisputeClosed(
  dispute: Stripe.Dispute,
  eventId: string,
  requestId: string,
): Promise<Response> {

  log("info", "dispute_closed", {
    requestId,
    disputeId: dispute.id,
    status:    dispute.status,
    chargeId:  dispute.charge,
  });

  const chargeId = typeof dispute.charge === "string"
    ? dispute.charge
    : (dispute.charge as Stripe.Charge)?.id ?? null;

  const order = await findOrderByChargeId(chargeId, requestId);

  if (!order) {
    log("warn", "dispute_closed_order_not_found", {
      requestId,
      chargeId,
      disputeId: dispute.id,
    });
    return respond(200, { received: true, skipped: "order_not_found" });
  }

  const isLost = dispute.status === "lost";
  const isWon  = dispute.status === "won";

  if (isLost) {
    await supabase
      .from("orders")
      .update({ payment_status: "lost_dispute" })
      .eq("id", order.id);
  } else if (isWon) {
    await supabase
      .from("orders")
      .update({ payment_status: "paid" })
      .eq("id", order.id);
  }

  // Won  → positive (funds returned to account)
  // Lost → negative (funds permanently gone)
  await supabase.from("financial_transactions").insert({
    order_id:         order.id,
    stripe_charge_id: chargeId,
    transaction_type: isLost ? "dispute_lost" : "dispute_won",
    amount:           isLost ? -(dispute.amount) : dispute.amount,
    currency:         dispute.currency ?? EXPECTED_CURRENCY,
    metadata: {
      dispute_id: dispute.id,
      status:     dispute.status,
      reason:     dispute.reason,
      event_id:   eventId,
    },
  });

  log("info", "dispute_closed_processed", {
    requestId,
    orderId:   order.id,
    disputeId: dispute.id,
    outcome:   dispute.status,
  });

  return respond(200, { received: true });
}

// ============================================================================
// LOYALTY: awardLoyaltyPoints
// ============================================================================
//
// Calls the Postgres function `award_loyalty_points` which handles:
//   • Base calculation    (1 pt per $1)
//   • Tier multiplier     (bronze 1x → platinum 2x)
//   • Streak multiplier   (3-day +10%, 7-day +25%, 30-day +50%)
//   • Profile update      (points, lifetime, tier, streak, last_order_date)
//   • Loyalty ledger      (loyalty_transactions insert)
//
// All of the above happens atomically inside a single Postgres transaction.
// This function cannot be called from the frontend — service role only.
// This cannot double-award on Stripe retries — replay lock fires first.
//
async function awardLoyaltyPoints({
  customerUid,
  orderId,
  amountCents,
  requestId,
}: {
  customerUid: string;
  orderId:     string;
  amountCents: number;
  requestId:   string;
}): Promise<void> {

  try {
    const { data, error } = await supabase.rpc("award_loyalty_points", {
      p_user_id:     customerUid,
      p_order_id:    orderId,
      p_amount_cents: amountCents,
    });

    if (error) {
      log("error", "loyalty_award_failed", {
        requestId,
        orderId,
        customerUid,
        error: error.message,
        code:  error.code,
      });
      // Non-fatal — order is confirmed. Points can be reconciled manually.
      return;
    }

   const raw = data as unknown;

if (!isLoyaltyResult(raw)) {
  log("warn", "loyalty_rpc_unexpected_shape", {
    requestId,
    orderId,
    customerUid,
  });
  return;
}

const result: LoyaltyResult = raw;
    // Log the full picture — visible in Supabase Edge Function logs
    log("info", "loyalty_points_awarded", {
      requestId,
      orderId,
      customerUid,
      pointsEarned:     result.points_earned,
      basePoints:       result.base_points,
      tierMultiplier:   result.tier_multiplier,
      streakMultiplier: result.streak_multiplier,
      newBalance:       result.new_balance,
      newLifetime:      result.new_lifetime,
      streak:           result.streak,
      tier:             result.tier,
      tierChanged:      result.tier_changed,
      tierBefore:       result.tier_before,
      sameDayOrder:     result.same_day_order,
    });

    // Log tier promotion separately so it's easy to alert on
    if (result.tier_changed) {
      log("info", "loyalty_tier_promoted", {
        requestId,
        orderId,
        customerUid,
        from: result.tier_before,
        to:   result.tier,
      });
    }

  } catch (err) {
    // RPC call itself crashed — non-fatal, log and continue
    log("error", "loyalty_rpc_crashed", {
      requestId,
      orderId,
      customerUid,
      error: String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function acquireEventLock(eventId: string, eventType: string): Promise<boolean> {
  const { error } = await supabase.from("stripe_events").insert({
    id: eventId,
    type: eventType,
    created_at: new Date().toISOString(),
  });

  if (!error) return true;
  if (error.code === "23505") return false; // already processed

  throw new Error(`Replay lock failure: ${error.message}`);
}

async function findOrderByChargeId(chargeId: string | null, requestId: string): Promise<{ id: string } | null> {
  if (!chargeId) return null;

  // Primary: JSON path equality (fast, indexable if you add expression index later)
  const { data: byMeta } = await supabase
    .from("orders")
    .select("id")
    .eq("metadata->>stripe_charge_id", chargeId)
    .maybeSingle();

  if (byMeta) return byMeta;

  // Fallback: one Stripe API call for legacy orders
  log("info", "charge_meta_miss_fallback", { requestId, chargeId });

  try {
    const charge = await stripe.charges.retrieve(chargeId);
    const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
    if (!paymentIntentId) return null;

    const { data: byIntent } = await supabase
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();

    return byIntent ?? null;
  } catch (err) {
    log("warn", "charge_fallback_failed", { requestId, chargeId, error: asErr(err) });
    return null;
  }
}

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function log(level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>): void {
  const entry = JSON.stringify({
    level,
    event,
    service: "stripe-webhook",
    timestamp: new Date().toISOString(),
    ...(data ?? {}),
  });

  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

function asErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

// Shipping details helper (Stripe TS can be inconsistent across versions)
function getShippingDetails(
  session: Stripe.Checkout.Session,
): { name?: string | null; phone?: string | null; address?: Stripe.Address | null } | null {
  const s = session as unknown as {
    shipping_details?: { name?: string | null; phone?: string | null; address?: Stripe.Address | null } | null;
    customer_details?: { name?: string | null; phone?: string | null; address?: Stripe.Address | null } | null;
  };

  return s.shipping_details ?? s.customer_details ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime validation for Json → CartItem[]
// ─────────────────────────────────────────────────────────────────────────────
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function asFiniteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asInt(v: unknown): number | null {
  const n = asFiniteNumber(v);
  if (n === null) return null;
  return Number.isInteger(n) ? n : Math.round(n);
}

function isCartItem(v: unknown): v is CartItem {
  if (!isRecord(v)) return false;

  const id = asNonEmptyString(v.id);
  const quantity = asInt(v.quantity);
  if (!id || quantity === null) return false;

  const nameOk = v.name === undefined || v.name === null || typeof v.name === "string";
  const priceOk = v.price === undefined || v.price === null || typeof v.price === "number";

  return nameOk && priceOk;
}

function parsePendingCartItems(itemsJson: unknown): CartItem[] {
  if (!Array.isArray(itemsJson)) return [];
  const out: CartItem[] = [];
  for (const el of itemsJson) {
    if (isCartItem(el)) out.push(el);
  }
  return out;
}

function isLoyaltyResult(v: unknown): v is LoyaltyResult {
  if (!isRecord(v)) return false;

  const num = (k: keyof LoyaltyResult) => typeof v[k] === "number";
  const bool = (k: keyof LoyaltyResult) => typeof v[k] === "boolean";
  const str = (k: keyof LoyaltyResult) => typeof v[k] === "string";

  return (
    num("points_earned") &&
    num("base_points") &&
    num("tier_multiplier") &&
    num("streak_multiplier") &&
    num("new_balance") &&
    num("new_lifetime") &&
    num("streak") &&
    bool("tier_changed") &&
    str("tier") &&
    str("tier_before") &&
    bool("same_day_order")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface CartItem {
  id: string;
  name?: string;
  quantity: number;
  price?: number;
}

interface LoyaltyResult {
  points_earned: number;
  base_points: number;
  tier_multiplier: number;
  streak_multiplier: number;
  new_balance: number;
  new_lifetime: number;
  streak: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
  tier_changed: boolean;
  tier_before: string;
  same_day_order: boolean;
}