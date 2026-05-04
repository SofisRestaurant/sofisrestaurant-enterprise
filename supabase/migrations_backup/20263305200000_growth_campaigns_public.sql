-- PATH: supabase/migrations/20260305090000_growth_campaigns_public.sql

-- Ensure uuid generation is available
create extension if not exists pgcrypto;

-- Base table (preferred): public.growth_campaigns
create table if not exists public.growth_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_name text not null,
  placement text not null,
  status text not null default 'draft',
  starts_at timestamptz not null default now(),
  ends_at timestamptz null,
  priority int not null default 0,
  weight numeric not null default 1,
  is_featured boolean not null default false,
  featured_for_date date null,
  promo_id uuid null,
  menu_item_id uuid null,
  hero_title text null,
  hero_subtitle text null,
  badge text null,
  cta_label text null,
  deep_link text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add missing columns safely if table already existed
alter table public.growth_campaigns
  add column if not exists campaign_name text,
  add column if not exists placement text,
  add column if not exists status text,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists priority int,
  add column if not exists weight numeric,
  add column if not exists is_featured boolean,
  add column if not exists featured_for_date date,
  add column if not exists promo_id uuid,
  add column if not exists menu_item_id uuid,
  add column if not exists hero_title text,
  add column if not exists hero_subtitle text,
  add column if not exists badge text,
  add column if not exists cta_label text,
  add column if not exists deep_link text,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

-- Normalize defaults where missing
alter table public.growth_campaigns
  alter column status set default 'draft',
  alter column starts_at set default now(),
  alter column priority set default 0,
  alter column weight set default 1,
  alter column is_featured set default false,
  alter column created_at set default now(),
  alter column updated_at set default now();

-- Status check constraint (draft|scheduled|active|paused|expired)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'growth_campaigns_status_check'
      and conrelid = 'public.growth_campaigns'::regclass
  ) then
    alter table public.growth_campaigns
      add constraint growth_campaigns_status_check
      check (status in ('draft','scheduled','active','paused','expired'));
  end if;
end $$;

-- Indexes
create index if not exists growth_campaigns_placement_status_idx
  on public.growth_campaigns (placement, status);

create index if not exists growth_campaigns_placement_window_idx
  on public.growth_campaigns (placement, starts_at, ends_at);

create index if not exists growth_campaigns_placement_featured_idx
  on public.growth_campaigns (placement, is_featured, featured_for_date);

create index if not exists growth_campaigns_status_window_idx
  on public.growth_campaigns (status, starts_at, ends_at);

-- Lock down table access (service role still works)
alter table public.growth_campaigns enable row level security;

-- Optional: ensure owner doesn't accidentally bypass RLS via view grants
alter table public.growth_campaigns force row level security;

revoke all on table public.growth_campaigns from public;
revoke all on table public.growth_campaigns from anon;
revoke all on table public.growth_campaigns from authenticated;

grant all on table public.growth_campaigns to service_role;

-- Public-safe active view (not granted to anon by default)
create or replace view public.active_campaigns_now
with (security_invoker = true) as
select
  id,
  campaign_name,
  placement,
  promo_id,
  starts_at,
  ends_at,
  badge,
  hero_title,
  hero_subtitle,
  cta_label,
  deep_link,
  menu_item_id,
  priority,
  weight,
  is_featured
from public.growth_campaigns
where status = 'active'
  and starts_at <= now()
  and (ends_at is null or ends_at > now());

revoke all on table public.active_campaigns_now from public;

-- Allow read from clients
grant select on table public.active_campaigns_now to anon;
grant select on table public.active_campaigns_now to authenticated;

-- Keep service role too (harmless)
grant select on table public.active_campaigns_now to service_role;
-- Rotation function: deterministic + idempotent per day
create or replace function public.rotate_daily_campaigns()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Expire anything ended (active or scheduled)
  update public.growth_campaigns
  set status = 'expired',
      is_featured = false,
      featured_for_date = null,
      updated_at = now()
  where ends_at is not null
    and ends_at <= now()
    and status in ('active','scheduled');

  -- Activate scheduled campaigns whose window has started
  update public.growth_campaigns
  set status = 'active',
      updated_at = now()
  where status = 'scheduled'
    and starts_at <= now()
    and (ends_at is null or ends_at > now());

  -- Clear featured flags for rows that are not currently active-in-window
  update public.growth_campaigns
  set is_featured = false,
      featured_for_date = null,
      updated_at = now()
  where is_featured = true
    and (
      status <> 'active'
      or starts_at > now()
      or (ends_at is not null and ends_at <= now())
    );

  -- Pick exactly one featured per placement among active-in-window
  with ranked as (
    select
      id,
      placement,
      row_number() over (
        partition by placement
        order by priority desc, weight desc, starts_at desc, id asc
      ) as rn
    from public.growth_campaigns
    where status = 'active'
      and starts_at <= now()
      and (ends_at is null or ends_at > now())
  ),
  winners as (
    select placement, id as winner_id
    from ranked
    where rn = 1
  )
  update public.growth_campaigns gc
  set
    is_featured = (gc.id = w.winner_id),
    featured_for_date = case when gc.id = w.winner_id then current_date else null end,
    updated_at = now()
  from winners w
  where gc.placement = w.placement
    and gc.status = 'active'
    and gc.starts_at <= now()
    and (gc.ends_at is null or gc.ends_at > now())
    and (
      gc.is_featured is distinct from (gc.id = w.winner_id)
      or gc.featured_for_date is distinct from case when gc.id = w.winner_id then current_date else null end
    );

end;
$$;

revoke all on function public.rotate_daily_campaigns() from public;
revoke all on function public.rotate_daily_campaigns() from anon;
revoke all on function public.rotate_daily_campaigns() from authenticated;

grant execute on function public.rotate_daily_campaigns() to service_role;