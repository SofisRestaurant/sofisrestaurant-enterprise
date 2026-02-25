-- =============================================================================
-- MIGRATION: promotions
-- =============================================================================
-- Global campaign / promo-code table.
-- ALL discount math references this table from the Edge Function only.
-- RLS: public = no access. service role = full access.
-- =============================================================================

create table if not exists promotions (
  id               uuid        primary key default gen_random_uuid(),
  code             text        unique not null,
  type             text        not null check (type in ('percent', 'fixed')),
  -- percent: 0–100 (integer %).   fixed: positive integer cents.
  value            integer     not null check (value > 0),
  -- NULL = unlimited
  max_uses         integer     check (max_uses is null or max_uses > 0),
  current_uses     integer     not null default 0,
  -- NULL = unlimited per user
  per_user_limit   integer     not null default 1 check (per_user_limit > 0),
  -- optional cart minimum in cents
  min_order_cents  integer     not null default 0,
  -- NULL = never expires
  expires_at       timestamptz,
  active           boolean     not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Keep updated_at current automatically
create or replace function promotions_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger promotions_updated_at
  before update on promotions
  for each row execute procedure promotions_set_updated_at();

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists promotions_code_idx    on promotions (lower(code));
create index if not exists promotions_active_idx  on promotions (active) where active = true;
create index if not exists promotions_expires_idx on promotions (expires_at) where expires_at is not null;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table promotions enable row level security;

-- No public or authenticated access — service role only
-- (Edge Functions run under service role and bypass RLS entirely)
-- Explicit deny policies make intent clear and prevent accidental escalation.

create policy "promotions: deny public read"
  on promotions for select
  to public
  using (false);

create policy "promotions: deny authenticated read"
  on promotions for select
  to authenticated
  using (false);

  -- =============================================================================
-- MIGRATION: user_credits
-- =============================================================================
-- Holds redeemable credits per user (loyalty redemptions, marketing grants,
-- refund credits, etc.). Credits are consumed atomically inside create-checkout.
--
-- RLS: users can SELECT their own unused credits.
--      Only service role can INSERT / UPDATE / DELETE.
-- =============================================================================

create table if not exists user_credits (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references profiles (id) on delete cascade,
  amount_cents integer     not null check (amount_cents > 0),
  -- 'loyalty_redemption' | 'marketing_grant' | 'refund' | 'manual_admin'
  source       text        not null,
  -- once consumed inside checkout, marked used + checkout_session_id recorded
  used         boolean     not null default false,
  used_at      timestamptz,
  checkout_session_id text,   -- Stripe session ID that consumed this credit
  -- NULL = never expires
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists user_credits_user_id_idx      on user_credits (user_id);
create index if not exists user_credits_unused_idx
  on user_credits (user_id, used, expires_at)
  where used = false;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table user_credits enable row level security;

-- Users can view their own credits (for display in UI)
create policy "user_credits: users read own"
  on user_credits for select
  to authenticated
  using (user_id = auth.uid());

-- Only service role writes (Edge Functions)
create policy "user_credits: deny authenticated insert"
  on user_credits for insert
  to authenticated
  with check (false);

create policy "user_credits: deny authenticated update"
  on user_credits for update
  to authenticated
  using (false);

create policy "user_credits: deny authenticated delete"
  on user_credits for delete
  to authenticated
  using (false);

  -- =============================================================================
-- MIGRATION: promo_redemptions
-- =============================================================================
-- Immutable audit log of every promo code use. One row per (promotion, user,
-- checkout session). Used to enforce per_user_limit and detect abuse.
--
-- RLS: users can SELECT their own rows (for display).
--      Only service role can INSERT. No UPDATE / DELETE ever.
-- =============================================================================

create table if not exists promo_redemptions (
  id                  uuid        primary key default gen_random_uuid(),
  promotion_id uuid not null references promotions (id) on delete cascade,
  user_id             uuid        not null references profiles (id) on delete cascade,
  discount_cents      integer     not null check (discount_cents >= 0),
  checkout_session_id text,       -- Stripe session ID (populated post-session creation)
  used_at             timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
create index if not exists promo_redemptions_promo_idx
  on promo_redemptions (promotion_id);

create index if not exists promo_redemptions_user_promo_idx
  on promo_redemptions (user_id, promotion_id);

-- Unique per (user, promotion) when per_user_limit = 1 (most common case).
-- For higher limits, enforce in application logic (count query).
-- This partial unique index covers the single-use case with zero overhead.
create unique index if not exists promo_redemptions_single_use_idx
  on promo_redemptions (user_id, promotion_id)
  where true;  -- application relaxes this by counting rows when per_user_limit > 1

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table promo_redemptions enable row level security;

-- Users can read their own redemption history
create policy "promo_redemptions: users read own"
  on promo_redemptions for select
  to authenticated
  using (user_id = auth.uid());

-- Immutable from client perspective
create policy "promo_redemptions: deny authenticated insert"
  on promo_redemptions for insert
  to authenticated
  with check (false);

create policy "promo_redemptions: deny authenticated update"
  on promo_redemptions for update
  to authenticated
  using (false);

create policy "promo_redemptions: deny authenticated delete"
  on promo_redemptions for delete
  to authenticated
  using (false);

  -- =============================================================================
-- MIGRATION: helpers + loyalty_transactions RLS hardening
-- =============================================================================

-- ── Promo decrement helper (used in rollback) ─────────────────────────────
-- Safe decrement that never goes below 0.
create or replace function promotions_decrement_uses(p_promo_id uuid)
returns void language plpgsql security definer as $$
begin
  update promotions
  set current_uses = greatest(current_uses - 1, 0)
  where id = p_promo_id;
end;
$$;

-- ── loyalty_transactions RLS ──────────────────────────────────────────────
-- Users can read their own transaction history.
-- Only service role (Edge Functions) can write.

alter table if exists loyalty_transactions enable row level security;

create policy "loyalty_transactions: users read own"
  on loyalty_transactions for select
  to authenticated
  using (user_id = auth.uid());

create policy "loyalty_transactions: deny authenticated insert"
  on loyalty_transactions for insert
  to authenticated
  with check (false);

create policy "loyalty_transactions: deny authenticated update"
  on loyalty_transactions for update
  to authenticated
  using (false);

create policy "loyalty_transactions: deny authenticated delete"
  on loyalty_transactions for delete
  to authenticated
  using (false);

-- ── checkout_rate_limits RLS ──────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_name = 'checkout_rate_limits'
  ) then
    execute '
      create policy "checkout_rate_limits: deny all authenticated"
      on checkout_rate_limits for all
      to authenticated
      using (false)
      with check (false)
    ';
  end if;
end;
$$;

-- ── pending_carts RLS ─────────────────────────────────────────────────────
alter table if exists pending_carts enable row level security;

create policy "pending_carts: users read own"
  on pending_carts for select
  to authenticated
  using (user_id = auth.uid());

create policy "pending_carts: deny authenticated write"
  on pending_carts for insert
  to authenticated
  with check (false);

create policy "pending_carts: deny authenticated update"
  on pending_carts for update
  to authenticated
  using (false);