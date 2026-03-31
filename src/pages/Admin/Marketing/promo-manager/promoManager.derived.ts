import type { AdminPromo } from '@/features/admin/types/admin-common.types';
import type {
  EnrichedPromo,
  Filters,
  PromoLifecycle,
  QuickFilter,
} from './promoManager.types';
import { EXPIRING_SOON_MS } from './promoManager.types';
import {
  safeDate,
  safeMeta,
  safeNum,
  safePosInt,
  safeStr,
  metaDate,
  metaNum,
  metaPosInt,
} from './promoManager.guards';

export function deriveLifecycle(promo: AdminPromo, now: number): PromoLifecycle {
  const status = safeStr(promo.status) ?? 'draft';
  const meta = safeMeta(promo.metadata);

  if (status === 'draft') return 'draft';
  if (status === 'inactive' || status === 'archived') return 'inactive';

  const endsAt =
    safeDate(promo.endsAt) ??
    metaDate(meta, 'ends_at', 'expires_at', 'endsAt', 'expiresAt');

  if (endsAt !== null && endsAt.getTime() < now) return 'expired';

  const startsAt =
    safeDate(promo.startsAt) ??
    metaDate(meta, 'starts_at', 'startsAt');

  if (startsAt !== null && startsAt.getTime() > now) return 'scheduled';

  return 'live';
}

export function enrichPromo(promo: AdminPromo, now: number): EnrichedPromo {
  const meta = safeMeta(promo.metadata);

  const currentUses =
    safePosInt(promo.redemptions) ??
    metaPosInt(meta, 'current_uses', 'currentUses', 'redemption_count', 'redemptions') ??
    0;

  const maxUses = metaPosInt(meta, 'max_uses', 'maxUses', 'max_redemptions');
  const usagePercent =
    maxUses !== null && maxUses > 0
      ? Math.min(100, Math.max(0, (currentUses / maxUses) * 100))
      : null;

  const startsAtSafe = safeDate(promo.startsAt) ?? metaDate(meta, 'starts_at', 'startsAt');

  const endsAtSafe =
    safeDate(promo.endsAt) ?? metaDate(meta, 'ends_at', 'expires_at', 'endsAt', 'expiresAt');

  const lifecycle = deriveLifecycle(promo, now);
  const isActive = safeStr(promo.status) === 'active';
  const isCapped = maxUses !== null && currentUses >= maxUses;

  const revenueCents =
    metaNum(
      meta,
      'revenue_cents',
      'influenced_revenue_cents',
      'revenueCents',
      'revenue_impact_cents',
      'total_discount_cents',
    ) ?? 0;

  const minOrderCents =
    metaPosInt(meta, 'min_order_cents', 'minOrderCents', 'minimum_order_cents') ?? null;

  const perUserLimit =
    metaPosInt(meta, 'per_user_limit', 'perUserLimit', 'max_uses_per_user') ?? null;

  const expiresSoon =
    endsAtSafe !== null &&
    endsAtSafe.getTime() >= now &&
    endsAtSafe.getTime() - now <= EXPIRING_SOON_MS;

  return {
    ...promo,
    lifecycle,
    isActive,
    currentUses,
    maxUses,
    usagePercent,
    isCapped,
    revenueCents,
    minOrderCents,
    perUserLimit,
    startsAtSafe,
    endsAtSafe,
    nameSafe: safeStr(promo.name),
    codeSafe: safeStr(promo.code) ?? promo.id,
    discountTypeSafe: safeStr(promo.discountType),
    discountValueSafe: safeNum(promo.discountValue),
    expiresSoon,
  };
}

export function buildTotals(enriched: EnrichedPromo[]) {
  const activeCount = enriched.filter((promo) => promo.isActive).length;
  const liveCount = enriched.filter((promo) => promo.lifecycle === 'live').length;
  const scheduledCount = enriched.filter((promo) => promo.lifecycle === 'scheduled').length;
  const cappedCount = enriched.filter((promo) => promo.isCapped).length;
  const totalUses = enriched.reduce((sum, promo) => sum + promo.currentUses, 0);
  const totalRevenueCents = enriched.reduce(
    (sum, promo) => sum + Math.max(0, promo.revenueCents),
    0,
  );

  return {
    activeCount,
    liveCount,
    scheduledCount,
    cappedCount,
    totalUses,
    totalRevenueCents,
  };
}

export function buildQuickCounts(enriched: EnrichedPromo[]): Record<QuickFilter, number> {
  return {
    all: enriched.length,
    live: enriched.filter((promo) => promo.lifecycle === 'live').length,
    scheduled: enriched.filter((promo) => promo.lifecycle === 'scheduled').length,
    capped: enriched.filter((promo) => promo.isCapped).length,
    expiring: enriched.filter((promo) => promo.expiresSoon && promo.lifecycle === 'live').length,
  };
}

export function filterAndSortPromos(enriched: EnrichedPromo[], filters: Filters): EnrichedPromo[] {
  const q = filters.q.trim().toLowerCase();
  const typeFilter = filters.type.trim().toLowerCase();

  const out = enriched.filter((promo) => {
    if (typeFilter.length > 0 && (promo.discountTypeSafe ?? '').toLowerCase() !== typeFilter) {
      return false;
    }

    if (filters.status.length > 0 && promo.lifecycle !== filters.status) {
      return false;
    }

    if (filters.quick === 'live' && promo.lifecycle !== 'live') return false;
    if (filters.quick === 'scheduled' && promo.lifecycle !== 'scheduled') return false;
    if (filters.quick === 'capped' && !promo.isCapped) return false;
    if (filters.quick === 'expiring' && !(promo.expiresSoon && promo.lifecycle === 'live')) {
      return false;
    }

    if (q.length === 0) return true;

    const haystack = [
      promo.codeSafe,
      promo.nameSafe ?? '',
      promo.discountTypeSafe ?? '',
      promo.lifecycle,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });

  const sorted = [...out];

  if (filters.sort === 'code') {
    sorted.sort((left, right) => left.codeSafe.localeCompare(right.codeSafe));
  } else if (filters.sort === 'uses') {
    sorted.sort((left, right) => right.currentUses - left.currentUses);
  } else if (filters.sort === 'revenue') {
    sorted.sort((left, right) => right.revenueCents - left.revenueCents);
  } else if (filters.sort === 'ending') {
    sorted.sort((left, right) => {
      const leftTime = left.endsAtSafe?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightTime = right.endsAtSafe?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });
  } else {
    sorted.sort((left, right) => {
      const leftTime = left.startsAtSafe?.getTime() ?? 0;
      const rightTime = right.startsAtSafe?.getTime() ?? 0;
      return rightTime - leftTime;
    });
  }

  return sorted;
}