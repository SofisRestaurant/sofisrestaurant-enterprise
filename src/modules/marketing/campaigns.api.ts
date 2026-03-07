// PATH: src/modules/marketing/campaigns.api.ts
import type { CampaignPublic, GetActiveCampaignsResult } from "../../types/campaigns";
import { supabase } from "../../lib/supabase/supabaseClient";

type EdgeOk = {
  ok: true;
  placement: string;
  featured: CampaignPublic | null;
  campaigns: CampaignPublic[];
  asOf: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isCampaignPublic(v: unknown): v is CampaignPublic {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === "string" &&
    typeof v.campaign_name === "string" &&
    typeof v.placement === "string" &&
    (typeof v.promo_id === "string" || v.promo_id === null) &&
    typeof v.starts_at === "string" &&
    (typeof v.ends_at === "string" || v.ends_at === null) &&
    (typeof v.badge === "string" || v.badge === null) &&
    (typeof v.hero_title === "string" || v.hero_title === null) &&
    (typeof v.hero_subtitle === "string" || v.hero_subtitle === null) &&
    (typeof v.cta_label === "string" || v.cta_label === null) &&
    (typeof v.deep_link === "string" || v.deep_link === null) &&
    (typeof v.menu_item_id === "string" || v.menu_item_id === null) &&
    typeof v.priority === "number" &&
    typeof v.weight === "number" &&
    typeof v.is_featured === "boolean"
  );
}

function isEdgeOk(v: unknown): v is EdgeOk {
  if (!isRecord(v) || v.ok !== true) return false;
  if (typeof v.placement !== "string") return false;
  if (typeof v.asOf !== "string") return false;

  const featured = v.featured;
  if (!(featured === null || isCampaignPublic(featured))) return false;

  const campaigns = v.campaigns;
  if (!Array.isArray(campaigns)) return false;
  if (!campaigns.every(isCampaignPublic)) return false;

  return true;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function getActiveCampaigns(args?: {
  placement?: string;
  limit?: number;
  featured?: boolean;
}): Promise<GetActiveCampaignsResult> {
  try {
    const placement = (args?.placement ?? "menu_deals_rail").trim() || "menu_deals_rail";
    const limit = clampInt(args?.limit ?? 12, 1, 50);
    const featured = args?.featured ?? true;

    const qs = new URLSearchParams();
    qs.set("placement", placement);
    qs.set("limit", String(limit));
    qs.set("featured", featured ? "true" : "false");

    const { data, error } = await supabase.functions.invoke(`get-active-campaigns?${qs.toString()}`, {
      method: "GET",
    });

    if (error) return { featured: null, campaigns: [] };
    if (!isEdgeOk(data)) return { featured: null, campaigns: [] };

    return {
      featured: data.featured,
      campaigns: data.campaigns,
    };
  } catch (_err: unknown) {
    return { featured: null, campaigns: [] };
  }
}