-- --------------------------------------------------------------------------
-- SHADOW-DB REPLAY SAFETY (db pull)
-- This migration revokes/alters growth_campaign_settings before the canonical
-- migration that creates it. Ensure it exists so shadow replay can't fail.
-- --------------------------------------------------------------------------
create table if not exists public.growth_campaign_settings (
  id integer primary key,
  auto_rotate_daily boolean not null default true,
  last_rotation_at timestamptz null
);

alter table public.growth_campaign_settings
  alter column id set default 1;

create table if not exists public.growth_campaign_settings (
  id integer primary key,
  auto_rotate_daily boolean not null default true,
  last_rotation_at timestamptz null
);

-- Keep singleton default consistent with later migrations
alter table public.growth_campaign_settings
  alter column id set default 1;

-- --------------------------------------------------------------------------
-- SHADOW-DB REPLAY SAFETY (db pull)
-- This migration revokes/alters growth_campaign_settings before the canonical
-- migration that creates it. Ensure it exists so shadow replay can't fail.
-- --------------------------------------------------------------------------
create table if not exists public.growth_campaign_settings (
  id integer primary key,
  auto_rotate_daily boolean not null default true,
  last_rotation_at timestamptz null
);

-- Keep singleton default consistent with later migrations
alter table public.growth_campaign_settings
  alter column id set default 1;

drop policy if exists "loyalty_accounts_block_delete" on "public"."loyalty_accounts";

drop policy if exists "loyalty_accounts_block_insert" on "public"."loyalty_accounts";

revoke delete on table "public"."growth_campaign_settings" from "anon";

revoke insert on table "public"."growth_campaign_settings" from "anon";

revoke references on table "public"."growth_campaign_settings" from "anon";

revoke select on table "public"."growth_campaign_settings" from "anon";

revoke trigger on table "public"."growth_campaign_settings" from "anon";

revoke truncate on table "public"."growth_campaign_settings" from "anon";

revoke update on table "public"."growth_campaign_settings" from "anon";

revoke delete on table "public"."growth_campaign_settings" from "authenticated";

revoke insert on table "public"."growth_campaign_settings" from "authenticated";

revoke references on table "public"."growth_campaign_settings" from "authenticated";

revoke select on table "public"."growth_campaign_settings" from "authenticated";

revoke trigger on table "public"."growth_campaign_settings" from "authenticated";

revoke truncate on table "public"."growth_campaign_settings" from "authenticated";

revoke update on table "public"."growth_campaign_settings" from "authenticated";

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'growth_campaign_settings_singleton_chk'
      and conrelid = 'public.growth_campaign_settings'::regclass
  ) then
    alter table public.growth_campaign_settings drop constraint growth_campaign_settings_singleton_chk;
  end if;
end $$;

drop function if exists "public"."redeem_loyalty_points"(p_user_id uuid, p_points integer, p_order_id uuid);

drop function if exists "public"."rotate_featured_growth_campaigns"(target_placement text);

drop materialized view if exists "analytics"."admin_category_margin";

drop materialized view if exists "analytics"."admin_kitchen_velocity";

drop materialized view if exists "analytics"."admin_modifier_attach_rate";

drop materialized view if exists "analytics"."admin_modifier_snapshot";

drop materialized view if exists "analytics"."admin_order_backlog";

drop materialized view if exists "analytics"."admin_profit_snapshot";

drop materialized view if exists "analytics"."admin_promo_health";

drop materialized view if exists "analytics"."admin_promo_performance";

drop materialized view if exists "analytics"."admin_promo_roi";

drop materialized view if exists "analytics"."admin_top_customers";

drop materialized view if exists "internal"."admin_executive_snapshot";

drop view if exists "internal"."admin_fraud_snapshot";

drop materialized view if exists "internal"."admin_hourly_heatmap";

drop materialized view if exists "internal"."admin_item_consumption";

drop materialized view if exists "internal"."admin_item_hourly_velocity";

drop materialized view if exists "internal"."admin_revenue_summary";

drop materialized view if exists "internal"."admin_risk_snapshot";

drop materialized view if exists "internal"."admin_top_items";

drop materialized view if exists "internal"."admin_weekday_heatmap";

drop view if exists "public"."admin_executive_snapshot";

drop view if exists "public"."admin_hourly_heatmap";

drop view if exists "public"."admin_item_consumption";

drop view if exists "public"."admin_revenue_summary";

drop view if exists "public"."financial_revenue_view";

drop function if exists "public"."get_loyalty_by_order"(p_order_id uuid);

drop view if exists "public"."loyalty_leaderboard";

drop view if exists "public"."menu_items_admin_full";

drop view if exists "public"."menu_items_public";

drop view if exists "public"."order_performance";

drop view if exists "public"."order_timeline";

drop materialized view if exists "analytics"."admin_item_margin";

drop materialized view if exists "analytics"."admin_modifier_profit";

drop materialized view if exists "analytics"."admin_modifier_sales";

drop index if exists "public"."growth_campaigns_featured_lookup_idx";

drop index if exists "public"."growth_campaigns_rotation_pool_idx";

drop index if exists "public"."growth_campaigns_rotation_schedule_idx";


  create table if not exists public.auth_audit_log(
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "event_type" text not null,
    "ip_address" text,
    "risk_score" integer,
    "device_id" uuid,
    "event_data" jsonb,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."auth_risk_rate_limits" (
    "session_id" uuid not null,
    "user_id" uuid not null,
    "attempts" integer not null default 0,
    "last_attempt_at" timestamp with time zone,
    "blocked_until" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."auth_risk_rate_limits" enable row level security;


  create table "public"."auth_risk_scores" (
    "session_id" uuid not null,
    "user_id" uuid not null,
    "risk_score" integer not null default 0,
    "device_unknown_pts" integer not null default 0,
    "geo_mismatch_pts" integer not null default 0,
    "rapid_attempts_pts" integer not null default 0,
    "unusual_time_pts" integer not null default 0,
    "pw_mismatch_pts" integer not null default 0,
    "requires_device_trust" boolean not null default false,
    "requires_mfa" boolean not null default false,
    "requires_step_up" boolean not null default false,
    "evaluated_at" timestamp with time zone not null default now(),
    "expires_at" timestamp with time zone not null
      );



  create table "public"."auth_session_validation_cooldowns" (
    "user_id" uuid not null,
    "session_id" uuid not null,
    "action" text not null,
    "last_seen_at" timestamp with time zone not null default now()
      );


alter table "public"."auth_session_validation_cooldowns" enable row level security;


  create table "public"."auth_sessions_meta" (
    "session_id" uuid not null,
    "user_id" uuid not null,
    "device_trust_id" uuid,
    "ip_address" text,
    "country_code" text,
    "is_trusted_device" boolean not null default false,
    "risk_score" integer not null default 0,
    "last_active_at" timestamp with time zone,
    "invalidated_at" timestamp with time zone,
    "invalidation_reason" text,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."device_trust" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "fingerprint_hash" text not null,
    "trust_label" text,
    "trusted_at" timestamp with time zone not null default now(),
    "last_seen_at" timestamp with time zone,
    "ip_at_trust" text,
    "is_revoked" boolean not null default false,
    "revoked_at" timestamp with time zone
      );


alter table "public"."device_trust" enable row level security;


  create table "public"."loyalty_ledger_labels" (
    "id" uuid not null default gen_random_uuid(),
    "ledger_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "label" jsonb not null default '{}'::jsonb
      );


alter table "public"."growth_campaign_settings" alter column "id" set default 1;

CREATE INDEX auth_audit_log_created_at_idx ON public.auth_audit_log USING btree (created_at DESC);

CREATE UNIQUE INDEX auth_audit_log_pkey ON public.auth_audit_log USING btree (id);

CREATE INDEX auth_audit_log_user_id_idx ON public.auth_audit_log USING btree (user_id);

CREATE INDEX auth_risk_rate_limits_blocked_until_idx ON public.auth_risk_rate_limits USING btree (blocked_until);

CREATE UNIQUE INDEX auth_risk_rate_limits_pkey ON public.auth_risk_rate_limits USING btree (session_id);

CREATE INDEX auth_risk_rate_limits_user_id_idx ON public.auth_risk_rate_limits USING btree (user_id);

CREATE UNIQUE INDEX auth_risk_scores_pkey ON public.auth_risk_scores USING btree (session_id);

CREATE INDEX auth_risk_scores_user_id_idx ON public.auth_risk_scores USING btree (user_id);

CREATE UNIQUE INDEX auth_session_validation_cooldowns_pkey ON public.auth_session_validation_cooldowns USING btree (user_id, session_id, action);

CREATE INDEX auth_sessions_meta_created_at_idx ON public.auth_sessions_meta USING btree (created_at DESC);

CREATE UNIQUE INDEX auth_sessions_meta_pkey ON public.auth_sessions_meta USING btree (session_id);

CREATE INDEX auth_sessions_meta_user_id_idx ON public.auth_sessions_meta USING btree (user_id);

CREATE INDEX auth_svcooldowns_last_seen_idx ON public.auth_session_validation_cooldowns USING btree (last_seen_at DESC);

CREATE UNIQUE INDEX checkout_rate_limits_user_id_key ON public.checkout_rate_limits USING btree (user_id);

CREATE INDEX device_trust_fp_idx ON public.device_trust USING btree (fingerprint_hash);

CREATE UNIQUE INDEX device_trust_pkey ON public.device_trust USING btree (id);

CREATE UNIQUE INDEX device_trust_unique_user_fp ON public.device_trust USING btree (user_id, fingerprint_hash);

CREATE INDEX device_trust_user_idx ON public.device_trust USING btree (user_id);

do $$
begin
  -- SHADOW-DB REPLAY SAFETY:
  -- growth_campaigns may not exist yet, or may not have newer columns at this point.
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'growth_campaigns'
  )
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='placement')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='active')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='eligible_for_rotation')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='is_featured')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='priority')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='weight')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='starts_at')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='ends_at')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='updated_at')
  then
    execute 'create index if not exists growth_campaigns_rotation_idx
             on public.growth_campaigns
             using btree (placement, active, eligible_for_rotation, is_featured, priority, weight, starts_at, ends_at, updated_at)';
  end if;
end $$;

CREATE INDEX idx_loyalty_ledger_idem ON public.loyalty_ledger USING btree (idempotency_key);

CREATE INDEX idx_loyalty_ledger_meta_order_id ON public.loyalty_ledger USING btree (((metadata ->> 'order_id'::text)));

CREATE INDEX idx_loyalty_ledger_reference_id ON public.loyalty_ledger USING btree (reference_id);

CREATE UNIQUE INDEX loyalty_accounts_user_id_unique ON public.loyalty_accounts USING btree (user_id);

CREATE UNIQUE INDEX loyalty_ledger_labels_pkey ON public.loyalty_ledger_labels USING btree (id);

CREATE UNIQUE INDEX uniq_loyalty_tx_order ON public.loyalty_transactions USING btree (order_id);

alter table "public"."auth_audit_log" add constraint "auth_audit_log_pkey" PRIMARY KEY using index "auth_audit_log_pkey";

alter table "public"."auth_risk_rate_limits" add constraint "auth_risk_rate_limits_pkey" PRIMARY KEY using index "auth_risk_rate_limits_pkey";

alter table "public"."auth_risk_scores" add constraint "auth_risk_scores_pkey" PRIMARY KEY using index "auth_risk_scores_pkey";

alter table "public"."auth_session_validation_cooldowns" add constraint "auth_session_validation_cooldowns_pkey" PRIMARY KEY using index "auth_session_validation_cooldowns_pkey";

alter table "public"."auth_sessions_meta" add constraint "auth_sessions_meta_pkey" PRIMARY KEY using index "auth_sessions_meta_pkey";

alter table "public"."device_trust" add constraint "device_trust_pkey" PRIMARY KEY using index "device_trust_pkey";

alter table "public"."loyalty_ledger_labels" add constraint "loyalty_ledger_labels_pkey" PRIMARY KEY using index "loyalty_ledger_labels_pkey";

alter table "public"."checkout_rate_limits" add constraint "checkout_rate_limits_user_id_key" UNIQUE using index "checkout_rate_limits_user_id_key";

alter table "public"."device_trust" add constraint "device_trust_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."device_trust" validate constraint "device_trust_user_id_fkey";

alter table "public"."growth_campaign_settings" add constraint "growth_campaign_settings_id_check" CHECK ((id = 1)) not valid;

alter table "public"."growth_campaign_settings" validate constraint "growth_campaign_settings_id_check";

alter table "public"."loyalty_accounts" add constraint "loyalty_accounts_user_id_unique" UNIQUE using index "loyalty_accounts_user_id_unique";

alter table "public"."loyalty_ledger_labels" add constraint "loyalty_ledger_labels_ledger_id_fkey" FOREIGN KEY (ledger_id) REFERENCES public.loyalty_ledger(id) not valid;

alter table "public"."loyalty_ledger_labels" validate constraint "loyalty_ledger_labels_ledger_id_fkey";

set check_function_bodies = off;

create or replace view "public"."admin_layout_snapshot" as  WITH today_rev AS (
         SELECT COALESCE(sum(o.amount_total), (0)::bigint) AS today_revenue_cents,
            (count(*))::integer AS today_orders
           FROM public.orders o
          WHERE ((o.created_at >= date_trunc('day'::text, now())) AND (o.payment_status = 'paid'::text))
        ), pending_orders AS (
         SELECT (count(*))::integer AS pending_orders
           FROM public.orders
          WHERE ((orders.status = 'confirmed'::text) AND (orders.payment_status = 'paid'::text))
        ), unread_notifs AS (
         SELECT (count(*))::integer AS unread_notifications
           FROM public.admin_notifications
          WHERE (admin_notifications.read = false)
        ), fraud_7d AS (
         SELECT (COALESCE(admin_fraud_snapshot.fraud_events_7d, (0)::bigint))::integer AS fraud_events_7d
           FROM public.admin_fraud_snapshot
         LIMIT 1
        ), abandoned AS (
         SELECT (count(*))::integer AS abandoned_carts
           FROM public.abandoned_cart_sessions
          WHERE (abandoned_cart_sessions.recovered IS NOT TRUE)
        ), pending_carts AS (
         SELECT (count(*))::integer AS pending_carts
           FROM public.pending_carts pending_carts_1
        )
 SELECT today_rev.today_revenue_cents,
    today_rev.today_orders,
    pending_orders.pending_orders,
    unread_notifs.unread_notifications,
    fraud_7d.fraud_events_7d,
    abandoned.abandoned_carts,
    pending_carts.pending_carts,
    now() AS generated_at
   FROM today_rev,
    pending_orders,
    unread_notifs,
    fraud_7d,
    abandoned,
    pending_carts;


CREATE OR REPLACE FUNCTION public.block_loyalty_transactions_writes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'V1 loyalty_transactions is frozen. Use V2.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_loyalty_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.loyalty_accounts (user_id, balance, lifetime_earned, tier, streak)
  values (new.id, 0, 0, 'bronze', 0)
  on conflict (user_id) do nothing;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.get_admin_layout_snapshot()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result jsonb;
begin
  select to_jsonb(s)
  into result
  from public.admin_layout_snapshot s;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin_uid(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.admins a
    where a.user_id = uid
  );
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_update_delete_labels()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'loyalty_ledger_labels is append-only';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(p_user_id uuid, p_points integer, p_admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'V1 loyalty is disabled. Use v2_redeem_points / loyalty_ledger.' using errcode = 'P0001';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.v2_award_points(p_account_id uuid, p_admin_id uuid, p_amount_cents integer, p_idempotency_key text, p_reference_id uuid)
 RETURNS TABLE(points_earned integer, new_balance integer, new_lifetime integer, new_tier text, streak integer, tier_changed boolean, was_duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_account public.loyalty_accounts%rowtype;
  v_points integer;
  v_new_balance integer;
  v_new_lifetime integer;
  v_new_tier text;
  v_old_tier text;
  v_streak integer;
begin
  if p_amount_cents <= 0 then
    raise exception 'Invalid amount';
  end if;

  v_points := floor(p_amount_cents / 100);

  -- Lock account
  select *
  into v_account
  from public.loyalty_accounts
  where id = p_account_id
  for update;

  if not found then
    raise exception 'Account not found';
  end if;

  v_old_tier := v_account.tier;

  -- Idempotency check
  if p_idempotency_key is not null then
    if exists (
      select 1
      from public.loyalty_ledger
      where idempotency_key = p_idempotency_key
    ) then
      return query
      select
        0,
        v_account.balance,
        v_account.lifetime_earned,
        v_account.tier,
        v_account.streak,
        false,
        true;
      return;
    end if;
  end if;

  v_new_balance := v_account.balance + v_points;
  v_new_lifetime := v_account.lifetime_earned + v_points;

  -- streak
  if v_account.last_activity = current_date then
    v_streak := v_account.streak;
  elsif v_account.last_activity = current_date - interval '1 day' then
    v_streak := v_account.streak + 1;
  else
    v_streak := 1;
  end if;

  -- tier
  v_new_tier :=
    case
      when v_new_lifetime >= 5000 then 'platinum'
      when v_new_lifetime >= 2000 then 'gold'
      when v_new_lifetime >= 500 then 'silver'
      else 'bronze'
    end;

  -- ✅ Append ledger row WITH order linkage (NO UPDATE later)
  insert into public.loyalty_ledger (
    account_id,
    amount,
    balance_after,
    entry_type,
    source,
    reference_id,
    admin_id,
    idempotency_key,
    metadata
  )
  values (
    p_account_id,
    v_points,
    v_new_balance,
    'earn',
    'admin_scan',
    p_reference_id, -- ✅ order id in reference_id
    p_admin_id,
    p_idempotency_key,
    jsonb_build_object(
      'v2', true,
      'order_id', p_reference_id, -- ✅ order id in metadata too
      'source', 'admin_scan'
    )
  );

  update public.loyalty_accounts
  set
    balance = v_new_balance,
    lifetime_earned = v_new_lifetime,
    tier = v_new_tier,
    streak = v_streak,
    last_activity = current_date,
    updated_at = now()
  where id = p_account_id;

  return query
  select
    v_points,
    v_new_balance,
    v_new_lifetime,
    v_new_tier,
    v_streak,
    (v_new_tier <> v_old_tier),
    false;
end;
$function$
;

create or replace view "public"."v2_loyalty_activity" as  SELECT id,
    account_id,
    created_at,
    entry_type,
    amount,
    balance_after,
    source,
    reference_id,
    admin_id,
    idempotency_key,
        CASE
            WHEN (source = 'admin_scan'::text) THEN 'admin_scan'::text
            WHEN (source = 'webhook'::text) THEN 'order'::text
            ELSE source
        END AS source_label,
    (COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('v2', true, 'source', source, 'source_label',
        CASE
            WHEN (source = 'admin_scan'::text) THEN 'admin_scan'::text
            WHEN (source = 'webhook'::text) THEN 'order'::text
            ELSE source
        END)) AS metadata_enriched
   FROM public.loyalty_ledger l;


create or replace view "public"."v2_loyalty_ledger_enriched" as  SELECT id,
    account_id,
    amount,
    balance_after,
    entry_type,
    source,
    reference_id,
    admin_id,
    idempotency_key,
    tier_at_time,
    streak_at_time,
    metadata,
    created_at,
    prev_hash,
    row_hash,
    (COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('v2', true, 'source', source, 'reference_id', reference_id)) AS metadata_enriched
   FROM public.loyalty_ledger l;


create materialized view "analytics"."admin_category_margin" as  SELECT m.category,
    round((avg((((m.price * (100)::numeric) - (c.cost_cents)::numeric) / NULLIF((m.price * (100)::numeric), (0)::numeric))) * (100)::numeric), 2) AS avg_margin_percent,
    sum((((m.price * (100)::numeric))::integer - c.cost_cents)) AS total_profit_cents
   FROM (public.menu_items m
     JOIN public.cost_of_goods c ON ((c.menu_item_id = m.id)))
  GROUP BY m.category;


create materialized view "analytics"."admin_item_margin" as  SELECT m.id,
    m.name,
    m.category,
    ((m.price * (100)::numeric))::integer AS price_cents,
    c.cost_cents,
    (((m.price * (100)::numeric))::integer - c.cost_cents) AS gross_profit_cents,
    round(((((m.price * (100)::numeric) - (c.cost_cents)::numeric) / NULLIF((m.price * (100)::numeric), (0)::numeric)) * (100)::numeric), 2) AS margin_percent
   FROM (public.menu_items m
     JOIN public.cost_of_goods c ON ((c.menu_item_id = m.id)));


create materialized view "analytics"."admin_kitchen_velocity" as  SELECT avg(EXTRACT(epoch FROM (updated_at - created_at))) AS avg_order_lifecycle_seconds
   FROM public.orders
  WHERE ((status = ANY (ARRAY['completed'::text, 'fulfilled'::text])) AND (payment_status = 'paid'::text));


create materialized view "analytics"."admin_modifier_sales" as  SELECT (modifier.value ->> 'name'::text) AS modifier_name,
    sum(((item.value ->> 'quantity'::text))::integer) AS times_attached
   FROM public.orders o,
    LATERAL jsonb_array_elements(o.cart_items) item(value),
    LATERAL jsonb_array_elements(COALESCE((item.value -> 'modifiers'::text), '[]'::jsonb)) modifier(value)
  WHERE (o.payment_status = 'paid'::text)
  GROUP BY (modifier.value ->> 'name'::text);


create materialized view "analytics"."admin_order_backlog" as  SELECT count(*) AS active_orders
   FROM public.orders
  WHERE (status = ANY (ARRAY['pending'::text, 'preparing'::text]));


create materialized view "analytics"."admin_profit_snapshot" as  SELECT sum(amount_total) AS total_revenue_cents,
    sum(( SELECT sum((((item.value ->> 'quantity'::text))::integer * ( SELECT admin_item_margin.gross_profit_cents
                   FROM analytics.admin_item_margin
                  WHERE (admin_item_margin.name = (item.value ->> 'name'::text))
                 LIMIT 1))) AS sum
           FROM jsonb_array_elements(o.cart_items) item(value))) AS total_gross_profit_cents,
    round(((sum(( SELECT sum((((item.value ->> 'quantity'::text))::integer * ( SELECT admin_item_margin.gross_profit_cents
                   FROM analytics.admin_item_margin
                  WHERE (admin_item_margin.name = (item.value ->> 'name'::text))
                 LIMIT 1))) AS sum
           FROM jsonb_array_elements(o.cart_items) item(value))) / (NULLIF(sum(amount_total), 0))::numeric) * (100)::numeric), 2) AS overall_margin_percent
   FROM public.orders o
  WHERE (payment_status = 'paid'::text);


create materialized view "analytics"."admin_promo_health" as  SELECT count(*) FILTER (WHERE (active = true)) AS active_promos,
    count(*) FILTER (WHERE (active = false)) AS inactive_promos,
    count(*) FILTER (WHERE ((ends_at < now()) AND (active = true))) AS stale_promos
   FROM public.promotions;


create materialized view "analytics"."admin_promo_performance" as  SELECT p.code,
    p.channel,
    count(r.id) AS times_used,
    sum(r.order_total_cents) AS gross_revenue_cents,
    sum(r.discount_cents) AS total_discount_cents,
    sum((r.order_total_cents - r.discount_cents)) AS net_revenue_cents
   FROM (public.promotions p
     LEFT JOIN public.promo_redemptions r ON ((r.promotion_id = p.id)))
  GROUP BY p.code, p.channel;


create materialized view "analytics"."admin_promo_roi" as  SELECT p.code,
    p.channel,
    count(r.id) AS redemptions,
    sum(r.order_total_cents) AS gross_revenue,
    sum(r.discount_cents) AS total_discount,
    sum((r.order_total_cents - r.discount_cents)) AS net_revenue,
    round((((sum((r.order_total_cents - r.discount_cents)))::numeric / (NULLIF(sum(r.order_total_cents), 0))::numeric) * (100)::numeric), 2) AS margin_percent
   FROM (public.promotions p
     LEFT JOIN public.promo_redemptions r ON ((r.promotion_id = p.id)))
  GROUP BY p.code, p.channel;


create materialized view "analytics"."admin_top_customers" as  SELECT customer_uid,
    count(*) AS order_count,
    sum(amount_total) AS total_spent_cents
   FROM public.orders
  WHERE (payment_status = 'paid'::text)
  GROUP BY customer_uid
  ORDER BY (sum(amount_total)) DESC
 LIMIT 20;


create materialized view "internal"."admin_executive_snapshot" as  SELECT ( SELECT sum(orders.amount_total) AS sum
           FROM public.orders
          WHERE (orders.payment_status = 'paid'::text)) AS lifetime_revenue_cents,
    ( SELECT count(*) AS count
           FROM public.orders) AS total_orders,
    ( SELECT avg(orders.amount_total) AS avg
           FROM public.orders
          WHERE (orders.payment_status = 'paid'::text)) AS avg_order_value_cents,
    ( SELECT sum(t.balance_after) AS sum
           FROM ( SELECT DISTINCT ON (loyalty_ledger.account_id) loyalty_ledger.account_id,
                    loyalty_ledger.balance_after
                   FROM public.loyalty_ledger
                  ORDER BY loyalty_ledger.account_id, loyalty_ledger.created_at DESC) t) AS outstanding_loyalty_points,
    ( SELECT count(*) AS count
           FROM public.fraud_logs
          WHERE (fraud_logs.created_at > (now() - '7 days'::interval))) AS fraud_events_7d;


create or replace view "internal"."admin_fraud_snapshot" as  SELECT count(*) FILTER (WHERE (status = 'disputed'::text)) AS disputes,
    count(*) FILTER (WHERE (status = 'cancelled'::text)) AS cancelled_orders,
    count(*) FILTER (WHERE (status = 'failed'::text)) AS failed_payments,
    count(*) AS fraud_events_7d
   FROM public.orders
  WHERE (created_at >= (now() - '7 days'::interval));


create materialized view "internal"."admin_hourly_heatmap" as  SELECT EXTRACT(hour FROM created_at) AS hour_of_day,
    count(*) AS orders,
    sum(amount_total) AS revenue_cents
   FROM public.orders
  WHERE (payment_status = 'paid'::text)
  GROUP BY (EXTRACT(hour FROM created_at))
  ORDER BY (EXTRACT(hour FROM created_at));


create materialized view "internal"."admin_item_consumption" as  SELECT (item.value ->> 'name'::text) AS item_name,
    sum(((item.value ->> 'quantity'::text))::integer) AS total_quantity,
    sum((((item.value ->> 'quantity'::text))::integer * o.amount_total)) AS revenue_impact_cents
   FROM public.orders o,
    LATERAL jsonb_array_elements(o.cart_items) item(value)
  WHERE (o.payment_status = 'paid'::text)
  GROUP BY (item.value ->> 'name'::text)
  ORDER BY (sum(((item.value ->> 'quantity'::text))::integer)) DESC;


create materialized view "internal"."admin_item_hourly_velocity" as  SELECT EXTRACT(hour FROM o.created_at) AS hour_of_day,
    (item.value ->> 'name'::text) AS item_name,
    sum(((item.value ->> 'quantity'::text))::integer) AS quantity
   FROM public.orders o,
    LATERAL jsonb_array_elements(o.cart_items) item(value)
  WHERE (o.payment_status = 'paid'::text)
  GROUP BY (EXTRACT(hour FROM o.created_at)), (item.value ->> 'name'::text);


create materialized view "internal"."admin_revenue_summary" as  SELECT date_trunc('day'::text, created_at) AS day,
    count(*) AS total_orders,
    sum(amount_total) AS total_revenue_cents,
    avg(amount_total) AS avg_order_value_cents
   FROM public.orders
  WHERE (payment_status = 'paid'::text)
  GROUP BY (date_trunc('day'::text, created_at));


create materialized view "internal"."admin_risk_snapshot" as  SELECT count(*) FILTER (WHERE (payment_status = 'failed'::text)) AS failed_payments,
    count(*) FILTER (WHERE (payment_status = 'disputed'::text)) AS disputes,
    count(*) FILTER (WHERE (status = 'cancelled'::text)) AS cancelled_orders
   FROM public.orders;


create materialized view "internal"."admin_top_items" as  SELECT (item.value ->> 'name'::text) AS item_name,
    sum(((item.value ->> 'quantity'::text))::integer) AS total_quantity
   FROM public.orders,
    LATERAL jsonb_array_elements(orders.cart_items) item(value)
  WHERE (orders.payment_status = 'paid'::text)
  GROUP BY (item.value ->> 'name'::text)
  ORDER BY (sum(((item.value ->> 'quantity'::text))::integer)) DESC;


create materialized view "internal"."admin_weekday_heatmap" as  SELECT EXTRACT(dow FROM created_at) AS day_of_week,
    count(*) AS orders,
    sum(amount_total) AS revenue_cents
   FROM public.orders
  WHERE (payment_status = 'paid'::text)
  GROUP BY (EXTRACT(dow FROM created_at))
  ORDER BY (EXTRACT(dow FROM created_at));


do $$
begin
  -- SHADOW-DB REPLAY SAFETY:
  -- growth_campaigns may not have these columns yet when sync_remote runs.
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'growth_campaigns'
  )
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='id')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='campaign_name')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='placement')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='promo_id')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='starts_at')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='ends_at')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='badge')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='hero_title')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='hero_subtitle')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='cta_label')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='deep_link')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='menu_item_id')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='priority')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='weight')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='is_featured')
  and exists (select 1 from information_schema.columns where table_schema='public' and table_name='growth_campaigns' and column_name='active')
  then
    execute $v$
      create or replace view public.active_campaigns_now as
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
      from public.growth_campaigns c
      where
        c.active = true
        and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at is null or c.ends_at > now());
    $v$;
  end if;
end $$;

create or replace view "public"."admin_hourly_heatmap" as  SELECT (EXTRACT(hour FROM created_at))::integer AS hour_of_day,
    count(*) AS orders_count,
    COALESCE(sum(amount_total), (0)::bigint) AS revenue_cents
   FROM public.orders o
  WHERE ((created_at >= (now() - '30 days'::interval)) AND (payment_status = ANY (ARRAY['paid'::text, 'succeeded'::text])))
  GROUP BY ((EXTRACT(hour FROM created_at))::integer)
  ORDER BY ((EXTRACT(hour FROM created_at))::integer);


create or replace view "public"."admin_item_consumption" as  SELECT oi.name AS item_name,
    sum(oi.quantity) AS qty_sold,
    (sum(oi.line_total_cents))::bigint AS revenue_impact_cents,
    count(DISTINCT oi.order_id) AS orders_with_item
   FROM (public.order_items oi
     JOIN public.orders o ON ((o.id = oi.order_id)))
  WHERE ((o.payment_status = ANY (ARRAY['paid'::text, 'succeeded'::text])) AND (o.created_at >= (now() - '30 days'::interval)))
  GROUP BY oi.name
  ORDER BY ((sum(oi.line_total_cents))::bigint) DESC
 LIMIT 50;


create or replace view "public"."admin_revenue_summary" as  WITH paid_orders AS (
         SELECT (date_trunc('day'::text, o.created_at))::date AS day,
            COALESCE(sum(o.amount_total), (0)::bigint) AS gross_revenue_cents,
            count(*) AS orders_count
           FROM public.orders o
          WHERE ((o.created_at >= (now() - '30 days'::interval)) AND (o.payment_status = ANY (ARRAY['paid'::text, 'succeeded'::text])))
          GROUP BY ((date_trunc('day'::text, o.created_at))::date)
        ), refunded_orders AS (
         SELECT (date_trunc('day'::text, o.created_at))::date AS day,
            COALESCE(sum(o.amount_total), (0)::bigint) AS refunded_cents,
            count(*) AS refunds_count
           FROM public.orders o
          WHERE ((o.created_at >= (now() - '30 days'::interval)) AND (o.payment_status = ANY (ARRAY['refunded'::text, 'partially_refunded'::text])))
          GROUP BY ((date_trunc('day'::text, o.created_at))::date)
        )
 SELECT d.day,
    COALESCE(p.gross_revenue_cents, (0)::bigint) AS gross_revenue_cents,
    COALESCE(r.refunded_cents, (0)::bigint) AS refunded_cents,
    (COALESCE(p.gross_revenue_cents, (0)::bigint) - COALESCE(r.refunded_cents, (0)::bigint)) AS net_revenue_cents,
    COALESCE(p.orders_count, (0)::bigint) AS paid_orders_count,
    COALESCE(r.refunds_count, (0)::bigint) AS refunds_count
   FROM ((( SELECT paid_orders.day
           FROM paid_orders
        UNION
         SELECT refunded_orders.day
           FROM refunded_orders) d
     LEFT JOIN paid_orders p ON ((p.day = d.day)))
     LEFT JOIN refunded_orders r ON ((r.day = d.day)))
  ORDER BY d.day;


CREATE OR REPLACE FUNCTION public.award_loyalty_points(p_user_id uuid, p_order_id uuid, p_amount_cents integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
begin
  raise exception 'V1 loyalty is disabled. Use v2_award_points / loyalty_ledger.' using errcode = 'P0001';
end;
$function$
;

create or replace view "public"."financial_revenue_view" as  SELECT id,
    amount_total,
    payment_status,
    created_at
   FROM public.orders
  WHERE (payment_status = 'paid'::text);


CREATE OR REPLACE FUNCTION public.get_loyalty_by_order(p_order_id uuid)
 RETURNS TABLE(ledger_id uuid, account_id uuid, amount integer, entry_type text, source text, reference_id uuid, idempotency_key text, created_at timestamp with time zone, metadata jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    l.id as ledger_id,
    l.account_id,
    l.amount,
    l.entry_type,
    l.source,
    l.reference_id,
    l.idempotency_key,
    l.created_at,
    l.metadata
  from public.loyalty_ledger l
  where
    -- most common: earned points for an order
    l.entry_type in ('earn','earned')
    and (
      -- ✅ best: directly linked
      l.reference_id = p_order_id

      -- ✅ next best: metadata link
      or (l.metadata ? 'order_id' and (l.metadata->>'order_id')::uuid = p_order_id)

      -- ✅ fallback: deterministic idempotency keys
      or l.idempotency_key = ('award:' || p_order_id::text)
      or l.idempotency_key = ('finalize-backfill:' || p_order_id::text)
    )
  order by l.created_at desc
  limit 1;
$function$
;

create or replace view "public"."loyalty_leaderboard" as  SELECT id,
    full_name,
    loyalty_points,
    lifetime_points,
    loyalty_tier,
    loyalty_streak,
    last_order_date,
        CASE loyalty_tier
            WHEN 'platinum'::text THEN 5000
            WHEN 'gold'::text THEN 2000
            WHEN 'silver'::text THEN 500
            ELSE 0
        END AS tier_threshold,
        CASE loyalty_tier
            WHEN 'platinum'::text THEN NULL::integer
            WHEN 'gold'::text THEN (5000 - lifetime_points)
            WHEN 'silver'::text THEN (2000 - lifetime_points)
            ELSE (500 - lifetime_points)
        END AS points_to_next_tier
   FROM public.profiles p
  ORDER BY lifetime_points DESC;


create or replace view "public"."menu_items_admin_full" as  SELECT id,
    name,
    description,
    price,
    category,
    created_at,
    image_url,
    available,
    featured,
    allergens,
    spicy_level,
    is_vegetarian,
    is_vegan,
    is_gluten_free,
    sort_order,
    inventory_count,
    low_stock_threshold,
    popularity_score,
    pairs_with,
    updated_at,
    COALESCE(( SELECT json_agg(json_build_object('id', mg.id, 'name', mg.name, 'description', mg.description, 'type', mg.type, 'required', mg.required, 'min_selections', mg.min_selections, 'max_selections', mg.max_selections, 'active', mg.active, 'sort_order', COALESCE(mim.sort_order, mg.sort_order), 'modifiers', ( SELECT COALESCE(json_agg(json_build_object('id', m.id, 'modifier_group_id', m.modifier_group_id, 'name', m.name, 'price_adjustment', m.price_adjustment, 'available', m.available, 'sort_order', m.sort_order) ORDER BY m.sort_order), '[]'::json) AS "coalesce"
                   FROM public.modifiers m
                  WHERE (m.modifier_group_id = mg.id))) ORDER BY COALESCE(mim.sort_order, mg.sort_order)) AS json_agg
           FROM (public.menu_item_modifier_groups mim
             JOIN public.modifier_groups mg ON ((mg.id = mim.modifier_group_id)))
          WHERE (mim.menu_item_id = mi.id)), '[]'::json) AS modifier_groups
   FROM public.menu_items mi;


create or replace view "public"."menu_items_public" as  SELECT m.id,
    m.name,
    m.description,
    m.price,
    m.category,
    m.image_url,
    m.available,
    m.featured,
    m.allergens,
    m.spicy_level,
    m.is_vegetarian,
    m.is_vegan,
    m.is_gluten_free,
    m.sort_order,
    m.pairs_with,
    m.created_at,
    m.updated_at,
    COALESCE(json_agg(DISTINCT jsonb_build_object('id', mg.id, 'name', mg.name, 'description', mg.description, 'type', mg.type, 'required', mg.required, 'min_selections', mg.min_selections, 'max_selections', mg.max_selections, 'active', mg.active, 'sort_order', mg.sort_order, 'modifiers', ( SELECT COALESCE(json_agg(jsonb_build_object('id', mo.id, 'modifier_group_id', mo.modifier_group_id, 'name', mo.name, 'price_adjustment', mo.price_adjustment, 'available', mo.available, 'sort_order', mo.sort_order) ORDER BY mo.sort_order), '[]'::json) AS "coalesce"
           FROM public.modifiers mo
          WHERE ((mo.modifier_group_id = mg.id) AND (mo.available = true))))) FILTER (WHERE (mg.id IS NOT NULL)), '[]'::json) AS modifier_groups
   FROM ((public.menu_items m
     LEFT JOIN public.menu_item_modifier_groups mig ON ((mig.menu_item_id = m.id)))
     LEFT JOIN public.modifier_groups mg ON (((mg.id = mig.modifier_group_id) AND (mg.active = true))))
  WHERE (m.available = true)
  GROUP BY m.id;


create or replace view "public"."order_performance" as  SELECT id AS order_id,
    order_number,
    status,
    created_at,
    updated_at
   FROM public.orders o;


create or replace view "public"."order_timeline" as  SELECT o.id AS order_id,
    o.order_number,
    o.status AS current_status,
    o.amount_total,
    o.customer_uid,
    oe.id AS event_id,
    oe.event_type,
    oe.event_data,
    oe.user_id,
    oe.created_at AS event_time
   FROM (public.orders o
     LEFT JOIN public.order_events oe ON ((oe.order_id = o.id)))
  ORDER BY o.created_at DESC, oe.created_at;


CREATE OR REPLACE FUNCTION public.rotate_daily_campaigns()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p record;
  chosen uuid;
begin

  update public.growth_campaigns
  set active = false
  where ends_at is not null
  and ends_at <= now()
  and active = true;

  for p in
    select distinct placement
    from public.growth_campaigns
    where
      starts_at <= now()
      and (ends_at is null or ends_at > now())
      and active = true
      and (status = 'active' or status is null)
  loop

    select id into chosen
    from public.growth_campaigns
    where
      placement = p.placement
      and active = true
      and starts_at <= now()
      and (ends_at is null or ends_at > now())
      and (status = 'active' or status is null)
    order by
      priority desc,
      weight desc,
      md5(id::text || current_date::text)
    limit 1;

    update public.growth_campaigns
    set
      is_featured = (id = chosen),
      featured_for_date = case when id = chosen then current_date else featured_for_date end
    where placement = p.placement
      and active = true
      and starts_at <= now()
      and (ends_at is null or ends_at > now());

  end loop;

  update public.growth_campaign_settings
  set last_rotation_at = now()
  where id = 1;

end;
$function$
;

CREATE OR REPLACE FUNCTION public.v2_award_points(p_account_id uuid, p_admin_id uuid, p_amount_cents integer, p_idempotency_key text)
 RETURNS TABLE(points_earned integer, new_balance integer, new_lifetime integer, new_tier text, streak integer, tier_changed boolean, was_duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_account loyalty_accounts%rowtype;
  v_points integer;
  v_new_balance integer;
  v_new_lifetime integer;
  v_new_tier text;
  v_old_tier text;
  v_streak integer;

  v_ref_order uuid := null;
  v_meta jsonb := '{}'::jsonb;
begin
  if p_amount_cents <= 0 then
    raise exception 'Invalid amount';
  end if;

  v_points := floor(p_amount_cents / 100);

  -- Lock account
  select *
  into v_account
  from public.loyalty_accounts
  where id = p_account_id
  for update;

  if not found then
    raise exception 'Account not found';
  end if;

  v_old_tier := v_account.tier;

  -- Idempotency check
  if p_idempotency_key is not null then
    if exists (
      select 1
      from public.loyalty_ledger
      where idempotency_key = p_idempotency_key
    ) then
      return query
      select
        0,
        v_account.balance,
        v_account.lifetime_earned,
        v_account.tier,
        v_account.streak,
        false,
        true;
      return;
    end if;
  end if;

  -- Calculate new balances
  v_new_balance := v_account.balance + v_points;
  v_new_lifetime := v_account.lifetime_earned + v_points;

  -- Calculate streak
  if v_account.last_activity = current_date then
    v_streak := v_account.streak;
  elsif v_account.last_activity = (current_date - interval '1 day') then
    v_streak := v_account.streak + 1;
  else
    v_streak := 1;
  end if;

  -- Tier resolution
  v_new_tier :=
    case
      when v_new_lifetime >= 5000 then 'platinum'
      when v_new_lifetime >= 2000 then 'gold'
      when v_new_lifetime >= 500 then 'silver'
      else 'bronze'
    end;

  -- ✅ Auto-link order awards by idempotency_key
  -- award:<order_uuid>
  -- finalize-backfill:<order_uuid>
  if p_idempotency_key ~* '^(award|finalize-backfill):[0-9a-f-]{36}$' then
    v_ref_order := right(p_idempotency_key, 36)::uuid;
    v_meta := jsonb_build_object(
      'v2', true,
      'source', 'order_award',
      'order_id', v_ref_order
    );
  else
    -- non-order awards (QR scan, admin award, etc.)
    v_meta := jsonb_build_object(
      'v2', true,
      'source', 'admin_scan'
    );
  end if;

  -- Ledger append (immutable, so do it right here)
  insert into public.loyalty_ledger (
    account_id,
    amount,
    balance_after,
    entry_type,
    source,
    admin_id,
    idempotency_key,
    reference_id,
    metadata
  )
  values (
    p_account_id,
    v_points,
    v_new_balance,
    'earn',
    'admin_scan',
    p_admin_id,
    p_idempotency_key,
    v_ref_order,
    v_meta
  );

  -- Update account
  update public.loyalty_accounts
  set
    balance = v_new_balance,
    lifetime_earned = v_new_lifetime,
    tier = v_new_tier,
    streak = v_streak,
    last_activity = current_date,
    updated_at = now()
  where id = p_account_id;

  return query
  select
    v_points,
    v_new_balance,
    v_new_lifetime,
    v_new_tier,
    v_streak,
    (v_new_tier <> v_old_tier),
    false;
end;
$function$
;

create materialized view "analytics"."admin_modifier_attach_rate" as  SELECT modifier_name,
    times_attached,
    ((times_attached)::numeric / (NULLIF(( SELECT count(*) AS count
           FROM public.orders
          WHERE (orders.payment_status = 'paid'::text)), 0))::numeric) AS attach_rate
   FROM analytics.admin_modifier_sales s;


create materialized view "analytics"."admin_modifier_profit" as  SELECT s.modifier_name,
    s.times_attached,
    m.gross_profit_cents,
    (s.times_attached * m.gross_profit_cents) AS total_profit_cents,
    m.margin_percent
   FROM (analytics.admin_modifier_sales s
     JOIN analytics.admin_modifier_margin m ON ((m.name = s.modifier_name)))
  ORDER BY (s.times_attached * m.gross_profit_cents) DESC;


create materialized view "analytics"."admin_modifier_snapshot" as  SELECT sum(total_profit_cents) AS total_modifier_profit_cents,
    avg(margin_percent) AS avg_modifier_margin
   FROM analytics.admin_modifier_profit;


create or replace view "public"."admin_executive_snapshot" as  WITH rev AS (
         SELECT (COALESCE(sum(admin_revenue_summary.net_revenue_cents), (0)::numeric))::bigint AS net_revenue_30d_cents
           FROM public.admin_revenue_summary
        ), profit AS (
         SELECT admin_profit_snapshot.total_gross_profit_cents
           FROM public.admin_profit_snapshot
          WHERE (admin_profit_snapshot.singleton_id = true)
        )
 SELECT ( SELECT rev.net_revenue_30d_cents
           FROM rev) AS net_revenue_30d_cents,
    ( SELECT profit.total_gross_profit_cents
           FROM profit) AS total_gross_profit_cents,
    now() AS generated_at;


CREATE INDEX idx_admin_revenue_day ON internal.admin_revenue_summary USING btree (day);

grant delete on table "public"."auth_audit_log" to "service_role";

grant insert on table "public"."auth_audit_log" to "service_role";

grant references on table "public"."auth_audit_log" to "service_role";

grant select on table "public"."auth_audit_log" to "service_role";

grant trigger on table "public"."auth_audit_log" to "service_role";

grant truncate on table "public"."auth_audit_log" to "service_role";

grant update on table "public"."auth_audit_log" to "service_role";

grant delete on table "public"."auth_risk_rate_limits" to "service_role";

grant insert on table "public"."auth_risk_rate_limits" to "service_role";

grant references on table "public"."auth_risk_rate_limits" to "service_role";

grant select on table "public"."auth_risk_rate_limits" to "service_role";

grant trigger on table "public"."auth_risk_rate_limits" to "service_role";

grant truncate on table "public"."auth_risk_rate_limits" to "service_role";

grant update on table "public"."auth_risk_rate_limits" to "service_role";

grant delete on table "public"."auth_risk_scores" to "service_role";

grant insert on table "public"."auth_risk_scores" to "service_role";

grant references on table "public"."auth_risk_scores" to "service_role";

grant select on table "public"."auth_risk_scores" to "service_role";

grant trigger on table "public"."auth_risk_scores" to "service_role";

grant truncate on table "public"."auth_risk_scores" to "service_role";

grant update on table "public"."auth_risk_scores" to "service_role";

grant delete on table "public"."auth_session_validation_cooldowns" to "service_role";

grant insert on table "public"."auth_session_validation_cooldowns" to "service_role";

grant references on table "public"."auth_session_validation_cooldowns" to "service_role";

grant select on table "public"."auth_session_validation_cooldowns" to "service_role";

grant trigger on table "public"."auth_session_validation_cooldowns" to "service_role";

grant truncate on table "public"."auth_session_validation_cooldowns" to "service_role";

grant update on table "public"."auth_session_validation_cooldowns" to "service_role";

grant delete on table "public"."auth_sessions_meta" to "service_role";

grant insert on table "public"."auth_sessions_meta" to "service_role";

grant references on table "public"."auth_sessions_meta" to "service_role";

grant select on table "public"."auth_sessions_meta" to "service_role";

grant trigger on table "public"."auth_sessions_meta" to "service_role";

grant truncate on table "public"."auth_sessions_meta" to "service_role";

grant update on table "public"."auth_sessions_meta" to "service_role";

grant delete on table "public"."device_trust" to "service_role";

grant insert on table "public"."device_trust" to "service_role";

grant references on table "public"."device_trust" to "service_role";

grant select on table "public"."device_trust" to "service_role";

grant trigger on table "public"."device_trust" to "service_role";

grant truncate on table "public"."device_trust" to "service_role";

grant update on table "public"."device_trust" to "service_role";

grant delete on table "public"."loyalty_ledger_labels" to "service_role";

grant insert on table "public"."loyalty_ledger_labels" to "service_role";

grant references on table "public"."loyalty_ledger_labels" to "service_role";

grant select on table "public"."loyalty_ledger_labels" to "service_role";

grant trigger on table "public"."loyalty_ledger_labels" to "service_role";

grant truncate on table "public"."loyalty_ledger_labels" to "service_role";

grant update on table "public"."loyalty_ledger_labels" to "service_role";

grant select on table "public"."user_credits" to "authenticated";


  create policy "auth_session_validation_cooldowns_service_full"
  on "public"."auth_session_validation_cooldowns"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "device_trust_service_full"
  on "public"."device_trust"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "growth_campaigns: admin read"
  on "public"."growth_campaigns"
  as permissive
  for select
  to authenticated
using (public.is_admin_uid(auth.uid()));



  create policy "growth_campaigns: admin write"
  on "public"."growth_campaigns"
  as permissive
  for all
  to authenticated
using (public.is_admin_uid(auth.uid()))
with check (public.is_admin_uid(auth.uid()));



  create policy "loyalty_accounts_select_own"
  on "public"."loyalty_accounts"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "loyalty_accounts_update_own"
  on "public"."loyalty_accounts"
  as permissive
  for update
  to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "customer_select_own_orders"
  on "public"."orders"
  as permissive
  for select
  to authenticated
using ((customer_uid = auth.uid()));



  create policy "orders_select_own"
  on "public"."orders"
  as permissive
  for select
  to authenticated
using ((customer_uid = auth.uid()));



  create policy "user_credits: deny write"
  on "public"."user_credits"
  as permissive
  for all
  to authenticated
using (false)
with check (false);



  create policy "user_credits: users read own"
  on "public"."user_credits"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "loyalty_accounts_block_delete"
  on "public"."loyalty_accounts"
  as permissive
  for delete
  to authenticated
using (false);



  create policy "loyalty_accounts_block_insert"
  on "public"."loyalty_accounts"
  as permissive
  for insert
  to authenticated
with check (false);


CREATE TRIGGER set_auth_risk_rl_updated_at BEFORE UPDATE ON public.auth_risk_rate_limits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_labels_no_delete BEFORE DELETE ON public.loyalty_ledger_labels FOR EACH ROW EXECUTE FUNCTION public.prevent_update_delete_labels();

CREATE TRIGGER trg_labels_no_update BEFORE UPDATE ON public.loyalty_ledger_labels FOR EACH ROW EXECUTE FUNCTION public.prevent_update_delete_labels();

CREATE TRIGGER trg_block_loyalty_transactions_writes BEFORE INSERT OR DELETE OR UPDATE ON public.loyalty_transactions FOR EACH ROW EXECUTE FUNCTION public.block_loyalty_transactions_writes();

CREATE TRIGGER on_auth_user_created_loyalty AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_loyalty_account();


