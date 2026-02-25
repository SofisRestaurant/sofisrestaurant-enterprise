drop trigger if exists "trg_touch_order_updated_at" on "public"."orders";

drop policy "Admins can read admin list" on "public"."admins";

drop policy "Allow public insert" on "public"."contact_messages";

drop policy "Allow public select" on "public"."menu_items";

drop policy "Only admins can delete menu items" on "public"."menu_items";

drop policy "Only admins can insert" on "public"."menu_items";

drop policy "Only admins can update" on "public"."menu_items";

drop policy "Admins can view all order events" on "public"."order_events";

drop policy "Customers can view their order events" on "public"."order_events";

drop policy "Service role can insert events" on "public"."order_events";

drop policy "Staff can view assigned order events" on "public"."order_events";

drop policy "Users can insert events" on "public"."order_events";

drop policy "Users can view their own orders" on "public"."orders";

drop policy "Webhook inserts only" on "public"."orders";

drop policy "profiles_select_own" on "public"."profiles";

drop policy "profiles_update_own" on "public"."profiles";

drop policy "profiles_insert_own" on "public"."profiles";

alter table "public"."order_events" drop constraint "order_events_user_id_fkey";

alter table "public"."order_events" drop constraint "valid_event_type";

alter table "public"."orders" drop constraint "orders_fulfillment_type_check";

alter table "public"."orders" drop constraint "orders_stripe_session_unique";

alter table "public"."orders" drop constraint "orders_status_check";

drop function if exists "public"."record_order_event"(p_order_id uuid, p_event_type text, p_event_data jsonb, p_user_id uuid);

drop function if exists "public"."touch_order_updated_at"();

drop view if exists "public"."order_performance";

drop view if exists "public"."order_timeline";

drop index if exists "public"."idx_order_events_data";

drop index if exists "public"."idx_order_events_event_type";

drop index if exists "public"."idx_order_events_order_time";

drop index if exists "public"."idx_order_events_order_type";

drop index if exists "public"."idx_order_events_user_id";

drop index if exists "public"."idx_orders_assigned_cook";

drop index if exists "public"."idx_orders_assigned_driver";

drop index if exists "public"."idx_orders_estimated_ready_time";

drop index if exists "public"."idx_orders_fulfillment_type";

drop index if exists "public"."idx_orders_location_id";

drop index if exists "public"."idx_orders_order_number";

drop index if exists "public"."orders_stripe_session_unique";


  create table "public"."daily_order_counter" (
    "day" date not null,
    "last_number" integer not null
      );


alter table "public"."daily_order_counter" enable row level security;


  create table "public"."fraud_logs" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "reason" text not null,
    "frontend_total" integer,
    "server_total" integer,
    "metadata" jsonb,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."fraud_logs" enable row level security;

alter table "public"."order_events" alter column "created_at" drop not null;

alter table "public"."orders" drop column "actual_ready_time";

alter table "public"."orders" drop column "assigned_cook";

alter table "public"."orders" drop column "assigned_driver";

alter table "public"."orders" drop column "estimated_ready_time";

alter table "public"."orders" drop column "fulfillment_type";

alter table "public"."orders" drop column "location_id";

alter table "public"."orders" add column "assigned_to" text;

alter table "public"."orders" add column "metadata" jsonb;

alter table "public"."orders" add column "notes" text;

alter table "public"."orders" alter column "order_number" set data type integer using "order_number"::integer;

alter table "public"."orders" alter column "order_type" set default 'food'::text;

alter table "public"."orders" alter column "payment_status" set default 'paid'::text;

CREATE UNIQUE INDEX daily_order_counter_pkey ON public.daily_order_counter USING btree (day);

CREATE UNIQUE INDEX fraud_logs_pkey ON public.fraud_logs USING btree (id);

alter table "public"."daily_order_counter" add constraint "daily_order_counter_pkey" PRIMARY KEY using index "daily_order_counter_pkey";

alter table "public"."fraud_logs" add constraint "fraud_logs_pkey" PRIMARY KEY using index "fraud_logs_pkey";

alter table "public"."orders" add constraint "orders_status_check" CHECK ((status = ANY (ARRAY['confirmed'::text, 'preparing'::text, 'ready'::text, 'completed'::text, 'cancelled'::text, 'shipped'::text, 'delivered'::text]))) not valid;

alter table "public"."orders" validate constraint "orders_status_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.auto_log_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event_data JSONB;
BEGIN
  -- Only if status changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    
    v_event_data := jsonb_build_object(
      'old_status', OLD.status,
      'new_status', NEW.status,
      'order_number', NEW.order_number,
      'total', NEW.amount_total,
      'customer_uid', NEW.customer_uid
    );

    INSERT INTO public.order_events (
      order_id,
      event_type,
      event_data,
      user_id
    )
    VALUES (
      NEW.id,
      'STATUS_CHANGED',
      v_event_data,
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  claims jsonb;
  user_role text := 'customer';
  uid text;
begin
  claims := event->'claims';

  -- try different places safely
  uid := coalesce(
    event->>'user_id',
    event->>'sub',
    event->'claims'->>'sub'
  );

  -- only query if uid exists
  if uid is not null then
    select role into user_role
    from public.profiles
    where id::text = uid;

    if user_role is null then
      user_role := 'customer';
    end if;
  end if;

  -- inject role
  claims := jsonb_set(claims, '{role}', to_jsonb(user_role));

  return jsonb_set(event, '{claims}', claims);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_next_order_number()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  next_number INTEGER;
BEGIN
  LOOP
    UPDATE public.daily_order_counter
    SET last_number = last_number + 1
    WHERE day = CURRENT_DATE
    RETURNING last_number INTO next_number;

    IF FOUND THEN
      RETURN next_number;
    END IF;

    BEGIN
      INSERT INTO public.daily_order_counter(day, last_number)
      VALUES (CURRENT_DATE, 1);
      RETURN 1;
    EXCEPTION WHEN unique_violation THEN
      -- someone else inserted, retry
    END;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_order_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin

  -- ORDER CREATED
  if tg_op = 'INSERT' then
    insert into public.order_events (
      order_id,
      event_type,
      event_data,
      user_id
    ) values (
      new.id,
      'ORDER_CREATED',
      jsonb_build_object(
        'total', new.amount_total,
        'currency', new.currency,
        'order_type', new.order_type
      ),
      null
    );
    return new;
  end if;

  -- STATUS CHANGED
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    
    -- Generic status change
    insert into public.order_events (
      order_id,
      event_type,
      event_data,
      user_id
    ) values (
      new.id,
      'STATUS_CHANGED',
      jsonb_build_object(
        'previous_status', old.status,
        'new_status', new.status
      ),
      null
    );

    -- Specific status events
    if new.status = 'preparing' then
      insert into public.order_events (order_id, event_type)
      values (new.id, 'PREPARING_STARTED');
    end if;

    if new.status = 'ready' then
      insert into public.order_events (order_id, event_type)
      values (new.id, 'READY_FOR_PICKUP');
    end if;

    if new.status = 'completed' then
      insert into public.order_events (order_id, event_type)
      values (new.id, 'COMPLETED');
    end if;

  end if;

  -- STAFF ASSIGNED
  if tg_op = 'UPDATE' and new.assigned_to is distinct from old.assigned_to then
    insert into public.order_events (
      order_id,
      event_type,
      event_data
    ) values (
      new.id,
      'COOK_ASSIGNED',
      jsonb_build_object(
        'assigned_to', new.assigned_to
      )
    );
  end if;

  -- NOTE ADDED
  if tg_op = 'UPDATE' and new.metadata is distinct from old.metadata then
    insert into public.order_events (
      order_id,
      event_type
    ) values (
      new.id,
      'NOTE_ADDED'
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.log_order_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Only log if status actually changed
  if old.status is distinct from new.status then
    
    insert into public.order_events (
      order_id,
      event_type,
      event_data,
      created_at
    )
    values (
      new.id,
      case
        when new.status = 'confirmed' then 'ORDER_CONFIRMED'
        when new.status = 'preparing' then 'PREPARING_STARTED'
        when new.status = 'ready' then 'READY_FOR_PICKUP'
        when new.status = 'completed' then 'COMPLETED'
        when new.status = 'cancelled' then 'ORDER_CANCELLED'
        else 'STATUS_CHANGED'
      end,
      jsonb_build_object(
        'previous_status', old.status,
        'new_status', new.status,
        'updated_by', auth.uid()
      ),
      now()
    );

  end if;

  return new;
end;
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
    insert into public.order_events (
      order_id,
      event_type,
      event_data,
      created_at
    )
    values (
      new.id,
      'STATUS_CHANGED',
      jsonb_build_object(
        'previous_status', old.status,
        'new_status', new.status,
        'changed_by', auth.uid()
      ),
      now()
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_order_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := public.get_next_order_number();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, role)
  values (new.id, 'customer');
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


grant delete on table "public"."daily_order_counter" to "anon";

grant insert on table "public"."daily_order_counter" to "anon";

grant references on table "public"."daily_order_counter" to "anon";

grant select on table "public"."daily_order_counter" to "anon";

grant trigger on table "public"."daily_order_counter" to "anon";

grant truncate on table "public"."daily_order_counter" to "anon";

grant update on table "public"."daily_order_counter" to "anon";

grant delete on table "public"."daily_order_counter" to "authenticated";

grant insert on table "public"."daily_order_counter" to "authenticated";

grant references on table "public"."daily_order_counter" to "authenticated";

grant select on table "public"."daily_order_counter" to "authenticated";

grant trigger on table "public"."daily_order_counter" to "authenticated";

grant truncate on table "public"."daily_order_counter" to "authenticated";

grant update on table "public"."daily_order_counter" to "authenticated";

grant delete on table "public"."daily_order_counter" to "service_role";

grant insert on table "public"."daily_order_counter" to "service_role";

grant references on table "public"."daily_order_counter" to "service_role";

grant select on table "public"."daily_order_counter" to "service_role";

grant trigger on table "public"."daily_order_counter" to "service_role";

grant truncate on table "public"."daily_order_counter" to "service_role";

grant update on table "public"."daily_order_counter" to "service_role";

grant delete on table "public"."fraud_logs" to "anon";

grant insert on table "public"."fraud_logs" to "anon";

grant references on table "public"."fraud_logs" to "anon";

grant select on table "public"."fraud_logs" to "anon";

grant trigger on table "public"."fraud_logs" to "anon";

grant truncate on table "public"."fraud_logs" to "anon";

grant update on table "public"."fraud_logs" to "anon";

grant delete on table "public"."fraud_logs" to "authenticated";

grant insert on table "public"."fraud_logs" to "authenticated";

grant references on table "public"."fraud_logs" to "authenticated";

grant select on table "public"."fraud_logs" to "authenticated";

grant trigger on table "public"."fraud_logs" to "authenticated";

grant truncate on table "public"."fraud_logs" to "authenticated";

grant update on table "public"."fraud_logs" to "authenticated";

grant delete on table "public"."fraud_logs" to "service_role";

grant insert on table "public"."fraud_logs" to "service_role";

grant references on table "public"."fraud_logs" to "service_role";

grant select on table "public"."fraud_logs" to "service_role";

grant trigger on table "public"."fraud_logs" to "service_role";

grant truncate on table "public"."fraud_logs" to "service_role";

grant update on table "public"."fraud_logs" to "service_role";


  create policy "admins_read"
  on "public"."admins"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text)))));



  create policy "contact_admin_read"
  on "public"."contact_messages"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text)))));



  create policy "contact_insert_public"
  on "public"."contact_messages"
  as permissive
  for insert
  to anon
with check (((name IS NOT NULL) AND (email IS NOT NULL) AND (message IS NOT NULL)));



  create policy "contact_read_admin"
  on "public"."contact_messages"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text)))));



  create policy "Admins can read daily counter"
  on "public"."daily_order_counter"
  as permissive
  for select
  to authenticated
using (((( SELECT auth.jwt() AS jwt) ->> 'role'::text) = 'admin'::text));



  create policy "admins_read_fraud_logs"
  on "public"."fraud_logs"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text)))));



  create policy "menu_admin_delete"
  on "public"."menu_items"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text)))));



  create policy "menu_read_public"
  on "public"."menu_items"
  as permissive
  for select
  to public
using (true);



  create policy "Service role full access"
  on "public"."order_events"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "block_direct_inserts"
  on "public"."order_events"
  as permissive
  for insert
  to authenticated
with check (false);



  create policy "order_events_read_policy"
  on "public"."order_events"
  as permissive
  for select
  to authenticated
using (((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = ( SELECT auth.uid() AS uid))) = ANY (ARRAY['admin'::text, 'staff'::text])) OR (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_events.order_id) AND (o.customer_uid = ( SELECT auth.uid() AS uid)))))));



  create policy "Admins read all orders"
  on "public"."orders"
  as permissive
  for select
  to public
using (((auth.jwt() ->> 'role'::text) = 'admin'::text));



  create policy "Temporary allow read all"
  on "public"."orders"
  as permissive
  for select
  to public
using (true);



  create policy "orders_no_direct_insert"
  on "public"."orders"
  as permissive
  for insert
  to authenticated
with check (false);



  create policy "orders_select"
  on "public"."orders"
  as permissive
  for select
  to public
using (((customer_uid = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text))))));



  create policy "orders_update_admin"
  on "public"."orders"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text)))));



  create policy "Users insert own profile"
  on "public"."profiles"
  as permissive
  for insert
  to public
with check ((id = auth.uid()));



  create policy "Users read own profile"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((id = auth.uid()));



  create policy "Users update own profile"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((id = auth.uid()));



  create policy "profiles_insert_own"
  on "public"."profiles"
  as permissive
  for insert
  to public
with check ((( SELECT auth.uid() AS uid) = id));


CREATE TRIGGER order_event_trigger AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_order_event();

CREATE TRIGGER order_status_trigger AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();

CREATE TRIGGER trigger_auto_log_order_status_change AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.auto_log_order_status_change();

CREATE TRIGGER trigger_log_order_event AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_order_event();

CREATE TRIGGER trigger_set_order_number BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_order_number();


