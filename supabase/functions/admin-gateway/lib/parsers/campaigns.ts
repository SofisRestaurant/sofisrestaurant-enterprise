// =============================================================================
// PATH: supabase/functions/admin-gateway/lib/parsers/campaigns.ts
// =============================================================================
// Request parsers for all campaign gateway actions.
// =============================================================================

import type {
  ToggleCampaignPayload,
  CreateCampaignPayload,
  UpdateCampaignPayload,
  PinFeaturedPayload,
} from '../../types.ts';

import { isRecord, safeStr, safeBool, safeNum, parseId } from './shared.ts';

export function parsePinFeaturedPayload(v: unknown): PinFeaturedPayload | null {
  if (!isRecord(v)) return null;

  const id = parseId(v.id);
  const placement = safeStr(v.placement, 120);
  if (!id || !placement) return null;

  return { id, placement };
}

export function parseCreateCampaignPayload(v: unknown): CreateCampaignPayload | null {
  if (!isRecord(v)) return null;

  const campaign_name = safeStr(v.campaign_name, 200);
  const placement = safeStr(v.placement, 120);
  const menu_item_id = safeStr(v.menu_item_id, 128);
  const badge = safeStr(v.badge, 64);
  const hero_title = safeStr(v.hero_title, 180);
  const hero_subtitle = safeStr(v.hero_subtitle, 400);
  const cta_label = safeStr(v.cta_label, 120);
  const deep_link = safeStr(v.deep_link, 600);
  const starts_at = safeStr(v.starts_at, 80);
  const ends_at = safeStr(v.ends_at, 80);
  const active = safeBool(v.active);
  const is_featured = safeBool(v.is_featured);
  const eligible_for_rotation = safeBool(v.eligible_for_rotation);
  const priorityRaw = safeNum(v.priority);
  const weightRaw = safeNum(v.weight);

  if (!campaign_name || !placement) return null;
  if (active === null || is_featured === null || eligible_for_rotation === null) return null;
  if (priorityRaw === null || weightRaw === null) return null;

  return {
    campaign_name,
    placement,
    menu_item_id: menu_item_id ?? null,
    badge: badge ?? null,
    hero_title: hero_title ?? null,
    hero_subtitle: hero_subtitle ?? null,
    cta_label: cta_label ?? null,
    deep_link: deep_link ?? null,
    starts_at: starts_at ?? null,
    ends_at: ends_at ?? null,
    active,
    is_featured,
    eligible_for_rotation,
    priority: Math.trunc(priorityRaw),
    weight: Math.trunc(weightRaw),
  };
}

export function parseUpdateCampaignPayload(v: unknown): UpdateCampaignPayload | null {
  if (!isRecord(v)) return null;

  const id = parseId(v.id);
  if (!id) return null;

  const base = parseCreateCampaignPayload(v);
  if (!base) return null;

  return { ...base, id };
}

export function parseToggleCampaignPayload(v: unknown): ToggleCampaignPayload | null {
  if (!isRecord(v)) return null;

  const id = parseId(v.id);
  const active = safeBool(v.active);
  if (!id || active === null) return null;

  return { id, active };
}