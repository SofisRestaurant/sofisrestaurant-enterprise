-- index used by campaign rotation queries.

alter table public.growth_campaigns
  add column if not exists eligible_for_rotation boolean;

update public.growth_campaigns
set eligible_for_rotation = true
where eligible_for_rotation is null;

alter table public.growth_campaigns
  alter column eligible_for_rotation set default true;

alter table public.growth_campaigns
  alter column eligible_for_rotation set not null;

comment on column public.growth_campaigns.eligible_for_rotation is
  'Controls whether an active campaign is eligible to participate in automatic featured rotation.';

create index if not exists growth_campaigns_rotation_pool_idx
  on public.growth_campaigns (
    placement,
    is_featured,
    priority desc,
    weight desc,
    starts_at desc,
    ends_at asc,
    updated_at desc,
    id
  )
  where active is true and eligible_for_rotation is true;