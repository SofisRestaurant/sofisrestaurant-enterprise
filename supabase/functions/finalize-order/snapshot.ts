// =============================================================================
// supabase/functions/finalize-order/snapshot.ts
// =============================================================================

import Stripe from 'stripe';
import type { DbClient, PendingCartRecord, PendingCartUpdate } from './types.ts';
import type { Json } from '../_shared/database.types.ts';
import {
  buildLegacyPricingSnapshotFromPendingCart,
  hashPricingSnapshot,
  parsePricingSnapshot,
  type OrderType,
  type PricingSnapshot,
} from '../_shared/pricing.ts';
import { isRecord, log, prefix, normalizeCurrency } from './utils.ts';
import { pickString } from './pending-cart.ts';

export function isOrderType(value: unknown): value is OrderType {
  return value === 'pickup' || value === 'delivery' || value === 'dine_in';
}

export function resolveSnapshotOrderType(
  stripeSession: Stripe.Checkout.Session,
  snapshot: PricingSnapshot,
): OrderType {
  if (isOrderType(snapshot.orderType)) return snapshot.orderType;
  const metaOrderType = pickString(stripeSession.metadata ?? {}, 'order_type');
  if (isOrderType(metaOrderType)) return metaOrderType;
  return 'pickup';
}

export async function buildAuthoritativeSnapshot(args: {
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

  if (!isRecord(snapshot) || Object.keys(snapshot).length === 0) {
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
    !isRecord(pendingCart.pricingSnapshotRaw) ||
    Object.keys(pendingCart.pricingSnapshotRaw).length === 0 ||
    !pendingCart.pricingHash ||
    pendingCart.pricingHash.trim().length < 16;

  return { snapshot, pricingHash, repaired };
}

export async function repairPendingCartIfNeeded(args: {
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
  if (error) throw new Error(`PENDING_CART_REPAIR_FAILED:${error.code ?? 'unknown'}`);

  log('info', 'pending_cart_repaired', { requestId, pendingCartId: prefix(pendingCart.id) });
}

export function validatePendingCartAgainstSnapshot(args: {
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

export function validateStripeAgainstSnapshot(args: {
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
  if (stripeCurrency !== snapshot.currency) throw new Error('CURRENCY_MISMATCH');

  const paymentIntentId =
    typeof stripeSession.payment_intent === 'string'
      ? stripeSession.payment_intent
      : (stripeSession.payment_intent?.id ?? null);

  return { stripeAmountTotal, stripeCurrency, paymentIntentId };
}