-- =============================================================================
-- ENTERPRISE INCENTIVES (REPLAY SAFE)
-- =============================================================================
-- Fully idempotent
-- Shadow-database safe
-- No assumptions about legacy tables
-- =============================================================================

-- =============================================================================
-- PROMOTIONS
-- =============================================================================

create table if not exists promotions (
  id               uuid        primary key default gen_random_uuid(),
  code             text        unique not null,
  type             text        not null check (type in ('percent', 'fixed')),
  value            integer     not null check (value > 0),
  max_uses         integer     check (max_uses is null or max_uses > 0),
  current_uses     integer     not null default 0,
  per_user_limit   integer     not null default 1 check (per_user_limit > 0),
  min_order_cents  integer     not null default 0,
  expires_at       timestamptz,
  active           boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create or replace function promotions_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists promotions_updated_at on promotions;

create trigger promotions_updated_at
  before update on promotions
  for each row execute procedure promotions_set_updated_at();

create index if not exists promotions_code_idx
  on promotions (lower(code));

create index if not exists promotions_active_idx
  on promotions (active) where active = true;

create index if not exists promotions_expires_idx
  on promotions (expires_at) where expires_at is not null;

alter table promotions enable row level security;

drop policy if exists "promotions: deny public read" on promotions;
create policy "promotions: deny public read"
  on promotions for select to public using (false);

drop policy if exists "promotions: deny authenticated read" on promotions;
create policy "promotions: deny authenticated read"
  on promotions for select to authenticated using (false);

-- =============================================================================
-- USER CREDITS
-- =============================================================================

create table if not exists user_credits (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references profiles (id) on delete cascade,
  amount_cents integer     not null check (amount_cents > 0),
  source       text        not null,
  used         boolean     not null default false,
  used_at      timestamptz,
  checkout_session_id text,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists user_credits_user_id_idx
  on user_credits (user_id);

create index if not exists user_credits_unused_idx
  on user_credits (user_id, used, expires_at)
  where used = false;

alter table user_credits enable row level security;

drop policy if exists "user_credits: users read own" on user_credits;
create policy "user_credits: users read own"
  on user_credits for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user_credits: deny authenticated insert" on user_credits;
create policy "user_credits: deny authenticated insert"
  on user_credits for insert to authenticated
  with check (false);

drop policy if exists "user_credits: deny authenticated update" on user_credits;
create policy "user_credits: deny authenticated update"
  on user_credits for update to authenticated
  using (false);

drop policy if exists "user_credits: deny authenticated delete" on user_credits;
create policy "user_credits: deny authenticated delete"
  on user_credits for delete to authenticated
  using (false);

-- =============================================================================
-- PROMO REDEMPTIONS
-- =============================================================================

create table if not exists promo_redemptions (
  id                  uuid primary key default gen_random_uuid(),
  promotion_id        uuid not null references promotions (id) on delete cascade,
  user_id             uuid not null references profiles (id) on delete cascade,
  discount_cents      integer not null check (discount_cents >= 0),
  checkout_session_id text,
  used_at             timestamptz not null default now()
);

create index if not exists promo_redemptions_promo_idx
  on promo_redemptions (promotion_id);

create index if not exists promo_redemptions_user_promo_idx
  on promo_redemptions (user_id, promotion_id);

create unique index if not exists promo_redemptions_single_use_idx
  on promo_redemptions (user_id, promotion_id);

alter table promo_redemptions enable row level security;

drop policy if exists "promo_redemptions: users read own" on promo_redemptions;
create policy "promo_redemptions: users read own"
  on promo_redemptions for select
  to authenticated
  using (user_id = auth.uid());

-- =============================================================================
-- HELPERS
-- =============================================================================

create or replace function promotions_decrement_uses(p_promo_id uuid)
returns void language plpgsql security definer as $$
begin
  update promotions
  set current_uses = greatest(current_uses - 1, 0)
  where id = p_promo_id;
end;
$$;

-- =============================================================================
-- LOYALTY_TRANSACTIONS (SAFE IF EXISTS)
-- =============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_name = 'loyalty_transactions'
  ) then

    execute 'alter table loyalty_transactions enable row level security';

    execute '
      create policy "loyalty_transactions: users read own"
      on loyalty_transactions
      for select
      to authenticated
      using (user_id = auth.uid())
    ';

    execute '
      create policy "loyalty_transactions: deny authenticated insert"
      on loyalty_transactions
      for insert
      to authenticated
      with check (false)
    ';

    execute '
      create policy "loyalty_transactions: deny authenticated update"
      on loyalty_transactions
      for update
      to authenticated
      using (false)
    ';

    execute '
      create policy "loyalty_transactions: deny authenticated delete"
      on loyalty_transactions
      for delete
      to authenticated
      using (false)
    ';

  end if;
end;
$$;

-- =============================================================================
-- OPTIONAL TABLE HARDENING (SAFE IF EXISTS)
-- =============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_name = 'checkout_rate_limits'
  ) then
    execute '
      create policy "checkout_rate_limits: deny all authenticated"
      on checkout_rate_limits
      for all
      to authenticated
      using (false)
      with check (false)
    ';
  end if;
end;
$$;

alter table if exists pending_carts enable row level security;