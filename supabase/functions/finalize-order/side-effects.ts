// =============================================================================
// supabase/functions/finalize-order/side-effects.ts
// =============================================================================

import type { DbClient, Db, OrderEventInsert, OrderItemInsert } from './types.ts';
import type { Json } from '../_shared/database.types.ts';
import type { PricingSnapshot } from '../_shared/pricing.ts';
import { buildStoredOrderCartItemsFromSnapshot } from '../_shared/order-cart-items-builder.ts';
import { log, prefix, clampAmountCents, asErrorMessage, nowIso } from './utils.ts';
import { LOYALTY_IDEMPOTENCY_PREFIX } from './config.ts';

// ── Order items ───────────────────────────────────────────────────────────────

export async function insertOrderItemsBestEffort(args: {
  db: DbClient;
  requestId: string;
  orderId: string;
  snapshot: PricingSnapshot;
  pricingHash: string;
}): Promise<void> {
  const { db, requestId, orderId, snapshot, pricingHash } = args;

  try {
    const { data: existing } = await db
      .from('order_items')
      .select('id')
      .eq('order_id', orderId)
      .limit(1)
      .maybeSingle();

    if (existing?.id) return;

    const builtItems = buildStoredOrderCartItemsFromSnapshot(snapshot, pricingHash);
    if (!builtItems.length) {
      log('warn', 'order_items_empty_snapshot', { requestId, orderId: prefix(orderId) });
      return;
    }

    const rows: OrderItemInsert[] = builtItems.map((item, index) => ({
      order_id: orderId,
      line_index: index,
      menu_item_id: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      line_total_cents: item.lineTotalCents,
      modifiers: item.modifiers as unknown as Json,
      notes: item.notes,
      pricing_hash: item.pricingHash,
    }));

    const { error } = await db.from('order_items').insert(rows);
    if (error) {
      log('warn', 'order_items_insert_failed', {
        requestId, orderId: prefix(orderId), code: error.code ?? null, message: error.message,
      });
      return;
    }

    log('info', 'order_items_inserted', { requestId, orderId: prefix(orderId), count: rows.length });
  } catch (err) {
    log('error', 'order_items_insert_crash', {
      requestId, orderId: prefix(orderId), error: asErrorMessage(err),
    });
  }
}

// ── Loyalty ───────────────────────────────────────────────────────────────────
// Tier multipliers — must match LOYALTY_TIERS in src/domain/loyalty/tiers.ts
// and calculatePointsPreview in src/modules/checkout/api/checkout.api.ts.
// These are server-authoritative: we read tier + streak from the DB,
// never from the client or Stripe metadata.

// Must match LOYALTY_TIERS multipliers in src/domain/loyalty/tiers.ts exactly.
const TIER_MULTIPLIERS: Record<string, number> = {
  bronze:   1.0,
  silver:   1.25,
  gold:     1.5,
  platinum: 2.0,
};

function resolveTierMultiplier(tier: string): number {
  return TIER_MULTIPLIERS[tier.toLowerCase()] ?? 1.0;
}

function resolveStreakMultiplier(streak: number): number {
  // nextStreak because the current order extends the streak by 1.
  const nextStreak = streak + 1;
  if (nextStreak >= 30) return 1.5;
  if (nextStreak >= 7)  return 1.25;
  if (nextStreak >= 3)  return 1.1;
  return 1.0;
}

export async function backfillLoyaltyV2IfMissing(args: {
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
    // Fetch tier + streak from loyalty_accounts — DB-authoritative.
    // The old query only fetched 'id', which is why the multiplier was never applied.
    const { data: account, error: accountError } = await db
      .from('loyalty_accounts')
      .select('id, tier, streak')
      .eq('user_id', userId)
      .maybeSingle();

    if (accountError || !account?.id) {
      log('warn', 'loyalty_backfill_account_missing', {
        requestId, userId: prefix(userId), code: accountError?.code ?? null,
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

    // Compute multipliers from DB-authoritative tier + streak.
    const tier           = typeof account.tier   === 'string' ? account.tier   : 'bronze';
    const streak         = typeof account.streak === 'number' ? account.streak : 0;
    const tierMultiplier = resolveTierMultiplier(tier);
    const streakMult     = resolveStreakMultiplier(streak);
    const basePoints     = Math.max(Math.floor(amountCents / 100), 0);
    const finalPoints    = Math.max(Math.floor(basePoints * tierMultiplier * streakMult), 0);
    const newStreak      = streak + 1;

    if (finalPoints <= 0) {
      log('info', 'loyalty_backfill_zero_points', {
        requestId, orderId: prefix(orderId), amountCents, basePoints,
      });
      return;
    }

    // v2_award_points expects p_amount as the post-multiplier value.
    // The edge function is responsible for computing this — the RPC stores it as-is.
    const { error } = await db.rpc('v2_award_points', {
      p_account_id:      account.id,
      p_admin_id:        userId,
      p_amount:          finalPoints,       // post-multiplier — what goes in the ledger
      p_base_points:     basePoints,        // pre-multiplier — audit only
      p_tier_at_time:    tier,             // audit only
      p_tier_mult:       tierMultiplier,   // audit only
      p_streak:          newStreak,        // new streak after this order
      p_streak_mult:     streakMult,       // audit only
      p_amount_cents:    amountCents,      // purchase amount — audit only
      p_idempotency_key: idempotencyKey,
      p_reference_id:    orderId,
    } as never);

    if (error) {
      log('warn', 'loyalty_backfill_award_failed_v2', {
        requestId, orderId: prefix(orderId), code: error.code ?? null,
      });
      return;
    }

    log('info', 'loyalty_backfill_awarded_v2', {
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
    log('error', 'loyalty_backfill_crash', {
      requestId, orderId: prefix(orderId), error: asErrorMessage(error),
    });
  }
}

// ── Growth events ─────────────────────────────────────────────────────────────

export async function maybeEmitGrowthEvents(args: {
  db: DbClient;
  requestId: string;
  orderId: string;
  userId: string;
  amountCents: number;
}): Promise<void> {
  const { db, requestId, orderId, userId, amountCents } = args;

  const rows: OrderEventInsert[] = [{
    order_id: orderId,
    user_id: userId,
    event_type: 'REVIEW_NUDGE_READY',
    event_data: { user_id: userId, amount_cents: amountCents } as Json,
  }];

  try {
    const { error } = await db.from('order_events').insert(rows);
    if (error) {
      log('warn', 'growth_events_insert_failed', {
        requestId, orderId: prefix(orderId), code: error.code ?? null,
      });
    }
  } catch { /* ignore */ }
}

// ── Credits ───────────────────────────────────────────────────────────────────

export async function markCreditUsedBestEffort(args: {
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
      log('warn', 'credit_finalize_lookup_failed', { requestId, creditId: prefix(creditId) });
      return;
    }

    if (data.used === true) {
      if (data.checkout_session_id === stripeSessionId) return;
      log('warn', 'credit_finalize_already_used_elsewhere', {
        requestId, creditId: prefix(creditId), stripeSessionId: prefix(stripeSessionId),
      });
      return;
    }

    const { error: updateError } = await db
      .from('user_credits')
      .update({ used: true, used_at: nowIso(), checkout_session_id: stripeSessionId })
      .eq('id', creditId)
      .eq('user_id', userId)
      .eq('used', false);

    if (updateError) {
      log('warn', 'credit_finalize_update_failed', {
        requestId, creditId: prefix(creditId), code: updateError.code ?? null,
      });
    }
  } catch (error) {
    log('warn', 'credit_finalize_exception', {
      requestId, creditId: prefix(creditId), error: asErrorMessage(error),
    });
  }
}

// ── Promo redemption ──────────────────────────────────────────────────────────

export async function recordPromoRedemptionBestEffort(args: {
  db: DbClient;
  requestId: string;
  promotionId: string | null;
  userId: string;
  checkoutSessionId: string;
  discountCents: number;
  orderTotalCents: number;
}): Promise<void> {
  const { db, requestId, promotionId, userId, checkoutSessionId, discountCents, orderTotalCents } = args;
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
        requestId, promotionId: prefix(promotionId), code: error.code ?? null,
      });
    }
  } catch (error) {
    log('warn', 'promo_redemption_exception', {
      requestId, promotionId: prefix(promotionId), error: asErrorMessage(error),
    });
  }
}