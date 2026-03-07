-- ============================================================================
-- 20887805200000_active_campaigns_and_rotation.sql
-- ----------------------------------------------------------------------------
-- Foundational growth-campaign rotation migration (CANONICAL OWNER)
--
-- Purpose:
-- 1) Ensure singleton settings table exists + normalized
-- 2) Ensure eligible_for_rotation exists and is not null (default true)
-- 3) Create indexes for rotation + featured lookups
-- 4) Define a single, canonical rotation RPC:
--      rotate_featured_growth_campaigns(target_placement text default null)
--    returns table:
--      (placement text, featured_campaign_id text, was_manual_override boolean, rotated_at timestamptz)
--
-- Design goals:
-- - Deterministic per day (UTC day) with weighting
-- - Respects schedule window (starts_at / ends_at)
-- - Supports manual override:
--     If is_featured=true AND eligible_for_rotation=false, it wins and no rotation occurs
-- - Concurrency safe via advisory lock
-- - Avoids return-type conflicts forever by dropping ALL signatures first
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Settings singleton table
-- ----------------------------------------------------------------------------
create table if not exists public.growth_campaign_settings (
  id integer primary key,
  auto_rotate_daily boolean not null default true,
  last_rotation_at timestamptz null
);

alter table public.growth_campaign_settings
  add column if not exists auto_rotate_daily boolean not null default true;

alter table public.growth_campaign_settings
  add column if not exists last_rotation_at timestamptz null;

do $$
begin
  if exists (
    select 1
    from public.growth_campaign_settings
    where id <> 1
  ) then
    raise exception 'public.growth_campaign_settings must remain a singleton row with id = 1';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'growth_campaign_settings_singleton_chk'
      and conrelid = 'public.growth_campaign_settings'::regclass
  ) then
    alter table public.growth_campaign_settings
      add constraint growth_campaign_settings_singleton_chk
      check (id = 1);
  end if;
end
$$;

insert into public.growth_campaign_settings (id, auto_rotate_daily, last_rotation_at)
values (1, true, null)
on conflict (id) do update
set auto_rotate_daily = coalesce(public.growth_campaign_settings.auto_rotate_daily, excluded.auto_rotate_daily);

-- ----------------------------------------------------------------------------
-- 2) eligible_for_rotation column hardening
-- ----------------------------------------------------------------------------
alter table public.growth_campaigns
  add column if not exists eligible_for_rotation boolean;

update public.growth_campaigns
set eligible_for_rotation = true
where eligible_for_rotation is null;

alter table public.growth_campaigns
  alter column eligible_for_rotation set default true;

alter table public.growth_campaigns
  alter column eligible_for_rotation set not null;

-- ----------------------------------------------------------------------------
-- 3) Indexes used by rotation + public “active now” reads
-- ----------------------------------------------------------------------------
create index if not exists growth_campaigns_rotation_schedule_idx
  on public.growth_campaigns (
    placement,
    active,
    eligible_for_rotation,
    starts_at,
    ends_at,
    priority,
    weight,
    updated_at,
    created_at,
    id
  );

create index if not exists growth_campaigns_featured_lookup_idx
  on public.growth_campaigns (
    placement,
    active,
    is_featured,
    featured_for_date,
    id
  );

-- ----------------------------------------------------------------------------
-- 4) Drop ALL old signatures (prevents return-type conflicts forever)
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rotate_featured_growth_campaigns'
  loop
    execute 'drop function if exists ' || r.sig || ';';
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 5) Canonical rotation RPC
-- ----------------------------------------------------------------------------
create or replace function public.rotate_featured_growth_campaigns(
  target_placement text default null
)
returns table (
  placement text,
  featured_campaign_id text,
  was_manual_override boolean,
  rotated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_today date := (timezone('UTC', now()))::date;
  v_requested_placement text := nullif(btrim(target_placement), '');
  v_placement text;

  v_manual_featured_id uuid;
  v_selected_id uuid;
begin
  -- Lock per placement scope so concurrent calls can't fight.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'public.rotate_featured_growth_campaigns:' || coalesce(v_requested_placement, '*'),
      0
    )
  );

  -- ensure singleton exists (idempotent)
  insert into public.growth_campaign_settings (id, auto_rotate_daily, last_rotation_at)
  values (1, true, null)
  on conflict (id) do nothing;

  for v_placement in
    select distinct btrim(gc.placement)
    from public.growth_campaigns gc
    where gc.active is true
      and gc.placement is not null
      and btrim(gc.placement) <> ''
      and (v_requested_placement is null or btrim(gc.placement) = v_requested_placement)
  loop
    v_manual_featured_id := null;
    v_selected_id := null;

    -- A) Manual override:
    -- If a campaign is featured AND NOT eligible_for_rotation, it wins.
    select gc.id
    into v_manual_featured_id
    from public.growth_campaigns gc
    where btrim(gc.placement) = v_placement
      and gc.active is true
      and (gc.starts_at is null or gc.starts_at <= v_now)
      and (gc.ends_at is null or gc.ends_at > v_now)
      and gc.eligible_for_rotation is false
      and coalesce(gc.is_featured, false) is true
    order by
      coalesce(gc.priority, 0) desc,
      coalesce(gc.updated_at, gc.created_at, v_now) desc,
      gc.id asc
    limit 1;

    if v_manual_featured_id is not null then
      return query
      select
        v_placement,
        v_manual_featured_id::text,
        true,
        v_now;

      continue;
    end if;

    -- B) Choose deterministic candidate from eligible pool
    -- Strategy:
    -- 1) priority DESC
    -- 2) avoid repeating same featured_for_date today (if that column exists/used)
    -- 3) deterministic weighted hash (UTC date + id) / weight
    -- 4) stable tie-breakers
    select gc.id
    into v_selected_id
    from public.growth_campaigns gc
    where btrim(gc.placement) = v_placement
      and gc.active is true
      and gc.eligible_for_rotation is true
      and (gc.starts_at is null or gc.starts_at <= v_now)
      and (gc.ends_at is null or gc.ends_at > v_now)
    order by
      coalesce(gc.priority, 0) desc,
      case
        when gc.featured_for_date = v_today then 0
        else 1
      end asc,
      (
        abs(hashtextextended(v_today::text || ':' || gc.id::text, 0))::numeric
        / greatest(coalesce(gc.weight, 1), 1)::numeric
      ) asc,
      coalesce(gc.updated_at, gc.created_at, v_now) asc,
      gc.id asc
    limit 1;

    if v_selected_id is not null then
      -- Apply single-winner featured toggle for this placement
      update public.growth_campaigns gc
      set
        is_featured = (gc.id = v_selected_id),
        featured_for_date = case
          when gc.id = v_selected_id then v_today
          else gc.featured_for_date
        end,
        updated_at = case
          when gc.id = v_selected_id
               and (
                 coalesce(gc.is_featured, false) is distinct from true
                 or gc.featured_for_date is distinct from v_today
               )
            then v_now
          when gc.id <> v_selected_id
               and coalesce(gc.is_featured, false) is distinct from false
            then v_now
          else gc.updated_at
        end
      where btrim(gc.placement) = v_placement
        and gc.active is true
        and (gc.starts_at is null or gc.starts_at <= v_now)
        and (gc.ends_at is null or gc.ends_at > v_now)
        and (
          gc.eligible_for_rotation is true
          or coalesce(gc.is_featured, false) is true
        );

      return query
      select
        v_placement,
        v_selected_id::text,
        false,
        v_now;
    else
      -- No eligible campaign: clear featured among eligible ones only
      update public.growth_campaigns gc
      set
        is_featured = false,
        updated_at = case
          when coalesce(gc.is_featured, false) is true then v_now
          else gc.updated_at
        end
      where btrim(gc.placement) = v_placement
        and gc.active is true
        and gc.eligible_for_rotation is true
        and (gc.starts_at is null or gc.starts_at <= v_now)
        and (gc.ends_at is null or gc.ends_at > v_now)
        and coalesce(gc.is_featured, false) is true;

      return query
      select
        v_placement,
        null::text,
        false,
        v_now;
    end if;
  end loop;

  update public.growth_campaign_settings
  set last_rotation_at = v_now
  where id = 1;

  return;
end;
$$;

comment on function public.rotate_featured_growth_campaigns(text) is
  'Service/admin-only RPC that deterministically rotates one featured campaign per placement unless a manual non-rotation featured campaign is already pinned (eligible_for_rotation=false).';

revoke all privileges on function public.rotate_featured_growth_campaigns(text) from public;
revoke all privileges on function public.rotate_featured_growth_campaigns(text) from anon;
revoke all privileges on function public.rotate_featured_growth_campaigns(text) from authenticated;
grant execute on function public.rotate_featured_growth_campaigns(text) to service_role;