// src/modules/menu/mappers/campaignsToDeals.mapper.ts
// =============================================================================
// Maps CampaignPublic API records to DealCard display objects.
//
// Used by:
//   - src/pages/Deals/Deals.tsx          → /deals page
//   - src/modules/menu/pages/MenuPage.tsx → menu deals rail
//
// All field access is defensive. safeStr() guards null / undefined /
// whitespace-only values so callers always receive clean typed data.
// =============================================================================

import type { CampaignPublic } from '../hooks/useActiveCampaigns';
import type { DealCard } from '../components/DealsRail';

/**
 * Returns a trimmed non-empty string, or null.
 * Guards against null, undefined, and whitespace-only strings.
 */
function safeStr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Maps an array of active CampaignPublic records to DealCard display objects.
 *
 * Field coverage:
 *   id          → campaign.id                   (required, React key + analytics anchor)
 *   title       → hero_title → campaign_name → 'Special'
 *   subtitle    → hero_subtitle
 *   badge       → badge → 'DEAL'
 *   startsAt    → starts_at
 *   endsAt      → ends_at
 *   ctaLabel    → cta_label → 'See deal'
 *   deepLink    → deep_link  (sanitised upstream inside useActiveCampaigns)
 *   featured    → is_featured
 *   menuItemId  → menu_item_id
 *   placement   → placement
 *
 * Preserves source array order. Callers are responsible for sorting/ranking.
 */
export function campaignsToDeals(campaigns: CampaignPublic[]): DealCard[] {
  const out: DealCard[] = [];

  for (const c of campaigns) {
    out.push({
      id:         c.id,
      title:      safeStr(c.hero_title) ?? safeStr(c.campaign_name) ?? 'Special',
      subtitle:   safeStr(c.hero_subtitle),
      badge:      safeStr(c.badge) ?? 'DEAL',
      startsAt:   c.starts_at  ?? null,
      endsAt:     c.ends_at    ?? null,
      ctaLabel:   safeStr(c.cta_label) ?? 'See deal',
      deepLink:   safeStr(c.deep_link),
      featured:   Boolean(c.is_featured),
      menuItemId: safeStr(c.menu_item_id),
      placement:  safeStr(c.placement),
    });
  }

  return out;
}