// PATH: src/types/campaigns.ts
export type CampaignPublic = {
  id: string;
  campaign_name: string;
  placement: string;
  promo_id: string | null;
  starts_at: string;
  ends_at: string | null;
  badge: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  cta_label: string | null;
  deep_link: string | null;
  menu_item_id: string | null;
  priority: number;
  weight: number;
  is_featured: boolean;
};

export type GetActiveCampaignsResult = {
  featured: CampaignPublic | null;
  campaigns: CampaignPublic[];
};