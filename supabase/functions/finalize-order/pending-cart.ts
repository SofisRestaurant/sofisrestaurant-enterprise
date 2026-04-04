// =============================================================================
// supabase/functions/finalize-order/pending-cart.ts
// =============================================================================

import Stripe from 'stripe';
import type { DbClient, PendingCartRecord } from './types.ts';
import {
  isRecord, log, prefix, readString, readNumber, readJson, normalizeCurrency, clampOrderTotalCents,
} from './utils.ts';

function pickString(meta: Stripe.Metadata | null | undefined, ...keys: string[]): string {
  if (!meta) return '';
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export { pickString };

export function parsePendingCartRecord(value: unknown): PendingCartRecord | null {
  if (!isRecord(value)) return null;

  const id = readString(value, 'id');
  const userId = readString(value, 'user_id');
  if (!id || !userId) return null;

  const items = readJson(value, 'items');
  if (items == null) return null;

  return {
    id,
    userId,
    items: items as import('../_shared/database.types.ts').Json,
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

const CART_SELECT =
  'id,user_id,items,subtotal_cents,discount_cents,tax_cents,total_cents,promo_id,credit_id,pricing_snapshot,pricing_hash,currency,consumed_at,stripe_session_id';

export async function loadPendingCartForSession(args: {
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
      .select(CART_SELECT)
      .eq('id', cartRef)
      .maybeSingle();

    if (error) {
      log('warn', 'pending_cart_lookup_by_ref_failed', {
        requestId, userId: prefix(userId), cartRef: prefix(cartRef),
        code: error.code ?? null, message: error.message,
      });
      return null;
    }
    cartRow = data ?? null;
  }

  if (!cartRow) {
    log('info', 'pending_cart_lookup_fallback_by_session', {
      requestId, userId: prefix(userId), sessionId: prefix(sessionId),
      cartRef: cartRef ? prefix(cartRef) : null,
    });

    const { data, error } = await db
      .from('pending_carts')
      .select(CART_SELECT)
      .eq('stripe_session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      log('warn', 'pending_cart_lookup_by_session_failed', {
        requestId, userId: prefix(userId), sessionId: prefix(sessionId),
        code: error.code ?? null, message: error.message,
      });
      throw new Error(`PENDING_CART_LOOKUP_FAILED:${error.code ?? 'unknown'}`);
    }
    cartRow = data ?? null;
  }

  if (!cartRow) {
    log('warn', 'pending_cart_not_found', {
      requestId, userId: prefix(userId), sessionId: prefix(sessionId),
      cartRef: cartRef ? prefix(cartRef) : null,
    });
    return null;
  }

  const parsed = parsePendingCartRecord(cartRow);
  if (!parsed) {
    log('error', 'pending_cart_parse_failed', {
      requestId, userId: prefix(userId), sessionId: prefix(sessionId),
    });
    throw new Error('PENDING_CART_INVALID');
  }

  if (parsed.userId !== userId) {
    log('warn', 'pending_cart_owner_mismatch', {
      requestId, requestUserId: prefix(userId), cartUserId: prefix(parsed.userId),
      sessionId: prefix(sessionId), cartId: prefix(parsed.id),
    });
    throw new Error('UNAUTHORIZED');
  }

  return parsed;
}