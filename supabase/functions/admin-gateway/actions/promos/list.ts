// =============================================================================
// PATH: supabase/functions/admin-gateway/actions/promos/list.ts
// =============================================================================
// Lists promotions plus computed redemption aggregates for Admin / Promos.
//
// Adds production-grade aggregate fields sourced from promo_redemptions:
// - redemption_count
// - total_discount_cents
// - revenue_cents
//
// Also hardens current_uses by reconciling it against redemption_count so the
// admin UI does not under-report usage if promotions.current_uses ever lags.
// =============================================================================

import { createServiceClient, parsePromoRow, PROMO_SELECT_COLS } from './shared.ts';
import type { PromoRow } from './shared.ts';

type UnknownRecord = Record<string, unknown>;

type PromoRedemptionRow = {
  promotion_id: string;
  discount_cents: number;
  order_total_cents: number | null;
};

type PromoAggregate = {
  redemption_count: number;
  total_discount_cents: number;
  revenue_cents: number;
};

export type PromoListRow = PromoRow & PromoAggregate;

export type PromoListResult = PromoListRow[];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parsePromoRedemptionRow(value: unknown): PromoRedemptionRow | null {
  if (!isRecord(value)) {
    return null;
  }

  const promotionId = asString(value.promotion_id);
  const discountCents = asFiniteNumber(value.discount_cents);
  const orderTotalCents =
    value.order_total_cents === null ? null : asFiniteNumber(value.order_total_cents);

  if (!promotionId || discountCents === null) {
    return null;
  }

  return {
    promotion_id: promotionId,
    discount_cents: Math.max(0, Math.trunc(discountCents)),
    order_total_cents:
      orderTotalCents === null ? null : Math.max(0, Math.trunc(orderTotalCents)),
  };
}

function buildAggregateIndex(redemptions: readonly PromoRedemptionRow[]): Map<string, PromoAggregate> {
  const index = new Map<string, PromoAggregate>();

  for (const redemption of redemptions) {
    const current = index.get(redemption.promotion_id) ?? {
      redemption_count: 0,
      total_discount_cents: 0,
      revenue_cents: 0,
    };

    current.redemption_count += 1;
    current.total_discount_cents += redemption.discount_cents;
    current.revenue_cents += redemption.order_total_cents ?? 0;

    index.set(redemption.promotion_id, current);
  }

  return index;
}

export async function listPromos(): Promise<PromoListResult> {
  const svc = createServiceClient();

  const { data: promoData, error: promoError } = await svc
    .from('promotions')
    .select(PROMO_SELECT_COLS)
    .order('created_at', { ascending: false })
    .limit(500);

  if (promoError) {
    throw Object.assign(new Error(promoError.message), { code: 'DB_PROMOS_LIST' });
  }

  const promos: PromoRow[] = [];
  for (const entry of promoData ?? []) {
    const parsed = parsePromoRow(entry);
    if (parsed !== null) {
      promos.push(parsed);
    }
  }

  if (promos.length === 0) {
    return [];
  }

  const promoIds = promos.map((promo) => promo.id);

  const { data: redemptionData, error: redemptionError } = await svc
    .from('promo_redemptions')
    .select('promotion_id,discount_cents,order_total_cents')
    .in('promotion_id', promoIds);

  if (redemptionError) {
    throw Object.assign(new Error(redemptionError.message), {
      code: 'DB_PROMO_REDEMPTIONS_LIST',
    });
  }

  const redemptions: PromoRedemptionRow[] = [];
  for (const entry of redemptionData ?? []) {
    const parsed = parsePromoRedemptionRow(entry);
    if (parsed !== null) {
      redemptions.push(parsed);
    }
  }

  const aggregateIndex = buildAggregateIndex(redemptions);

  return promos.map((promo) => {
    const aggregate = aggregateIndex.get(promo.id) ?? {
      redemption_count: 0,
      total_discount_cents: 0,
      revenue_cents: 0,
    };

    const reconciledCurrentUses = Math.max(
      promo.current_uses ?? 0,
      aggregate.redemption_count,
    );

    return {
      ...promo,
      current_uses: reconciledCurrentUses,
      redemption_count: aggregate.redemption_count,
      total_discount_cents: aggregate.total_discount_cents,
      revenue_cents: aggregate.revenue_cents,
    };
  });
}