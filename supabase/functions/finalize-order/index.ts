// =============================================================================
// PATH: supabase/functions/finalize-order/index.ts
// =============================================================================
// finalize-order — Production Hardened (2026, fully upgraded)
//
// Responsibilities
//   1. Enforce CORS (fail-closed when Origin is present and not allowlisted)
//   2. Require JWT auth and verify customer ownership
//   3. Retrieve Stripe Checkout Session and verify payment success
//   4. Locate pending_carts row via Stripe metadata, then fallback by stripe_session_id
//   5. Rebuild / validate authoritative pricing snapshot and pricing hash
//   6. Repair pending cart snapshot/hash if missing or invalid
//   7. Atomically consume pending cart (consumed_at) with race-safe semantics
//   8. Insert orders idempotently using stripe_session_id uniqueness
//   9. Backfill loyalty, promo redemption, growth events, and credit usage best-effort
//  10. Return a stable, ownership-checked success payload for OrderSuccess.tsx
//
// Security
//   - Never trusts client totals
//   - Requires auth, verifies Stripe metadata owner matches auth user
//   - Validates Stripe total + currency against authoritative pricing snapshot
//   - Never writes empty pricing snapshots
//   - Race-safe under retries and concurrent finalize calls
//   - Does not log secrets, raw JWTs, or full Stripe ids
//
// Important DB alignment
//   - orders.order_type is constrained to 'food' | 'merch' in your schema.
//   - Service type ('pickup' | 'delivery' | 'dine_in') is stored in metadata,
//     NOT in orders.order_type.
//   - net_amount_cents is a generated column and MUST NOT be inserted/updated.
// =============================================================================

import Stripe from 'stripe';
import { authenticate, AuthError } from '../_shared/auth.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import type { Database, Json } from '../_shared/database.types.ts';
import {
  buildLegacyPricingSnapshotFromPendingCart,
  hashPricingSnapshot,
  parsePricingSnapshot,
  type OrderType,
  type PricingSnapshot,
} from '../_shared/pricing.ts';

type JsonRecord = Record<string, unknown>;
type Db = Database;
type DbClient = ReturnType<typeof createServiceClient>;

type OrderEventInsert = Db['public']['Tables']['order_events']['Insert'];

type PendingCartUpdate = Db['public']['Tables']['pending_carts']['Update'] & {
  pricing_snapshot?: Json;
  pricing_hash?: string | null;
  stripe_session_id?: string | null;
  consumed_at?: string | null;
};

type OrderInsert = Db['public']['Tables']['orders']['Insert'] & {
  order_type?: string | null;
  metadata?: Json;
};

type PendingCartRecord = {
  id: string;
  userId: string;
  items: Json;
  promoId: string | null;
  creditId: string | null;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  pricingHash: string | null;
  pricingSnapshotRaw: unknown;
  consumedAt: string | null;
  stripeSessionId: string | null;
};

type ExistingOrderRow = {
  id: string;
  amount_total: number;
  payment_status: string | null;
  status: string | null;
};

type FinalizeSuccessBody = {
  ok: true;
  requestId: string;
  order_id: string;
  already_finalized: boolean;
  payment_status: string | null;
  status: string | null;
  session_id: string;
};

const MAX_BODY_BYTES = 10_000;
const MAX_SESSION_ID_LEN = 200;
const MAX_REQUEST_ID_LEN = 128;

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_BLOCK_MS = 10 * 60 * 1000;
const FINALIZE_RATE_LIMIT_TABLE = 'checkout_rate_limits';

const LOYALTY_IDEMPOTENCY_PREFIX = 'finalize-backfill:';
const MAX_AWARD_AMOUNT_CENTS = 500_000;
const MAX_ORDER_TOTAL_CENTS = 500_000;

const ALLOWED_ORIGINS = new Set<string>([
  'https://sofislegacy.com',
  'https://www.sofislegacy.com',
  'https://sofisrestaurant-enterprise.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
]);

const STRIPE_SESSION_RE = /^cs_(test|live)_[a-zA-Z0-9]+$/;
const DB_PAYMENT_STATUS_PAID = 'paid';
const DB_ORDER_STATUS_CONFIRMED = 'confirmed';
const DB_ORDER_TYPE_FOOD = 'food';

const DEFAULT_STRIPE_API_VERSION = '2026-02-25.clover';

// ─────────────────────────────────────────────────────────────────────────────
// Stripe bootstrap
// ─────────────────────────────────────────────────────────────────────────────

function mustEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function isValidStripeApiVersion(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(\.[a-zA-Z0-9_-]+)?$/.test(value);
}

const STRIPE_SECRET_KEY = mustEnv('STRIPE_SECRET_KEY');
const ENV_STRIPE_API_VERSION = (Deno.env.get('STRIPE_API_VERSION') ?? '').trim();
const STRIPE_API_VERSION = (
  isValidStripeApiVersion(ENV_STRIPE_API_VERSION)
    ? ENV_STRIPE_API_VERSION
    : DEFAULT_STRIPE_API_VERSION
) as Stripe.LatestApiVersion;

let stripeSingleton: Stripe | null = null;

function getStripeOrThrow(): { stripe: Stripe; apiVersion: string } {
  if (stripeSingleton) {
    return { stripe: stripeSingleton, apiVersion: STRIPE_API_VERSION };
  }

  stripeSingleton = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });

  return { stripe: stripeSingleton, apiVersion: STRIPE_API_VERSION };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic helpers
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeRequestId(req: Request): string {
  const headerId = (req.headers.get('x-request-id') ?? '').trim();
  if (headerId) return headerId.slice(0, MAX_REQUEST_ID_LEN);
  return crypto.randomUUID();
}

function prefix(value: string | null | undefined, length = 8): string | null {
  if (!value) return null;
  return value.slice(0, length);
}

function asErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function clampAmountCents(value: unknown): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(MAX_AWARD_AMOUNT_CENTS, Math.max(0, Math.trunc(parsed)));
}

function clampOrderTotalCents(value: unknown): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(MAX_ORDER_TOTAL_CENTS, Math.max(0, Math.trunc(parsed)));
}

function log(level: 'info' | 'warn' | 'error', event: string, meta: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      level,
      event,
      service: 'finalize-order',
      ts: nowIso(),
      ...meta,
    }),
  );
}

function readString(rec: JsonRecord, key: string): string | null {
  const value = rec[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(rec: JsonRecord, key: string): number | null {
  const value = rec[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readJson(rec: JsonRecord, key: string): Json | null {
  const value = rec[key];
  return (value as Json) ?? null;
}

function normalizeCurrency(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized || 'usd';
}

function isOrderType(value: unknown): value is OrderType {
  return value === 'pickup' || value === 'delivery' || value === 'dine_in';
}

function pickString(meta: Stripe.Metadata | null | undefined, ...keys: string[]): string {
  if (!meta) return '';
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function isNonEmptyJsonObject(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length > 0;
}

function normalizeStripePaid(session: Stripe.Checkout.Session): boolean {
  return session.payment_status === 'paid' || session.status === 'complete';
}

function resolveSnapshotOrderType(
  stripeSession: Stripe.Checkout.Session,
  snapshot: PricingSnapshot,
): OrderType {
  if (isOrderType(snapshot.orderType)) return snapshot.orderType;
  const metaOrderType = pickString(stripeSession.metadata ?? {}, 'order_type');
  if (isOrderType(metaOrderType)) return metaOrderType;
  return 'pickup';
}

// ─────────────────────────────────────────────────────────────────────────────
// CORS / responses
// ─────────────────────────────────────────────────────────────────────────────

function corsHeadersFor(req: Request): Record<string, string> | null {
  const origin = (req.headers.get('origin') ?? '').trim();

  if (!origin) {
    return { Vary: 'Origin' };
  }

  if (!ALLOWED_ORIGINS.has(origin)) return null;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, apikey, x-client-info, content-type, x-idempotency-key, x-application-name, x-request-id',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function withStandardHeaders(headersInit: HeadersInit, requestId: string): Headers {
  const headers = new Headers(headersInit);
  if (!headers.has('Vary')) headers.set('Vary', 'Origin');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Request-Id', requestId);
  return headers;
}

function jsonResponse(
  body: unknown,
  status: number,
  headersInit: HeadersInit,
  requestId: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withStandardHeaders(headersInit, requestId),
  });
}

function errorResponse(
  cors: HeadersInit,
  requestId: string,
  code: string,
  message: string,
  status: number,
  meta?: Record<string, unknown>,
): Response {
  log(status >= 500 ? 'error' : 'warn', 'error', {
    requestId,
    code,
    message,
    ...(meta ?? {}),
  });

  return jsonResponse(
    {
      ok: false,
      error: {
        code,
        message,
        requestId,
      },
    },
    status,
    cors,
    requestId,
  );
}

function successResponse(
  cors: HeadersInit,
  requestId: string,
  body: FinalizeSuccessBody,
): Response {
  return jsonResponse(body, 200, cors, requestId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Request parsing
// ─────────────────────────────────────────────────────────────────────────────

async function readJsonObjectBody(req: Request): Promise<JsonRecord> {
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.includes('application/json')) throw new Error('UNSUPPORTED_CONTENT_TYPE');

  const rawBody = await req.text();
  if (!rawBody.trim()) throw new Error('EMPTY_BODY');

  const bodyBytes = new TextEncoder().encode(rawBody).length;
  if (bodyBytes > MAX_BODY_BYTES) throw new Error('BODY_TOO_LARGE');

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error('INVALID_JSON_BODY');
  }

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
// Rate limiting
// ─────────────────────────────────────────────────────────────────────────────

async function checkRateLimit(
  db: DbClient,
  userId: string,
): Promise<{ blocked: boolean; retryAfterSeconds: number }> {
  const now = Date.now();

  const { data, error } = await db
    .from(FINALIZE_RATE_LIMIT_TABLE)
    .select('attempts,last_attempt_at,blocked_until')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error('RATE_LIMIT_LOOKUP_FAILED');

  const blockedUntilMs =
    typeof data?.blocked_until === 'string' ? Date.parse(data.blocked_until) : Number.NaN;

  if (Number.isFinite(blockedUntilMs) && blockedUntilMs > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((blockedUntilMs - now) / 1000)),
    };
  }

  const lastAttemptMs =
    typeof data?.last_attempt_at === 'string' ? Date.parse(data.last_attempt_at) : Number.NaN;

  const previousAttempts = typeof data?.attempts === 'number' ? data.attempts : 0;
  const nextAttempts =
    Number.isFinite(lastAttemptMs) && now - lastAttemptMs < RATE_LIMIT_WINDOW_MS
      ? previousAttempts + 1
      : 1;

  const blocked = nextAttempts > RATE_LIMIT_MAX;
  const blockedUntilIso = blocked ? new Date(now + RATE_LIMIT_BLOCK_MS).toISOString() : null;

  const upsertRow: Db['public']['Tables']['checkout_rate_limits']['Insert'] = {
    user_id: userId,
    attempts: nextAttempts,
    last_attempt_at: new Date(now).toISOString(),
    blocked_until: blockedUntilIso,
  };

  const { error: upsertError } = await db
    .from(FINALIZE_RATE_LIMIT_TABLE)
    .upsert(upsertRow, { onConflict: 'user_id' });

  if (upsertError) throw new Error('RATE_LIMIT_WRITE_FAILED');

  return {
    blocked,
    retryAfterSeconds: blocked ? Math.max(1, Math.ceil(RATE_LIMIT_BLOCK_MS / 1000)) : 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Side effects (best effort)
// ─────────────────────────────────────────────────────────────────────────────

async function backfillLoyaltyV2IfMissing(args: {
  db: DbClient;
  requestId: string;
  userId: string;
  orderId: string;
  amountCents: number;
}): Promise<void> {
  const { db, requestId, userId, orderId } = args;
  const amountCents = clampAmountCents(args.amountCents);
  if (amountCents <= 0) return;

  try {
    const { data: account, error: accountError } = await db
      .from('loyalty_accounts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (accountError || !account?.id) {
      log('warn', 'loyalty_backfill_account_missing', {
        requestId,
        userId: prefix(userId),
        code: accountError?.code ?? null,
      });
      return;
    }

    const idempotencyKey = `${LOYALTY_IDEMPOTENCY_PREFIX}${orderId}`;

    const { data: existingLedger, error: ledgerError } = await db
      .from('loyalty_ledger')
      .select('id')
      .eq('account_id', account.id)
      .or(`reference_id.eq.${orderId},idempotency_key.eq.${idempotencyKey}`)
      .limit(1)
      .maybeSingle();

    if (!ledgerError && existingLedger?.id) return;

    const { error } = await db.rpc('v2_award_points', {
      p_account_id: account.id,
      p_admin_id: userId,
      p_amount_cents: amountCents,
      p_idempotency_key: idempotencyKey,
      p_reference_id: orderId,
    });

    if (error) {
      log('warn', 'loyalty_backfill_award_failed_v2', {
        requestId,
        orderId: prefix(orderId),
        code: error.code ?? null,
      });
      return;
    }

    log('info', 'loyalty_backfill_awarded_v2', {
      requestId,
      orderId: prefix(orderId),
      accountId: prefix(account.id),
    });
  } catch (error) {
    log('error', 'loyalty_backfill_crash', {
      requestId,
      orderId: prefix(orderId),
      error: asErrorMessage(error),
    });
  }
}

async function maybeEmitGrowthEvents(args: {
  db: DbClient;
  requestId: string;
  orderId: string;
  userId: string;
  amountCents: number;
}): Promise<void> {
  const { db, requestId, orderId, userId, amountCents } = args;

  const rows: OrderEventInsert[] = [
    {
      order_id: orderId,
      user_id: userId,
      event_type: 'REVIEW_NUDGE_READY',
      event_data: {
        user_id: userId,
        amount_cents: amountCents,
      } as Json,
    },
  ];

  try {
    const { error } = await db.from('order_events').insert(rows);
    if (error) {
      log('warn', 'growth_events_insert_failed', {
        requestId,
        orderId: prefix(orderId),
        code: error.code ?? null,
      });
    }
  } catch {
    // ignore
  }
}

async function markCreditUsedBestEffort(args: {
  db: DbClient;
  requestId: string;
  creditId: string | null;
  userId: string;
  stripeSessionId: string;
}): Promise<void> {
  const { db, requestId, creditId, userId, stripeSessionId } = args;
  if (!creditId) return;

  try {
    const { data, error } = await db
      .from('user_credits')
      .select('id,user_id,used,checkout_session_id')
      .eq('id', creditId)
      .maybeSingle();

    if (error || !data || data.user_id !== userId) {
      log('warn', 'credit_finalize_lookup_failed', {
        requestId,
        creditId: prefix(creditId),
      });
      return;
    }

    if (data.used === true) {
      if (data.checkout_session_id === stripeSessionId) return;

      log('warn', 'credit_finalize_already_used_elsewhere', {
        requestId,
        creditId: prefix(creditId),
        stripeSessionId: prefix(stripeSessionId),
      });
      return;
    }

    const { error: updateError } = await db
      .from('user_credits')
      .update({
        used: true,
        used_at: nowIso(),
        checkout_session_id: stripeSessionId,
      })
      .eq('id', creditId)
      .eq('user_id', userId)
      .eq('used', false);

    if (updateError) {
      log('warn', 'credit_finalize_update_failed', {
        requestId,
        creditId: prefix(creditId),
        code: updateError.code ?? null,
      });
    }
  } catch (error) {
    log('warn', 'credit_finalize_exception', {
      requestId,
      creditId: prefix(creditId),
      error: asErrorMessage(error),
    });
  }
}

async function recordPromoRedemptionBestEffort(args: {
  db: DbClient;
  requestId: string;
  promotionId: string | null;
  userId: string;
  checkoutSessionId: string;
  discountCents: number;
  orderTotalCents: number;
}): Promise<void> {
  const { db, requestId, promotionId, userId, checkoutSessionId, discountCents, orderTotalCents } =
    args;

  if (!promotionId || discountCents <= 0) return;

  try {
    const { data: existing, error: existingError } = await db
      .from('promo_redemptions')
      .select('id')
      .eq('promotion_id', promotionId)
      .eq('user_id', userId)
      .eq('checkout_session_id', checkoutSessionId)
      .limit(1)
      .maybeSingle();

    if (!existingError && existing?.id) return;

    const { data: promotion } = await db
      .from('promotions')
      .select('channel')
      .eq('id', promotionId)
      .maybeSingle();

    const insertRow: Db['public']['Tables']['promo_redemptions']['Insert'] = {
      promotion_id: promotionId,
      user_id: userId,
      checkout_session_id: checkoutSessionId,
      discount_cents: discountCents,
      order_total_cents: orderTotalCents,
      channel: promotion?.channel ?? null,
    };

    const { error } = await db.from('promo_redemptions').insert(insertRow);
    if (error) {
      log('warn', 'promo_redemption_insert_failed', {
        requestId,
        promotionId: prefix(promotionId),
        code: error.code ?? null,
      });
    }
  } catch (error) {
    log('warn', 'promo_redemption_exception', {
      requestId,
      promotionId: prefix(promotionId),
      error: asErrorMessage(error),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending cart parsing / loading
// ─────────────────────────────────────────────────────────────────────────────

function parsePendingCartRecord(value: unknown): PendingCartRecord | null {
  if (!isRecord(value)) return null;

  const id = readString(value, 'id');
  const userId = readString(value, 'user_id');
  if (!id || !userId) return null;

  const items = readJson(value, 'items');
  if (items == null) return null;

  return {
    id,
    userId,
    items,
    promoId: readString(value, 'promo_id'),
    creditId: readString(value, 'credit_id'),
    subtotalCents: clampOrderTotalCents(readNumber(value, 'subtotal_cents') ?? 0),
    discountCents: clampOrderTotalCents(readNumber(value, 'discount_cents') ?? 0),
    taxCents: clampOrderTotalCents(readNumber(value, 'tax_cents') ?? 0),
    totalCents: clampOrderTotalCents(readNumber(value, 'total_cents') ?? 0),
    currency: normalizeCurrency(value['currency']),
    pricingHash: readString(value, 'pricing_hash'),
    pricingSnapshotRaw: value['pricing_snapshot'],
    consumedAt: readString(value, 'consumed_at'),
    stripeSessionId: readString(value, 'stripe_session_id'),
  };
}

async function loadPendingCartForSession(args: {
  db: DbClient;
  requestId: string;
  userId: string;
  sessionId: string;
  stripeSession: Stripe.Checkout.Session;
}): Promise<PendingCartRecord | null> {
  const { db, requestId, userId, sessionId, stripeSession } = args;

  const cartRef = pickString(
    stripeSession.metadata ?? {},
    'pending_cart_id',
    'cart_ref',
    'cart_id',
    'pendingCartId',
  );

  let cartRow: unknown = null;

  if (cartRef) {
    const { data, error } = await db
      .from('pending_carts')
      .select(
        'id,user_id,items,subtotal_cents,discount_cents,tax_cents,total_cents,promo_id,credit_id,pricing_snapshot,pricing_hash,currency,consumed_at,stripe_session_id',
      )
      .eq('id', cartRef)
      .maybeSingle();

    if (error) {
      log('warn', 'pending_cart_lookup_by_ref_failed', {
        requestId,
        userId: prefix(userId),
        cartRef: prefix(cartRef),
        code: error.code ?? null,
        message: error.message,
      });
      return null;
    }

    cartRow = data ?? null;
  }

  if (!cartRow) {
    log('info', 'pending_cart_lookup_fallback_by_session', {
      requestId,
      userId: prefix(userId),
      sessionId: prefix(sessionId),
      cartRef: cartRef ? prefix(cartRef) : null,
    });

    const { data, error } = await db
      .from('pending_carts')
      .select(
        'id,user_id,items,subtotal_cents,discount_cents,tax_cents,total_cents,promo_id,credit_id,pricing_snapshot,pricing_hash,currency,consumed_at,stripe_session_id',
      )
      .eq('stripe_session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      log('warn', 'pending_cart_lookup_by_session_failed', {
        requestId,
        userId: prefix(userId),
        sessionId: prefix(sessionId),
        code: error.code ?? null,
        message: error.message,
      });
      throw new Error(`PENDING_CART_LOOKUP_FAILED:${error.code ?? 'unknown'}`);
    }

    cartRow = data ?? null;
  }

  if (!cartRow) {
    log('warn', 'pending_cart_not_found', {
      requestId,
      userId: prefix(userId),
      sessionId: prefix(sessionId),
      cartRef: cartRef ? prefix(cartRef) : null,
    });
    return null;
  }

  const parsed = parsePendingCartRecord(cartRow);
  if (!parsed) {
    log('error', 'pending_cart_parse_failed', {
      requestId,
      userId: prefix(userId),
      sessionId: prefix(sessionId),
      cartRef: cartRef ? prefix(cartRef) : null,
    });
    throw new Error('PENDING_CART_INVALID');
  }

  if (parsed.userId !== userId) {
    log('warn', 'pending_cart_owner_mismatch', {
      requestId,
      requestUserId: prefix(userId),
      cartUserId: prefix(parsed.userId),
      sessionId: prefix(sessionId),
      cartId: prefix(parsed.id),
    });
    throw new Error('UNAUTHORIZED');
  }

  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot validation / repair
// ─────────────────────────────────────────────────────────────────────────────

async function buildAuthoritativeSnapshot(args: {
  requestId: string;
  userId: string;
  pendingCart: PendingCartRecord;
  stripeSession: Stripe.Checkout.Session;
}): Promise<{ snapshot: PricingSnapshot; pricingHash: string; repaired: boolean }> {
  const { requestId, userId, pendingCart, stripeSession } = args;

  const metaOrderType = pickString(stripeSession.metadata ?? {}, 'order_type');
  const fallbackOrderType: OrderType = isOrderType(metaOrderType) ? metaOrderType : 'pickup';

  const parsed = parsePricingSnapshot(pendingCart.pricingSnapshotRaw);

  const snapshot =
    parsed ??
    buildLegacyPricingSnapshotFromPendingCart({
      userId,
      currency: pendingCart.currency,
      orderType: fallbackOrderType,
      orderNotes: null,
      items: pendingCart.items,
      subtotalCents: pendingCart.subtotalCents,
      discountCents: pendingCart.discountCents,
      taxCents: pendingCart.taxCents,
      totalCents: pendingCart.totalCents,
      promoId: pendingCart.promoId,
      creditId: pendingCart.creditId,
    });

  if (!isNonEmptyJsonObject(snapshot)) {
    throw new Error('PRICING_SNAPSHOT_INVALID');
  }

  const pricingHash = await hashPricingSnapshot(snapshot);
  if (!pricingHash || pricingHash.trim().length < 16) {
    throw new Error('PRICING_HASH_INVALID');
  }

  if (pendingCart.pricingHash && pendingCart.pricingHash !== pricingHash) {
    log('warn', 'pricing_hash_mismatch', {
      requestId,
      pendingCartId: prefix(pendingCart.id),
      storedHash: pendingCart.pricingHash.slice(0, 16),
      recalculatedHash: pricingHash.slice(0, 16),
    });
    throw new Error('PRICING_HASH_MISMATCH');
  }

  const repaired =
    !isNonEmptyJsonObject(pendingCart.pricingSnapshotRaw) ||
    !pendingCart.pricingHash ||
    pendingCart.pricingHash.trim().length < 16;

  return { snapshot, pricingHash, repaired };
}

async function repairPendingCartIfNeeded(args: {
  db: DbClient;
  requestId: string;
  pendingCart: PendingCartRecord;
  snapshot: PricingSnapshot;
  pricingHash: string;
  repaired: boolean;
}): Promise<void> {
  const { db, requestId, pendingCart, snapshot, pricingHash, repaired } = args;
  if (!repaired) return;

  const repairPatch: PendingCartUpdate = {
    pricing_snapshot: snapshot as unknown as Json,
    pricing_hash: pricingHash,
  };

  const { error } = await db.from('pending_carts').update(repairPatch).eq('id', pendingCart.id);

  if (error) {
    throw new Error(`PENDING_CART_REPAIR_FAILED:${error.code ?? 'unknown'}`);
  }

  log('info', 'pending_cart_repaired', {
    requestId,
    pendingCartId: prefix(pendingCart.id),
  });
}

function validatePendingCartAgainstSnapshot(args: {
  pendingCart: PendingCartRecord;
  snapshot: PricingSnapshot;
}): void {
  const { pendingCart, snapshot } = args;

  const expectedDiscountCents =
    snapshot.campaignDiscountCents + snapshot.promoDiscountCents + snapshot.creditCents;

  if (
    pendingCart.subtotalCents !== snapshot.subtotalCents ||
    pendingCart.discountCents !== expectedDiscountCents ||
    pendingCart.taxCents !== snapshot.taxCents ||
    pendingCart.totalCents !== snapshot.totalCents
  ) {
    throw new Error('PENDING_CART_TOTAL_MISMATCH');
  }
}

function validateStripeAgainstSnapshot(args: {
  stripeSession: Stripe.Checkout.Session;
  snapshot: PricingSnapshot;
}): { stripeAmountTotal: number; stripeCurrency: string; paymentIntentId: string | null } {
  const { stripeSession, snapshot } = args;

  const stripeAmountTotal =
    typeof stripeSession.amount_total === 'number' ? stripeSession.amount_total : null;
  const stripeCurrency = normalizeCurrency(stripeSession.currency ?? 'usd');

  if (stripeAmountTotal === null || stripeAmountTotal !== snapshot.totalCents) {
    throw new Error('TOTAL_MISMATCH');
  }

  if (stripeCurrency !== snapshot.currency) {
    throw new Error('CURRENCY_MISMATCH');
  }

  const paymentIntentId =
    typeof stripeSession.payment_intent === 'string'
      ? stripeSession.payment_intent
      : (stripeSession.payment_intent?.id ?? null);

  return {
    stripeAmountTotal,
    stripeCurrency,
    paymentIntentId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Order creation
// ─────────────────────────────────────────────────────────────────────────────

async function consumePendingCart(args: {
  db: DbClient;
  pendingCart: PendingCartRecord;
  sessionId: string;
  snapshot: PricingSnapshot;
  pricingHash: string;
}): Promise<boolean> {
  const { db, pendingCart, sessionId, snapshot, pricingHash } = args;

  const consumePatch: PendingCartUpdate = {
    consumed_at: nowIso(),
    stripe_session_id: sessionId,
    pricing_snapshot: snapshot as unknown as Json,
    pricing_hash: pricingHash,
  };

  const { data, error } = await db
    .from('pending_carts')
    .update(consumePatch)
    .eq('id', pendingCart.id)
    .is('consumed_at', null)
    .select('id');

  if (error) {
    throw new Error(`PENDING_CART_CONSUME_FAILED:${error.code ?? 'unknown'}`);
  }

  return Array.isArray(data) && data.length > 0;
}

async function getExistingOrderBySession(
  db: DbClient,
  sessionId: string,
): Promise<ExistingOrderRow | null> {
  const { data } = await db
    .from('orders')
    .select('id,amount_total,payment_status,status')
    .eq('stripe_session_id', sessionId)
    .maybeSingle();

  return data ?? null;
}

function buildOrderMetadata(args: {
  requestId: string;
  pendingCart: PendingCartRecord;
  snapshot: PricingSnapshot;
  pricingHash: string;
  stripeSession: Stripe.Checkout.Session;
  stripeApiVersion: string;
  stripeAmountTotal: number;
  stripeCurrency: string;
  consumedNow: boolean;
}): Json {
  const {
    requestId,
    pendingCart,
    snapshot,
    pricingHash,
    stripeSession,
    stripeApiVersion,
    stripeAmountTotal,
    stripeCurrency,
    consumedNow,
  } = args;

  const serviceType = resolveSnapshotOrderType(stripeSession, snapshot);

  return {
    source: 'finalize-order',
    request_id: requestId,
    pending_cart_id: pendingCart.id,
    service_type: serviceType,
    order_service_type: serviceType,
    stripe_session_status: stripeSession.status ?? null,
    stripe_payment_status: stripeSession.payment_status ?? null,
    stripe_api_version: stripeApiVersion,
    promo_id: snapshot.promoId,
    credit_id: snapshot.creditId,
    applied_campaign_ids: snapshot.appliedCampaignIds,
    pricing_hash: pricingHash,
    pricing_snapshot: snapshot,
    stripe_amount_total: stripeAmountTotal,
    stripe_currency: stripeCurrency,
    pending_cart_consumed_now: consumedNow,
  } as Json;
}

async function insertOrReadFinalOrder(args: {
  db: DbClient;
  requestId: string;
  sessionId: string;
  userId: string;
  userEmail: string | null;
  stripeSession: Stripe.Checkout.Session;
  paymentIntentId: string | null;
  snapshot: PricingSnapshot;
  pendingCart: PendingCartRecord;
  orderMetadata: Json;
}): Promise<{ order: ExistingOrderRow; inserted: boolean }> {
  const {
    db,
    requestId,
    sessionId,
    userId,
    userEmail,
    stripeSession,
    paymentIntentId,
    snapshot,
    pendingCart,
    orderMetadata,
  } = args;

  const totalDiscountCents =
    snapshot.campaignDiscountCents + snapshot.promoDiscountCents + snapshot.creditCents;

  const orderInsert: OrderInsert = {
    stripe_session_id: sessionId,
    stripe_payment_intent_id: paymentIntentId,
    order_type: DB_ORDER_TYPE_FOOD,

    customer_uid: userId,
    customer_email: stripeSession.customer_details?.email ?? userEmail ?? null,
    customer_name: stripeSession.customer_details?.name ?? null,
    customer_phone: stripeSession.customer_details?.phone ?? null,

    amount_subtotal: snapshot.subtotalCents,
    amount_tax: snapshot.taxCents,
    amount_shipping: 0,
    amount_total: snapshot.totalCents,

    currency: snapshot.currency,
    payment_status: DB_PAYMENT_STATUS_PAID,
    status: DB_ORDER_STATUS_CONFIRMED,

    cart_items: pendingCart.items,
    metadata: orderMetadata,
    notes: snapshot.orderNotes,

    payment_method_type: 'unknown',

    subtotal_cents: snapshot.subtotalCents,
    tax_cents: snapshot.taxCents,
    tip_cents: 0,
    discount_cents: totalDiscountCents,
    delivery_fee_cents: 0,
    service_fee_cents: 0,
    total_cents: snapshot.totalCents,
    amount_received_cents: snapshot.totalCents,
    refunded_amount_cents: 0,

    // DO NOT include net_amount_cents — generated column
  };

  const { data: insertedOrder, error: insertError } = await db
    .from('orders')
    .insert(orderInsert)
    .select('id,amount_total,payment_status,status')
    .maybeSingle();

  if (insertError) {
    log('warn', 'order_insert_failed', {
      requestId,
      sessionId: prefix(sessionId),
      code: insertError.code ?? null,
      message: insertError.message,
    });
  }

  if (insertedOrder?.id) {
    return { order: insertedOrder, inserted: true };
  }

  const existing = await getExistingOrderBySession(db, sessionId);
  if (existing?.id) {
    return { order: existing, inserted: false };
  }

  throw new Error('ORDER_CREATE_FAILED');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = makeRequestId(req);
  const start = Date.now();

  const cors = corsHeadersFor(req);
  if (!cors) {
    return new Response('Origin not allowed', {
      status: 403,
      headers: withStandardHeaders({ Vary: 'Origin' }, requestId),
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: withStandardHeaders(cors, requestId),
    });
  }

  if (req.method !== 'POST') {
    return errorResponse(cors, requestId, 'METHOD_NOT_ALLOWED', 'Method not allowed.', 405);
  }

  let stripe: Stripe;
  let stripeApiVersion: string;
  try {
    const loaded = getStripeOrThrow();
    stripe = loaded.stripe;
    stripeApiVersion = loaded.apiVersion;
  } catch (error) {
    log('error', 'stripe_init_failed', {
      requestId,
      error: asErrorMessage(error),
    });

    return errorResponse(
      cors,
      requestId,
      'STRIPE_INIT_FAILED',
      'Stripe is not configured on the server.',
      503,
    );
  }

  let user: { id: string; email: string | null };
  try {
    user = await authenticate(req);
  } catch (error) {
    const code = error instanceof AuthError ? error.code : 'AUTH_ERROR';
    const status = error instanceof AuthError ? error.status : 401;
    return errorResponse(cors, requestId, code, 'Unauthorized', status);
  }

  const db = createServiceClient();

  try {
    const rateLimit = await checkRateLimit(db, user.id);
    if (rateLimit.blocked) {
      const headers = new Headers(withStandardHeaders(cors, requestId));
      headers.set('Retry-After', String(rateLimit.retryAfterSeconds));

      return new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many attempts. Please wait.',
            requestId,
          },
        }),
        { status: 429, headers },
      );
    }
  } catch (error) {
    return errorResponse(cors, requestId, 'RATE_LIMIT_LOOKUP_FAILED', 'Service unavailable.', 503, {
      error: asErrorMessage(error),
    });
  }

  let rawBody: JsonRecord;
  try {
    rawBody = await readJsonObjectBody(req);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'INVALID_JSON_BODY';

    if (message === 'UNSUPPORTED_CONTENT_TYPE') {
      return errorResponse(
        cors,
        requestId,
        'UNSUPPORTED_CONTENT_TYPE',
        'Content-Type must be application/json.',
        415,
      );
    }

    if (message === 'BODY_TOO_LARGE') {
      return errorResponse(cors, requestId, 'BODY_TOO_LARGE', 'Request body is too large.', 413);
    }

    if (message === 'EMPTY_BODY') {
      return errorResponse(cors, requestId, 'EMPTY_BODY', 'Request body is required.', 400);
    }

    return errorResponse(
      cors,
      requestId,
      'INVALID_JSON_BODY',
      'Request body must be valid JSON.',
      400,
    );
  }

  let sessionId: string;
  try {
    sessionId = mustStripeSessionId(rawBody.sessionId ?? rawBody.session_id);
  } catch {
    return errorResponse(cors, requestId, 'INVALID_SESSION_ID', 'Invalid session id.', 400);
  }

  try {
    const preexistingOrder = await getExistingOrderBySession(db, sessionId);

    if (preexistingOrder?.id) {
      await backfillLoyaltyV2IfMissing({
        db,
        requestId,
        userId: user.id,
        orderId: preexistingOrder.id,
        amountCents: preexistingOrder.amount_total,
      });

      log('info', 'finalize_idempotent_return', {
        requestId,
        orderId: prefix(preexistingOrder.id),
        sessionId: prefix(sessionId),
        ms: Date.now() - start,
      });

      return successResponse(cors, requestId, {
        ok: true,
        requestId,
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
        requestId,
        sessionId: prefix(sessionId),
        owner: prefix(owner),
        userId: prefix(user.id),
      });

      return errorResponse(cors, requestId, 'UNAUTHORIZED', 'Unauthorized.', 401);
    }

    if (!normalizeStripePaid(stripeSession)) {
      return jsonResponse(
        {
          ok: true,
          requestId,
          order_id: null,
          already_finalized: false,
          payment_status: stripeSession.payment_status ?? null,
          status: stripeSession.status ?? null,
          session_id: sessionId,
          message: 'Payment not confirmed yet',
        },
        200,
        cors,
        requestId,
      );
    }

    const pendingCart = await loadPendingCartForSession({
      db,
      requestId,
      userId: user.id,
      sessionId,
      stripeSession,
    });

    if (!pendingCart) {
      return errorResponse(
        cors,
        requestId,
        'PENDING_CART_NOT_FOUND',
        'Pending cart not found.',
        404,
      );
    }

    const { snapshot, pricingHash, repaired } = await buildAuthoritativeSnapshot({
      requestId,
      userId: user.id,
      pendingCart,
      stripeSession,
    });

    await repairPendingCartIfNeeded({
      db,
      requestId,
      pendingCart,
      snapshot,
      pricingHash,
      repaired,
    });

    validatePendingCartAgainstSnapshot({
      pendingCart,
      snapshot,
    });

    const { stripeAmountTotal, stripeCurrency, paymentIntentId } = validateStripeAgainstSnapshot({
      stripeSession,
      snapshot,
    });

    const consumedNow = await consumePendingCart({
      db,
      pendingCart,
      sessionId,
      snapshot,
      pricingHash,
    });

    const orderMetadata = buildOrderMetadata({
      requestId,
      pendingCart,
      snapshot,
      pricingHash,
      stripeSession,
      stripeApiVersion,
      stripeAmountTotal,
      stripeCurrency,
      consumedNow,
    });

    const { order: finalOrder, inserted } = await insertOrReadFinalOrder({
      db,
      requestId,
      sessionId,
      userId: user.id,
      userEmail: user.email,
      stripeSession,
      paymentIntentId,
      snapshot,
      pendingCart,
      orderMetadata,
    });

    await Promise.all([
      backfillLoyaltyV2IfMissing({
        db,
        requestId,
        userId: user.id,
        orderId: finalOrder.id,
        amountCents: finalOrder.amount_total,
      }),
      maybeEmitGrowthEvents({
        db,
        requestId,
        orderId: finalOrder.id,
        userId: user.id,
        amountCents: finalOrder.amount_total,
      }),
      markCreditUsedBestEffort({
        db,
        requestId,
        creditId: snapshot.creditId,
        userId: user.id,
        stripeSessionId: sessionId,
      }),
      recordPromoRedemptionBestEffort({
        db,
        requestId,
        promotionId: snapshot.promoId,
        userId: user.id,
        checkoutSessionId: sessionId,
        discountCents: snapshot.promoDiscountCents,
        orderTotalCents: snapshot.totalCents,
      }),
    ]);

    log('info', 'finalize_ok', {
      requestId,
      orderId: prefix(finalOrder.id),
      sessionId: prefix(sessionId),
      inserted,
      consumedNow,
      ms: Date.now() - start,
    });

    return successResponse(cors, requestId, {
      ok: true,
      requestId,
      order_id: finalOrder.id,
      already_finalized: !inserted,
      payment_status: finalOrder.payment_status,
      status: finalOrder.status,
      session_id: sessionId,
    });
  } catch (error) {
    const message = asErrorMessage(error);

    if (message.startsWith('PENDING_CART_LOOKUP_FAILED')) {
      return errorResponse(
        cors,
        requestId,
        'PENDING_CART_LOOKUP_FAILED',
        'Pending cart lookup failed.',
        503,
      );
    }

    if (message === 'PENDING_CART_INVALID') {
      return errorResponse(
        cors,
        requestId,
        'PENDING_CART_INVALID',
        'Pending cart is invalid.',
        500,
      );
    }

    if (message === 'UNAUTHORIZED') {
      return errorResponse(cors, requestId, 'UNAUTHORIZED', 'Unauthorized.', 401);
    }

    if (message === 'PRICING_SNAPSHOT_INVALID') {
      return errorResponse(
        cors,
        requestId,
        'PRICING_SNAPSHOT_INVALID',
        'Pricing snapshot is invalid.',
        500,
      );
    }

    if (message === 'PRICING_HASH_INVALID') {
      return errorResponse(
        cors,
        requestId,
        'PRICING_HASH_INVALID',
        'Pricing hash is invalid.',
        500,
      );
    }

    if (message === 'PRICING_HASH_MISMATCH') {
      return errorResponse(
        cors,
        requestId,
        'PRICING_HASH_MISMATCH',
        'Pricing snapshot failed verification.',
        409,
      );
    }

    if (message.startsWith('PENDING_CART_REPAIR_FAILED')) {
      return errorResponse(
        cors,
        requestId,
        'PENDING_CART_REPAIR_FAILED',
        'Failed to repair pending cart pricing snapshot.',
        500,
      );
    }

    if (message === 'PENDING_CART_TOTAL_MISMATCH') {
      return errorResponse(
        cors,
        requestId,
        'PENDING_CART_TOTAL_MISMATCH',
        'Pending cart totals do not match snapshot.',
        409,
      );
    }

    if (message === 'TOTAL_MISMATCH') {
      return errorResponse(
        cors,
        requestId,
        'TOTAL_MISMATCH',
        'Charged total does not match authoritative pricing.',
        409,
      );
    }

    if (message === 'CURRENCY_MISMATCH') {
      return errorResponse(
        cors,
        requestId,
        'CURRENCY_MISMATCH',
        'Charged currency does not match authoritative pricing.',
        409,
      );
    }

    if (message.startsWith('PENDING_CART_CONSUME_FAILED')) {
      return errorResponse(
        cors,
        requestId,
        'PENDING_CART_CONSUME_FAILED',
        'Failed to consume pending cart.',
        500,
      );
    }

    if (message === 'ORDER_CREATE_FAILED') {
      return errorResponse(
        cors,
        requestId,
        'ORDER_CREATE_FAILED',
        'Failed to create order.',
        500,
      );
    }

    log('error', 'unhandled_exception', {
      requestId,
      error: message,
    });

    return errorResponse(cors, requestId, 'INTERNAL', 'Internal server error.', 500);
  }
});