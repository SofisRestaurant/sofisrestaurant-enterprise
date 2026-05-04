drop policy "abandoned_block_authenticated" on "public"."abandoned_cart_sessions";

drop policy "service_role_only" on "public"."guest_rate_limits";

drop policy "menu_items_public_read" on "public"."menu_items";

drop policy "modifier_costs_admin_only" on "public"."modifier_costs";

drop policy "modifier_groups_admin_full" on "public"."modifier_groups";

drop policy "modifier_groups_public_read" on "public"."modifier_groups";

drop policy "modifiers_admin_full" on "public"."modifiers";

drop policy "modifiers_public_read" on "public"."modifiers";

drop policy "admin_full_access_orders" on "public"."orders";

drop policy "customer_select_own_orders" on "public"."orders";

drop policy "guest_orders_service_role_only" on "public"."orders";

drop policy "orders_select_own" on "public"."orders";

drop policy "orders_block_delete" on "public"."orders";

drop policy "orders_block_insert" on "public"."orders";

drop policy "orders_block_update" on "public"."orders";

revoke delete on table "public"."guest_rate_limits" from "anon";

revoke insert on table "public"."guest_rate_limits" from "anon";

revoke references on table "public"."guest_rate_limits" from "anon";

revoke select on table "public"."guest_rate_limits" from "anon";

revoke trigger on table "public"."guest_rate_limits" from "anon";

revoke truncate on table "public"."guest_rate_limits" from "anon";

revoke update on table "public"."guest_rate_limits" from "anon";

revoke delete on table "public"."guest_rate_limits" from "authenticated";

revoke insert on table "public"."guest_rate_limits" from "authenticated";

revoke references on table "public"."guest_rate_limits" from "authenticated";

revoke select on table "public"."guest_rate_limits" from "authenticated";

revoke trigger on table "public"."guest_rate_limits" from "authenticated";

revoke truncate on table "public"."guest_rate_limits" from "authenticated";

revoke update on table "public"."guest_rate_limits" from "authenticated";

revoke delete on table "public"."modifier_costs" from "service_role";

revoke insert on table "public"."modifier_costs" from "service_role";

revoke references on table "public"."modifier_costs" from "service_role";

revoke select on table "public"."modifier_costs" from "service_role";

revoke trigger on table "public"."modifier_costs" from "service_role";

revoke truncate on table "public"."modifier_costs" from "service_role";

revoke update on table "public"."modifier_costs" from "service_role";

revoke delete on table "public"."order_dispute_events" from "anon";

revoke insert on table "public"."order_dispute_events" from "anon";

revoke references on table "public"."order_dispute_events" from "anon";

revoke select on table "public"."order_dispute_events" from "anon";

revoke trigger on table "public"."order_dispute_events" from "anon";

revoke truncate on table "public"."order_dispute_events" from "anon";

revoke update on table "public"."order_dispute_events" from "anon";

revoke delete on table "public"."order_dispute_events" from "authenticated";

revoke insert on table "public"."order_dispute_events" from "authenticated";

revoke references on table "public"."order_dispute_events" from "authenticated";

revoke select on table "public"."order_dispute_events" from "authenticated";

revoke trigger on table "public"."order_dispute_events" from "authenticated";

revoke truncate on table "public"."order_dispute_events" from "authenticated";

revoke update on table "public"."order_dispute_events" from "authenticated";

revoke delete on table "public"."order_fulfillment_evidence" from "anon";

revoke insert on table "public"."order_fulfillment_evidence" from "anon";

revoke references on table "public"."order_fulfillment_evidence" from "anon";

revoke select on table "public"."order_fulfillment_evidence" from "anon";

revoke trigger on table "public"."order_fulfillment_evidence" from "anon";

revoke truncate on table "public"."order_fulfillment_evidence" from "anon";

revoke update on table "public"."order_fulfillment_evidence" from "anon";

revoke delete on table "public"."order_fulfillment_evidence" from "authenticated";

revoke insert on table "public"."order_fulfillment_evidence" from "authenticated";

revoke references on table "public"."order_fulfillment_evidence" from "authenticated";

revoke select on table "public"."order_fulfillment_evidence" from "authenticated";

revoke trigger on table "public"."order_fulfillment_evidence" from "authenticated";

revoke truncate on table "public"."order_fulfillment_evidence" from "authenticated";

revoke update on table "public"."order_fulfillment_evidence" from "authenticated";

revoke delete on table "public"."order_payment_details" from "anon";

revoke insert on table "public"."order_payment_details" from "anon";

revoke references on table "public"."order_payment_details" from "anon";

revoke select on table "public"."order_payment_details" from "anon";

revoke trigger on table "public"."order_payment_details" from "anon";

revoke truncate on table "public"."order_payment_details" from "anon";

revoke update on table "public"."order_payment_details" from "anon";

revoke delete on table "public"."order_payment_details" from "authenticated";

revoke insert on table "public"."order_payment_details" from "authenticated";

revoke references on table "public"."order_payment_details" from "authenticated";

revoke select on table "public"."order_payment_details" from "authenticated";

revoke trigger on table "public"."order_payment_details" from "authenticated";

revoke truncate on table "public"."order_payment_details" from "authenticated";

revoke update on table "public"."order_payment_details" from "authenticated";

revoke delete on table "public"."sms_log" from "anon";

revoke insert on table "public"."sms_log" from "anon";

revoke references on table "public"."sms_log" from "anon";

revoke select on table "public"."sms_log" from "anon";

revoke trigger on table "public"."sms_log" from "anon";

revoke truncate on table "public"."sms_log" from "anon";

revoke update on table "public"."sms_log" from "anon";

revoke delete on table "public"."sms_log" from "authenticated";

revoke insert on table "public"."sms_log" from "authenticated";

revoke references on table "public"."sms_log" from "authenticated";

revoke select on table "public"."sms_log" from "authenticated";

revoke trigger on table "public"."sms_log" from "authenticated";

revoke truncate on table "public"."sms_log" from "authenticated";

revoke update on table "public"."sms_log" from "authenticated";

revoke delete on table "public"."sms_verify_attempts" from "anon";

revoke insert on table "public"."sms_verify_attempts" from "anon";

revoke references on table "public"."sms_verify_attempts" from "anon";

revoke select on table "public"."sms_verify_attempts" from "anon";

revoke trigger on table "public"."sms_verify_attempts" from "anon";

revoke truncate on table "public"."sms_verify_attempts" from "anon";

revoke update on table "public"."sms_verify_attempts" from "anon";

revoke delete on table "public"."sms_verify_attempts" from "authenticated";

revoke insert on table "public"."sms_verify_attempts" from "authenticated";

revoke references on table "public"."sms_verify_attempts" from "authenticated";

revoke select on table "public"."sms_verify_attempts" from "authenticated";

revoke trigger on table "public"."sms_verify_attempts" from "authenticated";

revoke truncate on table "public"."sms_verify_attempts" from "authenticated";

revoke update on table "public"."sms_verify_attempts" from "authenticated";

revoke delete on table "public"."stripe_webhook_events" from "anon";

revoke insert on table "public"."stripe_webhook_events" from "anon";

revoke references on table "public"."stripe_webhook_events" from "anon";

revoke select on table "public"."stripe_webhook_events" from "anon";

revoke trigger on table "public"."stripe_webhook_events" from "anon";

revoke truncate on table "public"."stripe_webhook_events" from "anon";

revoke update on table "public"."stripe_webhook_events" from "anon";

revoke delete on table "public"."stripe_webhook_events" from "authenticated";

revoke insert on table "public"."stripe_webhook_events" from "authenticated";

revoke references on table "public"."stripe_webhook_events" from "authenticated";

revoke select on table "public"."stripe_webhook_events" from "authenticated";

revoke trigger on table "public"."stripe_webhook_events" from "authenticated";

revoke truncate on table "public"."stripe_webhook_events" from "authenticated";

revoke update on table "public"."stripe_webhook_events" from "authenticated";

alter table "public"."loyalty_accounts" drop constraint "loyalty_accounts_user_unique";

alter table "public"."modifier_costs" drop constraint "modifier_cost_non_negative";

alter table "public"."modifier_costs" drop constraint "modifier_costs_modifier_id_fkey";

alter table "public"."modifier_groups" drop constraint "modifier_groups_max_selections_check";

alter table "public"."modifier_groups" drop constraint "modifier_groups_min_selections_check";

alter table "public"."modifier_groups" drop constraint "modifier_groups_type_check";

alter table "public"."orders" drop constraint "orders_guest_email_check";

alter table "public"."orders" drop constraint "orders_guest_token_check";

alter table "public"."orders" drop constraint "orders_loyalty_discount_cents_check";

alter table "public"."orders" drop constraint "orders_loyalty_points_redeemed_check";

alter table "public"."pending_carts" drop constraint "pending_carts_status_check";

alter table "public"."orders" drop constraint "orders_pending_cart_id_fkey";

drop materialized view if exists "analytics"."admin_modifier_snapshot";

drop function if exists "public"."admin_get_tax_daily_rows"(date_from date, date_to date, p_currency character, use_cache boolean);

drop function if exists "public"."admin_get_tax_export"(date_from date, date_to date, p_currency character, granularity text);

drop function if exists "public"."admin_get_tax_monthly_rows"(month_from date, month_to date, p_currency character);

drop function if exists "public"."admin_get_tax_orders"(date_from date, date_to date, p_currency character, fulfillment_filter text, disputed_only boolean, refunded_only boolean, page_size integer, page_offset integer);

drop function if exists "public"."admin_get_tax_summary"(date_from date, date_to date, p_currency character, use_cache boolean);

drop view if exists "public"."menu_items_public";

drop function if exists "public"."prune_guest_rate_limits"();

drop materialized view if exists "analytics"."admin_campaign_roi";

drop materialized view if exists "analytics"."admin_cart_abandonment";

drop materialized view if exists "analytics"."admin_category_margin";

drop materialized view if exists "analytics"."admin_kitchen_velocity";

drop materialized view if exists "analytics"."admin_modifier_attach_rate";

drop materialized view if exists "analytics"."admin_modifier_sales";

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

drop view if exists "public"."active_campaigns_now";

drop view if exists "public"."admin_dispute_timeline";

drop view if exists "public"."admin_executive_snapshot";

drop view if exists "public"."admin_hourly_heatmap";

drop view if exists "public"."admin_item_consumption";

drop view if exists "public"."admin_layout_snapshot";

drop view if exists "public"."admin_revenue_summary";

drop materialized view if exists "public"."admin_tax_daily_summary_mat";

drop view if exists "public"."admin_tax_monthly_summary";

drop view if exists "public"."financial_revenue_view";

drop view if exists "public"."loyalty_leaderboard";

drop view if exists "public"."menu_items_admin_full";

drop view if exists "public"."menu_items_with_modifiers";

drop view if exists "public"."order_performance";

drop view if exists "public"."order_timeline";

drop function if exists "public"."v2_award_points"(p_account_id uuid, p_admin_id uuid, p_amount_cents integer, p_idempotency_key text, p_reference_id uuid);

drop materialized view if exists "analytics"."admin_modifier_profit";

drop materialized view if exists "analytics"."admin_item_margin";

drop view if exists "public"."admin_tax_daily_summary";

drop view if exists "public"."admin_tax_order_breakdown";

drop materialized view if exists "analytics"."admin_modifier_margin";

alter table "public"."modifier_costs" drop constraint "modifier_costs_pkey";

alter table "public"."modifier_groups" drop constraint "modifier_groups_pkey";

drop index if exists "public"."idx_modifiers_modifier_group_id";

drop index if exists "public"."idx_orders_guest_email";

drop index if exists "public"."idx_orders_pending_cart_id";

drop index if exists "public"."idx_pending_carts_status";

drop index if exists "public"."loyalty_accounts_user_unique";

drop index if exists "public"."modifier_costs_pkey";

drop index if exists "public"."modifier_groups_pkey";

drop index if exists "public"."pending_carts_expires_idx";

drop table "public"."modifier_costs";


  create table "public"."modifier_group_modifiers" (
    "id" uuid not null default gen_random_uuid(),
    "modifier_group_id" uuid not null,
    "modifier_id" uuid not null,
    "position" integer default 0
      );



  create table "public"."modifier_options" (
    "id" uuid not null default gen_random_uuid(),
    "modifier_group_id" uuid not null,
    "name" text not null,
    "price_adjustment" numeric default 0,
    "is_default" boolean default false,
    "sort_order" integer default 0,
    "available" boolean default true,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."modifier_options" enable row level security;

alter table "public"."auth_sessions_meta" add column "invalidation_reason" text;

alter table "public"."growth_campaigns" alter column "priority" drop not null;

alter table "public"."growth_campaigns" alter column "weight" drop not null;

alter table "public"."guest_rate_limits" disable row level security;

alter table "public"."menu_items" add column "active" boolean default true;

alter table "public"."menu_items" alter column "sort_order" set not null;

alter table "public"."modifier_groups" alter column "active" drop not null;

alter table "public"."modifier_groups" alter column "created_at" drop not null;

alter table "public"."modifier_groups" alter column "min_selections" set default 0;

alter table "public"."modifier_groups" alter column "required" drop not null;

alter table "public"."modifier_groups" alter column "sort_order" drop not null;

alter table "public"."modifier_groups" alter column "type" drop not null;

alter table "public"."modifier_groups" alter column "updated_at" drop not null;

alter table "public"."modifiers" alter column "available" drop not null;

alter table "public"."modifiers" alter column "created_at" drop not null;

alter table "public"."modifiers" alter column "price_adjustment" drop not null;

alter table "public"."modifiers" alter column "price_adjustment" set data type numeric using "price_adjustment"::numeric;

alter table "public"."modifiers" alter column "sort_order" drop default;

alter table "public"."modifiers" alter column "sort_order" drop not null;

alter table "public"."modifiers" alter column "updated_at" drop not null;

alter table "public"."order_fulfillment_evidence" add column "handoff_type" text;

alter table "public"."orders" add column "campaign_discount_cents" integer not null default 0;

alter table "public"."orders" add column "credit_cents" integer not null default 0;

alter table "public"."orders" add column "credit_id" uuid;

alter table "public"."orders" add column "idempotency_key" text;

alter table "public"."orders" add column "loyalty_account_id" uuid;

alter table "public"."orders" add column "pricing_hash" text;

alter table "public"."orders" add column "pricing_snapshot" jsonb;

alter table "public"."orders" add column "promo_discount_cents" integer not null default 0;

alter table "public"."orders" add column "promo_id" uuid;

alter table "public"."orders" alter column "source" drop default;

alter table "public"."orders" alter column "source" drop not null;

alter table "public"."pending_carts" drop column "status";

alter table "public"."pending_carts" alter column "id" set default gen_random_uuid();

CREATE INDEX growth_campaigns_active_pricing_idx ON public.growth_campaigns USING btree (active, auto_apply, menu_item_id, applies_to_category, applies_to_order_type, priority DESC, pricing_priority DESC, weight DESC, starts_at DESC, ends_at, updated_at DESC, id) WHERE (deal_type IS NOT NULL);

CREATE INDEX idx_item_modifier_group ON public.menu_item_modifier_groups USING btree (menu_item_id);

CREATE INDEX idx_modifier_options_group ON public.modifier_options USING btree (modifier_group_id);

CREATE UNIQUE INDEX menu_items_category_sort_order_unique ON public.menu_items USING btree (category, sort_order) WHERE (available IS TRUE);

CREATE UNIQUE INDEX menu_modifier_groups_pkey ON public.modifier_groups USING btree (id);

CREATE UNIQUE INDEX menu_modifier_options_pkey ON public.modifier_options USING btree (id);

CREATE UNIQUE INDEX modifier_group_modifiers_pkey ON public.modifier_group_modifiers USING btree (id);

CREATE INDEX orders_guest_token_idx ON public.orders USING btree (guest_token) WHERE (guest_token IS NOT NULL);

CREATE UNIQUE INDEX orders_pending_cart_id_key ON public.orders USING btree (pending_cart_id) WHERE (pending_cart_id IS NOT NULL);

CREATE UNIQUE INDEX orders_stripe_payment_intent_id_uniq ON public.orders USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);

CREATE UNIQUE INDEX orders_stripe_session_id_uniq ON public.orders USING btree (stripe_session_id);

CREATE INDEX pending_carts_consumed_at_idx ON public.pending_carts USING btree (consumed_at);

CREATE UNIQUE INDEX unique_modifier_per_group ON public.modifier_options USING btree (modifier_group_id, name);

alter table "public"."modifier_group_modifiers" add constraint "modifier_group_modifiers_pkey" PRIMARY KEY using index "modifier_group_modifiers_pkey";

alter table "public"."modifier_groups" add constraint "menu_modifier_groups_pkey" PRIMARY KEY using index "menu_modifier_groups_pkey";

alter table "public"."modifier_options" add constraint "menu_modifier_options_pkey" PRIMARY KEY using index "menu_modifier_options_pkey";

alter table "public"."menu_items" add constraint "menu_items_sort_order_required_when_available_chk" CHECK (((available IS FALSE) OR (sort_order IS NOT NULL))) not valid;

alter table "public"."menu_items" validate constraint "menu_items_sort_order_required_when_available_chk";

alter table "public"."modifier_group_modifiers" add constraint "modifier_group_modifiers_modifier_group_id_fkey" FOREIGN KEY (modifier_group_id) REFERENCES public.modifier_groups(id) not valid;

alter table "public"."modifier_group_modifiers" validate constraint "modifier_group_modifiers_modifier_group_id_fkey";

alter table "public"."modifier_group_modifiers" add constraint "modifier_group_modifiers_modifier_id_fkey" FOREIGN KEY (modifier_id) REFERENCES public.modifiers(id) not valid;

alter table "public"."modifier_group_modifiers" validate constraint "modifier_group_modifiers_modifier_id_fkey";

alter table "public"."modifier_options" add constraint "fk_modifiers_group" FOREIGN KEY (modifier_group_id) REFERENCES public.modifier_groups(id) ON DELETE CASCADE not valid;

alter table "public"."modifier_options" validate constraint "fk_modifiers_group";

alter table "public"."modifier_options" add constraint "menu_modifier_options_group_id_fkey" FOREIGN KEY (modifier_group_id) REFERENCES public.modifier_groups(id) ON DELETE CASCADE not valid;

alter table "public"."modifier_options" validate constraint "menu_modifier_options_group_id_fkey";

alter table "public"."modifier_options" add constraint "unique_modifier_per_group" UNIQUE using index "unique_modifier_per_group";

alter table "public"."order_fulfillment_evidence" add constraint "order_fulfillment_evidence_handoff_type_check" CHECK ((handoff_type = ANY (ARRAY['pickup'::text, 'delivery'::text, 'dine_in'::text]))) not valid;

alter table "public"."order_fulfillment_evidence" validate constraint "order_fulfillment_evidence_handoff_type_check";

alter table "public"."pending_carts" add constraint "pending_carts_pricing_hash_nonempty_chk" CHECK (((created_at < '2026-03-06 00:00:00+00'::timestamp with time zone) OR ((pricing_hash IS NOT NULL) AND (length(btrim(pricing_hash)) >= 16)))) not valid;

alter table "public"."pending_carts" validate constraint "pending_carts_pricing_hash_nonempty_chk";

alter table "public"."pending_carts" add constraint "pending_carts_pricing_snapshot_nonempty_chk" CHECK (((created_at < '2026-03-06 00:00:00+00'::timestamp with time zone) OR ((jsonb_typeof(pricing_snapshot) = 'object'::text) AND (pricing_snapshot <> '{}'::jsonb)))) not valid;

alter table "public"."pending_carts" validate constraint "pending_carts_pricing_snapshot_nonempty_chk";

alter table "public"."orders" add constraint "orders_pending_cart_id_fkey" FOREIGN KEY (pending_cart_id) REFERENCES public.pending_carts(id) not valid;

alter table "public"."orders" validate constraint "orders_pending_cart_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.admin_get_tax_daily_rows(date_from date DEFAULT ((CURRENT_DATE - '30 days'::interval))::date, date_to date DEFAULT CURRENT_DATE, p_currency text DEFAULT 'usd'::text, use_cache boolean DEFAULT true)
 RETURNS SETOF public.admin_tax_daily_summary
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if (select role from public.profiles where id = auth.uid()) <> 'admin' then
    raise exception 'admin_get_tax_daily_rows: insufficient privileges';
  end if;

  if use_cache and date_to < current_date then
    return query
      select *
      from public.admin_tax_daily_summary_mat
      where report_date between date_from and date_to
        and currency = lower(trim(p_currency))
      order by report_date desc;
  else
    return query
      select *
      from public.admin_tax_daily_summary
      where report_date between date_from and date_to
        and currency = lower(trim(p_currency))
      order by report_date desc;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_tax_export(date_from date, date_to date, p_currency text, granularity text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  normalized_currency text := lower(trim(p_currency));
begin
  if (select role from public.profiles where id = auth.uid()) <> 'admin' then
    raise exception 'admin_get_tax_export: insufficient privileges';
  end if;

  if granularity = 'daily' then
    return jsonb_build_object(
      'granularity', granularity,
      'date_from', date_from,
      'date_to', date_to,
      'currency', normalized_currency,
      'generated_at', now(),
      'generated_by', auth.uid(),
      'rows', (
        select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        from public.admin_get_tax_daily_rows(date_from, date_to, normalized_currency, true) t
      )
    );
  elsif granularity = 'monthly' then
    return jsonb_build_object(
      'granularity', granularity,
      'date_from', date_from,
      'date_to', date_to,
      'currency', normalized_currency,
      'generated_at', now(),
      'generated_by', auth.uid(),
      'rows', (
        select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        from public.admin_get_tax_monthly_rows(date_from, date_to, normalized_currency) t
      )
    );
  else
    return jsonb_build_object(
      'granularity', granularity,
      'date_from', date_from,
      'date_to', date_to,
      'currency', normalized_currency,
      'generated_at', now(),
      'generated_by', auth.uid(),
      'rows', (
        select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        from public.admin_get_tax_orders(date_from, date_to, normalized_currency, null, false, false, 100000, 0) t
      )
    );
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_tax_monthly_rows(month_from date DEFAULT (date_trunc('year'::text, (CURRENT_DATE)::timestamp with time zone))::date, month_to date DEFAULT CURRENT_DATE, p_currency text DEFAULT 'usd'::text)
 RETURNS SETOF public.admin_tax_monthly_summary
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if (select role from public.profiles where id = auth.uid()) <> 'admin' then
    raise exception 'admin_get_tax_monthly_rows: insufficient privileges';
  end if;

  return query
    select *
    from public.admin_tax_monthly_summary
    where report_month between date_trunc('month', month_from)::date
                           and date_trunc('month', month_to)::date
      and currency = lower(trim(p_currency))
    order by report_month desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_tax_orders(date_from date DEFAULT ((CURRENT_DATE - '30 days'::interval))::date, date_to date DEFAULT CURRENT_DATE, p_currency text DEFAULT 'usd'::text, fulfillment_filter text DEFAULT NULL::text, disputed_only boolean DEFAULT false, refunded_only boolean DEFAULT false, page_size integer DEFAULT 50, page_offset integer DEFAULT 0)
 RETURNS TABLE(order_id uuid, captured_date date, charge_captured_at timestamp with time zone, payment_status text, fulfillment_type text, subtotal_cents integer, discount_cents integer, taxable_sales_cents integer, tax_collected_cents integer, tip_cents integer, gross_total_cents integer, refunded_amount_cents integer, refunded_tax_estimate_cents integer, net_total_cents integer, net_tax_cents integer, dispute_status text, is_disputed boolean, card_brand text, stripe_payment_intent_id text, total_rows bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if (select role from public.profiles where id = auth.uid()) <> 'admin' then
    raise exception 'admin_get_tax_orders: insufficient privileges';
  end if;

  return query
  with filtered as (
    select
      b.*,
      count(*) over () as total_rows
    from public.admin_tax_order_breakdown b
    where b.captured_date between date_from and date_to
      and b.currency = lower(trim(p_currency))
      and (fulfillment_filter is null or b.fulfillment_type = fulfillment_filter)
      and (not disputed_only or b.is_disputed)
      and (not refunded_only or b.refunded_amount_cents > 0)
  )
  select
    f.order_id,
    f.captured_date,
    f.charge_captured_at,
    f.payment_status::text,
    f.fulfillment_type::text,
    f.subtotal_cents,
    f.discount_cents,
    f.taxable_sales_cents,
    f.tax_collected_cents,
    f.tip_cents,
    f.gross_total_cents,
    f.refunded_amount_cents,
    f.refunded_tax_estimate_cents,
    f.net_total_cents,
    f.net_tax_cents,
    f.dispute_status::text,
    f.is_disputed,
    f.card_brand,
    f.stripe_payment_intent_id,
    f.total_rows
  from filtered f
  order by f.charge_captured_at desc
  limit page_size
  offset page_offset;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_get_tax_summary(date_from date DEFAULT ((CURRENT_DATE - '30 days'::interval))::date, date_to date DEFAULT CURRENT_DATE, p_currency text DEFAULT 'usd'::text, use_cache boolean DEFAULT true)
 RETURNS public.tax_summary_result
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  result public.tax_summary_result;
  normalized_currency text;
begin
  if (select role from public.profiles where id = auth.uid()) <> 'admin' then
    raise exception 'admin_get_tax_summary: insufficient privileges';
  end if;

  if date_to < date_from then
    raise exception 'date_to must be >= date_from';
  end if;

  if (date_to - date_from) > 366 then
    raise exception 'Date range cannot exceed 366 days. Use export for longer ranges.';
  end if;

  normalized_currency := lower(trim(p_currency));

  result.date_from := date_from;
  result.date_to := date_to;
  result.currency := normalized_currency::character(3);
  result.period_days := (date_to - date_from) + 1;

  if use_cache and date_to < current_date then
    select
      coalesce(sum(orders_count), 0),
      coalesce(sum(disputed_orders_count), 0),
      coalesce(sum(refunded_orders_count), 0),
      coalesce(sum(gross_sales_cents), 0),
      coalesce(sum(discount_cents), 0),
      coalesce(sum(taxable_sales_cents), 0),
      coalesce(sum(tax_collected_cents), 0),
      coalesce(sum(tip_cents), 0),
      coalesce(sum(delivery_fee_cents), 0),
      coalesce(sum(service_fee_cents), 0),
      coalesce(sum(gross_total_cents), 0),
      coalesce(sum(refunded_sales_cents), 0),
      coalesce(sum(refunded_tax_cents), 0),
      coalesce(sum(net_sales_cents), 0),
      coalesce(sum(net_tax_cents), 0),
      coalesce(sum(total_stripe_fees_cents), 0)
    into
      result.orders_count,
      result.disputed_orders_count,
      result.refunded_orders_count,
      result.gross_sales_cents,
      result.discount_cents,
      result.taxable_sales_cents,
      result.tax_collected_cents,
      result.tip_cents,
      result.delivery_fee_cents,
      result.service_fee_cents,
      result.gross_total_cents,
      result.refunded_sales_cents,
      result.refunded_tax_cents,
      result.net_sales_cents,
      result.net_tax_cents,
      result.total_stripe_fees_cents
    from public.admin_tax_daily_summary_mat
    where report_date between date_from and date_to
      and currency = normalized_currency;
  else
    select
      coalesce(sum(orders_count), 0),
      coalesce(sum(disputed_orders_count), 0),
      coalesce(sum(refunded_orders_count), 0),
      coalesce(sum(gross_sales_cents), 0),
      coalesce(sum(discount_cents), 0),
      coalesce(sum(taxable_sales_cents), 0),
      coalesce(sum(tax_collected_cents), 0),
      coalesce(sum(tip_cents), 0),
      coalesce(sum(delivery_fee_cents), 0),
      coalesce(sum(service_fee_cents), 0),
      coalesce(sum(gross_total_cents), 0),
      coalesce(sum(refunded_sales_cents), 0),
      coalesce(sum(refunded_tax_cents), 0),
      coalesce(sum(net_sales_cents), 0),
      coalesce(sum(net_tax_cents), 0),
      coalesce(sum(total_stripe_fees_cents), 0)
    into
      result.orders_count,
      result.disputed_orders_count,
      result.refunded_orders_count,
      result.gross_sales_cents,
      result.discount_cents,
      result.taxable_sales_cents,
      result.tax_collected_cents,
      result.tip_cents,
      result.delivery_fee_cents,
      result.service_fee_cents,
      result.gross_total_cents,
      result.refunded_sales_cents,
      result.refunded_tax_cents,
      result.net_sales_cents,
      result.net_tax_cents,
      result.total_stripe_fees_cents
    from public.admin_tax_daily_summary
    where report_date between date_from and date_to
      and currency = normalized_currency;
  end if;

  result.effective_tax_rate_pct := case
    when result.taxable_sales_cents > 0 then
      round(
        (result.tax_collected_cents::numeric / result.taxable_sales_cents::numeric) * 100,
        4
      )
    else 0
  end;

  result.avg_order_cents := case
    when result.orders_count > 0 then
      round(result.gross_total_cents::numeric / result.orders_count::numeric, 2)
    else 0
  end;

  result.avg_tax_per_order_cents := case
    when result.orders_count > 0 then
      round(result.tax_collected_cents::numeric / result.orders_count::numeric, 2)
    else 0
  end;

  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_menu_item_public(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select
    jsonb_build_object(
      'id',             m.id,
      'name',           m.name,
      'price',          m.price,
      'category',       m.category,
      'featured',       m.featured,
      'available',      m.available,
      'sort_order',     m.sort_order,
      'description',    m.description,
      'image_url',      m.image_url,
      'spicy_level',    m.spicy_level,
      'is_vegetarian',  coalesce(m.is_vegetarian, false),
      'is_vegan',       coalesce(m.is_vegan, false),
      'is_gluten_free', coalesce(m.is_gluten_free, false),
      'allergens',      coalesce(m.allergens, '{}'),
      'pairs_with',     coalesce(m.pairs_with, '{}'),
      'created_at',     coalesce(m.created_at, now())::text,
      'updated_at',     m.updated_at::text,
      'modifier_groups', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id',             mg.id,
              'name',           mg.name,
              'description',    mg.description,
              'type',           coalesce(mg.type, 'checkbox'),
              'required',       coalesce(mg.required, false),
              'active',         coalesce(mg.active, true),
              'min_selections', mg.min_selections,
              'max_selections', mg.max_selections,
              'sort_order',     mg.sort_order,
              'modifiers', (
                select coalesce(
                  jsonb_agg(
                    jsonb_build_object(
                      'id',                mod.id,
                      'name',              mod.name,
                      'price_adjustment',  coalesce(mod.price_adjustment, 0),
                      'available',         coalesce(mod.available, true),
                      'is_default',        coalesce(mod.is_default, false),
                      'sort_order',        coalesce(mod.sort_order, 0)
                    )
                    order by coalesce(mod.sort_order, 0) asc
                  ),
                  '[]'::jsonb
                )
                from modifiers mod
                where mod.modifier_group_id = mg.id
                  and coalesce(mod.available, true) = true
              )
            )
            order by coalesce(mig.sort_order, 0) asc
          )
          from menu_item_modifier_groups mig
          join modifier_groups mg on mg.id = mig.modifier_group_id
          where mig.menu_item_id = m.id
            and coalesce(mg.active, true) = true
        ),
        '[]'::jsonb
      )
    )
  from menu_items m
  where m.id = p_item_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_menu_items()
 RETURNS TABLE(id uuid, name text, description text, price numeric, category text, image_url text, available boolean, featured boolean, allergens text[], spicy_level integer, is_vegetarian boolean, is_vegan boolean, is_gluten_free boolean, sort_order integer, pairs_with text, modifier_groups json)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    m.id,
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

    (
      select coalesce(
        json_agg(
          json_build_object(
            'id', mg.id,
            'name', mg.name,
            'type', mg.type,
            'required', mg.required,
            'min_selections', mg.min_selections,
            'max_selections', mg.max_selections,
            'sort_order', mg.sort_order,
            'modifiers', (
              select coalesce(
                json_agg(
                  json_build_object(
                    'id', mo.id,
                    'name', mo.name,
                    'price_adjustment', mo.price_adjustment,
                    'available', mo.available,
                    'sort_order', mo.sort_order,
                    'is_default', mo.is_default
                  )
                  order by mo.sort_order
                ),
                '[]'::json
              )
              from modifiers mo
              where mo.modifier_group_id = mg.id
                and mo.available = true
            )
          )
          order by mg.sort_order
        ),
        '[]'::json
      )
      from menu_item_modifier_groups mig
      join modifier_groups mg on mg.id = mig.modifier_group_id
      where mig.menu_item_id = m.id
        and mg.active = true
    ) as modifier_groups

  from menu_items m
  where m.available = true

  order by
    m.category asc nulls last,
    m.sort_order asc nulls last,
    m.name asc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_menu_public()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    jsonb_agg(item_row order by (item_row->>'sort_order')::int asc nulls last),
    '[]'::jsonb
  )
  from (
    select
      jsonb_build_object(
        'id',             m.id,
        'name',           m.name,
        'price',          m.price,
        'category',       m.category,
        'featured',       m.featured,
        'available',      m.available,
        'sort_order',     m.sort_order,
        'description',    m.description,
        'image_url',      m.image_url,
        'spicy_level',    m.spicy_level,
        'is_vegetarian',  coalesce(m.is_vegetarian, false),
        'is_vegan',       coalesce(m.is_vegan, false),
        'is_gluten_free', coalesce(m.is_gluten_free, false),
        'allergens',      coalesce(m.allergens, '{}'),
        'pairs_with',     coalesce(m.pairs_with, '{}'),
        'created_at',     coalesce(m.created_at, now())::text,
        'updated_at',     m.updated_at::text,
        'modifier_groups', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'id',             mg.id,
                'name',           mg.name,
                'description',    mg.description,
                'type',           coalesce(mg.type, 'checkbox'),
                'required',       coalesce(mg.required, false),
                'active',         coalesce(mg.active, true),
                'min_selections', mg.min_selections,
                'max_selections', mg.max_selections,
                'sort_order',     mg.sort_order,
                'modifiers', (
                  select coalesce(
                    jsonb_agg(
                      jsonb_build_object(
                        'id',                mod.id,
                        'name',              mod.name,
                        'price_adjustment',  coalesce(mod.price_adjustment, 0),
                        'available',         coalesce(mod.available, true),
                        'is_default',        coalesce(mod.is_default, false),
                        'sort_order',        coalesce(mod.sort_order, 0)
                      )
                      order by coalesce(mod.sort_order, 0) asc
                    ),
                    '[]'::jsonb
                  )
                  from modifiers mod
                  where mod.modifier_group_id = mg.id
                    and coalesce(mod.available, true) = true
                )
              )
              order by coalesce(mig.sort_order, 0) asc
            )
            from menu_item_modifier_groups mig
            join modifier_groups mg on mg.id = mig.modifier_group_id
            where mig.menu_item_id = m.id
              and coalesce(mg.active, true) = true
          ),
          '[]'::jsonb
        )
      ) as item_row
    from menu_items m
    where m.available = true
  ) sub;
$function$
;

CREATE OR REPLACE FUNCTION public.menu_items_assign_sort_order()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_next int;
begin
  if new.available is true and (new.sort_order is null or new.sort_order < 0) then
    select coalesce(max(sort_order), -1) + 1
      into v_next
    from public.menu_items
    where category = new.category
      and available is true;

    new.sort_order := v_next;
  end if;

  return new;
end;
$function$
;

create or replace view "public"."menu_items_view" as  SELECT mi.id,
    mi.name,
    mi.description,
    mi.price,
    mi.category,
    mi.created_at,
    mi.image_url,
    mi.available,
    mi.featured,
    mi.allergens,
    mi.spicy_level,
    mi.is_vegetarian,
    mi.is_vegan,
    mi.is_gluten_free,
    mi.sort_order,
    mi.inventory_count,
    mi.low_stock_threshold,
    mi.popularity_score,
    mi.pairs_with,
    mi.updated_at,
    COALESCE(jsonb_agg(jsonb_build_object('id', mg.id, 'name', mg.name, 'type', mg.type, 'active', mg.active, 'required', mg.required, 'min_selections', mg.min_selections, 'max_selections', mg.max_selections, 'modifiers', ( SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'available', m.available, 'is_default', m.is_default, 'sort_order', m.sort_order, 'price_adjustment', m.price_adjustment) ORDER BY m.sort_order) AS jsonb_agg
           FROM public.modifiers m
          WHERE (m.modifier_group_id = mg.id))) ORDER BY mg.sort_order) FILTER (WHERE (mg.id IS NOT NULL)), '[]'::jsonb) AS modifier_groups
   FROM ((public.menu_items mi
     LEFT JOIN public.menu_item_modifier_groups mig ON ((mi.id = mig.menu_item_id)))
     LEFT JOIN public.modifier_groups mg ON ((mg.id = mig.modifier_group_id)))
  GROUP BY mi.id
  ORDER BY mi.sort_order;


CREATE OR REPLACE FUNCTION public.v2_award_points(p_account_id uuid, p_admin_id uuid, p_amount integer, p_base_points integer, p_tier_at_time text, p_tier_mult numeric, p_streak integer, p_streak_mult numeric, p_amount_cents integer, p_idempotency_key text, p_reference_id uuid)
 RETURNS TABLE(points_earned integer, new_balance integer, new_lifetime integer, new_tier text, streak integer, tier_changed boolean, was_duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account      public.loyalty_accounts%rowtype;
  v_new_balance  integer;
  v_new_lifetime integer;
  v_new_tier     text;
  v_old_tier     text;
  v_phoenix_today date;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  v_phoenix_today := (NOW() AT TIME ZONE 'America/Phoenix')::date;

  SELECT *
  INTO v_account
  FROM public.loyalty_accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  v_old_tier := v_account.tier;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.loyalty_ledger
      WHERE idempotency_key = p_idempotency_key
    ) THEN
      RETURN QUERY SELECT 0, v_account.balance, v_account.lifetime_earned,
        v_account.tier, v_account.streak, false, true;
      RETURN;
    END IF;
  END IF;

  v_new_balance  := v_account.balance + p_amount;
  v_new_lifetime := v_account.lifetime_earned + p_amount;

  v_new_tier :=
    CASE
      WHEN v_new_lifetime >= 5000 THEN 'platinum'
      WHEN v_new_lifetime >= 2000 THEN 'gold'
      WHEN v_new_lifetime >= 500  THEN 'silver'
      ELSE 'bronze'
    END;

  INSERT INTO public.loyalty_ledger (
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
    metadata
  )
  VALUES (
    p_account_id,
    p_amount,
    v_new_balance,
    'earn',
    'order',
    p_reference_id,
    p_admin_id,
    p_idempotency_key,
    p_tier_at_time,
    p_streak,
    jsonb_build_object(
      'v2',          true,
      'order_id',    p_reference_id,
      'source',      'order',
      'base_points', p_base_points,
      'tier_mult',   p_tier_mult,
      'streak_mult', p_streak_mult,
      'amount_cents', p_amount_cents
    )
  );

  UPDATE public.loyalty_accounts
  SET
    balance         = v_new_balance,
    lifetime_earned = v_new_lifetime,
    tier            = v_new_tier,
    streak          = p_streak,
    last_activity   = v_phoenix_today,
    updated_at      = NOW()
  WHERE id = p_account_id;

  RETURN QUERY SELECT
    p_amount,
    v_new_balance,
    v_new_lifetime,
    v_new_tier,
    p_streak,
    (v_new_tier <> v_old_tier),
    false;
END;
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

create materialized view "analytics"."admin_campaign_roi" as  SELECT id,
    name,
    channel,
    budget_cents,
    revenue_cents,
    (revenue_cents - budget_cents) AS net_profit_cents,
    round(((((revenue_cents - budget_cents))::numeric / (NULLIF(budget_cents, 0))::numeric) * (100)::numeric), 2) AS roi_percent
   FROM public.growth_campaigns c;


create materialized view "analytics"."admin_cart_abandonment" as  SELECT count(*) AS abandoned_carts
   FROM public.pending_carts
  WHERE (created_at < (now() - '00:30:00'::interval));


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


create or replace view "public"."active_campaigns_now" as  SELECT id,
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
   FROM public.growth_campaigns c
  WHERE ((active = true) AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((ends_at IS NULL) OR (ends_at > now())));


create or replace view "public"."admin_dispute_timeline" as  SELECT ode.id,
    ode.order_id,
    ode.dispute_id,
    ode.event_type,
    ode.event_source,
    ode.previous_status,
    ode.new_status,
    ode.previous_amount_cents,
    ode.new_amount_cents,
    ode.actor_name,
    ode.actor_role,
    ode.note,
    ode.evidence_urls,
    ode.evidence_labels,
    ode.metadata,
    ode.occurred_at,
    o.stripe_payment_intent_id,
    o.total_cents,
    o.dispute_due_by,
    o.dispute_status
   FROM (public.order_dispute_events ode
     JOIN public.orders o ON ((o.id = ode.order_id)))
  ORDER BY ode.occurred_at DESC;


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


create or replace view "public"."admin_tax_order_breakdown" as  SELECT o.id AS order_id,
    o.created_at AS order_created_at,
    date((o.charge_captured_at AT TIME ZONE 'UTC'::text)) AS captured_date,
    o.charge_captured_at,
    o.status,
    o.payment_status,
    o.order_type AS fulfillment_type,
    o.currency,
    o.amount_subtotal AS subtotal_cents,
    0 AS discount_cents,
    o.amount_subtotal AS taxable_sales_cents,
    o.amount_tax AS tax_collected_cents,
    0 AS tip_cents,
    COALESCE(o.amount_shipping, 0) AS delivery_fee_cents,
    0 AS service_fee_cents,
    o.amount_total AS gross_total_cents,
    COALESCE(o.refunded_amount_cents, 0) AS refunded_amount_cents,
        CASE
            WHEN (o.amount_total > 0) THEN (round(((o.amount_tax)::numeric * ((COALESCE(o.refunded_amount_cents, 0))::numeric / (o.amount_total)::numeric))))::integer
            ELSE 0
        END AS refunded_tax_estimate_cents,
    (o.amount_total - COALESCE(o.refunded_amount_cents, 0)) AS net_total_cents,
    (o.amount_tax -
        CASE
            WHEN (o.amount_total > 0) THEN (round(((o.amount_tax)::numeric * ((COALESCE(o.refunded_amount_cents, 0))::numeric / (o.amount_total)::numeric))))::integer
            ELSE 0
        END) AS net_tax_cents,
    COALESCE(o.dispute_status, 'none'::public.dispute_status_enum) AS dispute_status,
    (COALESCE(o.dispute_status, 'none'::public.dispute_status_enum) <> ALL (ARRAY['none'::public.dispute_status_enum, 'won'::public.dispute_status_enum, 'lost'::public.dispute_status_enum, 'charge_refunded'::public.dispute_status_enum])) AS is_disputed,
    opd.card_brand,
    opd.funding AS card_funding,
    COALESCE(opd.stripe_fee_cents, 0) AS stripe_fee_cents,
    o.stripe_payment_intent_id,
    o.stripe_charge_id
   FROM (public.orders o
     LEFT JOIN public.order_payment_details opd ON ((opd.order_id = o.id)))
  WHERE (public.is_tax_eligible_status(o.payment_status) AND (o.charge_captured_at IS NOT NULL));


CREATE OR REPLACE FUNCTION public.check_guest_rate_limit(p_ip_hash text, p_window_ms bigint DEFAULT 900000, p_max_requests integer DEFAULT 20, p_block_duration_ms bigint DEFAULT 1800000, p_overrun_limit integer DEFAULT 3)
 RETURNS TABLE(allowed boolean, reason text, retry_after_ms bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_found          BOOLEAN;
  v_request_count  INTEGER;
  v_window_start   TIMESTAMPTZ;
  v_blocked_until  TIMESTAMPTZ;
  v_now            TIMESTAMPTZ := clock_timestamp();
  v_window_cutoff  TIMESTAMPTZ := v_now - (p_window_ms * INTERVAL '1 millisecond');
  v_retry_ms       BIGINT;
  v_new_count      INTEGER;
BEGIN
  SELECT
    TRUE,
    gr.request_count,
    gr.window_start,
    gr.blocked_until
  INTO
    v_found,
    v_request_count,
    v_window_start,
    v_blocked_until
  FROM public.guest_rate_limits gr
  WHERE gr.ip_hash = p_ip_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.guest_rate_limits
      (ip_hash, request_count, window_start, overrun_count, updated_at)
    VALUES
      (p_ip_hash, 1, v_now, 0, v_now);

    RETURN QUERY SELECT TRUE, ''::text, 0::bigint;
    RETURN;
  END IF;

  IF v_blocked_until IS NOT NULL AND v_blocked_until > v_now THEN
    v_retry_ms := EXTRACT(EPOCH FROM (v_blocked_until - v_now))::BIGINT * 1000;
    RETURN QUERY SELECT FALSE, 'ip_blocked'::text, v_retry_ms;
    RETURN;
  END IF;

  IF v_window_start < v_window_cutoff THEN
    UPDATE public.guest_rate_limits
    SET request_count = 1,
        window_start  = v_now,
        blocked_until = NULL,
        updated_at    = v_now
    WHERE ip_hash = p_ip_hash;

    RETURN QUERY SELECT TRUE, ''::text, 0::bigint;
    RETURN;
  END IF;

  v_new_count := v_request_count + 1;

  IF v_new_count > p_max_requests THEN
    RETURN QUERY SELECT FALSE, 'rate_limit_exceeded'::text, 1000::bigint;
    RETURN;
  END IF;

  UPDATE public.guest_rate_limits
  SET request_count = v_new_count,
      updated_at    = v_now
  WHERE ip_hash = p_ip_hash;

  RETURN QUERY SELECT TRUE, ''::text, 0::bigint;
END;
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


create or replace view "public"."menu_items_admin_full" as  SELECT mi.id,
    mi.name,
    mi.price,
    mi.available,
    mi.category,
    mi.sort_order,
    mi.featured,
    mi.description,
    mi.image_url,
    mi.spicy_level,
    mi.is_vegetarian,
    mi.is_vegan,
    mi.is_gluten_free,
    mi.allergens,
    mi.pairs_with,
    mi.created_at,
    mi.updated_at,
    COALESCE(json_agg(DISTINCT jsonb_build_object('id', mg.id, 'name', mg.name, 'sort_order', mig.sort_order, 'modifiers', ( SELECT json_agg(jsonb_build_object('id', mo.id, 'name', mo.name, 'price_adjustment', mo.price_adjustment, 'available', mo.available) ORDER BY mo.sort_order) AS json_agg
           FROM public.modifier_options mo
          WHERE (mo.modifier_group_id = mg.id)))) FILTER (WHERE (mg.id IS NOT NULL)), '[]'::json) AS modifier_groups
   FROM ((public.menu_items mi
     LEFT JOIN public.menu_item_modifier_groups mig ON ((mi.id = mig.menu_item_id)))
     LEFT JOIN public.modifier_groups mg ON ((mg.id = mig.modifier_group_id)))
  GROUP BY mi.id;


create or replace view "public"."menu_items_with_modifiers" as  SELECT mi.id,
    mi.name,
    mi.description,
    mi.price,
    mi.category,
    mi.created_at,
    mi.image_url,
    mi.available,
    mi.featured,
    mi.allergens,
    mi.spicy_level,
    mi.is_vegetarian,
    mi.is_vegan,
    mi.is_gluten_free,
    mi.sort_order,
    mi.inventory_count,
    mi.low_stock_threshold,
    mi.popularity_score,
    mi.pairs_with,
    mi.updated_at,
    COALESCE(jsonb_agg(jsonb_build_object('id', mg.id, 'name', mg.name, 'type', mg.type, 'active', mg.active, 'required', mg.required, 'min_selections', mg.min_selections, 'max_selections', mg.max_selections, 'modifiers', ( SELECT jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'available', m.available, 'is_default', m.is_default, 'sort_order', m.sort_order, 'price_adjustment', m.price_adjustment) ORDER BY m.sort_order) AS jsonb_agg
           FROM public.modifiers m
          WHERE (m.modifier_group_id = mg.id))) ORDER BY mg.sort_order) FILTER (WHERE (mg.id IS NOT NULL)), '[]'::jsonb) AS modifier_groups
   FROM ((public.menu_items mi
     LEFT JOIN public.menu_item_modifier_groups mig ON ((mi.id = mig.menu_item_id)))
     LEFT JOIN public.modifier_groups mg ON ((mg.id = mig.modifier_group_id)))
  GROUP BY mi.id
  ORDER BY mi.sort_order;


create or replace view "public"."order_performance" as  SELECT id AS order_id,
    order_number,
    status,
    created_at,
    updated_at
   FROM public.orders o;


create or replace view "public"."order_timeline" as  SELECT o.id AS order_id,
    o.order_number,
    o.status AS current_status,
    o.order_type,
    o.fulfillment_type,
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


CREATE OR REPLACE FUNCTION public.rotate_featured_growth_campaigns(target_placement text DEFAULT NULL::text)
 RETURNS TABLE(placement text, featured_campaign_id text, was_manual_override boolean, rotated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := now();
  v_today date := (timezone('UTC', now()))::date;
  v_requested_placement text := nullif(btrim(target_placement), '');
  v_placement text;

  v_manual_featured_id uuid;
  v_selected_id uuid;
begin
  -- Concurrency safety: per placement scope so concurrent calls can't fight.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'public.rotate_featured_growth_campaigns:' || coalesce(v_requested_placement, '*'),
      0
    )
  );

  -- Ensure singleton exists (idempotent)
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
    -- If a campaign is featured AND NOT eligible_for_rotation, it wins (no rotation).
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
    -- 2) prefer NOT repeating a campaign already featured today
    -- 3) deterministic weighted hash (UTC date + id) divided by weight
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
      -- Apply single-winner featured toggle for this placement.
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
      -- No eligible campaign found:
      -- Clear featured among eligible ones only.
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
$function$
;

CREATE OR REPLACE FUNCTION public.sync_order_items_from_order_cart()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lines     jsonb;
  v_line      jsonb;
  v_i         int := 0;
  v_qty       int;
  v_unit      bigint;
  v_total     bigint;
  v_mid       uuid;
  v_name      text;
  v_notes     text;
  v_mods      jsonb;
  v_hash      text;
  v_mod_unit  bigint;
BEGIN
  -- Only process paid/succeeded orders
  IF new.payment_status NOT IN ('paid', 'succeeded') THEN
    RETURN new;
  END IF;

  -- ── Source 1: pricing_snapshot.lines (authoritative) ──────────────────────
  -- Written by create-checkout with full name, price, and modifier data.
  -- This is the correct source and should always be present for new orders.
  v_lines := new.metadata -> 'pricing_snapshot' -> 'lines';

  -- ── Source 2: cart_items fallback (legacy) ────────────────────────────────
  -- Raw cart JSON — only has id/quantity/modifiers, no name or price.
  -- Used only if pricing_snapshot is missing (old orders before 2026-03-06).
  IF v_lines IS NULL OR jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) = 0 THEN
    v_lines := new.cart_items;
  END IF;

  IF v_lines IS NULL OR jsonb_typeof(v_lines) <> 'array' THEN
    RETURN new;
  END IF;

  -- Wipe and rebuild — deterministic, handles retries cleanly
  DELETE FROM public.order_items WHERE order_id = new.id;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines)
  LOOP
    -- Quantity
    v_qty := GREATEST(1, COALESCE(
      NULLIF((v_line->>'quantity')::int, 0),
      NULLIF((v_line->>'qty')::int, 0),
      1
    ));

    -- Name — pricing_snapshot uses 'name', cart_items may use 'title' etc.
    v_name := COALESCE(
      NULLIF(v_line->>'name', ''),
      NULLIF(v_line->>'title', ''),
      NULLIF(v_line->>'item_name', ''),
      'Unknown Item'
    );

    -- menu_item_id — pricing_snapshot uses 'menuItemId', cart_items uses 'id'
    BEGIN
      v_mid := NULLIF(COALESCE(
        v_line->>'menuItemId',
        v_line->>'menu_item_id',
        v_line->>'item_id',
        v_line->>'id'
      ), '')::uuid;
    EXCEPTION WHEN others THEN
      v_mid := NULL;
    END;

    -- Modifier unit total — sum priceAdjustmentCents across modifiers array
    v_mod_unit := 0;
    IF jsonb_typeof(v_line->'modifiers') = 'array' THEN
      SELECT COALESCE(SUM(
        COALESCE(
          NULLIF((m->>'priceAdjustmentCents')::bigint, 0),
          NULLIF((m->>'priceAdjustment')::bigint, 0),
          0
        )
      ), 0)
      INTO v_mod_unit
      FROM jsonb_array_elements(v_line->'modifiers') AS m;
    END IF;

    -- Unit price cents
    -- pricing_snapshot: baseUnitPriceCents + modifierUnitPriceCents
    -- cart_items fallback: unitPriceCents or unit_price_cents
    v_unit := COALESCE(
      -- pricing_snapshot path: base + modifier
      CASE
        WHEN (v_line->>'baseUnitPriceCents') IS NOT NULL
        THEN NULLIF((v_line->>'baseUnitPriceCents')::bigint, 0) + v_mod_unit
        ELSE NULL
      END,
      -- cart_items fallback paths
      NULLIF((v_line->>'unitPriceCents')::bigint, 0),
      NULLIF((v_line->>'unit_price_cents')::bigint, 0),
      NULLIF((v_line->>'price_cents')::bigint, 0),
      0
    );

    -- Line total cents
    -- pricing_snapshot: finalPretaxLineTotalCents
    -- cart_items fallback: lineTotalCents, then compute from unit * qty
    v_total := COALESCE(
      NULLIF((v_line->>'finalPretaxLineTotalCents')::bigint, 0),
      NULLIF((v_line->>'lineTotalCents')::bigint, 0),
      NULLIF((v_line->>'line_total_cents')::bigint, 0),
      NULLIF((v_line->>'total_cents')::bigint, 0),
      (v_unit * v_qty::bigint)
    );

    -- Notes
    v_notes := NULLIF(COALESCE(
      v_line->>'notes',
      v_line->>'special_instructions',
      v_line->>'note'
    ), '');

    -- Modifiers (store raw)
    v_mods := CASE
      WHEN jsonb_typeof(v_line->'modifiers') = 'array' THEN v_line->'modifiers'
      ELSE '[]'::jsonb
    END;

    -- Pricing hash
    v_hash := NULLIF(COALESCE(
      v_line->>'basePricingHash',
      v_line->>'pricingHash',
      v_line->>'pricing_hash'
    ), '');

    INSERT INTO public.order_items (
      order_id,
      line_index,
      menu_item_id,
      name,
      quantity,
      unit_price_cents,
      line_total_cents,
      modifiers,
      notes,
      pricing_hash
    ) VALUES (
      new.id,
      v_i,
      v_mid,
      v_name,
      v_qty,
      v_unit,
      v_total,
      v_mods,
      v_notes,
      v_hash
    );

    v_i := v_i + 1;
  END LOOP;

  RETURN new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.v2_award_points(p_account_id uuid, p_admin_id uuid, p_amount_cents integer, p_idempotency_key text, p_reference_id uuid)
 RETURNS TABLE(points_earned integer, new_balance integer, new_lifetime integer, new_tier text, streak integer, tier_changed boolean, was_duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account      public.loyalty_accounts%rowtype;
  v_points       integer;
  v_new_balance  integer;
  v_new_lifetime integer;
  v_new_tier     text;
  v_old_tier     text;
  v_streak       integer;
  -- Phoenix, AZ is UTC-7 year-round (no DST).
  -- Using explicit offset so streak day resets at midnight Arizona time,
  -- not midnight UTC (which would fire 7 hours early).
  v_phoenix_today date;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  v_points := FLOOR(p_amount_cents / 100);

  -- Phoenix local date: shift UTC timestamp by -7 hours
  v_phoenix_today := (NOW() AT TIME ZONE 'America/Phoenix')::date;

  -- Lock account row (serialises concurrent awards per user)
  SELECT *
  INTO v_account
  FROM public.loyalty_accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  v_old_tier := v_account.tier;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.loyalty_ledger
      WHERE idempotency_key = p_idempotency_key
    ) THEN
      RETURN QUERY
      SELECT
        0,
        v_account.balance,
        v_account.lifetime_earned,
        v_account.tier,
        v_account.streak,
        false,
        true;
      RETURN;
    END IF;
  END IF;

  v_new_balance  := v_account.balance + v_points;
  v_new_lifetime := v_account.lifetime_earned + v_points;

  -- Streak: uses Phoenix local date so day boundary is midnight Arizona time
  IF v_account.last_activity = v_phoenix_today THEN
    -- Same day: streak unchanged
    v_streak := v_account.streak;
  ELSIF v_account.last_activity = v_phoenix_today - INTERVAL '1 day' THEN
    -- Consecutive day: extend streak
    v_streak := v_account.streak + 1;
  ELSE
    -- Gap or first order: reset to 1
    v_streak := 1;
  END IF;

  -- Tier
  v_new_tier :=
    CASE
      WHEN v_new_lifetime >= 5000 THEN 'platinum'
      WHEN v_new_lifetime >= 2000 THEN 'gold'
      WHEN v_new_lifetime >= 500  THEN 'silver'
      ELSE 'bronze'
    END;

  -- ✅ Append ledger row — now includes tier_at_time and streak_at_time
  INSERT INTO public.loyalty_ledger (
    account_id,
    amount,
    balance_after,
    entry_type,
    source,
    reference_id,
    admin_id,
    idempotency_key,
    tier_at_time,    -- ✅ was missing — caused 'bronze' and 0 in UI
    streak_at_time,  -- ✅ was missing — caused '0 days' in UI
    metadata
  )
  VALUES (
    p_account_id,
    v_points,
    v_new_balance,
    'earn',
    'order',         -- ✅ was 'admin_scan' — now correctly labelled
    p_reference_id,
    p_admin_id,
    p_idempotency_key,
    v_old_tier,      -- tier the customer held at order time
    v_streak,        -- streak including this order
    jsonb_build_object(
      'v2',       true,
      'order_id', p_reference_id,
      'source',   'order'
    )
  );

  -- Update account state
  UPDATE public.loyalty_accounts
  SET
    balance         = v_new_balance,
    lifetime_earned = v_new_lifetime,
    tier            = v_new_tier,
    streak          = v_streak,
    last_activity   = v_phoenix_today,  -- ✅ Phoenix date, not UTC date
    updated_at      = NOW()
  WHERE id = p_account_id;

  RETURN QUERY
  SELECT
    v_points,
    v_new_balance,
    v_new_lifetime,
    v_new_tier,
    v_streak,
    (v_new_tier <> v_old_tier),
    false;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.v2_reserve_loyalty_points(p_account_id uuid, p_user_id uuid, p_points integer, p_stripe_session_id text, p_points_per_dollar numeric DEFAULT 100)
 RETURNS TABLE(reserved_points integer, reserved_cents integer, new_balance integer, was_duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account          loyalty_accounts%ROWTYPE;
  v_new_bal          integer;
  v_cents            integer;
  v_inserted         integer;
  v_idem_key         text;
  c_max_points_per_order  CONSTANT integer := 5000;
  c_max_points_per_day    CONSTANT integer := 10000;
  v_active_reserves  integer;
  v_daily_redeemed   integer;
BEGIN
  IF p_points <= 0 THEN
    RAISE EXCEPTION 'reserve amount must be positive, got %', p_points
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_stripe_session_id IS NULL OR trim(p_stripe_session_id) = '' THEN
    RAISE EXCEPTION 'stripe_session_id is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_points_per_dollar <= 0 THEN
    RAISE EXCEPTION 'points_per_dollar must be positive, got %', p_points_per_dollar
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_points > c_max_points_per_order THEN
    RAISE EXCEPTION 'Per-order redemption limit exceeded: requested %, max per order is %',
      p_points, c_max_points_per_order
      USING ERRCODE = 'check_violation';
  END IF;

  v_idem_key := 'reserve:' || p_stripe_session_id;

  IF EXISTS (
    SELECT 1 FROM loyalty_ledger WHERE idempotency_key = v_idem_key
  ) THEN
    SELECT balance INTO v_new_bal FROM loyalty_accounts WHERE id = p_account_id;
    v_cents := floor(p_points::numeric / p_points_per_dollar * 100)::integer;
    RETURN QUERY SELECT p_points, v_cents, COALESCE(v_new_bal, 0), true;
    RETURN;
  END IF;

  SELECT * INTO v_account
  FROM loyalty_accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loyalty account not found: %', p_account_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_account.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Account % does not belong to user %', p_account_id, p_user_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_account.balance < p_points THEN
    RAISE EXCEPTION 'Insufficient loyalty balance: account has %, redemption requires %',
      v_account.balance, p_points
      USING ERRCODE = 'check_violation';
  END IF;

  -- Cross-session stack prevention — excludes released and redeemed reserves
  SELECT COALESCE(ABS(SUM(amount)), 0)::integer
  INTO v_active_reserves
  FROM loyalty_ledger ll
  WHERE ll.account_id     = p_account_id
    AND ll.entry_type     = 'checkout_reserve'
    AND ll.idempotency_key <> v_idem_key
    AND NOT EXISTS (
      SELECT 1 FROM loyalty_ledger ll2
      WHERE ll2.idempotency_key =
        replace(ll.idempotency_key, 'reserve:', 'release:')
    );

  IF v_active_reserves > 0 THEN
    RAISE EXCEPTION
      'Active loyalty reserve exists (% pts). Complete or cancel the existing checkout before starting a new one.',
      v_active_reserves
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(ABS(SUM(amount)), 0)::integer
  INTO v_daily_redeemed
  FROM loyalty_ledger
  WHERE account_id = p_account_id
    AND entry_type IN ('redeemed', 'checkout_reserve')
    AND created_at >= now() - interval '24 hours'
    AND NOT EXISTS (
      SELECT 1 FROM loyalty_ledger ll2
      WHERE ll2.idempotency_key =
        replace(loyalty_ledger.idempotency_key, 'reserve:', 'release:')
    );

  IF v_daily_redeemed + p_points > c_max_points_per_day THEN
    RAISE EXCEPTION
      'Daily redemption limit exceeded: % pts used today, % pts requested, daily max is %',
      v_daily_redeemed, p_points, c_max_points_per_day
      USING ERRCODE = 'check_violation';
  END IF;

  v_new_bal := v_account.balance - p_points;
  v_cents   := floor(p_points::numeric / p_points_per_dollar * 100)::integer;

  INSERT INTO loyalty_ledger (
    account_id, amount, balance_after, entry_type, source,
    idempotency_key, tier_at_time, streak_at_time, metadata
  ) VALUES (
    p_account_id, -p_points, v_new_bal, 'checkout_reserve', 'online_checkout',
    v_idem_key, v_account.tier, v_account.streak,
    jsonb_build_object(
      'stripe_session_id', p_stripe_session_id,
      'reserved_cents',    v_cents,
      'user_id',           p_user_id,
      'reserved_at',       now()
    )
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
    DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT balance INTO v_new_bal FROM loyalty_accounts WHERE id = p_account_id;
    RETURN QUERY SELECT p_points, v_cents, COALESCE(v_new_bal, 0), true;
    RETURN;
  END IF;

  UPDATE loyalty_accounts
  SET balance = v_new_bal, last_activity = now(), updated_at = now()
  WHERE id = p_account_id;

  RETURN QUERY SELECT p_points, v_cents, v_new_bal, false;
END;
$function$
;

create materialized view "analytics"."admin_modifier_attach_rate" as  SELECT modifier_name,
    times_attached,
    ((times_attached)::numeric / (NULLIF(( SELECT count(*) AS count
           FROM public.orders
          WHERE (orders.payment_status = 'paid'::text)), 0))::numeric) AS attach_rate
   FROM analytics.admin_modifier_sales s;


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


create or replace view "public"."admin_tax_daily_summary" as  SELECT captured_date AS report_date,
    currency,
    count(*) AS orders_count,
    count(*) FILTER (WHERE is_disputed) AS disputed_orders_count,
    count(*) FILTER (WHERE (refunded_amount_cents > 0)) AS refunded_orders_count,
    sum(subtotal_cents) AS gross_sales_cents,
    sum(discount_cents) AS discount_cents,
    sum(taxable_sales_cents) AS taxable_sales_cents,
    sum(tax_collected_cents) AS tax_collected_cents,
    sum(tip_cents) AS tip_cents,
    sum(delivery_fee_cents) AS delivery_fee_cents,
    sum(service_fee_cents) AS service_fee_cents,
    sum(gross_total_cents) AS gross_total_cents,
    sum(refunded_amount_cents) AS refunded_sales_cents,
    sum(refunded_tax_estimate_cents) AS refunded_tax_cents,
    sum(net_total_cents) AS net_sales_cents,
    sum(net_tax_cents) AS net_tax_cents,
    sum(stripe_fee_cents) AS total_stripe_fees_cents
   FROM public.admin_tax_order_breakdown
  GROUP BY captured_date, currency
  ORDER BY captured_date DESC;


create materialized view "public"."admin_tax_daily_summary_mat" as  SELECT report_date,
    currency,
    orders_count,
    disputed_orders_count,
    refunded_orders_count,
    gross_sales_cents,
    discount_cents,
    taxable_sales_cents,
    tax_collected_cents,
    tip_cents,
    delivery_fee_cents,
    service_fee_cents,
    gross_total_cents,
    refunded_sales_cents,
    refunded_tax_cents,
    net_sales_cents,
    net_tax_cents,
    total_stripe_fees_cents
   FROM public.admin_tax_daily_summary;


create or replace view "public"."admin_tax_monthly_summary" as  SELECT (date_trunc('month'::text, (report_date)::timestamp with time zone))::date AS report_month,
    to_char((report_date)::timestamp with time zone, 'YYYY-MM'::text) AS report_month_label,
    currency,
    count(DISTINCT report_date) AS active_days,
    sum(orders_count) AS orders_count,
    sum(disputed_orders_count) AS disputed_orders_count,
    sum(refunded_orders_count) AS refunded_orders_count,
    sum(gross_sales_cents) AS gross_sales_cents,
    sum(discount_cents) AS discount_cents,
    sum(taxable_sales_cents) AS taxable_sales_cents,
    sum(tax_collected_cents) AS tax_collected_cents,
    sum(tip_cents) AS tip_cents,
    sum(delivery_fee_cents) AS delivery_fee_cents,
    sum(service_fee_cents) AS service_fee_cents,
    sum(gross_total_cents) AS gross_total_cents,
    sum(refunded_sales_cents) AS refunded_sales_cents,
    sum(refunded_tax_cents) AS refunded_tax_cents,
    sum(net_sales_cents) AS net_sales_cents,
    sum(net_tax_cents) AS net_tax_cents,
    sum(total_stripe_fees_cents) AS total_stripe_fees_cents,
        CASE
            WHEN (sum(taxable_sales_cents) > (0)::numeric) THEN round(((sum(tax_collected_cents) / sum(taxable_sales_cents)) * (100)::numeric), 4)
            ELSE (0)::numeric
        END AS effective_tax_rate_pct
   FROM public.admin_tax_daily_summary d
  GROUP BY ((date_trunc('month'::text, (report_date)::timestamp with time zone))::date), (to_char((report_date)::timestamp with time zone, 'YYYY-MM'::text)), currency
  ORDER BY ((date_trunc('month'::text, (report_date)::timestamp with time zone))::date) DESC;


CREATE INDEX idx_admin_revenue_day ON internal.admin_revenue_summary USING btree (day);

grant insert on table "public"."abandoned_cart_sessions" to "authenticated";

grant select on table "public"."abandoned_cart_sessions" to "authenticated";

grant update on table "public"."abandoned_cart_sessions" to "authenticated";

grant select on table "public"."menu_item_modifier_groups" to "authenticated";

grant select on table "public"."menu_items" to "authenticated";

grant delete on table "public"."modifier_group_modifiers" to "service_role";

grant insert on table "public"."modifier_group_modifiers" to "service_role";

grant references on table "public"."modifier_group_modifiers" to "service_role";

grant select on table "public"."modifier_group_modifiers" to "service_role";

grant trigger on table "public"."modifier_group_modifiers" to "service_role";

grant truncate on table "public"."modifier_group_modifiers" to "service_role";

grant update on table "public"."modifier_group_modifiers" to "service_role";

grant select on table "public"."modifier_groups" to "authenticated";

grant select on table "public"."modifier_options" to "anon";

grant select on table "public"."modifier_options" to "authenticated";

grant delete on table "public"."modifier_options" to "service_role";

grant insert on table "public"."modifier_options" to "service_role";

grant references on table "public"."modifier_options" to "service_role";

grant select on table "public"."modifier_options" to "service_role";

grant trigger on table "public"."modifier_options" to "service_role";

grant truncate on table "public"."modifier_options" to "service_role";

grant update on table "public"."modifier_options" to "service_role";

grant select on table "public"."modifiers" to "authenticated";

grant select on table "public"."pending_carts" to "authenticated";


  create policy "acs_insert"
  on "public"."abandoned_cart_sessions"
  as permissive
  for insert
  to authenticated
with check ((user_id = auth.uid()));



  create policy "acs_select_own"
  on "public"."abandoned_cart_sessions"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "acs_update_own"
  on "public"."abandoned_cart_sessions"
  as permissive
  for update
  to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "admin_read_abandoned_cart_sessions"
  on "public"."abandoned_cart_sessions"
  as permissive
  for select
  to authenticated
using (public.is_admin(auth.uid()));



  create policy "Allow select for authenticated users"
  on "public"."menu_item_modifier_groups"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "Authenticated can read junction"
  on "public"."menu_item_modifier_groups"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Public read item modifier groups"
  on "public"."menu_item_modifier_groups"
  as permissive
  for select
  to public
using (true);



  create policy "Public read junction"
  on "public"."menu_item_modifier_groups"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Public read menu_item_modifier_groups"
  on "public"."menu_item_modifier_groups"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Public can view available menu items"
  on "public"."menu_items"
  as permissive
  for select
  to public
using ((available = true));



  create policy "menu_items_authenticated_read"
  on "public"."menu_items"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Allow select for authenticated users"
  on "public"."modifier_groups"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "Authenticated can read modifier groups"
  on "public"."modifier_groups"
  as permissive
  for select
  to authenticated
using ((active = true));



  create policy "Public read modifier groups"
  on "public"."modifier_groups"
  as permissive
  for select
  to public
using (true);



  create policy "Allow select for authenticated users"
  on "public"."modifier_options"
  as permissive
  for select
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "Public read modifier options"
  on "public"."modifier_options"
  as permissive
  for select
  to public
using (true);



  create policy "Admins can manage modifiers"
  on "public"."modifiers"
  as permissive
  for all
  to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));



  create policy "Authenticated can read modifiers"
  on "public"."modifiers"
  as permissive
  for select
  to authenticated
using ((available = true));



  create policy "No public access to modifiers"
  on "public"."modifiers"
  as permissive
  for select
  to anon
using (false);



  create policy "Public can view available modifiers"
  on "public"."modifiers"
  as permissive
  for select
  to anon, authenticated
using ((available = true));



  create policy "Public read modifiers"
  on "public"."modifiers"
  as permissive
  for select
  to anon, authenticated
using ((available = true));



  create policy "modifiers_authenticated_read"
  on "public"."modifiers"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Admins can view all orders"
  on "public"."orders"
  as permissive
  for select
  to authenticated
using (public.is_admin(auth.uid()));



  create policy "Service role can view orders"
  on "public"."orders"
  as permissive
  for select
  to service_role
using (true);



  create policy "Users can view own orders"
  on "public"."orders"
  as permissive
  for select
  to authenticated
using ((customer_uid = auth.uid()));



  create policy "admin_read_pending_carts"
  on "public"."pending_carts"
  as permissive
  for select
  to authenticated
using (public.is_admin(auth.uid()));



  create policy "guest can read own pending cart"
  on "public"."pending_carts"
  as permissive
  for select
  to public
using ((guest_email IS NOT NULL));



  create policy "orders_block_delete"
  on "public"."orders"
  as permissive
  for delete
  to authenticated
using (false);



  create policy "orders_block_insert"
  on "public"."orders"
  as permissive
  for insert
  to authenticated
with check (false);



  create policy "orders_block_update"
  on "public"."orders"
  as permissive
  for update
  to authenticated
using (false);


CREATE TRIGGER trg_menu_items_assign_sort_order BEFORE INSERT ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.menu_items_assign_sort_order();


  create policy "Admin update menu images"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'menu-images'::text));



  create policy "Admin upload menu images"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'menu-images'::text));



