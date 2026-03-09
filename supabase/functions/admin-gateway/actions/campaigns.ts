// PATH: supabase/functions/admin-gateway/actions/campaigns.ts

import { createServiceClient } from '../../_shared/supabase.ts';

type CampaignRow = {
  id: string;
  campaign_name: string | null;
  placement: string | null;
  active: boolean | null;
  priority: number | null;
  weight: number | null;
  starts_at: string | null;
  ends_at: string | null;
  updated_at: string | null;

  badge: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  cta_label: string | null;
  deep_link: string | null;
  menu_item_id: string | null;

  is_featured: boolean | null;
  eligible_for_rotation: boolean | null;
};

export type CampaignListResult = CampaignRow[];

export type TogglePayload = {
  id: string;
  active: boolean;
};

export type CreatePayload = {
  campaign_name: string;
  placement: string;
  menu_item_id: string | null;

  badge: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  cta_label: string | null;
  deep_link: string | null;

  starts_at: string | null;
  ends_at: string | null;

  active: boolean;
  is_featured: boolean;
  eligible_for_rotation: boolean;
  priority: number;
  weight: number;
};

export type UpdatePayload = CreatePayload & { id: string };

export type PinFeaturedPayload = { id: string; placement: string };

export async function listCampaigns(): Promise<CampaignListResult> {
  const svc = createServiceClient();

  const { data, error } = await svc
    .from('growth_campaigns')
    .select(
      'id,campaign_name,placement,active,priority,weight,starts_at,ends_at,updated_at,badge,hero_title,hero_subtitle,cta_label,deep_link,menu_item_id,is_featured,eligible_for_rotation',
    )
    .order('updated_at', { ascending: false })
    .limit(500);

  if (error) throw Object.assign(new Error(error.message), { code: 'DB_CAMPAIGNS_LIST' });

  return (data ?? []) as CampaignRow[];
}

export async function toggleCampaign(payload: TogglePayload): Promise<{ ok: true }> {
  const svc = createServiceClient();

  const { error } = await svc
    .from('growth_campaigns')
    .update({ active: payload.active })
    .eq('id', payload.id);

  if (error) throw Object.assign(new Error(error.message), { code: 'DB_CAMPAIGN_TOGGLE' });

  return { ok: true };
}

export async function createCampaign(payload: CreatePayload): Promise<{ ok: true; id: string }> {
  const svc = createServiceClient();

  const { data, error } = await svc
    .from('growth_campaigns')
    .insert({
      campaign_name: payload.campaign_name,
      placement: payload.placement,
      menu_item_id: payload.menu_item_id,

      badge: payload.badge,
      hero_title: payload.hero_title,
      hero_subtitle: payload.hero_subtitle,
      cta_label: payload.cta_label,
      deep_link: payload.deep_link,

      starts_at: payload.starts_at,
      ends_at: payload.ends_at,

      active: payload.active,
      is_featured: payload.is_featured,
      eligible_for_rotation: payload.eligible_for_rotation,
      priority: payload.priority,
      weight: payload.weight,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw Object.assign(new Error(error?.message ?? 'Insert failed'), {
      code: 'DB_CAMPAIGN_CREATE',
    });
  }

  return { ok: true, id: data.id as string };
}

export async function updateCampaign(payload: UpdatePayload): Promise<{ ok: true }> {
  const svc = createServiceClient();

  const { error } = await svc
    .from('growth_campaigns')
    .update({
      campaign_name: payload.campaign_name,
      placement: payload.placement,
      menu_item_id: payload.menu_item_id,

      badge: payload.badge,
      hero_title: payload.hero_title,
      hero_subtitle: payload.hero_subtitle,
      cta_label: payload.cta_label,
      deep_link: payload.deep_link,

      starts_at: payload.starts_at,
      ends_at: payload.ends_at,

      active: payload.active,
      is_featured: payload.is_featured,
      eligible_for_rotation: payload.eligible_for_rotation,
      priority: payload.priority,
      weight: payload.weight,
    })
    .eq('id', payload.id);

  if (error) throw Object.assign(new Error(error.message), { code: 'DB_CAMPAIGN_UPDATE' });

  return { ok: true };
}

export async function pinFeatured(payload: PinFeaturedPayload): Promise<{ ok: true }> {
  const svc = createServiceClient();

  // 1) clear featured for this placement
  const clear = await svc
    .from('growth_campaigns')
    .update({ is_featured: false })
    .eq('placement', payload.placement);

  if (clear.error)
    throw Object.assign(new Error(clear.error.message), { code: 'DB_CAMPAIGN_CLEAR_FEATURED' });

  // 2) set featured for target id
  const set = await svc.from('growth_campaigns').update({ is_featured: true }).eq('id', payload.id);

  if (set.error)
    throw Object.assign(new Error(set.error.message), { code: 'DB_CAMPAIGN_PIN_FEATURED' });

  return { ok: true };
}

export async function runCampaignRotation(): Promise<{ ok: true }> {
  const svc = createServiceClient();

  const { error } = await svc.rpc('rotate_daily_campaigns');

  if (error) throw Object.assign(new Error(error.message), { code: 'DB_CAMPAIGN_ROTATE' });

  return { ok: true };
}
