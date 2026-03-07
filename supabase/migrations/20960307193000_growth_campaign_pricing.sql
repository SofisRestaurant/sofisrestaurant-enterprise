-- ============================================================================
-- growth_campaign_pricing
-- ----------------------------------------------------------------------------
-- Adds real pricing semantics to growth_campaigns and persists immutable
-- pricing snapshots on pending_carts so checkout/finalize share one server
-- truth.
--
-- Notes:
-- - We intentionally reuse public.growth_campaigns.menu_item_id as the primary
--   item-scope field for item-level pricing rules.
-- - Orders already have metadata/json storage, so we persist the final pricing
--   snapshot there during finalize-order instead of adding new order columns.
-- - pending_carts gets pricing_snapshot/pricing_hash/currency to lock the
--   checkout decision before payment completes.
-- ============================================================================

alter table public.growth_campaigns
  add column if not exists deal_type text null,
  add column if not exists deal_price_cents integer null,
  add column if not exists discount_percent integer null,
  add column if not exists discount_cents integer null,
  add column if not exists applies_to_category public.menu_category null,
  add column if not exists applies_to_order_type text null,
  add column if not exists auto_apply boolean not null default true,
  add column if not exists stackable boolean not null default false,
  add column if not exists pricing_priority integer not null default 0,
  add column if not exists max_redemptions integer null,
  add column if not exists per_user_limit integer null;

comment on column public.growth_campaigns.deal_type is
  'Pricing rule type for the campaign: fixed_price, percent_off, amount_off, or bogo.';
comment on column public.growth_campaigns.deal_price_cents is
  'Used when deal_type = fixed_price. Integer cents.';
comment on column public.growth_campaigns.discount_percent is
  'Used when deal_type = percent_off. Whole-number percent 1-100.';
comment on column public.growth_campaigns.discount_cents is
  'Used when deal_type = amount_off. Integer cents.';
comment on column public.growth_campaigns.menu_item_id is
  'When a pricing rule is configured, menu_item_id is the primary item-level target.';
comment on column public.growth_campaigns.applies_to_category is
  'Optional category-wide scope for campaign pricing.';
comment on column public.growth_campaigns.applies_to_order_type is
  'Optional order-type scope: pickup, delivery, dine_in.';
comment on column public.growth_campaigns.auto_apply is
  'If true, pricing can be applied automatically during checkout.';
comment on column public.growth_campaigns.stackable is
  'If false, order-level promo discount will not stack on top of this campaign line.';
comment on column public.growth_campaigns.pricing_priority is
  'Additional pricing tie-breaker. Higher wins.';
comment on column public.growth_campaigns.max_redemptions is
  'Reserved for global campaign redemption ceilings.';
comment on column public.growth_campaigns.per_user_limit is
  'Reserved for per-user campaign redemption ceilings.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'growth_campaigns_deal_type_chk'
      and conrelid = 'public.growth_campaigns'::regclass
  ) then
    alter table public.growth_campaigns
      add constraint growth_campaigns_deal_type_chk
      check (
        deal_type is null
        or deal_type in ('fixed_price', 'percent_off', 'amount_off', 'bogo')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'growth_campaigns_deal_price_cents_chk'
      and conrelid = 'public.growth_campaigns'::regclass
  ) then
    alter table public.growth_campaigns
      add constraint growth_campaigns_deal_price_cents_chk
      check (deal_price_cents is null or deal_price_cents >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'growth_campaigns_discount_percent_chk'
      and conrelid = 'public.growth_campaigns'::regclass
  ) then
    alter table public.growth_campaigns
      add constraint growth_campaigns_discount_percent_chk
      check (discount_percent is null or (discount_percent >= 1 and discount_percent <= 100));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'growth_campaigns_discount_cents_chk'
      and conrelid = 'public.growth_campaigns'::regclass
  ) then
    alter table public.growth_campaigns
      add constraint growth_campaigns_discount_cents_chk
      check (discount_cents is null or discount_cents >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'growth_campaigns_applies_to_order_type_chk'
      and conrelid = 'public.growth_campaigns'::regclass
  ) then
    alter table public.growth_campaigns
      add constraint growth_campaigns_applies_to_order_type_chk
      check (
        applies_to_order_type is null
        or applies_to_order_type in ('pickup', 'delivery', 'dine_in')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'growth_campaigns_max_redemptions_chk'
      and conrelid = 'public.growth_campaigns'::regclass
  ) then
    alter table public.growth_campaigns
      add constraint growth_campaigns_max_redemptions_chk
      check (max_redemptions is null or max_redemptions > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'growth_campaigns_per_user_limit_chk'
      and conrelid = 'public.growth_campaigns'::regclass
  ) then
    alter table public.growth_campaigns
      add constraint growth_campaigns_per_user_limit_chk
      check (per_user_limit is null or per_user_limit > 0);
  end if;
end $$;

create index if not exists growth_campaigns_active_pricing_idx
  on public.growth_campaigns (
    active,
    auto_apply,
    menu_item_id,
    applies_to_category,
    applies_to_order_type,
    priority desc,
    pricing_priority desc,
    weight desc,
    starts_at desc,
    ends_at asc,
    updated_at desc,
    id
  )
  where deal_type is not null;

alter table public.pending_carts
  add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists pricing_hash text null,
  add column if not exists currency text not null default 'usd';

comment on column public.pending_carts.pricing_snapshot is
  'Immutable server-authoritative checkout pricing snapshot.';
comment on column public.pending_carts.pricing_hash is
  'Deterministic integrity hash for pricing_snapshot.';
comment on column public.pending_carts.currency is
  'Checkout currency used when the Stripe session was created.';

create index if not exists pending_carts_stripe_session_id_idx
  on public.pending_carts (stripe_session_id)
  where stripe_session_id is not null;

create index if not exists pending_carts_expires_at_idx
  on public.pending_carts (expires_at);

update public.pending_carts
set
  currency = coalesce(nullif(trim(currency), ''), 'usd'),
  pricing_snapshot = case
    when pricing_snapshot is null then '{}'::jsonb
    else pricing_snapshot
  end
where
  currency is distinct from coalesce(nullif(trim(currency), ''), 'usd')
  or pricing_snapshot is null;