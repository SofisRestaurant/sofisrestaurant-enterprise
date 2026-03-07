-- Safe public-facing active campaigns view for menu/deals reads.
-- The public Edge function should read this view, not the base table.
-- This view intentionally:
-- - only exposes customer-safe columns
-- - only includes active campaigns within their start/end schedule
-- - normalizes blank text to null
-- - falls back campaign_name from name for older rows
-- - keeps all direct public grants revoked

create or replace view public.active_campaigns_now as
select
  c.id,
  coalesce(
    nullif(btrim(c.campaign_name), ''),
    nullif(btrim(c.name), '')
  ) as campaign_name,
  nullif(btrim(c.placement), '') as placement,
  c.promo_id,
  c.starts_at,
  c.ends_at,
  nullif(btrim(c.badge), '') as badge,
  nullif(btrim(c.hero_title), '') as hero_title,
  nullif(btrim(c.hero_subtitle), '') as hero_subtitle,
  nullif(btrim(c.cta_label), '') as cta_label,
  case
    when c.deep_link is null then null
    when btrim(c.deep_link) = '' then null
    else btrim(c.deep_link)
  end as deep_link,
  c.menu_item_id,
  coalesce(c.priority, 0) as priority,
  greatest(coalesce(c.weight, 1), 1) as weight,
  coalesce(c.is_featured, false) as is_featured
from public.growth_campaigns c
where
  c.active is true
  and nullif(btrim(c.placement), '') is not null
  and coalesce(
    nullif(btrim(c.campaign_name), ''),
    nullif(btrim(c.name), '')
  ) is not null
  and (c.starts_at is null or c.starts_at <= now())
  and (c.ends_at is null or c.ends_at > now());

alter view public.active_campaigns_now set (security_barrier = true);

comment on view public.active_campaigns_now is
  'Customer-safe active campaigns view filtered by active flag and schedule window.';

revoke all privileges on table public.active_campaigns_now from public;
revoke all privileges on table public.active_campaigns_now from anon;
revoke all privileges on table public.active_campaigns_now from authenticated;

grant select on table public.active_campaigns_now to service_role;