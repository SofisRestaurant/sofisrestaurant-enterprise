begin;

alter table public.growth_campaigns
  add column if not exists active boolean not null default true;

-- Optional: helps when you list only active campaigns
create index if not exists growth_campaigns_active_idx
  on public.growth_campaigns (active);

comment on column public.growth_campaigns.active is
'Whether the campaign is currently active/paused in the admin UI.';

commit;