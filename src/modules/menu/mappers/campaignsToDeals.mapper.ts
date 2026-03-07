import type { CampaignPublic } from "../hooks/useActiveCampaigns";
import type { DealCard } from "../components/DealsRail";

function safeStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function campaignsToDeals(campaigns: CampaignPublic[]): DealCard[] {
  const out: DealCard[] = [];

  for (const c of campaigns) {
    const title =
      safeStr(c.hero_title) ||
      safeStr(c.campaign_name) ||
      "Special";

    const subtitle = safeStr(c.hero_subtitle);

    out.push({
      id: c.id,
      title,
      subtitle,
      badge: safeStr(c.badge) ?? "DEAL",
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      ctaLabel: safeStr(c.cta_label) ?? "See deal",
    });
  }

  return out;
}