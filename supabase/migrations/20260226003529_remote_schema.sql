drop trigger if exists "order_status_trigger" on "public"."orders";

drop trigger if exists "trigger_auto_log_order_status_change" on "public"."orders";

drop trigger if exists "trigger_log_order_event" on "public"."orders";

drop policy "contact_admin_read" on "public"."contact_messages";

drop policy "contact_insert_public" on "public"."contact_messages";

drop policy "contact_read_admin" on "public"."contact_messages";

drop policy "admins_read_fraud_logs" on "public"."fraud_logs";

drop policy "block_direct_inserts" on "public"."order_events";

drop policy "order_events_read_policy" on "public"."order_events";

drop policy "Admins read all orders" on "public"."orders";

drop policy "Temporary allow read all" on "public"."orders";

drop policy "orders_select" on "public"."orders";

drop policy "orders_update_admin" on "public"."orders";

drop policy "profiles_insert_own" on "public"."profiles";

drop policy "Users insert own profile" on "public"."profiles";

drop policy "Users read own profile" on "public"."profiles";

drop policy "Users update own profile" on "public"."profiles";

alter table "public"."loyalty_ledger" drop constraint "loyalty_ledger_entry_type_check";

drop function if exists "public"."award_loyalty_points_atomic"(p_user_id uuid, p_points integer, p_admin_id uuid, p_base_points integer, p_tier text, p_tier_mult numeric, p_streak integer, p_streak_mult numeric, p_amount_cents integer, p_order_id uuid);

drop view if exists "public"."reconcile_v2_accounts";

drop function if exists "public"."redeem_loyalty_points_atomic"(p_user_id uuid, p_points integer, p_admin_id uuid, p_mode text);

drop view if exists "public"."v2_account_summary";

drop function if exists "public"."v2_award_points"(p_account_id uuid, p_admin_id uuid, p_amount integer, p_base_points integer, p_tier_at_time text, p_tier_mult numeric, p_streak integer, p_streak_mult numeric, p_amount_cents integer, p_idempotency_key text);

drop function if exists "public"."v2_issue_correction"(p_account_id uuid, p_admin_id uuid, p_amount integer, p_reason text);

drop function if exists "public"."v2_redeem_points"(p_account_id uuid, p_admin_id uuid, p_amount integer, p_idempotency_key text, p_reference_id uuid);

drop function if exists "public"."v2_redeem_points"(p_account_id uuid, p_admin_id uuid, p_amount integer, p_mode text, p_idempotency_key text);

drop view if exists "public"."order_performance";

drop view if exists "public"."order_timeline";


  create table "public"."account_lockouts" (
    "email" text not null,
    "failed_attempts" integer not null default 0,
    "locked_until" timestamp with time zone,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."account_lockouts" enable row level security;


  create table "public"."admin_notifications" (
    "id" uuid not null default gen_random_uuid(),
    "type" text,
    "order_id" uuid,
    "message" text,
    "created_at" timestamp with time zone default now(),
    "read" boolean default false
      );



  create table "public"."health_check" (
    "id" integer not null default 1
      );


alter table "public"."health_check" enable row level security;


  create table "public"."ip_blocks" (
    "ip" text not null,
    "reason" text,
    "blocked_until" timestamp with time zone,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."ip_blocks" enable row level security;


  create table "public"."login_attempts" (
    "id" uuid not null default gen_random_uuid(),
    "email" text not null,
    "ip" text not null,
    "user_agent" text,
    "success" boolean not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."login_attempts" enable row level security;


  create table "public"."loyalty_transactions" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "order_id" uuid,
    "transaction_type" text not null,
    "points_delta" integer not null,
    "points_balance" integer not null,
    "lifetime_balance" integer not null,
    "tier_at_time" text not null default 'bronze'::text,
    "streak_at_time" integer not null default 0,
    "tier_multiplier" numeric not null default 1.0,
    "streak_multiplier" numeric not null default 1.0,
    "base_points" integer not null default 0,
    "metadata" jsonb,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."loyalty_transactions" enable row level security;


  create table "public"."order_status_audit" (
    "id" uuid not null default gen_random_uuid(),
    "order_id" uuid not null,
    "old_status" text,
    "new_status" text,
    "changed_by" uuid,
    "changed_at" timestamp with time zone default now()
      );


alter table "public"."order_status_audit" enable row level security;


  create table "public"."password_attempts" (
    "ip_address" text not null,
    "attempts" integer not null default 0,
    "last_attempt" timestamp with time zone not null default now()
      );


alter table "public"."password_attempts" enable row level security;


  create table "public"."password_fingerprints" (
    "fingerprint" text not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."password_fingerprints" enable row level security;


  create table "public"."pending_carts" (
    "id" uuid not null,
    "user_id" uuid not null,
    "items" jsonb not null,
    "created_at" timestamp with time zone default now(),
    "expires_at" timestamp with time zone default (now() + '01:00:00'::interval),
    "total_cents" integer not null default 0,
    "promo_id" uuid,
    "credit_id" uuid,
    "subtotal_cents" integer not null default 0,
    "discount_cents" integer not null default 0,
    "tax_cents" integer not null default 0
      );


alter table "public"."pending_carts" enable row level security;


  create table "public"."security_events" (
    "id" uuid not null default gen_random_uuid(),
    "event_type" text not null,
    "metadata" jsonb,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."staff_action_logs" (
    "id" uuid not null default gen_random_uuid(),
    "order_id" uuid not null,
    "staff_id" uuid not null,
    "action" text not null,
    "old_status" text,
    "new_status" text,
    "ip_address" text,
    "user_agent" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."staff_action_logs" enable row level security;


  create table "public"."stripe_events" (
    "id" text not null,
    "type" text not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."stripe_events" enable row level security;

alter table "public"."fraud_logs" add column "stripe_total" integer not null default 0;

alter table "public"."menu_items" add column "allergens" text[] default '{}'::text[];

alter table "public"."menu_items" add column "available" boolean not null default true;

alter table "public"."menu_items" add column "featured" boolean not null default false;

alter table "public"."menu_items" add column "image_url" text;

alter table "public"."menu_items" add column "is_gluten_free" boolean default false;

alter table "public"."menu_items" add column "is_vegan" boolean default false;

alter table "public"."menu_items" add column "is_vegetarian" boolean default false;

alter table "public"."menu_items" add column "sort_order" integer default 0;

alter table "public"."menu_items" add column "spicy_level" integer default 0;

alter table "public"."profiles" add column "last_order_date" date;

alter table "public"."profiles" add column "lifetime_points" integer not null default 0;

alter table "public"."profiles" add column "loyalty_points" integer not null default 0;

alter table "public"."profiles" add column "loyalty_public_id" uuid not null;

alter table "public"."profiles" add column "loyalty_streak" integer not null default 0;

alter table "public"."profiles" add column "loyalty_tier" text not null default 'bronze'::text;

CREATE INDEX account_lockouts_email_idx ON public.account_lockouts USING btree (email);

CREATE UNIQUE INDEX account_lockouts_pkey ON public.account_lockouts USING btree (email);

CREATE UNIQUE INDEX admin_notifications_pkey ON public.admin_notifications USING btree (id);

CREATE UNIQUE INDEX health_check_pkey ON public.health_check USING btree (id);

CREATE INDEX idx_loyalty_tx_order_id ON public.loyalty_transactions USING btree (order_id) WHERE (order_id IS NOT NULL);

CREATE INDEX idx_loyalty_tx_type ON public.loyalty_transactions USING btree (transaction_type, created_at DESC);

CREATE INDEX idx_loyalty_tx_user_id ON public.loyalty_transactions USING btree (user_id, created_at DESC);

CREATE INDEX idx_menu_items_available ON public.menu_items USING btree (available);

CREATE INDEX idx_menu_items_featured ON public.menu_items USING btree (featured);

CREATE INDEX idx_orders_stripe_charge_id ON public.orders USING btree (((metadata ->> 'stripe_charge_id'::text)));

CREATE INDEX idx_profiles_loyalty_public_id ON public.profiles USING btree (loyalty_public_id);

CREATE INDEX idx_profiles_loyalty_tier ON public.profiles USING btree (loyalty_tier, lifetime_points DESC);

CREATE INDEX idx_stripe_events_created_at ON public.stripe_events USING btree (created_at DESC);

CREATE INDEX ip_blocks_blocked_idx ON public.ip_blocks USING btree (blocked_until);

CREATE UNIQUE INDEX ip_blocks_pkey ON public.ip_blocks USING btree (ip);

CREATE INDEX login_attempts_created_idx ON public.login_attempts USING btree (created_at);

CREATE INDEX login_attempts_email_idx ON public.login_attempts USING btree (email);

CREATE INDEX login_attempts_ip_idx ON public.login_attempts USING btree (ip);

CREATE UNIQUE INDEX login_attempts_pkey ON public.login_attempts USING btree (id);

CREATE UNIQUE INDEX loyalty_transactions_pkey ON public.loyalty_transactions USING btree (id);

CREATE UNIQUE INDEX order_status_audit_pkey ON public.order_status_audit USING btree (id);

CREATE UNIQUE INDEX password_attempts_pkey ON public.password_attempts USING btree (ip_address);

CREATE UNIQUE INDEX password_fingerprints_pkey ON public.password_fingerprints USING btree (fingerprint);

CREATE INDEX pending_carts_created_at_idx ON public.pending_carts USING btree (created_at);

CREATE INDEX pending_carts_expires_idx ON public.pending_carts USING btree (expires_at);

CREATE UNIQUE INDEX pending_carts_pkey ON public.pending_carts USING btree (id);

CREATE INDEX pending_carts_user_idx ON public.pending_carts USING btree (user_id);

CREATE UNIQUE INDEX profiles_loyalty_public_id_key ON public.profiles USING btree (loyalty_public_id);

CREATE UNIQUE INDEX security_events_pkey ON public.security_events USING btree (id);

CREATE UNIQUE INDEX staff_action_logs_pkey ON public.staff_action_logs USING btree (id);

CREATE UNIQUE INDEX stripe_events_pkey ON public.stripe_events USING btree (id);

CREATE UNIQUE INDEX uniq_loyalty_order ON public.loyalty_transactions USING btree (order_id) WHERE (order_id IS NOT NULL);

CREATE UNIQUE INDEX unique_loyalty_public_id ON public.profiles USING btree (loyalty_public_id);

alter table "public"."account_lockouts" add constraint "account_lockouts_pkey" PRIMARY KEY using index "account_lockouts_pkey";

alter table "public"."admin_notifications" add constraint "admin_notifications_pkey" PRIMARY KEY using index "admin_notifications_pkey";

alter table "public"."health_check" add constraint "health_check_pkey" PRIMARY KEY using index "health_check_pkey";

alter table "public"."ip_blocks" add constraint "ip_blocks_pkey" PRIMARY KEY using index "ip_blocks_pkey";

alter table "public"."login_attempts" add constraint "login_attempts_pkey" PRIMARY KEY using index "login_attempts_pkey";

alter table "public"."loyalty_transactions" add constraint "loyalty_transactions_pkey" PRIMARY KEY using index "loyalty_transactions_pkey";

alter table "public"."order_status_audit" add constraint "order_status_audit_pkey" PRIMARY KEY using index "order_status_audit_pkey";

alter table "public"."password_attempts" add constraint "password_attempts_pkey" PRIMARY KEY using index "password_attempts_pkey";

alter table "public"."password_fingerprints" add constraint "password_fingerprints_pkey" PRIMARY KEY using index "password_fingerprints_pkey";

alter table "public"."pending_carts" add constraint "pending_carts_pkey" PRIMARY KEY using index "pending_carts_pkey";

alter table "public"."security_events" add constraint "security_events_pkey" PRIMARY KEY using index "security_events_pkey";

alter table "public"."staff_action_logs" add constraint "staff_action_logs_pkey" PRIMARY KEY using index "staff_action_logs_pkey";

alter table "public"."stripe_events" add constraint "stripe_events_pkey" PRIMARY KEY using index "stripe_events_pkey";

alter table "public"."admin_notifications" add constraint "admin_notifications_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) not valid;

alter table "public"."admin_notifications" validate constraint "admin_notifications_order_id_fkey";

alter table "public"."loyalty_transactions" add constraint "loyalty_transactions_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL not valid;

alter table "public"."loyalty_transactions" validate constraint "loyalty_transactions_order_id_fkey";

alter table "public"."loyalty_transactions" add constraint "loyalty_transactions_transaction_type_check" CHECK ((transaction_type = ANY (ARRAY['earned'::text, 'redeemed'::text, 'bonus'::text, 'expired'::text, 'adjusted'::text]))) not valid;

alter table "public"."loyalty_transactions" validate constraint "loyalty_transactions_transaction_type_check";

alter table "public"."loyalty_transactions" add constraint "loyalty_transactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."loyalty_transactions" validate constraint "loyalty_transactions_user_id_fkey";

alter table "public"."menu_items" add constraint "menu_items_spicy_level_check" CHECK (((spicy_level >= 0) AND (spicy_level <= 5))) not valid;

alter table "public"."menu_items" validate constraint "menu_items_spicy_level_check";

alter table "public"."orders" add constraint "orders_payment_status_check" CHECK ((payment_status = ANY (ARRAY['processing'::text, 'paid'::text, 'failed'::text, 'disputed'::text, 'refunded'::text, 'lost_dispute'::text]))) not valid;

alter table "public"."orders" validate constraint "orders_payment_status_check";

alter table "public"."orders" add constraint "prevent_complete_if_unpaid" CHECK ((NOT ((status = 'completed'::text) AND (payment_status <> 'paid'::text)))) not valid;

alter table "public"."orders" validate constraint "prevent_complete_if_unpaid";

alter table "public"."profiles" add constraint "loyalty_points_non_negative" CHECK ((loyalty_points >= 0)) not valid;

alter table "public"."profiles" validate constraint "loyalty_points_non_negative";

alter table "public"."profiles" add constraint "profiles_loyalty_public_id_key" UNIQUE using index "profiles_loyalty_public_id_key";

alter table "public"."profiles" add constraint "profiles_loyalty_tier_check" CHECK ((loyalty_tier = ANY (ARRAY['bronze'::text, 'silver'::text, 'gold'::text, 'platinum'::text]))) not valid;

alter table "public"."profiles" validate constraint "profiles_loyalty_tier_check";

alter table "public"."profiles" add constraint "unique_loyalty_public_id" UNIQUE using index "unique_loyalty_public_id";

alter table "public"."staff_action_logs" add constraint "fk_staff_order" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE not valid;

alter table "public"."staff_action_logs" validate constraint "fk_staff_order";

alter table "public"."staff_action_logs" add constraint "staff_action_logs_immutable" CHECK (true) NO INHERIT not valid;

alter table "public"."staff_action_logs" validate constraint "staff_action_logs_immutable";

alter table "public"."loyalty_ledger" add constraint "loyalty_ledger_entry_type_check" CHECK ((entry_type = ANY (ARRAY['earn'::text, 'redeem'::text, 'adjustment'::text, 'expiry'::text, 'correction'::text]))) not valid;

alter table "public"."loyalty_ledger" validate constraint "loyalty_ledger_entry_type_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public._deprecated_award_v1(p_user_id uuid, p_points integer, p_admin_id uuid, p_base_points integer, p_tier text, p_tier_mult numeric, p_streak integer, p_streak_mult numeric, p_amount_cents integer, p_order_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(new_balance integer, new_lifetime integer, new_tier text, tier_changed boolean, was_duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RAISE EXCEPTION
    'award_loyalty_points_atomic is deprecated. Use v2_award_points().'
    USING ERRCODE = 'feature_not_supported';
END;
$function$
;

CREATE OR REPLACE FUNCTION public._deprecated_redeem_v1(p_user_id uuid, p_points integer, p_admin_id uuid, p_mode text DEFAULT 'dine_in'::text)
 RETURNS TABLE(new_balance integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RAISE EXCEPTION
    'redeem_loyalty_points_atomic is deprecated. Use v2_redeem_points().'
    USING ERRCODE = 'feature_not_supported';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.award_loyalty_points(p_user_id uuid, p_order_id uuid, p_amount_cents integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile            RECORD;
  v_base_points        integer;
  v_tier_mult          numeric;
  v_streak_mult        numeric;
  v_total_points       integer;
  v_new_streak         integer;
  v_same_day           boolean;
  v_tier_before        text;
  v_tier_after         text;
  v_new_lifetime       integer;
  v_new_balance        integer;
  v_tier_changed       boolean := false;
  v_today              date    := CURRENT_DATE;
BEGIN


  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;


  v_base_points := GREATEST(FLOOR(p_amount_cents::numeric / 100), 0);


  -- Based on LIFETIME points (never decrements, cannot be gamed by spending)
  v_tier_mult := CASE v_profile.loyalty_tier
    WHEN 'platinum' THEN 2.0
    WHEN 'gold'     THEN 1.5
    WHEN 'silver'   THEN 1.25
    ELSE                 1.0   -- bronze
  END;


  v_same_day := (v_profile.last_order_date = v_today);

  IF v_same_day THEN
    v_new_streak := v_profile.loyalty_streak;
  ELSIF v_profile.last_order_date = (v_today - INTERVAL '1 day') THEN
    v_new_streak := v_profile.loyalty_streak + 1;
  ELSE
    v_new_streak := 1;
  END IF;


  v_streak_mult := CASE
    WHEN v_new_streak >= 30 THEN 1.50   -- 30-day fire streak: +50%
    WHEN v_new_streak >= 7  THEN 1.25   -- Weekly streak: +25%
    WHEN v_new_streak >= 3  THEN 1.10   -- 3-day streak: +10%
    ELSE                         1.0
  END;


  v_total_points := GREATEST(
    FLOOR(v_base_points::numeric * v_tier_mult * v_streak_mult),
    0
  );


  v_new_lifetime := v_profile.lifetime_points + v_total_points;
  v_new_balance  := v_profile.loyalty_points  + v_total_points;
  v_tier_before  := v_profile.loyalty_tier;


  -- Tiers are earned by total lifetime spend — never downgraded
  v_tier_after := CASE
    WHEN v_new_lifetime >= 5000 THEN 'platinum'
    WHEN v_new_lifetime >= 2000 THEN 'gold'
    WHEN v_new_lifetime >= 500  THEN 'silver'
    ELSE                             'bronze'
  END;

  v_tier_changed := (v_tier_before <> v_tier_after);


  UPDATE public.profiles
  SET
    loyalty_points  = v_new_balance,
    lifetime_points = v_new_lifetime,
    loyalty_tier    = v_tier_after,
    loyalty_streak  = v_new_streak,
    last_order_date = CASE WHEN v_same_day THEN last_order_date ELSE v_today END,
    updated_at      = now()
  WHERE id = p_user_id;


  INSERT INTO public.loyalty_transactions (
    user_id,
    order_id,
    transaction_type,
    points_delta,
    points_balance,
    lifetime_balance,
    tier_at_time,
    streak_at_time,
    tier_multiplier,
    streak_multiplier,
    base_points,
    metadata
  ) VALUES (
    p_user_id,
    p_order_id,
    'earned',
    v_total_points,
    v_new_balance,
    v_new_lifetime,
    v_tier_after,
    v_new_streak,
    v_tier_mult,
    v_streak_mult,
    v_base_points,
    jsonb_build_object(
      'order_id',         p_order_id,
      'amount_cents',     p_amount_cents,
      'tier_changed',     v_tier_changed,
      'tier_before',      v_tier_before,
      'same_day_order',   v_same_day
    )
  );


  RETURN jsonb_build_object(
    'points_earned',      v_total_points,
    'base_points',        v_base_points,
    'tier_multiplier',    v_tier_mult,
    'streak_multiplier',  v_streak_mult,
    'new_balance',        v_new_balance,
    'new_lifetime',       v_new_lifetime,
    'streak',             v_new_streak,
    'tier',               v_tier_after,
    'tier_changed',       v_tier_changed,
    'tier_before',        v_tier_before,
    'same_day_order',     v_same_day
  );

END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_pending_carts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.pending_carts
  where created_at < now() - interval '30 minutes';
end;
$function$
;

create or replace view "public"."financial_revenue_view" as  SELECT id,
    amount_total,
    payment_status,
    created_at
   FROM public.orders
  WHERE (payment_status = 'paid'::text);


CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.admins
    WHERE user_id = uid
  );
$function$
;

CREATE OR REPLACE FUNCTION public.log_staff_status_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.status is distinct from new.status then
    insert into public.staff_action_logs (
      staff_id,
      action,
      order_id
    )
    values (
      auth.uid(),
      'STATUS_CHANGE:' || old.status || '→' || new.status,
      new.id
    );
  end if;

  return new;
end;
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


CREATE OR REPLACE FUNCTION public.prevent_financial_event_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN

  IF OLD.event_type IN (
    'PAYMENT_RECEIVED',
    'PAYMENT_FAILED',
    'PAYMENT_DISPUTED',
    'PAYMENT_DISPUTE_LOST',
    'PAYMENT_DISPUTE_WON'
  ) THEN
    RAISE EXCEPTION 'Financial events cannot be deleted';
  END IF;

  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_illegal_payment_events()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN

  IF NEW.event_type = 'PAYMENT_RECEIVED' THEN

    IF EXISTS (
      SELECT 1 FROM orders
      WHERE id = NEW.order_id
      AND payment_status IN ('disputed', 'lost_dispute', 'refunded')
    ) THEN
      RAISE EXCEPTION 'Cannot record PAYMENT_RECEIVED after dispute/refund';
    END IF;

  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_illegal_payment_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN

  -- If already disputed/lost/refunded → block changing to paid
  IF OLD.payment_status IN ('disputed', 'lost_dispute', 'refunded')
     AND NEW.payment_status = 'paid' THEN
     
     RAISE EXCEPTION 'Cannot revert payment_status once disputed/refunded';

  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_order_event_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'order_events cannot be deleted (ledger protection)';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_order_event_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'order_events are immutable and cannot be updated';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reconcile_v2_accounts()
 RETURNS TABLE(user_id uuid, v1_balance integer, v2_balance integer, drift integer, v2_account_exists boolean)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT
    p.id                                            AS user_id,
    COALESCE(p.loyalty_points, 0)                  AS v1_balance,
    COALESCE(la.balance, 0)                         AS v2_balance,
    COALESCE(p.loyalty_points, 0)
      - COALESCE(la.balance, 0)                    AS drift,
    (la.id IS NOT NULL)                             AS v2_account_exists
  FROM profiles p
  LEFT JOIN loyalty_accounts la ON la.user_id = p.id
  WHERE COALESCE(p.loyalty_points, 0) <> COALESCE(la.balance, 0)
     OR la.id IS NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.redeem_loyalty_points(p_user_id uuid, p_points integer, p_order_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profile RECORD;
BEGIN
  IF p_points <= 0 THEN
    RAISE EXCEPTION 'Redemption amount must be positive';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_profile.loyalty_points < p_points THEN
    RAISE EXCEPTION 'Insufficient points: balance=%, requested=%',
      v_profile.loyalty_points, p_points;
  END IF;

  UPDATE public.profiles
  SET
    loyalty_points = loyalty_points - p_points,
    updated_at     = now()
  WHERE id = p_user_id;

  INSERT INTO public.loyalty_transactions (
    user_id,
    order_id,
    transaction_type,
    points_delta,
    points_balance,
    lifetime_balance,
    tier_at_time,
    streak_at_time,
    tier_multiplier,
    streak_multiplier,
    base_points
  ) VALUES (
    p_user_id,
    p_order_id,
    'redeemed',
    -(p_points),
    v_profile.loyalty_points - p_points,
    v_profile.lifetime_points,
    v_profile.loyalty_tier,
    v_profile.loyalty_streak,
    1.0,
    1.0,
    p_points
  );

  RETURN jsonb_build_object(
    'redeemed',     p_points,
    'new_balance',  v_profile.loyalty_points - p_points
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.restrict_order_update_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Prevent changing protected columns
  if old.amount_total is distinct from new.amount_total
     or old.currency is distinct from new.currency
     or old.customer_uid is distinct from new.customer_uid
     or old.stripe_session_id is distinct from new.stripe_session_id
     or old.payment_status is distinct from new.payment_status
  then
     raise exception 'Unauthorized column update attempt';
  end if;

  return new;
end;
$function$
;

create or replace view "public"."revenue_summary" as  SELECT sum(amount) AS net_revenue
   FROM public.financial_transactions;


CREATE OR REPLACE FUNCTION public.set_loyalty_public_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.loyalty_public_id IS NULL THEN
    NEW.loyalty_public_id := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_order_status_secure(order_id uuid, new_status text)
 RETURNS public.orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_status text;
  v_payment_status text;
  v_role text;
  v_order public.orders;
BEGIN

  -- Extract role from JWT
  v_role := (auth.jwt() -> 'app_metadata' ->> 'role');

  IF v_role IS NULL THEN
    INSERT INTO public.security_events(
      event_type,
      metadata,
      created_at
    )
    VALUES(
      'UNAUTHORIZED_ATTEMPT',
      jsonb_build_object(
        'order_id', order_id,
        'attempted_status', new_status
      ),
      now()
    );

    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Lock row
  SELECT status, payment_status
  INTO v_current_status, v_payment_status
  FROM public.orders
  WHERE id = order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- LEGAL STATE MACHINE
  IF NOT (
    (v_current_status = 'confirmed' AND new_status IN ('preparing','cancelled')) OR
    (v_current_status = 'preparing' AND new_status IN ('ready','cancelled')) OR
    (v_current_status = 'ready' AND new_status IN ('delivered','cancelled'))
  ) THEN

    INSERT INTO public.security_events(
      event_type,
      metadata,
      created_at
    )
    VALUES(
      'ILLEGAL_STATUS_ATTEMPT',
      jsonb_build_object(
        'order_id', order_id,
        'from', v_current_status,
        'attempted_status', new_status,
        'role', v_role
      ),
      now()
    );

    RAISE EXCEPTION 'Illegal transition';
  END IF;

  -- PAYMENT ENFORCEMENT
  IF new_status = 'delivered' AND v_payment_status <> 'paid' THEN

    INSERT INTO public.security_events(
      event_type,
      metadata,
      created_at
    )
    VALUES(
      'UNPAID_DELIVERY_ATTEMPT',
      jsonb_build_object(
        'order_id', order_id,
        'role', v_role
      ),
      now()
    );

    RAISE EXCEPTION 'Cannot deliver unpaid order';
  END IF;

  -- Perform update
  UPDATE public.orders
  SET status = new_status,
      updated_at = now()
  WHERE id = order_id
  RETURNING * INTO v_order;

  RETURN v_order;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.v2_redeem_points(p_account_id uuid, p_amount integer, p_admin_id uuid, p_reference_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS TABLE(new_balance integer, was_duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_current_balance integer;
  v_new_balance integer;
BEGIN
  -- Lock account row
  SELECT balance
  INTO v_current_balance
  FROM loyalty_accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM loyalty_ledger
      WHERE idempotency_key = p_idempotency_key
    ) THEN
      RETURN QUERY
      SELECT v_current_balance, true;
      RETURN;
    END IF;
  END IF;

  -- Validate sufficient balance
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance'
      USING ERRCODE = '23514';
  END IF;

  v_new_balance := v_current_balance - p_amount;

  -- Insert ledger row
  INSERT INTO loyalty_ledger (
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
  SELECT
    p_account_id,
    -p_amount,
    v_new_balance,
    'redeem',
    'admin',
    p_reference_id,
    p_admin_id,
    p_idempotency_key,
    tier,
    streak,
    jsonb_build_object('v2', true)
  FROM loyalty_accounts
  WHERE id = p_account_id;

  RETURN QUERY
  SELECT v_new_balance, false;

END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.status is distinct from new.status then
    insert into public.order_status_audit (
      order_id,
      old_status,
      new_status,
      changed_by
    )
    values (
      old.id,
      old.status,
      new.status,
      auth.uid()
    );
  end if;

  return new;
end;
$function$
;

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


CREATE OR REPLACE FUNCTION public.v2_award_points(p_user_id uuid, p_amount integer, p_admin_id uuid, p_reference_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS TABLE(new_balance integer, new_lifetime integer, new_tier text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_account loyalty_accounts%ROWTYPE;
  v_new_balance integer;
  v_new_lifetime integer;
  v_new_tier text;
BEGIN

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Award amount must be positive';
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM loyalty_ledger
      WHERE idempotency_key = p_idempotency_key
    ) THEN
      RETURN QUERY
      SELECT balance, lifetime_earned, tier
      FROM loyalty_accounts
      WHERE user_id = p_user_id;
      RETURN;
    END IF;
  END IF;

  -- Lock account row
  SELECT *
  INTO v_account
  FROM loyalty_accounts
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loyalty account not found';
  END IF;

  v_new_balance := v_account.balance + p_amount;
  v_new_lifetime := v_account.lifetime_earned + p_amount;

  -- Tier logic
  v_new_tier :=
    CASE
      WHEN v_new_lifetime >= 5000 THEN 'platinum'
      WHEN v_new_lifetime >= 2000 THEN 'gold'
      WHEN v_new_lifetime >= 500 THEN 'silver'
      ELSE 'bronze'
    END;

  -- Update account
  UPDATE loyalty_accounts
  SET
    balance = v_new_balance,
    lifetime_earned = v_new_lifetime,
    tier = v_new_tier,
    last_activity = now(),
    updated_at = now()
  WHERE id = v_account.id;

  -- Insert ledger entry
  INSERT INTO loyalty_ledger (
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
  ) VALUES (
    v_account.id,
    p_amount,
    v_new_balance,
    'earn',
    'admin',
    p_reference_id,
    p_admin_id,
    p_idempotency_key,
    v_new_tier,
    v_account.streak,
    jsonb_build_object(
      'awarded_at', now()
    )
  );

  RETURN QUERY
  SELECT v_new_balance, v_new_lifetime, v_new_tier;

END;
$function$
;

grant delete on table "public"."account_lockouts" to "anon";

grant insert on table "public"."account_lockouts" to "anon";

grant references on table "public"."account_lockouts" to "anon";

grant select on table "public"."account_lockouts" to "anon";

grant trigger on table "public"."account_lockouts" to "anon";

grant truncate on table "public"."account_lockouts" to "anon";

grant update on table "public"."account_lockouts" to "anon";

grant delete on table "public"."account_lockouts" to "authenticated";

grant insert on table "public"."account_lockouts" to "authenticated";

grant references on table "public"."account_lockouts" to "authenticated";

grant select on table "public"."account_lockouts" to "authenticated";

grant trigger on table "public"."account_lockouts" to "authenticated";

grant truncate on table "public"."account_lockouts" to "authenticated";

grant update on table "public"."account_lockouts" to "authenticated";

grant delete on table "public"."account_lockouts" to "service_role";

grant insert on table "public"."account_lockouts" to "service_role";

grant references on table "public"."account_lockouts" to "service_role";

grant select on table "public"."account_lockouts" to "service_role";

grant trigger on table "public"."account_lockouts" to "service_role";

grant truncate on table "public"."account_lockouts" to "service_role";

grant update on table "public"."account_lockouts" to "service_role";

grant delete on table "public"."admin_notifications" to "anon";

grant insert on table "public"."admin_notifications" to "anon";

grant references on table "public"."admin_notifications" to "anon";

grant select on table "public"."admin_notifications" to "anon";

grant trigger on table "public"."admin_notifications" to "anon";

grant truncate on table "public"."admin_notifications" to "anon";

grant update on table "public"."admin_notifications" to "anon";

grant delete on table "public"."admin_notifications" to "authenticated";

grant insert on table "public"."admin_notifications" to "authenticated";

grant references on table "public"."admin_notifications" to "authenticated";

grant select on table "public"."admin_notifications" to "authenticated";

grant trigger on table "public"."admin_notifications" to "authenticated";

grant truncate on table "public"."admin_notifications" to "authenticated";

grant update on table "public"."admin_notifications" to "authenticated";

grant delete on table "public"."admin_notifications" to "service_role";

grant insert on table "public"."admin_notifications" to "service_role";

grant references on table "public"."admin_notifications" to "service_role";

grant select on table "public"."admin_notifications" to "service_role";

grant trigger on table "public"."admin_notifications" to "service_role";

grant truncate on table "public"."admin_notifications" to "service_role";

grant update on table "public"."admin_notifications" to "service_role";

grant delete on table "public"."health_check" to "anon";

grant insert on table "public"."health_check" to "anon";

grant references on table "public"."health_check" to "anon";

grant select on table "public"."health_check" to "anon";

grant trigger on table "public"."health_check" to "anon";

grant truncate on table "public"."health_check" to "anon";

grant update on table "public"."health_check" to "anon";

grant delete on table "public"."health_check" to "authenticated";

grant insert on table "public"."health_check" to "authenticated";

grant references on table "public"."health_check" to "authenticated";

grant select on table "public"."health_check" to "authenticated";

grant trigger on table "public"."health_check" to "authenticated";

grant truncate on table "public"."health_check" to "authenticated";

grant update on table "public"."health_check" to "authenticated";

grant delete on table "public"."health_check" to "service_role";

grant insert on table "public"."health_check" to "service_role";

grant references on table "public"."health_check" to "service_role";

grant select on table "public"."health_check" to "service_role";

grant trigger on table "public"."health_check" to "service_role";

grant truncate on table "public"."health_check" to "service_role";

grant update on table "public"."health_check" to "service_role";

grant delete on table "public"."ip_blocks" to "anon";

grant insert on table "public"."ip_blocks" to "anon";

grant references on table "public"."ip_blocks" to "anon";

grant select on table "public"."ip_blocks" to "anon";

grant trigger on table "public"."ip_blocks" to "anon";

grant truncate on table "public"."ip_blocks" to "anon";

grant update on table "public"."ip_blocks" to "anon";

grant delete on table "public"."ip_blocks" to "authenticated";

grant insert on table "public"."ip_blocks" to "authenticated";

grant references on table "public"."ip_blocks" to "authenticated";

grant select on table "public"."ip_blocks" to "authenticated";

grant trigger on table "public"."ip_blocks" to "authenticated";

grant truncate on table "public"."ip_blocks" to "authenticated";

grant update on table "public"."ip_blocks" to "authenticated";

grant delete on table "public"."ip_blocks" to "service_role";

grant insert on table "public"."ip_blocks" to "service_role";

grant references on table "public"."ip_blocks" to "service_role";

grant select on table "public"."ip_blocks" to "service_role";

grant trigger on table "public"."ip_blocks" to "service_role";

grant truncate on table "public"."ip_blocks" to "service_role";

grant update on table "public"."ip_blocks" to "service_role";

grant delete on table "public"."login_attempts" to "anon";

grant insert on table "public"."login_attempts" to "anon";

grant references on table "public"."login_attempts" to "anon";

grant select on table "public"."login_attempts" to "anon";

grant trigger on table "public"."login_attempts" to "anon";

grant truncate on table "public"."login_attempts" to "anon";

grant update on table "public"."login_attempts" to "anon";

grant delete on table "public"."login_attempts" to "authenticated";

grant insert on table "public"."login_attempts" to "authenticated";

grant references on table "public"."login_attempts" to "authenticated";

grant select on table "public"."login_attempts" to "authenticated";

grant trigger on table "public"."login_attempts" to "authenticated";

grant truncate on table "public"."login_attempts" to "authenticated";

grant update on table "public"."login_attempts" to "authenticated";

grant delete on table "public"."login_attempts" to "service_role";

grant insert on table "public"."login_attempts" to "service_role";

grant references on table "public"."login_attempts" to "service_role";

grant select on table "public"."login_attempts" to "service_role";

grant trigger on table "public"."login_attempts" to "service_role";

grant truncate on table "public"."login_attempts" to "service_role";

grant update on table "public"."login_attempts" to "service_role";

grant delete on table "public"."loyalty_transactions" to "anon";

grant insert on table "public"."loyalty_transactions" to "anon";

grant references on table "public"."loyalty_transactions" to "anon";

grant select on table "public"."loyalty_transactions" to "anon";

grant trigger on table "public"."loyalty_transactions" to "anon";

grant truncate on table "public"."loyalty_transactions" to "anon";

grant update on table "public"."loyalty_transactions" to "anon";

grant delete on table "public"."loyalty_transactions" to "authenticated";

grant insert on table "public"."loyalty_transactions" to "authenticated";

grant references on table "public"."loyalty_transactions" to "authenticated";

grant select on table "public"."loyalty_transactions" to "authenticated";

grant trigger on table "public"."loyalty_transactions" to "authenticated";

grant truncate on table "public"."loyalty_transactions" to "authenticated";

grant update on table "public"."loyalty_transactions" to "authenticated";

grant delete on table "public"."loyalty_transactions" to "service_role";

grant insert on table "public"."loyalty_transactions" to "service_role";

grant references on table "public"."loyalty_transactions" to "service_role";

grant select on table "public"."loyalty_transactions" to "service_role";

grant trigger on table "public"."loyalty_transactions" to "service_role";

grant truncate on table "public"."loyalty_transactions" to "service_role";

grant update on table "public"."loyalty_transactions" to "service_role";

grant delete on table "public"."order_status_audit" to "anon";

grant insert on table "public"."order_status_audit" to "anon";

grant references on table "public"."order_status_audit" to "anon";

grant select on table "public"."order_status_audit" to "anon";

grant trigger on table "public"."order_status_audit" to "anon";

grant truncate on table "public"."order_status_audit" to "anon";

grant update on table "public"."order_status_audit" to "anon";

grant insert on table "public"."order_status_audit" to "authenticated";

grant references on table "public"."order_status_audit" to "authenticated";

grant select on table "public"."order_status_audit" to "authenticated";

grant trigger on table "public"."order_status_audit" to "authenticated";

grant truncate on table "public"."order_status_audit" to "authenticated";

grant delete on table "public"."order_status_audit" to "service_role";

grant insert on table "public"."order_status_audit" to "service_role";

grant references on table "public"."order_status_audit" to "service_role";

grant select on table "public"."order_status_audit" to "service_role";

grant trigger on table "public"."order_status_audit" to "service_role";

grant truncate on table "public"."order_status_audit" to "service_role";

grant update on table "public"."order_status_audit" to "service_role";

grant delete on table "public"."password_attempts" to "anon";

grant insert on table "public"."password_attempts" to "anon";

grant references on table "public"."password_attempts" to "anon";

grant select on table "public"."password_attempts" to "anon";

grant trigger on table "public"."password_attempts" to "anon";

grant truncate on table "public"."password_attempts" to "anon";

grant update on table "public"."password_attempts" to "anon";

grant delete on table "public"."password_attempts" to "authenticated";

grant insert on table "public"."password_attempts" to "authenticated";

grant references on table "public"."password_attempts" to "authenticated";

grant select on table "public"."password_attempts" to "authenticated";

grant trigger on table "public"."password_attempts" to "authenticated";

grant truncate on table "public"."password_attempts" to "authenticated";

grant update on table "public"."password_attempts" to "authenticated";

grant delete on table "public"."password_attempts" to "service_role";

grant insert on table "public"."password_attempts" to "service_role";

grant references on table "public"."password_attempts" to "service_role";

grant select on table "public"."password_attempts" to "service_role";

grant trigger on table "public"."password_attempts" to "service_role";

grant truncate on table "public"."password_attempts" to "service_role";

grant update on table "public"."password_attempts" to "service_role";

grant delete on table "public"."password_fingerprints" to "anon";

grant insert on table "public"."password_fingerprints" to "anon";

grant references on table "public"."password_fingerprints" to "anon";

grant select on table "public"."password_fingerprints" to "anon";

grant trigger on table "public"."password_fingerprints" to "anon";

grant truncate on table "public"."password_fingerprints" to "anon";

grant update on table "public"."password_fingerprints" to "anon";

grant delete on table "public"."password_fingerprints" to "authenticated";

grant insert on table "public"."password_fingerprints" to "authenticated";

grant references on table "public"."password_fingerprints" to "authenticated";

grant select on table "public"."password_fingerprints" to "authenticated";

grant trigger on table "public"."password_fingerprints" to "authenticated";

grant truncate on table "public"."password_fingerprints" to "authenticated";

grant update on table "public"."password_fingerprints" to "authenticated";

grant delete on table "public"."password_fingerprints" to "service_role";

grant insert on table "public"."password_fingerprints" to "service_role";

grant references on table "public"."password_fingerprints" to "service_role";

grant select on table "public"."password_fingerprints" to "service_role";

grant trigger on table "public"."password_fingerprints" to "service_role";

grant truncate on table "public"."password_fingerprints" to "service_role";

grant update on table "public"."password_fingerprints" to "service_role";

grant delete on table "public"."pending_carts" to "anon";

grant insert on table "public"."pending_carts" to "anon";

grant references on table "public"."pending_carts" to "anon";

grant select on table "public"."pending_carts" to "anon";

grant trigger on table "public"."pending_carts" to "anon";

grant truncate on table "public"."pending_carts" to "anon";

grant update on table "public"."pending_carts" to "anon";

grant delete on table "public"."pending_carts" to "authenticated";

grant insert on table "public"."pending_carts" to "authenticated";

grant references on table "public"."pending_carts" to "authenticated";

grant select on table "public"."pending_carts" to "authenticated";

grant trigger on table "public"."pending_carts" to "authenticated";

grant truncate on table "public"."pending_carts" to "authenticated";

grant update on table "public"."pending_carts" to "authenticated";

grant delete on table "public"."pending_carts" to "service_role";

grant insert on table "public"."pending_carts" to "service_role";

grant references on table "public"."pending_carts" to "service_role";

grant select on table "public"."pending_carts" to "service_role";

grant trigger on table "public"."pending_carts" to "service_role";

grant truncate on table "public"."pending_carts" to "service_role";

grant update on table "public"."pending_carts" to "service_role";

grant delete on table "public"."security_events" to "anon";

grant insert on table "public"."security_events" to "anon";

grant references on table "public"."security_events" to "anon";

grant select on table "public"."security_events" to "anon";

grant trigger on table "public"."security_events" to "anon";

grant truncate on table "public"."security_events" to "anon";

grant update on table "public"."security_events" to "anon";

grant delete on table "public"."security_events" to "authenticated";

grant insert on table "public"."security_events" to "authenticated";

grant references on table "public"."security_events" to "authenticated";

grant select on table "public"."security_events" to "authenticated";

grant trigger on table "public"."security_events" to "authenticated";

grant truncate on table "public"."security_events" to "authenticated";

grant update on table "public"."security_events" to "authenticated";

grant delete on table "public"."security_events" to "service_role";

grant insert on table "public"."security_events" to "service_role";

grant references on table "public"."security_events" to "service_role";

grant select on table "public"."security_events" to "service_role";

grant trigger on table "public"."security_events" to "service_role";

grant truncate on table "public"."security_events" to "service_role";

grant update on table "public"."security_events" to "service_role";

grant delete on table "public"."staff_action_logs" to "anon";

grant insert on table "public"."staff_action_logs" to "anon";

grant references on table "public"."staff_action_logs" to "anon";

grant select on table "public"."staff_action_logs" to "anon";

grant trigger on table "public"."staff_action_logs" to "anon";

grant truncate on table "public"."staff_action_logs" to "anon";

grant update on table "public"."staff_action_logs" to "anon";

grant insert on table "public"."staff_action_logs" to "authenticated";

grant references on table "public"."staff_action_logs" to "authenticated";

grant select on table "public"."staff_action_logs" to "authenticated";

grant trigger on table "public"."staff_action_logs" to "authenticated";

grant truncate on table "public"."staff_action_logs" to "authenticated";

grant delete on table "public"."staff_action_logs" to "service_role";

grant insert on table "public"."staff_action_logs" to "service_role";

grant references on table "public"."staff_action_logs" to "service_role";

grant select on table "public"."staff_action_logs" to "service_role";

grant trigger on table "public"."staff_action_logs" to "service_role";

grant truncate on table "public"."staff_action_logs" to "service_role";

grant update on table "public"."staff_action_logs" to "service_role";

grant delete on table "public"."stripe_events" to "anon";

grant insert on table "public"."stripe_events" to "anon";

grant references on table "public"."stripe_events" to "anon";

grant select on table "public"."stripe_events" to "anon";

grant trigger on table "public"."stripe_events" to "anon";

grant truncate on table "public"."stripe_events" to "anon";

grant update on table "public"."stripe_events" to "anon";

grant delete on table "public"."stripe_events" to "authenticated";

grant insert on table "public"."stripe_events" to "authenticated";

grant references on table "public"."stripe_events" to "authenticated";

grant select on table "public"."stripe_events" to "authenticated";

grant trigger on table "public"."stripe_events" to "authenticated";

grant truncate on table "public"."stripe_events" to "authenticated";

grant update on table "public"."stripe_events" to "authenticated";

grant delete on table "public"."stripe_events" to "service_role";

grant insert on table "public"."stripe_events" to "service_role";

grant references on table "public"."stripe_events" to "service_role";

grant select on table "public"."stripe_events" to "service_role";

grant trigger on table "public"."stripe_events" to "service_role";

grant truncate on table "public"."stripe_events" to "service_role";

grant update on table "public"."stripe_events" to "service_role";


  create policy "Service role only"
  on "public"."account_lockouts"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "Admins read contact"
  on "public"."contact_messages"
  as permissive
  for select
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "Public insert contact"
  on "public"."contact_messages"
  as permissive
  for insert
  to anon
with check (((name IS NOT NULL) AND (email IS NOT NULL) AND (message IS NOT NULL) AND (length(name) <= 200) AND (length(email) <= 320) AND (length(message) <= 2000)));



  create policy "Service role full access"
  on "public"."contact_messages"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "Admin read fraud_logs"
  on "public"."fraud_logs"
  as permissive
  for select
  to authenticated
using ((((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text));



  create policy "fraud_logs_no_direct_insert"
  on "public"."fraud_logs"
  as permissive
  for insert
  to authenticated
with check (false);



  create policy "Public health read"
  on "public"."health_check"
  as permissive
  for select
  to anon
using (true);



  create policy "Service role only"
  on "public"."ip_blocks"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "no public access"
  on "public"."login_attempts"
  as permissive
  for all
  to anon
using (false);



  create policy "deny_all"
  on "public"."loyalty_transactions"
  as permissive
  for all
  to public
using (false);



  create policy "loyalty_transactions: deny authenticated delete"
  on "public"."loyalty_transactions"
  as permissive
  for delete
  to authenticated
using (false);



  create policy "loyalty_transactions: deny authenticated insert"
  on "public"."loyalty_transactions"
  as permissive
  for insert
  to authenticated
with check (false);



  create policy "loyalty_transactions: deny authenticated update"
  on "public"."loyalty_transactions"
  as permissive
  for update
  to authenticated
using (false);



  create policy "loyalty_transactions: users read own"
  on "public"."loyalty_transactions"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "loyalty_tx_admin_read"
  on "public"."loyalty_transactions"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text)))));



  create policy "loyalty_tx_read_own"
  on "public"."loyalty_transactions"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "loyalty_tx_service_role"
  on "public"."loyalty_transactions"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "Admin read order_events"
  on "public"."order_events"
  as permissive
  for select
  to authenticated
using ((((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text));



  create policy "order_events_no_direct_insert"
  on "public"."order_events"
  as permissive
  for insert
  to authenticated
with check (false);



  create policy "Admin read order_status_audit"
  on "public"."order_status_audit"
  as permissive
  for select
  to authenticated
using ((((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text));



  create policy "order_status_audit_no_direct_insert"
  on "public"."order_status_audit"
  as permissive
  for insert
  to authenticated
with check (false);



  create policy "Orders can be updated only via RPC"
  on "public"."orders"
  as permissive
  for update
  to authenticated
using (false)
with check (false);



  create policy "Orders read access"
  on "public"."orders"
  as permissive
  for select
  to authenticated
using (((((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'kitchen'::text, 'expo'::text])) OR (customer_uid = ( SELECT auth.uid() AS uid))));



  create policy "no public access"
  on "public"."password_attempts"
  as permissive
  for all
  to anon
using (false);



  create policy "service_role_only"
  on "public"."password_fingerprints"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "Service role full access"
  on "public"."pending_carts"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "Users delete own cart"
  on "public"."pending_carts"
  as permissive
  for delete
  to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Users insert own cart"
  on "public"."pending_carts"
  as permissive
  for insert
  to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Users read own cart"
  on "public"."pending_carts"
  as permissive
  for select
  to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Users update own cart"
  on "public"."pending_carts"
  as permissive
  for update
  to authenticated
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));



  create policy "pending_carts: deny authenticated update"
  on "public"."pending_carts"
  as permissive
  for update
  to authenticated
using (false);



  create policy "pending_carts: deny authenticated write"
  on "public"."pending_carts"
  as permissive
  for insert
  to authenticated
with check (false);



  create policy "pending_carts: users read own"
  on "public"."pending_carts"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "Service role full access"
  on "public"."profiles"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "promo_redemptions: deny authenticated delete"
  on "public"."promo_redemptions"
  as permissive
  for delete
  to authenticated
using (false);



  create policy "promo_redemptions: deny authenticated insert"
  on "public"."promo_redemptions"
  as permissive
  for insert
  to authenticated
with check (false);



  create policy "promo_redemptions: deny authenticated update"
  on "public"."promo_redemptions"
  as permissive
  for update
  to authenticated
using (false);



  create policy "Admins can read staff logs"
  on "public"."staff_action_logs"
  as permissive
  for select
  to authenticated
using ((((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text));



  create policy "service_role_only"
  on "public"."stripe_events"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "Users insert own profile"
  on "public"."profiles"
  as permissive
  for insert
  to authenticated
with check ((( SELECT auth.uid() AS uid) = id));



  create policy "Users read own profile"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using ((( SELECT auth.uid() AS uid) = id));



  create policy "Users update own profile"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using ((( SELECT auth.uid() AS uid) = id))
with check ((( SELECT auth.uid() AS uid) = id));


CREATE TRIGGER prevent_financial_event_delete_trigger BEFORE DELETE ON public.order_events FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_event_delete();

CREATE TRIGGER prevent_order_event_delete_trigger BEFORE DELETE ON public.order_events FOR EACH ROW EXECUTE FUNCTION public.prevent_order_event_delete();

CREATE TRIGGER prevent_order_event_update_trigger BEFORE UPDATE ON public.order_events FOR EACH ROW EXECUTE FUNCTION public.prevent_order_event_update();

CREATE TRIGGER prevent_payment_reversal_event_trigger BEFORE INSERT ON public.order_events FOR EACH ROW EXECUTE FUNCTION public.prevent_illegal_payment_events();

CREATE TRIGGER order_status_audit_trigger AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();

CREATE TRIGGER prevent_payment_status_reversal BEFORE UPDATE ON public.orders FOR EACH ROW WHEN ((old.payment_status IS DISTINCT FROM new.payment_status)) EXECUTE FUNCTION public.prevent_illegal_payment_status_change();

CREATE TRIGGER trigger_log_staff_status AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_staff_status_update();

CREATE TRIGGER trg_set_loyalty_public_id BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_loyalty_public_id();


