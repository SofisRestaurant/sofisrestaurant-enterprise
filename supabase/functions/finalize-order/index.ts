// =============================================================================
// supabase/functions/finalize-order/index.ts
// =============================================================================
// Responsibilities:
//   1. CORS + auth
//   2. Rate limiting
//   3. Stripe session verification
//   4. Pending cart → pricing snapshot → order insert
//   5. Best-effort side effects: order_items, loyalty, growth, credits, promo
//
// All logic is split into dedicated modules — this file only orchestrates.
// =============================================================================

import { authenticate, AuthError } from '../_shared/auth.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { corsHeaders, withStandardHeaders } from './cors.ts';
import { errorResponse, successResponse, jsonResponse } from './responses.ts';
import { getStripeOrThrow } from './stripe-client.ts';
import { checkRateLimit } from './rate-limit.ts';
import { loadPendingCartForSession, pickString } from './pending-cart.ts';
import {
  buildAuthoritativeSnapshot,
  repairPendingCartIfNeeded,
  validatePendingCartAgainstSnapshot,
  validateStripeAgainstSnapshot,
} from './snapshot.ts';
import {
  consumePendingCart,
  getExistingOrderBySession,
  buildOrderMetadata,
  insertOrReadFinalOrder,
} from './order-creation.ts';
import {
  insertOrderItemsBestEffort,
  backfillLoyaltyV2IfMissing,
  maybeEmitGrowthEvents,
  markCreditUsedBestEffort,
  recordPromoRedemptionBestEffort,
} from './side-effects.ts';
import { isRecord, makeRequestId, prefix, asErrorMessage, log } from './utils.ts';
import { MAX_BODY_BYTES, MAX_SESSION_ID_LEN, MAX_REQUEST_ID_LEN, STRIPE_SESSION_RE } from './config.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Request parsing
// ─────────────────────────────────────────────────────────────────────────────

async function readJsonObjectBody(req: Request): Promise<Record<string, unknown>> {
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.includes('application/json')) throw new Error('UNSUPPORTED_CONTENT_TYPE');

  const rawBody = await req.text();
  if (!rawBody.trim()) throw new Error('EMPTY_BODY');
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');

  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { throw new Error('INVALID_JSON_BODY'); }
  if (!isRecord(parsed)) throw new Error('INVALID_JSON_BODY');
  return parsed;
}

function mustStripeSessionId(value: unknown): string {
  if (typeof value !== 'string') throw new Error('INVALID_SESSION_ID');
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_SESSION_ID_LEN || !STRIPE_SESSION_RE.test(normalized)) {
    throw new Error('INVALID_SESSION_ID');
  }
  return normalized;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = makeRequestId(req, MAX_REQUEST_ID_LEN);
  const start = Date.now();

  const cors = corsHeaders(req);
  if (!cors) {
    return new Response('Origin not allowed', {
      status: 403,
      headers: withStandardHeaders({ Vary: 'Origin' }, requestId),
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: withStandardHeaders(cors, requestId) });
  }

  if (req.method !== 'POST') {
    return errorResponse(cors, requestId, 'METHOD_NOT_ALLOWED', 'Method not allowed.', 405);
  }

  // ── Stripe ──────────────────────────────────────────────────────────────────
  let stripe: import('stripe').default;
  let stripeApiVersion: string;
  try {
    const loaded = getStripeOrThrow();
    stripe = loaded.stripe;
    stripeApiVersion = loaded.apiVersion;
  } catch (error) {
    log('error', 'stripe_init_failed', { requestId, error: asErrorMessage(error) });
    return errorResponse(cors, requestId, 'STRIPE_INIT_FAILED', 'Stripe is not configured.', 503);
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  let user: { id: string; email: string | null };
  try {
    user = await authenticate(req);
  } catch (error) {
    const code = error instanceof AuthError ? error.code : 'AUTH_ERROR';
    const status = error instanceof AuthError ? error.status : 401;
    return errorResponse(cors, requestId, code, 'Unauthorized', status);
  }

  const db = createServiceClient();

  // ── Rate limit ──────────────────────────────────────────────────────────────
  try {
    const rateLimit = await checkRateLimit(db, user.id);
    if (rateLimit.blocked) {
      const headers = new Headers(withStandardHeaders(cors, requestId));
      headers.set('Retry-After', String(rateLimit.retryAfterSeconds));
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many attempts.', requestId } }),
        { status: 429, headers },
      );
    }
  } catch (error) {
    return errorResponse(cors, requestId, 'RATE_LIMIT_LOOKUP_FAILED', 'Service unavailable.', 503, {
      error: asErrorMessage(error),
    });
  }

  // ── Body ────────────────────────────────────────────────────────────────────
  let rawBody: Record<string, unknown>;
  try {
    rawBody = await readJsonObjectBody(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'INVALID_JSON_BODY';
    if (message === 'UNSUPPORTED_CONTENT_TYPE') return errorResponse(cors, requestId, message, 'Content-Type must be application/json.', 415);
    if (message === 'BODY_TOO_LARGE') return errorResponse(cors, requestId, message, 'Request body is too large.', 413);
    if (message === 'EMPTY_BODY') return errorResponse(cors, requestId, message, 'Request body is required.', 400);
    return errorResponse(cors, requestId, 'INVALID_JSON_BODY', 'Request body must be valid JSON.', 400);
  }

  let sessionId: string;
  try {
    sessionId = mustStripeSessionId(rawBody.sessionId ?? rawBody.session_id);
  } catch {
    return errorResponse(cors, requestId, 'INVALID_SESSION_ID', 'Invalid session id.', 400);
  }

  // ── Main flow ───────────────────────────────────────────────────────────────
  try {
    const preexistingOrder = await getExistingOrderBySession(db, sessionId);

    if (preexistingOrder?.id) {
      await backfillLoyaltyV2IfMissing({
        db, requestId, userId: user.id,
        orderId: preexistingOrder.id,
        amountCents: preexistingOrder.amount_total,
      });
      log('info', 'finalize_idempotent_return', {
        requestId, orderId: prefix(preexistingOrder.id),
        sessionId: prefix(sessionId), ms: Date.now() - start,
      });
      return successResponse(cors, requestId, {
        ok: true, requestId,
        order_id: preexistingOrder.id,
        already_finalized: true,
        payment_status: preexistingOrder.payment_status,
        status: preexistingOrder.status,
        session_id: sessionId,
      });
    }

    const stripeSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });

    const owner = pickString(stripeSession.metadata ?? {}, 'user_id', 'customer_uid', 'uid');
    if (!owner || owner !== user.id) {
      log('warn', 'stripe_owner_mismatch', {
        requestId, sessionId: prefix(sessionId),
        owner: prefix(owner), userId: prefix(user.id),
      });
      return errorResponse(cors, requestId, 'UNAUTHORIZED', 'Unauthorized.', 401);
    }

    if (stripeSession.payment_status !== 'paid' && stripeSession.status !== 'complete') {
      return jsonResponse(
        { ok: true, requestId, order_id: null, already_finalized: false,
          payment_status: stripeSession.payment_status ?? null,
          status: stripeSession.status ?? null,
          session_id: sessionId, message: 'Payment not confirmed yet' },
        200, cors, requestId,
      );
    }

    const pendingCart = await loadPendingCartForSession({
      db, requestId, userId: user.id, sessionId, stripeSession,
    });

    if (!pendingCart) {
      return errorResponse(cors, requestId, 'PENDING_CART_NOT_FOUND', 'Pending cart not found.', 404);
    }

    const { snapshot, pricingHash, repaired } = await buildAuthoritativeSnapshot({
      requestId, userId: user.id, pendingCart, stripeSession,
    });

    await repairPendingCartIfNeeded({ db, requestId, pendingCart, snapshot, pricingHash, repaired });
    validatePendingCartAgainstSnapshot({ pendingCart, snapshot });

    const { stripeAmountTotal, stripeCurrency, paymentIntentId } =
      validateStripeAgainstSnapshot({ stripeSession, snapshot });

    const consumedNow = await consumePendingCart({ db, pendingCart, sessionId, snapshot, pricingHash });

    const orderMetadata = buildOrderMetadata({
      requestId, pendingCart, snapshot, pricingHash, stripeSession,
      stripeApiVersion, stripeAmountTotal, stripeCurrency, consumedNow,
    });

    const { order: finalOrder, inserted } = await insertOrReadFinalOrder({
      db, requestId, sessionId, userId: user.id, userEmail: user.email,
      stripeSession, paymentIntentId, snapshot, pendingCart, orderMetadata,
    });

    await Promise.all([
      insertOrderItemsBestEffort({ db, requestId, orderId: finalOrder.id, snapshot, pricingHash }),
      backfillLoyaltyV2IfMissing({ db, requestId, userId: user.id, orderId: finalOrder.id, amountCents: finalOrder.amount_total }),
      maybeEmitGrowthEvents({ db, requestId, orderId: finalOrder.id, userId: user.id, amountCents: finalOrder.amount_total }),
      markCreditUsedBestEffort({ db, requestId, creditId: snapshot.creditId, userId: user.id, stripeSessionId: sessionId }),
      recordPromoRedemptionBestEffort({
        db, requestId, promotionId: snapshot.promoId, userId: user.id,
        checkoutSessionId: sessionId, discountCents: snapshot.promoDiscountCents,
        orderTotalCents: snapshot.totalCents,
      }),
    ]);

    log('info', 'finalize_ok', {
      requestId, orderId: prefix(finalOrder.id),
      sessionId: prefix(sessionId), inserted, consumedNow,
      ms: Date.now() - start,
    });

    return successResponse(cors, requestId, {
      ok: true, requestId,
      order_id: finalOrder.id,
      already_finalized: !inserted,
      payment_status: finalOrder.payment_status,
      status: finalOrder.status,
      session_id: sessionId,
    });

  } catch (error) {
    const message = asErrorMessage(error);

    const knownErrors: Record<string, [string, number]> = {
      'PENDING_CART_INVALID': ['Pending cart is invalid.', 500],
      'UNAUTHORIZED': ['Unauthorized.', 401],
      'PRICING_SNAPSHOT_INVALID': ['Pricing snapshot is invalid.', 500],
      'PRICING_HASH_INVALID': ['Pricing hash is invalid.', 500],
      'PRICING_HASH_MISMATCH': ['Pricing snapshot failed verification.', 409],
      'PENDING_CART_TOTAL_MISMATCH': ['Pending cart totals do not match snapshot.', 409],
      'TOTAL_MISMATCH': ['Charged total does not match authoritative pricing.', 409],
      'CURRENCY_MISMATCH': ['Charged currency does not match authoritative pricing.', 409],
      'ORDER_CREATE_FAILED': ['Failed to create order.', 500],
    };

    for (const [prefix_key, [msg, status]] of Object.entries(knownErrors)) {
      if (message === prefix_key || message.startsWith(prefix_key)) {
        return errorResponse(cors, requestId, prefix_key, msg, status);
      }
    }

    if (message.startsWith('PENDING_CART_LOOKUP_FAILED')) {
      return errorResponse(cors, requestId, 'PENDING_CART_LOOKUP_FAILED', 'Pending cart lookup failed.', 503);
    }
    if (message.startsWith('PENDING_CART_REPAIR_FAILED')) {
      return errorResponse(cors, requestId, 'PENDING_CART_REPAIR_FAILED', 'Failed to repair pending cart.', 500);
    }
    if (message.startsWith('PENDING_CART_CONSUME_FAILED')) {
      return errorResponse(cors, requestId, 'PENDING_CART_CONSUME_FAILED', 'Failed to consume pending cart.', 500);
    }

    log('error', 'unhandled_exception', { requestId, error: message });
    return errorResponse(cors, requestId, 'INTERNAL', 'Internal server error.', 500);
  }
});