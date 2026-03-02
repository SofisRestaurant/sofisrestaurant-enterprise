create extension if not exists "pg_cron" with schema "pg_catalog";

create schema if not exists "analytics";

create schema if not exists "internal";

create type "public"."menu_category" as enum ('appetizers', 'entrees', 'desserts', 'drinks', 'lunch', 'breakfast', 'specials');

drop policy "fraud_logs_no_direct_insert" on "public"."fraud_logs";

drop policy "no public access" on "public"."login_attempts";

drop policy "loyalty_accounts: deny authenticated delete" on "public"."loyalty_accounts";

drop policy "loyalty_accounts: deny authenticated insert" on "public"."loyalty_accounts";

drop policy "loyalty_accounts: deny authenticated update" on "public"."loyalty_accounts";

drop policy "loyalty_accounts: service role full access" on "public"."loyalty_accounts";

drop policy "loyalty_accounts: users read own" on "public"."loyalty_accounts";

drop policy "loyalty_ledger: deny all authenticated writes" on "public"."loyalty_ledger";

drop policy "loyalty_ledger: deny authenticated delete" on "public"."loyalty_ledger";

drop policy "loyalty_ledger: deny authenticated update" on "public"."loyalty_ledger";

drop policy "loyalty_ledger: service role full access" on "public"."loyalty_ledger";

drop policy "loyalty_ledger: users read own" on "public"."loyalty_ledger";

drop policy "deny_all" on "public"."loyalty_transactions";

drop policy "loyalty_transactions: deny authenticated delete" on "public"."loyalty_transactions";

drop policy "loyalty_transactions: deny authenticated insert" on "public"."loyalty_transactions";

drop policy "loyalty_transactions: deny authenticated update" on "public"."loyalty_transactions";

drop policy "loyalty_transactions: users read own" on "public"."loyalty_transactions";

drop policy "loyalty_tx_admin_read" on "public"."loyalty_transactions";

drop policy "loyalty_tx_read_own" on "public"."loyalty_transactions";

drop policy "loyalty_tx_service_role" on "public"."loyalty_transactions";

drop policy "menu_admin_delete" on "public"."menu_items";

drop policy "menu_read_public" on "public"."menu_items";

drop policy "Orders can be updated only via RPC" on "public"."orders";

drop policy "Orders read access" on "public"."orders";

drop policy "orders_no_direct_insert" on "public"."orders";

drop policy "no public access" on "public"."password_attempts";

drop policy "Service role full access" on "public"."pending_carts";

drop policy "Users delete own cart" on "public"."pending_carts";

drop policy "Users insert own cart" on "public"."pending_carts";

drop policy "Users read own cart" on "public"."pending_carts";

drop policy "Users update own cart" on "public"."pending_carts";

drop policy "pending_carts: deny authenticated update" on "public"."pending_carts";

drop policy "pending_carts: deny authenticated write" on "public"."pending_carts";

drop policy "pending_carts: users read own" on "public"."pending_carts";

drop policy "Service role full access" on "public"."profiles";

drop policy "Users insert own profile" on "public"."profiles";

drop policy "Users read own profile" on "public"."profiles";

drop policy "Users update own profile" on "public"."profiles";

drop policy "promo_redemptions: deny authenticated delete" on "public"."promo_redemptions";

drop policy "promo_redemptions: deny authenticated insert" on "public"."promo_redemptions";

drop policy "promo_redemptions: deny authenticated update" on "public"."promo_redemptions";

drop policy "promotions: deny authenticated read" on "public"."promotions";

drop policy "promotions: deny public read" on "public"."promotions";

drop policy "user_credits: deny authenticated delete" on "public"."user_credits";

drop policy "user_credits: deny authenticated insert" on "public"."user_credits";

drop policy "user_credits: deny authenticated update" on "public"."user_credits";

drop policy "user_credits: users read own" on "public"."user_credits";

drop policy "admins_read" on "public"."admins";

drop policy "Admins can read daily counter" on "public"."daily_order_counter";

drop policy "Admin read fraud_logs" on "public"."fraud_logs";

drop policy "Admin read order_events" on "public"."order_events";

drop policy "Admin read order_status_audit" on "public"."order_status_audit";

drop policy "promo_redemptions: users read own" on "public"."promo_redemptions";

drop policy "Admins can read staff logs" on "public"."staff_action_logs";

revoke delete on table "public"."account_lockouts" from "anon";

revoke insert on table "public"."account_lockouts" from "anon";

revoke references on table "public"."account_lockouts" from "anon";

revoke select on table "public"."account_lockouts" from "anon";

revoke trigger on table "public"."account_lockouts" from "anon";

revoke truncate on table "public"."account_lockouts" from "anon";

revoke update on table "public"."account_lockouts" from "anon";

revoke delete on table "public"."account_lockouts" from "authenticated";

revoke insert on table "public"."account_lockouts" from "authenticated";

revoke references on table "public"."account_lockouts" from "authenticated";

revoke select on table "public"."account_lockouts" from "authenticated";

revoke trigger on table "public"."account_lockouts" from "authenticated";

revoke truncate on table "public"."account_lockouts" from "authenticated";

revoke update on table "public"."account_lockouts" from "authenticated";

revoke delete on table "public"."admin_notifications" from "anon";

revoke insert on table "public"."admin_notifications" from "anon";

revoke references on table "public"."admin_notifications" from "anon";

revoke select on table "public"."admin_notifications" from "anon";

revoke trigger on table "public"."admin_notifications" from "anon";

revoke truncate on table "public"."admin_notifications" from "anon";

revoke update on table "public"."admin_notifications" from "anon";

revoke delete on table "public"."admin_notifications" from "authenticated";

revoke insert on table "public"."admin_notifications" from "authenticated";

revoke references on table "public"."admin_notifications" from "authenticated";

revoke select on table "public"."admin_notifications" from "authenticated";

revoke trigger on table "public"."admin_notifications" from "authenticated";

revoke truncate on table "public"."admin_notifications" from "authenticated";

revoke update on table "public"."admin_notifications" from "authenticated";

revoke delete on table "public"."admin_profit_snapshot" from "anon";

revoke insert on table "public"."admin_profit_snapshot" from "anon";

revoke references on table "public"."admin_profit_snapshot" from "anon";

revoke select on table "public"."admin_profit_snapshot" from "anon";

revoke trigger on table "public"."admin_profit_snapshot" from "anon";

revoke truncate on table "public"."admin_profit_snapshot" from "anon";

revoke update on table "public"."admin_profit_snapshot" from "anon";

revoke delete on table "public"."admin_profit_snapshot" from "authenticated";

revoke insert on table "public"."admin_profit_snapshot" from "authenticated";

revoke references on table "public"."admin_profit_snapshot" from "authenticated";

revoke select on table "public"."admin_profit_snapshot" from "authenticated";

revoke trigger on table "public"."admin_profit_snapshot" from "authenticated";

revoke truncate on table "public"."admin_profit_snapshot" from "authenticated";

revoke update on table "public"."admin_profit_snapshot" from "authenticated";

revoke delete on table "public"."admins" from "anon";

revoke insert on table "public"."admins" from "anon";

revoke references on table "public"."admins" from "anon";

revoke select on table "public"."admins" from "anon";

revoke trigger on table "public"."admins" from "anon";

revoke truncate on table "public"."admins" from "anon";

revoke update on table "public"."admins" from "anon";

revoke delete on table "public"."admins" from "authenticated";

revoke insert on table "public"."admins" from "authenticated";

revoke references on table "public"."admins" from "authenticated";

revoke select on table "public"."admins" from "authenticated";

revoke trigger on table "public"."admins" from "authenticated";

revoke truncate on table "public"."admins" from "authenticated";

revoke update on table "public"."admins" from "authenticated";

revoke delete on table "public"."contact_messages" from "anon";

revoke references on table "public"."contact_messages" from "anon";

revoke select on table "public"."contact_messages" from "anon";

revoke trigger on table "public"."contact_messages" from "anon";

revoke truncate on table "public"."contact_messages" from "anon";

revoke update on table "public"."contact_messages" from "anon";

revoke delete on table "public"."contact_messages" from "authenticated";

revoke insert on table "public"."contact_messages" from "authenticated";

revoke references on table "public"."contact_messages" from "authenticated";

revoke select on table "public"."contact_messages" from "authenticated";

revoke trigger on table "public"."contact_messages" from "authenticated";

revoke truncate on table "public"."contact_messages" from "authenticated";

revoke update on table "public"."contact_messages" from "authenticated";

revoke delete on table "public"."daily_order_counter" from "anon";

revoke insert on table "public"."daily_order_counter" from "anon";

revoke references on table "public"."daily_order_counter" from "anon";

revoke select on table "public"."daily_order_counter" from "anon";

revoke trigger on table "public"."daily_order_counter" from "anon";

revoke truncate on table "public"."daily_order_counter" from "anon";

revoke update on table "public"."daily_order_counter" from "anon";

revoke delete on table "public"."daily_order_counter" from "authenticated";

revoke insert on table "public"."daily_order_counter" from "authenticated";

revoke references on table "public"."daily_order_counter" from "authenticated";

revoke select on table "public"."daily_order_counter" from "authenticated";

revoke trigger on table "public"."daily_order_counter" from "authenticated";

revoke truncate on table "public"."daily_order_counter" from "authenticated";

revoke update on table "public"."daily_order_counter" from "authenticated";

revoke delete on table "public"."financial_transactions" from "anon";

revoke insert on table "public"."financial_transactions" from "anon";

revoke references on table "public"."financial_transactions" from "anon";

revoke select on table "public"."financial_transactions" from "anon";

revoke trigger on table "public"."financial_transactions" from "anon";

revoke truncate on table "public"."financial_transactions" from "anon";

revoke update on table "public"."financial_transactions" from "anon";

revoke delete on table "public"."financial_transactions" from "authenticated";

revoke insert on table "public"."financial_transactions" from "authenticated";

revoke references on table "public"."financial_transactions" from "authenticated";

revoke select on table "public"."financial_transactions" from "authenticated";

revoke trigger on table "public"."financial_transactions" from "authenticated";

revoke truncate on table "public"."financial_transactions" from "authenticated";

revoke update on table "public"."financial_transactions" from "authenticated";

revoke delete on table "public"."fraud_logs" from "anon";

revoke insert on table "public"."fraud_logs" from "anon";

revoke references on table "public"."fraud_logs" from "anon";

revoke select on table "public"."fraud_logs" from "anon";

revoke trigger on table "public"."fraud_logs" from "anon";

revoke truncate on table "public"."fraud_logs" from "anon";

revoke update on table "public"."fraud_logs" from "anon";

revoke delete on table "public"."fraud_logs" from "authenticated";

revoke insert on table "public"."fraud_logs" from "authenticated";

revoke references on table "public"."fraud_logs" from "authenticated";

revoke select on table "public"."fraud_logs" from "authenticated";

revoke trigger on table "public"."fraud_logs" from "authenticated";

revoke truncate on table "public"."fraud_logs" from "authenticated";

revoke update on table "public"."fraud_logs" from "authenticated";

revoke delete on table "public"."health_check" from "anon";

revoke insert on table "public"."health_check" from "anon";

revoke references on table "public"."health_check" from "anon";

revoke trigger on table "public"."health_check" from "anon";

revoke truncate on table "public"."health_check" from "anon";

revoke update on table "public"."health_check" from "anon";

revoke delete on table "public"."health_check" from "authenticated";

revoke insert on table "public"."health_check" from "authenticated";

revoke references on table "public"."health_check" from "authenticated";

revoke select on table "public"."health_check" from "authenticated";

revoke trigger on table "public"."health_check" from "authenticated";

revoke truncate on table "public"."health_check" from "authenticated";

revoke update on table "public"."health_check" from "authenticated";

revoke delete on table "public"."ip_blocks" from "anon";

revoke insert on table "public"."ip_blocks" from "anon";

revoke references on table "public"."ip_blocks" from "anon";

revoke select on table "public"."ip_blocks" from "anon";

revoke trigger on table "public"."ip_blocks" from "anon";

revoke truncate on table "public"."ip_blocks" from "anon";

revoke update on table "public"."ip_blocks" from "anon";

revoke delete on table "public"."ip_blocks" from "authenticated";

revoke insert on table "public"."ip_blocks" from "authenticated";

revoke references on table "public"."ip_blocks" from "authenticated";

revoke select on table "public"."ip_blocks" from "authenticated";

revoke trigger on table "public"."ip_blocks" from "authenticated";

revoke truncate on table "public"."ip_blocks" from "authenticated";

revoke update on table "public"."ip_blocks" from "authenticated";

revoke delete on table "public"."login_attempts" from "anon";

revoke insert on table "public"."login_attempts" from "anon";

revoke references on table "public"."login_attempts" from "anon";

revoke select on table "public"."login_attempts" from "anon";

revoke trigger on table "public"."login_attempts" from "anon";

revoke truncate on table "public"."login_attempts" from "anon";

revoke update on table "public"."login_attempts" from "anon";

revoke delete on table "public"."login_attempts" from "authenticated";

revoke insert on table "public"."login_attempts" from "authenticated";

revoke references on table "public"."login_attempts" from "authenticated";

revoke select on table "public"."login_attempts" from "authenticated";

revoke trigger on table "public"."login_attempts" from "authenticated";

revoke truncate on table "public"."login_attempts" from "authenticated";

revoke update on table "public"."login_attempts" from "authenticated";

revoke delete on table "public"."loyalty_accounts" from "anon";

revoke insert on table "public"."loyalty_accounts" from "anon";

revoke references on table "public"."loyalty_accounts" from "anon";

revoke select on table "public"."loyalty_accounts" from "anon";

revoke trigger on table "public"."loyalty_accounts" from "anon";

revoke truncate on table "public"."loyalty_accounts" from "anon";

revoke update on table "public"."loyalty_accounts" from "anon";

revoke delete on table "public"."loyalty_accounts" from "authenticated";

revoke insert on table "public"."loyalty_accounts" from "authenticated";

revoke references on table "public"."loyalty_accounts" from "authenticated";

revoke trigger on table "public"."loyalty_accounts" from "authenticated";

revoke truncate on table "public"."loyalty_accounts" from "authenticated";

revoke update on table "public"."loyalty_accounts" from "authenticated";

revoke delete on table "public"."loyalty_ledger" from "anon";

revoke insert on table "public"."loyalty_ledger" from "anon";

revoke references on table "public"."loyalty_ledger" from "anon";

revoke select on table "public"."loyalty_ledger" from "anon";

revoke trigger on table "public"."loyalty_ledger" from "anon";

revoke truncate on table "public"."loyalty_ledger" from "anon";

revoke update on table "public"."loyalty_ledger" from "anon";

revoke insert on table "public"."loyalty_ledger" from "authenticated";

revoke references on table "public"."loyalty_ledger" from "authenticated";

revoke trigger on table "public"."loyalty_ledger" from "authenticated";

revoke truncate on table "public"."loyalty_ledger" from "authenticated";

revoke delete on table "public"."loyalty_transactions" from "anon";

revoke insert on table "public"."loyalty_transactions" from "anon";

revoke references on table "public"."loyalty_transactions" from "anon";

revoke select on table "public"."loyalty_transactions" from "anon";

revoke trigger on table "public"."loyalty_transactions" from "anon";

revoke truncate on table "public"."loyalty_transactions" from "anon";

revoke update on table "public"."loyalty_transactions" from "anon";

revoke delete on table "public"."loyalty_transactions" from "authenticated";

revoke insert on table "public"."loyalty_transactions" from "authenticated";

revoke references on table "public"."loyalty_transactions" from "authenticated";

revoke trigger on table "public"."loyalty_transactions" from "authenticated";

revoke truncate on table "public"."loyalty_transactions" from "authenticated";

revoke update on table "public"."loyalty_transactions" from "authenticated";

revoke delete on table "public"."menu_items" from "anon";

revoke insert on table "public"."menu_items" from "anon";

revoke references on table "public"."menu_items" from "anon";

revoke trigger on table "public"."menu_items" from "anon";

revoke truncate on table "public"."menu_items" from "anon";

revoke update on table "public"."menu_items" from "anon";

revoke delete on table "public"."menu_items" from "authenticated";

revoke insert on table "public"."menu_items" from "authenticated";

revoke references on table "public"."menu_items" from "authenticated";

revoke select on table "public"."menu_items" from "authenticated";

revoke trigger on table "public"."menu_items" from "authenticated";

revoke truncate on table "public"."menu_items" from "authenticated";

revoke update on table "public"."menu_items" from "authenticated";

revoke delete on table "public"."order_events" from "anon";

revoke insert on table "public"."order_events" from "anon";

revoke references on table "public"."order_events" from "anon";

revoke select on table "public"."order_events" from "anon";

revoke trigger on table "public"."order_events" from "anon";

revoke truncate on table "public"."order_events" from "anon";

revoke update on table "public"."order_events" from "anon";

revoke delete on table "public"."order_events" from "authenticated";

revoke insert on table "public"."order_events" from "authenticated";

revoke references on table "public"."order_events" from "authenticated";

revoke select on table "public"."order_events" from "authenticated";

revoke trigger on table "public"."order_events" from "authenticated";

revoke truncate on table "public"."order_events" from "authenticated";

revoke update on table "public"."order_events" from "authenticated";

revoke delete on table "public"."order_status_audit" from "anon";

revoke insert on table "public"."order_status_audit" from "anon";

revoke references on table "public"."order_status_audit" from "anon";

revoke select on table "public"."order_status_audit" from "anon";

revoke trigger on table "public"."order_status_audit" from "anon";

revoke truncate on table "public"."order_status_audit" from "anon";

revoke update on table "public"."order_status_audit" from "anon";

revoke delete on table "public"."order_status_audit" from "authenticated";

revoke insert on table "public"."order_status_audit" from "authenticated";

revoke references on table "public"."order_status_audit" from "authenticated";

revoke select on table "public"."order_status_audit" from "authenticated";

revoke trigger on table "public"."order_status_audit" from "authenticated";

revoke truncate on table "public"."order_status_audit" from "authenticated";

revoke update on table "public"."order_status_audit" from "authenticated";

revoke delete on table "public"."orders" from "anon";

revoke insert on table "public"."orders" from "anon";

revoke references on table "public"."orders" from "anon";

revoke select on table "public"."orders" from "anon";

revoke trigger on table "public"."orders" from "anon";

revoke truncate on table "public"."orders" from "anon";

revoke update on table "public"."orders" from "anon";

revoke delete on table "public"."orders" from "authenticated";

revoke insert on table "public"."orders" from "authenticated";

revoke references on table "public"."orders" from "authenticated";

revoke trigger on table "public"."orders" from "authenticated";

revoke truncate on table "public"."orders" from "authenticated";

revoke update on table "public"."orders" from "authenticated";

revoke delete on table "public"."password_attempts" from "anon";

revoke insert on table "public"."password_attempts" from "anon";

revoke references on table "public"."password_attempts" from "anon";

revoke select on table "public"."password_attempts" from "anon";

revoke trigger on table "public"."password_attempts" from "anon";

revoke truncate on table "public"."password_attempts" from "anon";

revoke update on table "public"."password_attempts" from "anon";

revoke delete on table "public"."password_attempts" from "authenticated";

revoke insert on table "public"."password_attempts" from "authenticated";

revoke references on table "public"."password_attempts" from "authenticated";

revoke select on table "public"."password_attempts" from "authenticated";

revoke trigger on table "public"."password_attempts" from "authenticated";

revoke truncate on table "public"."password_attempts" from "authenticated";

revoke update on table "public"."password_attempts" from "authenticated";

revoke delete on table "public"."password_fingerprints" from "anon";

revoke insert on table "public"."password_fingerprints" from "anon";

revoke references on table "public"."password_fingerprints" from "anon";

revoke select on table "public"."password_fingerprints" from "anon";

revoke trigger on table "public"."password_fingerprints" from "anon";

revoke truncate on table "public"."password_fingerprints" from "anon";

revoke update on table "public"."password_fingerprints" from "anon";

revoke delete on table "public"."password_fingerprints" from "authenticated";

revoke insert on table "public"."password_fingerprints" from "authenticated";

revoke references on table "public"."password_fingerprints" from "authenticated";

revoke select on table "public"."password_fingerprints" from "authenticated";

revoke trigger on table "public"."password_fingerprints" from "authenticated";

revoke truncate on table "public"."password_fingerprints" from "authenticated";

revoke update on table "public"."password_fingerprints" from "authenticated";

revoke delete on table "public"."pending_carts" from "anon";

revoke insert on table "public"."pending_carts" from "anon";

revoke references on table "public"."pending_carts" from "anon";

revoke select on table "public"."pending_carts" from "anon";

revoke trigger on table "public"."pending_carts" from "anon";

revoke truncate on table "public"."pending_carts" from "anon";

revoke update on table "public"."pending_carts" from "anon";

revoke delete on table "public"."pending_carts" from "authenticated";

revoke insert on table "public"."pending_carts" from "authenticated";

revoke references on table "public"."pending_carts" from "authenticated";

revoke select on table "public"."pending_carts" from "authenticated";

revoke trigger on table "public"."pending_carts" from "authenticated";

revoke truncate on table "public"."pending_carts" from "authenticated";

revoke update on table "public"."pending_carts" from "authenticated";

revoke delete on table "public"."profiles" from "anon";

revoke insert on table "public"."profiles" from "anon";

revoke references on table "public"."profiles" from "anon";

revoke select on table "public"."profiles" from "anon";

revoke trigger on table "public"."profiles" from "anon";

revoke truncate on table "public"."profiles" from "anon";

revoke update on table "public"."profiles" from "anon";

revoke delete on table "public"."profiles" from "authenticated";

revoke insert on table "public"."profiles" from "authenticated";

revoke references on table "public"."profiles" from "authenticated";

revoke trigger on table "public"."profiles" from "authenticated";

revoke truncate on table "public"."profiles" from "authenticated";

revoke delete on table "public"."promo_redemptions" from "anon";

revoke insert on table "public"."promo_redemptions" from "anon";

revoke references on table "public"."promo_redemptions" from "anon";

revoke select on table "public"."promo_redemptions" from "anon";

revoke trigger on table "public"."promo_redemptions" from "anon";

revoke truncate on table "public"."promo_redemptions" from "anon";

revoke update on table "public"."promo_redemptions" from "anon";

revoke delete on table "public"."promo_redemptions" from "authenticated";

revoke insert on table "public"."promo_redemptions" from "authenticated";

revoke references on table "public"."promo_redemptions" from "authenticated";

revoke select on table "public"."promo_redemptions" from "authenticated";

revoke trigger on table "public"."promo_redemptions" from "authenticated";

revoke truncate on table "public"."promo_redemptions" from "authenticated";

revoke update on table "public"."promo_redemptions" from "authenticated";

revoke delete on table "public"."promotions" from "anon";

revoke insert on table "public"."promotions" from "anon";

revoke references on table "public"."promotions" from "anon";

revoke select on table "public"."promotions" from "anon";

revoke trigger on table "public"."promotions" from "anon";

revoke truncate on table "public"."promotions" from "anon";

revoke update on table "public"."promotions" from "anon";

revoke delete on table "public"."promotions" from "authenticated";

revoke insert on table "public"."promotions" from "authenticated";

revoke references on table "public"."promotions" from "authenticated";

revoke select on table "public"."promotions" from "authenticated";

revoke trigger on table "public"."promotions" from "authenticated";

revoke truncate on table "public"."promotions" from "authenticated";

revoke update on table "public"."promotions" from "authenticated";

revoke delete on table "public"."security_events" from "anon";

revoke insert on table "public"."security_events" from "anon";

revoke references on table "public"."security_events" from "anon";

revoke select on table "public"."security_events" from "anon";

revoke trigger on table "public"."security_events" from "anon";

revoke truncate on table "public"."security_events" from "anon";

revoke update on table "public"."security_events" from "anon";

revoke delete on table "public"."security_events" from "authenticated";

revoke insert on table "public"."security_events" from "authenticated";

revoke references on table "public"."security_events" from "authenticated";

revoke select on table "public"."security_events" from "authenticated";

revoke trigger on table "public"."security_events" from "authenticated";

revoke truncate on table "public"."security_events" from "authenticated";

revoke update on table "public"."security_events" from "authenticated";

revoke delete on table "public"."staff_action_logs" from "anon";

revoke insert on table "public"."staff_action_logs" from "anon";

revoke references on table "public"."staff_action_logs" from "anon";

revoke select on table "public"."staff_action_logs" from "anon";

revoke trigger on table "public"."staff_action_logs" from "anon";

revoke truncate on table "public"."staff_action_logs" from "anon";

revoke update on table "public"."staff_action_logs" from "anon";

revoke delete on table "public"."staff_action_logs" from "authenticated";

revoke insert on table "public"."staff_action_logs" from "authenticated";

revoke references on table "public"."staff_action_logs" from "authenticated";

revoke select on table "public"."staff_action_logs" from "authenticated";

revoke trigger on table "public"."staff_action_logs" from "authenticated";

revoke truncate on table "public"."staff_action_logs" from "authenticated";

revoke update on table "public"."staff_action_logs" from "authenticated";

revoke delete on table "public"."stripe_events" from "anon";

revoke insert on table "public"."stripe_events" from "anon";

revoke references on table "public"."stripe_events" from "anon";

revoke select on table "public"."stripe_events" from "anon";

revoke trigger on table "public"."stripe_events" from "anon";

revoke truncate on table "public"."stripe_events" from "anon";

revoke update on table "public"."stripe_events" from "anon";

revoke delete on table "public"."stripe_events" from "authenticated";

revoke insert on table "public"."stripe_events" from "authenticated";

revoke references on table "public"."stripe_events" from "authenticated";

revoke select on table "public"."stripe_events" from "authenticated";

revoke trigger on table "public"."stripe_events" from "authenticated";

revoke truncate on table "public"."stripe_events" from "authenticated";

revoke update on table "public"."stripe_events" from "authenticated";

revoke delete on table "public"."user_credits" from "anon";

revoke insert on table "public"."user_credits" from "anon";

revoke references on table "public"."user_credits" from "anon";

revoke select on table "public"."user_credits" from "anon";

revoke trigger on table "public"."user_credits" from "anon";

revoke truncate on table "public"."user_credits" from "anon";

revoke update on table "public"."user_credits" from "anon";

revoke delete on table "public"."user_credits" from "authenticated";

revoke insert on table "public"."user_credits" from "authenticated";

revoke references on table "public"."user_credits" from "authenticated";

revoke select on table "public"."user_credits" from "authenticated";

revoke trigger on table "public"."user_credits" from "authenticated";

revoke truncate on table "public"."user_credits" from "authenticated";

revoke update on table "public"."user_credits" from "authenticated";

alter table "public"."profiles" drop constraint "unique_loyalty_public_id";

drop view if exists "public"."admin_executive_snapshot";

drop view if exists "public"."admin_fraud_snapshot";

drop view if exists "public"."admin_hourly_heatmap";

drop view if exists "public"."admin_item_consumption";

drop view if exists "public"."admin_loyalty_liability";

drop view if exists "public"."admin_loyalty_summary";

drop view if exists "public"."admin_revenue_summary";

drop view if exists "public"."admin_risk_snapshot";

drop function if exists "public"."v2_award_points"(p_account_id uuid, p_amount integer, p_admin_id uuid, p_reference_id uuid, p_idempotency_key text);

drop function if exists "public"."verify_loyalty_hash_chain"();

drop view if exists "public"."financial_revenue_view";

drop view if exists "public"."loyalty_leaderboard";

drop view if exists "public"."order_performance";

drop view if exists "public"."order_timeline";

drop index if exists "public"."unique_loyalty_public_id";


  create table "internal"."admin_access_logs" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "ip_address" text,
    "endpoint" text,
    "created_at" timestamp with time zone default now()
      );



  create table "internal"."admin_rate_limits" (
    "user_id" uuid not null,
    "window_start" timestamp with time zone,
    "request_count" integer
      );



  create table "internal"."audit_log" (
    "id" uuid not null default gen_random_uuid(),
    "table_name" text,
    "operation" text,
    "old_row" jsonb,
    "new_row" jsonb,
    "changed_by" uuid,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."abandoned_cart_sessions" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "email" text,
    "cart_value_cents" integer,
    "last_activity" timestamp with time zone,
    "recovered" boolean default false,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."abandoned_cart_sessions" enable row level security;


  create table "public"."ai_insights" (
    "id" uuid not null default gen_random_uuid(),
    "category" text not null,
    "title" text not null,
    "body" text not null,
    "impact_pct" numeric,
    "confidence" numeric,
    "applied" boolean default false,
    "created_at" timestamp with time zone default now()
      );



  create table "public"."checkout_rate_limits" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "ip" text,
    "attempts" integer not null default 1,
    "last_attempt_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."checkout_rate_limits" enable row level security;


  create table "public"."cost_of_goods" (
    "menu_item_id" uuid not null,
    "cost_cents" integer not null,
    "last_updated" timestamp with time zone default now()
      );


alter table "public"."cost_of_goods" enable row level security;


  create table "public"."discount_optimizer_rules" (
    "id" uuid not null default gen_random_uuid(),
    "min_margin_percent" numeric,
    "min_conversion_rate" numeric,
    "suggested_discount" numeric,
    "active" boolean default true
      );


alter table "public"."discount_optimizer_rules" enable row level security;


  create table "public"."discount_predictions" (
    "id" uuid not null default gen_random_uuid(),
    "day_of_week" integer,
    "hour" integer,
    "avg_conversion" numeric,
    "avg_margin" numeric,
    "recommended_discount" numeric,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."discount_predictions" enable row level security;


  create table "public"."growth_campaigns" (
    "id" uuid not null default gen_random_uuid(),
    "name" text,
    "channel" text,
    "budget_cents" integer,
    "spent_cents" integer default 0,
    "revenue_cents" integer default 0,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."growth_campaigns" enable row level security;


  create table "public"."menu_item_modifier_groups" (
    "id" uuid not null default gen_random_uuid(),
    "menu_item_id" uuid not null,
    "modifier_group_id" uuid not null,
    "sort_order" integer not null default 0
      );


alter table "public"."menu_item_modifier_groups" enable row level security;


  create table "public"."modifier_costs" (
    "modifier_id" uuid not null,
    "cost_cents" integer not null,
    "last_updated" timestamp with time zone default now()
      );


alter table "public"."modifier_costs" enable row level security;


  create table "public"."modifier_groups" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "description" text,
    "type" text not null,
    "required" boolean not null default false,
    "min_selections" integer,
    "max_selections" integer,
    "sort_order" integer not null default 0,
    "active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."modifier_groups" enable row level security;


  create table "public"."modifiers" (
    "id" uuid not null default gen_random_uuid(),
    "modifier_group_id" uuid not null,
    "name" text not null,
    "price_adjustment" numeric(10,2) not null default 0,
    "available" boolean not null default true,
    "sort_order" integer not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."modifiers" enable row level security;


  create table "public"."promotion_expirations" (
    "id" uuid not null default gen_random_uuid(),
    "promotion_id" uuid,
    "expired_at" timestamp with time zone default now()
      );


alter table "public"."promotion_expirations" enable row level security;


  create table "public"."smart_discounts" (
    "id" uuid not null default gen_random_uuid(),
    "day_of_week" integer,
    "start_hour" integer,
    "end_hour" integer,
    "type" text,
    "value" numeric,
    "active" boolean default true
      );


alter table "public"."smart_discounts" enable row level security;

alter table "public"."admin_notifications" enable row level security;

alter table "public"."financial_transactions" enable row level security;

alter table "public"."loyalty_transactions" alter column "order_id" set not null;

alter table "public"."menu_items" add column "inventory_count" integer;

alter table "public"."menu_items" add column "low_stock_threshold" integer default 5;

alter table "public"."menu_items" add column "pairs_with" uuid[];

alter table "public"."menu_items" add column "popularity_score" integer default 0;

alter table "public"."menu_items" add column "updated_at" timestamp with time zone default now();

alter table "public"."menu_items" alter column "category" set data type public.menu_category using "category"::public.menu_category;

alter table "public"."promo_redemptions" add column "channel" text;

alter table "public"."promo_redemptions" add column "order_total_cents" integer;

alter table "public"."promotions" add column "campaign_id" uuid;

alter table "public"."promotions" add column "channel" text;

alter table "public"."promotions" add column "cost_center" text;

alter table "public"."promotions" add column "ends_at" timestamp with time zone;

alter table "public"."promotions" add column "geo_target" text;

alter table "public"."promotions" add column "starts_at" timestamp with time zone;

alter table "public"."security_events" enable row level security;

CREATE UNIQUE INDEX admin_access_logs_pkey ON internal.admin_access_logs USING btree (id);

CREATE UNIQUE INDEX admin_rate_limits_pkey ON internal.admin_rate_limits USING btree (user_id);

CREATE UNIQUE INDEX audit_log_pkey ON internal.audit_log USING btree (id);

CREATE UNIQUE INDEX abandoned_cart_sessions_pkey ON public.abandoned_cart_sessions USING btree (id);

CREATE INDEX ai_insights_confidence_idx ON public.ai_insights USING btree (confidence DESC);

CREATE UNIQUE INDEX ai_insights_pkey ON public.ai_insights USING btree (id);

CREATE INDEX checkout_rate_limits_ip_idx ON public.checkout_rate_limits USING btree (ip);

CREATE UNIQUE INDEX checkout_rate_limits_pkey ON public.checkout_rate_limits USING btree (id);

CREATE INDEX checkout_rate_limits_user_id_idx ON public.checkout_rate_limits USING btree (user_id);

CREATE UNIQUE INDEX cost_of_goods_pkey ON public.cost_of_goods USING btree (menu_item_id);

CREATE UNIQUE INDEX discount_optimizer_rules_pkey ON public.discount_optimizer_rules USING btree (id);

CREATE UNIQUE INDEX discount_predictions_pkey ON public.discount_predictions USING btree (id);

CREATE UNIQUE INDEX growth_campaigns_pkey ON public.growth_campaigns USING btree (id);

CREATE INDEX idx_admin_notifications_order_id ON public.admin_notifications USING btree (order_id);

CREATE INDEX idx_financial_transactions_order_id ON public.financial_transactions USING btree (order_id);

CREATE INDEX idx_loyalty_entry_type ON public.loyalty_ledger USING btree (entry_type);

CREATE INDEX idx_menu_item_modifier_groups_modifier_group_id ON public.menu_item_modifier_groups USING btree (modifier_group_id);

CREATE INDEX idx_modifiers_modifier_group_id ON public.modifiers USING btree (modifier_group_id);

CREATE INDEX idx_orders_created_paid ON public.orders USING btree (created_at) WHERE (payment_status = 'paid'::text);

CREATE INDEX idx_orders_payment_status ON public.orders USING btree (payment_status);

CREATE INDEX idx_orders_status_created ON public.orders USING btree (status, created_at DESC);

CREATE INDEX idx_staff_action_logs_order_id ON public.staff_action_logs USING btree (order_id);

CREATE UNIQUE INDEX loyalty_unique_award ON public.loyalty_transactions USING btree (order_id, transaction_type) WHERE (transaction_type = 'earned'::text);

CREATE UNIQUE INDEX menu_item_modifier_groups_menu_item_id_modifier_group_id_key ON public.menu_item_modifier_groups USING btree (menu_item_id, modifier_group_id);

CREATE UNIQUE INDEX menu_item_modifier_groups_pkey ON public.menu_item_modifier_groups USING btree (id);

CREATE UNIQUE INDEX modifier_costs_pkey ON public.modifier_costs USING btree (modifier_id);

CREATE UNIQUE INDEX modifier_groups_pkey ON public.modifier_groups USING btree (id);

CREATE UNIQUE INDEX modifiers_pkey ON public.modifiers USING btree (id);

CREATE UNIQUE INDEX promotion_expirations_pkey ON public.promotion_expirations USING btree (id);

CREATE UNIQUE INDEX smart_discounts_pkey ON public.smart_discounts USING btree (id);

alter table "internal"."admin_access_logs" add constraint "admin_access_logs_pkey" PRIMARY KEY using index "admin_access_logs_pkey";

alter table "internal"."admin_rate_limits" add constraint "admin_rate_limits_pkey" PRIMARY KEY using index "admin_rate_limits_pkey";

alter table "internal"."audit_log" add constraint "audit_log_pkey" PRIMARY KEY using index "audit_log_pkey";

alter table "public"."abandoned_cart_sessions" add constraint "abandoned_cart_sessions_pkey" PRIMARY KEY using index "abandoned_cart_sessions_pkey";

alter table "public"."ai_insights" add constraint "ai_insights_pkey" PRIMARY KEY using index "ai_insights_pkey";

alter table "public"."checkout_rate_limits" add constraint "checkout_rate_limits_pkey" PRIMARY KEY using index "checkout_rate_limits_pkey";

alter table "public"."cost_of_goods" add constraint "cost_of_goods_pkey" PRIMARY KEY using index "cost_of_goods_pkey";

alter table "public"."discount_optimizer_rules" add constraint "discount_optimizer_rules_pkey" PRIMARY KEY using index "discount_optimizer_rules_pkey";

alter table "public"."discount_predictions" add constraint "discount_predictions_pkey" PRIMARY KEY using index "discount_predictions_pkey";

alter table "public"."growth_campaigns" add constraint "growth_campaigns_pkey" PRIMARY KEY using index "growth_campaigns_pkey";

alter table "public"."menu_item_modifier_groups" add constraint "menu_item_modifier_groups_pkey" PRIMARY KEY using index "menu_item_modifier_groups_pkey";

alter table "public"."modifier_costs" add constraint "modifier_costs_pkey" PRIMARY KEY using index "modifier_costs_pkey";

alter table "public"."modifier_groups" add constraint "modifier_groups_pkey" PRIMARY KEY using index "modifier_groups_pkey";

alter table "public"."modifiers" add constraint "modifiers_pkey" PRIMARY KEY using index "modifiers_pkey";

alter table "public"."promotion_expirations" add constraint "promotion_expirations_pkey" PRIMARY KEY using index "promotion_expirations_pkey";

alter table "public"."smart_discounts" add constraint "smart_discounts_pkey" PRIMARY KEY using index "smart_discounts_pkey";

alter table "public"."cost_of_goods" add constraint "cost_non_negative" CHECK ((cost_cents >= 0)) not valid;

alter table "public"."cost_of_goods" validate constraint "cost_non_negative";

alter table "public"."cost_of_goods" add constraint "cost_of_goods_menu_item_id_fkey" FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE not valid;

alter table "public"."cost_of_goods" validate constraint "cost_of_goods_menu_item_id_fkey";

alter table "public"."menu_item_modifier_groups" add constraint "menu_item_modifier_groups_menu_item_id_fkey" FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE not valid;

alter table "public"."menu_item_modifier_groups" validate constraint "menu_item_modifier_groups_menu_item_id_fkey";

alter table "public"."menu_item_modifier_groups" add constraint "menu_item_modifier_groups_menu_item_id_modifier_group_id_key" UNIQUE using index "menu_item_modifier_groups_menu_item_id_modifier_group_id_key";

alter table "public"."menu_item_modifier_groups" add constraint "menu_item_modifier_groups_modifier_group_id_fkey" FOREIGN KEY (modifier_group_id) REFERENCES public.modifier_groups(id) ON DELETE CASCADE not valid;

alter table "public"."menu_item_modifier_groups" validate constraint "menu_item_modifier_groups_modifier_group_id_fkey";

alter table "public"."modifier_costs" add constraint "modifier_cost_non_negative" CHECK ((cost_cents >= 0)) not valid;

alter table "public"."modifier_costs" validate constraint "modifier_cost_non_negative";

alter table "public"."modifier_costs" add constraint "modifier_costs_modifier_id_fkey" FOREIGN KEY (modifier_id) REFERENCES public.modifiers(id) ON DELETE CASCADE not valid;

alter table "public"."modifier_costs" validate constraint "modifier_costs_modifier_id_fkey";

alter table "public"."modifier_groups" add constraint "modifier_groups_max_selections_check" CHECK ((max_selections >= 1)) not valid;

alter table "public"."modifier_groups" validate constraint "modifier_groups_max_selections_check";

alter table "public"."modifier_groups" add constraint "modifier_groups_min_selections_check" CHECK ((min_selections >= 0)) not valid;

alter table "public"."modifier_groups" validate constraint "modifier_groups_min_selections_check";

alter table "public"."modifier_groups" add constraint "modifier_groups_type_check" CHECK ((type = ANY (ARRAY['radio'::text, 'checkbox'::text, 'quantity'::text]))) not valid;

alter table "public"."modifier_groups" validate constraint "modifier_groups_type_check";

alter table "public"."modifiers" add constraint "modifiers_modifier_group_id_fkey" FOREIGN KEY (modifier_group_id) REFERENCES public.modifier_groups(id) ON DELETE CASCADE not valid;

alter table "public"."modifiers" validate constraint "modifiers_modifier_group_id_fkey";

alter table "public"."profiles" add constraint "prevent_role_escalation" CHECK ((role = ANY (ARRAY['customer'::text, 'admin'::text]))) not valid;

alter table "public"."profiles" validate constraint "prevent_role_escalation";

alter table "public"."promotion_expirations" add constraint "promotion_expirations_promotion_id_fkey" FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) not valid;

alter table "public"."promotion_expirations" validate constraint "promotion_expirations_promotion_id_fkey";

alter table "public"."promotions" add constraint "promotions_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES public.growth_campaigns(id) not valid;

alter table "public"."promotions" validate constraint "promotions_campaign_id_fkey";

set check_function_bodies = off;

create materialized view "analytics"."admin_abandoned_cart_metrics" as  SELECT count(*) AS total_abandoned,
    count(*) FILTER (WHERE (recovered = true)) AS recovered,
    round((((count(*) FILTER (WHERE (recovered = true)))::numeric / (NULLIF(count(*), 0))::numeric) * (100)::numeric), 2) AS recovery_rate_percent
   FROM public.abandoned_cart_sessions;


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


create materialized view "analytics"."admin_modifier_margin" as  SELECT m.id,
    m.name,
    ((m.price_adjustment * (100)::numeric))::integer AS price_cents,
    c.cost_cents,
    (((m.price_adjustment * (100)::numeric))::integer - c.cost_cents) AS gross_profit_cents,
    round(((((m.price_adjustment * (100)::numeric) - (c.cost_cents)::numeric) / NULLIF((m.price_adjustment * (100)::numeric), (0)::numeric)) * (100)::numeric), 2) AS margin_percent
   FROM (public.modifiers m
     JOIN public.modifier_costs c ON ((c.modifier_id = m.id)));


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


create materialized view "internal"."admin_loyalty_abuse" as  SELECT account_id,
    sum(
        CASE
            WHEN (entry_type = 'earn'::text) THEN amount
            ELSE 0
        END) AS total_earned,
    sum(
        CASE
            WHEN (entry_type = 'redeem'::text) THEN amount
            ELSE 0
        END) AS total_redeemed,
    count(*) FILTER (WHERE (entry_type = 'adjustment'::text)) AS adjustment_count
   FROM public.loyalty_ledger
  GROUP BY account_id
 HAVING ((count(*) FILTER (WHERE (entry_type = 'adjustment'::text)) > 5) OR (sum(
        CASE
            WHEN (entry_type = 'redeem'::text) THEN amount
            ELSE 0
        END) > sum(
        CASE
            WHEN (entry_type = 'earn'::text) THEN amount
            ELSE 0
        END)));


create materialized view "internal"."admin_loyalty_liability" as  SELECT sum(balance_after) AS total_points_outstanding
   FROM ( SELECT DISTINCT ON (loyalty_ledger.account_id) loyalty_ledger.account_id,
            loyalty_ledger.balance_after
           FROM public.loyalty_ledger
          ORDER BY loyalty_ledger.account_id, loyalty_ledger.created_at DESC) latest_balances;


create materialized view "internal"."admin_loyalty_summary" as  SELECT sum(
        CASE
            WHEN (entry_type = 'issue'::text) THEN amount
            ELSE 0
        END) AS total_issued,
    sum(
        CASE
            WHEN (entry_type = 'redeem'::text) THEN amount
            ELSE 0
        END) AS total_redeemed,
    count(*) FILTER (WHERE (entry_type = 'redeem'::text)) AS total_redemptions,
    count(*) FILTER (WHERE (entry_type = 'issue'::text)) AS total_issuances
   FROM public.loyalty_ledger;


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


CREATE OR REPLACE FUNCTION public.get_loyalty_by_order(p_order_id uuid)
 RETURNS SETOF public.loyalty_transactions
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT *
  FROM loyalty_transactions
  WHERE order_id = p_order_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_loyalty_for_order(p_order_id uuid)
 RETURNS TABLE(points_delta integer, new_balance integer, tier text, streak integer, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    l.amount as points_delta,
    a.balance as new_balance,
    a.tier,
    a.streak,
    l.created_at
  from loyalty_ledger l
  join loyalty_accounts a
    on a.id = l.account_id
  where l.reference_id = p_order_id
    and l.entry_type = 'earned'
    and l.amount > 0
  order by l.created_at desc
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_loyalty_ledger_secure(p_account_id uuid)
 RETURNS SETOF public.loyalty_ledger
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT l.*
  FROM loyalty_ledger l
  JOIN loyalty_accounts a
    ON a.id = l.account_id
  WHERE l.account_id = p_account_id
  AND (
    a.user_id = (SELECT auth.uid())
    OR public.is_admin((SELECT auth.uid()))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.health_ping()
 RETURNS TABLE(status text, server_time timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    'ok'::text,
    now()::timestamptz;
$function$
;

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


CREATE OR REPLACE FUNCTION public.update_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

create or replace view "public"."v2_account_summary" as  SELECT id,
    user_id,
    balance,
    lifetime_earned,
    tier,
    streak,
    last_activity,
    status,
    created_at,
    updated_at,
    last_award_at,
    last_redeem_at
   FROM public.loyalty_accounts;


CREATE OR REPLACE FUNCTION public.v2_award_points(p_account_id uuid, p_admin_id uuid, p_amount_cents integer, p_idempotency_key text)
 RETURNS TABLE(points_earned integer, new_balance integer, new_lifetime integer, new_tier text, streak integer, tier_changed boolean, was_duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_account loyalty_accounts%ROWTYPE;
  v_points integer;
  v_new_balance integer;
  v_new_lifetime integer;
  v_new_tier text;
  v_old_tier text;
  v_streak integer;
BEGIN

  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  v_points := FLOOR(p_amount_cents / 100);

  -- Lock account
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

  -- Calculate new balances
  v_new_balance := v_account.balance + v_points;
  v_new_lifetime := v_account.lifetime_earned + v_points;

  -- Calculate streak
  IF v_account.last_activity = CURRENT_DATE THEN
    v_streak := v_account.streak;
  ELSIF v_account.last_activity = CURRENT_DATE - INTERVAL '1 day' THEN
    v_streak := v_account.streak + 1;
  ELSE
    v_streak := 1;
  END IF;

  -- Tier resolution
  v_new_tier :=
    CASE
      WHEN v_new_lifetime >= 5000 THEN 'platinum'
      WHEN v_new_lifetime >= 2000 THEN 'gold'
      WHEN v_new_lifetime >= 500 THEN 'silver'
      ELSE 'bronze'
    END;

  -- Ledger append
  INSERT INTO public.loyalty_ledger (
    account_id,
    amount,
    balance_after,
    entry_type,
    source,
    admin_id,
    idempotency_key
  )
  VALUES (
    p_account_id,
    v_points,
    v_new_balance,
    'earn',
    'admin_scan',
    p_admin_id,
    p_idempotency_key
  );

  -- Update account
  UPDATE public.loyalty_accounts
  SET
    balance = v_new_balance,
    lifetime_earned = v_new_lifetime,
    tier = v_new_tier,
    streak = v_streak,
    last_activity = CURRENT_DATE,
    updated_at = NOW()
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

create or replace view "public"."financial_revenue_view" as  SELECT id,
    amount_total,
    payment_status,
    created_at
   FROM public.orders
  WHERE (payment_status = 'paid'::text);


CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = uid
      AND role = 'admin'
  );
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


CREATE INDEX idx_admin_revenue_day ON internal.admin_revenue_summary USING btree (day);

grant delete on table "public"."abandoned_cart_sessions" to "service_role";

grant insert on table "public"."abandoned_cart_sessions" to "service_role";

grant references on table "public"."abandoned_cart_sessions" to "service_role";

grant select on table "public"."abandoned_cart_sessions" to "service_role";

grant trigger on table "public"."abandoned_cart_sessions" to "service_role";

grant truncate on table "public"."abandoned_cart_sessions" to "service_role";

grant update on table "public"."abandoned_cart_sessions" to "service_role";

grant delete on table "public"."ai_insights" to "service_role";

grant insert on table "public"."ai_insights" to "service_role";

grant references on table "public"."ai_insights" to "service_role";

grant select on table "public"."ai_insights" to "service_role";

grant trigger on table "public"."ai_insights" to "service_role";

grant truncate on table "public"."ai_insights" to "service_role";

grant update on table "public"."ai_insights" to "service_role";

grant delete on table "public"."checkout_rate_limits" to "service_role";

grant insert on table "public"."checkout_rate_limits" to "service_role";

grant references on table "public"."checkout_rate_limits" to "service_role";

grant select on table "public"."checkout_rate_limits" to "service_role";

grant trigger on table "public"."checkout_rate_limits" to "service_role";

grant truncate on table "public"."checkout_rate_limits" to "service_role";

grant update on table "public"."checkout_rate_limits" to "service_role";

grant delete on table "public"."cost_of_goods" to "service_role";

grant insert on table "public"."cost_of_goods" to "service_role";

grant references on table "public"."cost_of_goods" to "service_role";

grant select on table "public"."cost_of_goods" to "service_role";

grant trigger on table "public"."cost_of_goods" to "service_role";

grant truncate on table "public"."cost_of_goods" to "service_role";

grant update on table "public"."cost_of_goods" to "service_role";

grant delete on table "public"."discount_optimizer_rules" to "service_role";

grant insert on table "public"."discount_optimizer_rules" to "service_role";

grant references on table "public"."discount_optimizer_rules" to "service_role";

grant select on table "public"."discount_optimizer_rules" to "service_role";

grant trigger on table "public"."discount_optimizer_rules" to "service_role";

grant truncate on table "public"."discount_optimizer_rules" to "service_role";

grant update on table "public"."discount_optimizer_rules" to "service_role";

grant delete on table "public"."discount_predictions" to "service_role";

grant insert on table "public"."discount_predictions" to "service_role";

grant references on table "public"."discount_predictions" to "service_role";

grant select on table "public"."discount_predictions" to "service_role";

grant trigger on table "public"."discount_predictions" to "service_role";

grant truncate on table "public"."discount_predictions" to "service_role";

grant update on table "public"."discount_predictions" to "service_role";

grant delete on table "public"."growth_campaigns" to "service_role";

grant insert on table "public"."growth_campaigns" to "service_role";

grant references on table "public"."growth_campaigns" to "service_role";

grant select on table "public"."growth_campaigns" to "service_role";

grant trigger on table "public"."growth_campaigns" to "service_role";

grant truncate on table "public"."growth_campaigns" to "service_role";

grant update on table "public"."growth_campaigns" to "service_role";

grant select on table "public"."menu_item_modifier_groups" to "anon";

grant delete on table "public"."menu_item_modifier_groups" to "service_role";

grant insert on table "public"."menu_item_modifier_groups" to "service_role";

grant references on table "public"."menu_item_modifier_groups" to "service_role";

grant select on table "public"."menu_item_modifier_groups" to "service_role";

grant trigger on table "public"."menu_item_modifier_groups" to "service_role";

grant truncate on table "public"."menu_item_modifier_groups" to "service_role";

grant update on table "public"."menu_item_modifier_groups" to "service_role";

grant delete on table "public"."modifier_costs" to "service_role";

grant insert on table "public"."modifier_costs" to "service_role";

grant references on table "public"."modifier_costs" to "service_role";

grant select on table "public"."modifier_costs" to "service_role";

grant trigger on table "public"."modifier_costs" to "service_role";

grant truncate on table "public"."modifier_costs" to "service_role";

grant update on table "public"."modifier_costs" to "service_role";

grant select on table "public"."modifier_groups" to "anon";

grant delete on table "public"."modifier_groups" to "service_role";

grant insert on table "public"."modifier_groups" to "service_role";

grant references on table "public"."modifier_groups" to "service_role";

grant select on table "public"."modifier_groups" to "service_role";

grant trigger on table "public"."modifier_groups" to "service_role";

grant truncate on table "public"."modifier_groups" to "service_role";

grant update on table "public"."modifier_groups" to "service_role";

grant select on table "public"."modifiers" to "anon";

grant delete on table "public"."modifiers" to "service_role";

grant insert on table "public"."modifiers" to "service_role";

grant references on table "public"."modifiers" to "service_role";

grant select on table "public"."modifiers" to "service_role";

grant trigger on table "public"."modifiers" to "service_role";

grant truncate on table "public"."modifiers" to "service_role";

grant update on table "public"."modifiers" to "service_role";

grant delete on table "public"."promotion_expirations" to "service_role";

grant insert on table "public"."promotion_expirations" to "service_role";

grant references on table "public"."promotion_expirations" to "service_role";

grant select on table "public"."promotion_expirations" to "service_role";

grant trigger on table "public"."promotion_expirations" to "service_role";

grant truncate on table "public"."promotion_expirations" to "service_role";

grant update on table "public"."promotion_expirations" to "service_role";

grant delete on table "public"."smart_discounts" to "service_role";

grant insert on table "public"."smart_discounts" to "service_role";

grant references on table "public"."smart_discounts" to "service_role";

grant select on table "public"."smart_discounts" to "service_role";

grant trigger on table "public"."smart_discounts" to "service_role";

grant truncate on table "public"."smart_discounts" to "service_role";

grant update on table "public"."smart_discounts" to "service_role";


  create policy "abandoned_block_authenticated"
  on "public"."abandoned_cart_sessions"
  as restrictive
  for all
  to authenticated
using (false);



  create policy "admin_notifications_select"
  on "public"."admin_notifications"
  as permissive
  for select
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "service role full access"
  on "public"."checkout_rate_limits"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "contact_messages_block_anon_delete"
  on "public"."contact_messages"
  as restrictive
  for delete
  to anon
using (false);



  create policy "contact_messages_block_anon_update"
  on "public"."contact_messages"
  as restrictive
  for update
  to anon
using (false);



  create policy "cost_admin_only"
  on "public"."cost_of_goods"
  as permissive
  for all
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)))
with check (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "discount_predictions_admin_full"
  on "public"."discount_predictions"
  as permissive
  for all
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)))
with check (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "financial_transactions: admins read"
  on "public"."financial_transactions"
  as permissive
  for select
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "fraud_block_delete"
  on "public"."fraud_logs"
  as restrictive
  for delete
  to authenticated
using (false);



  create policy "fraud_block_insert"
  on "public"."fraud_logs"
  as restrictive
  for insert
  to authenticated
with check (false);



  create policy "fraud_block_update"
  on "public"."fraud_logs"
  as restrictive
  for update
  to authenticated
using (false);



  create policy "login_attempts_block_anon"
  on "public"."login_attempts"
  as restrictive
  for all
  to anon
using (false);



  create policy "loyalty_accounts_block_delete"
  on "public"."loyalty_accounts"
  as restrictive
  for delete
  to authenticated
using (false);



  create policy "loyalty_accounts_block_insert"
  on "public"."loyalty_accounts"
  as restrictive
  for insert
  to authenticated
with check (false);



  create policy "loyalty_accounts_block_update"
  on "public"."loyalty_accounts"
  as restrictive
  for update
  to authenticated
using (false);



  create policy "loyalty_ledger_block_delete"
  on "public"."loyalty_ledger"
  as restrictive
  for delete
  to authenticated
using (false);



  create policy "loyalty_ledger_block_insert"
  on "public"."loyalty_ledger"
  as restrictive
  for insert
  to authenticated
with check (false);



  create policy "loyalty_ledger_block_update"
  on "public"."loyalty_ledger"
  as restrictive
  for update
  to authenticated
using (false);



  create policy "loyalty_tx_block_delete"
  on "public"."loyalty_transactions"
  as restrictive
  for delete
  to authenticated
using (false);



  create policy "loyalty_tx_block_insert"
  on "public"."loyalty_transactions"
  as restrictive
  for insert
  to authenticated
with check (false);



  create policy "loyalty_tx_block_update"
  on "public"."loyalty_transactions"
  as restrictive
  for update
  to authenticated
using (false);



  create policy "menu_item_modifier_groups_admin_full"
  on "public"."menu_item_modifier_groups"
  as permissive
  for all
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)))
with check (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "menu_item_modifier_groups_public_read"
  on "public"."menu_item_modifier_groups"
  as permissive
  for select
  to anon
using (true);



  create policy "menu_items_admin_delete"
  on "public"."menu_items"
  as permissive
  for delete
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "menu_items_admin_insert"
  on "public"."menu_items"
  as permissive
  for insert
  to authenticated
with check (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "menu_items_admin_update"
  on "public"."menu_items"
  as permissive
  for update
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)))
with check (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "menu_items_public_read"
  on "public"."menu_items"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "modifier_costs_admin_only"
  on "public"."modifier_costs"
  as permissive
  for all
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)))
with check (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "modifier_groups_admin_full"
  on "public"."modifier_groups"
  as permissive
  for all
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)))
with check (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "modifier_groups_public_read"
  on "public"."modifier_groups"
  as permissive
  for select
  to anon
using (true);



  create policy "modifiers_admin_full"
  on "public"."modifiers"
  as permissive
  for all
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)))
with check (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "modifiers_public_read"
  on "public"."modifiers"
  as permissive
  for select
  to anon
using (true);



  create policy "orders_block_delete"
  on "public"."orders"
  as restrictive
  for delete
  to authenticated
using (false);



  create policy "orders_block_insert"
  on "public"."orders"
  as restrictive
  for insert
  to authenticated
with check (false);



  create policy "orders_block_update"
  on "public"."orders"
  as restrictive
  for update
  to authenticated
using (false);



  create policy "password_attempts_block_anon"
  on "public"."password_attempts"
  as restrictive
  for all
  to anon
using (false);



  create policy "pending_carts_select"
  on "public"."pending_carts"
  as permissive
  for select
  to authenticated
using ((public.is_admin(( SELECT auth.uid() AS uid)) OR (user_id = ( SELECT auth.uid() AS uid))));



  create policy "profiles_block_user_delete"
  on "public"."profiles"
  as restrictive
  for delete
  to authenticated
using (false);



  create policy "profiles_select"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using ((public.is_admin(( SELECT auth.uid() AS uid)) OR (id = ( SELECT auth.uid() AS uid))));



  create policy "profiles_service_full"
  on "public"."profiles"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "profiles_user_update"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using ((id = ( SELECT auth.uid() AS uid)))
with check ((id = ( SELECT auth.uid() AS uid)));



  create policy "promo_block_delete"
  on "public"."promo_redemptions"
  as restrictive
  for delete
  to authenticated
using (false);



  create policy "promo_block_insert"
  on "public"."promo_redemptions"
  as restrictive
  for insert
  to authenticated
with check (false);



  create policy "promo_block_update"
  on "public"."promo_redemptions"
  as restrictive
  for update
  to authenticated
using (false);



  create policy "promotions_admin_read"
  on "public"."promotions"
  as permissive
  for select
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "promotions_service_full"
  on "public"."promotions"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "security_events: admins read"
  on "public"."security_events"
  as permissive
  for select
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "Users can read their credits"
  on "public"."user_credits"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "authenticated read own credits"
  on "public"."user_credits"
  as permissive
  for select
  to authenticated
using ((( SELECT auth.uid() AS uid) = user_id));



  create policy "service role full access"
  on "public"."user_credits"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "admins_read"
  on "public"."admins"
  as permissive
  for select
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "Admins can read daily counter"
  on "public"."daily_order_counter"
  as permissive
  for select
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "Admin read fraud_logs"
  on "public"."fraud_logs"
  as permissive
  for select
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "Admin read order_events"
  on "public"."order_events"
  as permissive
  for select
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "Admin read order_status_audit"
  on "public"."order_status_audit"
  as permissive
  for select
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)));



  create policy "promo_redemptions: users read own"
  on "public"."promo_redemptions"
  as permissive
  for select
  to authenticated
using ((user_id = ( SELECT auth.uid() AS uid)));



  create policy "Admins can read staff logs"
  on "public"."staff_action_logs"
  as permissive
  for select
  to authenticated
using (public.is_admin(( SELECT auth.uid() AS uid)));


CREATE TRIGGER update_menu_items_timestamp BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


  create policy "Public read menu images"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'menu-images'::text));



