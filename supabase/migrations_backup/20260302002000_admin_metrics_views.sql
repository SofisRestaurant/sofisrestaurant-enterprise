-- =============================================================================
-- Admin Metrics Views (v1)
-- Creates:
--   - admin_revenue_summary
--   - admin_item_consumption
--   - admin_hourly_heatmap
--   - admin_loyalty_summary
--   - admin_loyalty_liability
--   - admin_risk_snapshot
--   - admin_fraud_snapshot
--   - admin_executive_snapshot
--
-- Notes:
-- - Uses only existing objects in your schema:
--   orders, financial_transactions, fraud_logs,
--   loyalty_accounts, loyalty_ledger,
--   checkout_rate_limits, abandoned_cart_sessions,
--   admin_profit_snapshot
-- - NO dependency on order_items table (you currently don’t have it)
-- - All views are read-only and meant for admin dashboards
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Revenue summary (last 30 days)
-- Source of truth: orders.amount_total + payment_status
-- -----------------------------------------------------------------------------
create or replace view public.admin_revenue_summary as
with paid_orders as (
  select
    date_trunc('day', o.created_at)::date as day,
    coalesce(sum(o.amount_total), 0)::bigint as gross_revenue_cents,
    count(*)::bigint as orders_count
  from public.orders o
  where o.created_at >= (now() - interval '30 days')
    and o.payment_status in ('paid', 'succeeded')
  group by 1
),
refunded_orders as (
  select
    date_trunc('day', o.created_at)::date as day,
    coalesce(sum(o.amount_total), 0)::bigint as refunded_cents,
    count(*)::bigint as refunds_count
  from public.orders o
  where o.created_at >= (now() - interval '30 days')
    and o.payment_status in ('refunded', 'partially_refunded')
  group by 1
)
select
  d.day,
  coalesce(p.gross_revenue_cents, 0) as gross_revenue_cents,
  coalesce(r.refunded_cents, 0) as refunded_cents,
  (coalesce(p.gross_revenue_cents, 0) - coalesce(r.refunded_cents, 0)) as net_revenue_cents,
  coalesce(p.orders_count, 0) as paid_orders_count,
  coalesce(r.refunds_count, 0) as refunds_count
from (
  select day from paid_orders
  union
  select day from refunded_orders
) d
left join paid_orders p on p.day = d.day
left join refunded_orders r on r.day = d.day
order by d.day asc;

comment on view public.admin_revenue_summary is
'Admin: 30-day revenue summary computed from orders.amount_total grouped by day.';

-- -----------------------------------------------------------------------------
-- 2) Item consumption (best available without order_items)
-- We approximate top items by exploding orders.cart_items JSON.
-- Assumes orders.cart_items stores an array of cart line items with at least:
--   - name (string)
--   - quantity (number)
--   - unitPriceCents OR unit_price_cents OR price_cents OR unit_amount
-- This keeps you moving even before an order_items table exists.
-- -----------------------------------------------------------------------------
create or replace view public.admin_item_consumption as
with recent as (
  select
    o.id as order_id,
    o.created_at,
    o.payment_status,
    o.cart_items
  from public.orders o
  where o.created_at >= (now() - interval '30 days')
    and o.payment_status in ('paid', 'succeeded')
    and o.cart_items is not null
),
expanded as (
  select
    r.order_id,
    r.created_at,
    (item->>'name')::text as item_name,
    coalesce(nullif((item->>'quantity')::int, 0), 1) as quantity,
    -- try multiple possible unit price field names (your code has drift history)
    coalesce(
      nullif((item->>'unitPriceCents')::int, 0),
      nullif((item->>'unit_price_cents')::int, 0),
      nullif((item->>'price_cents')::int, 0),
      nullif((item->>'unit_amount')::int, 0),
      0
    ) as unit_price_cents
  from recent r
  cross join lateral jsonb_array_elements(r.cart_items) as item
  where (item->>'name') is not null
),
rolled as (
  select
    item_name,
    sum(quantity)::bigint as qty_sold,
    sum((unit_price_cents::bigint * quantity::bigint))::bigint as revenue_impact_cents,
    count(distinct order_id)::bigint as orders_with_item
  from expanded
  group by 1
)
select
  item_name,
  qty_sold,
  revenue_impact_cents,
  orders_with_item
from rolled
order by revenue_impact_cents desc nulls last;

comment on view public.admin_item_consumption is
'Admin: Top items approximation by expanding orders.cart_items JSON for paid orders (30d).';

-- -----------------------------------------------------------------------------
-- 3) Hourly heatmap (last 30 days)
-- Counts paid orders and revenue by hour of day.
-- -----------------------------------------------------------------------------
create or replace view public.admin_hourly_heatmap as
select
  extract(hour from o.created_at)::int as hour_of_day,
  count(*)::bigint as orders_count,
  coalesce(sum(o.amount_total), 0)::bigint as revenue_cents
from public.orders o
where o.created_at >= (now() - interval '30 days')
  and o.payment_status in ('paid', 'succeeded')
group by 1
order by 1 asc;

comment on view public.admin_hourly_heatmap is
'Admin: Hour-of-day heatmap (30d) from paid orders.';

-- -----------------------------------------------------------------------------
-- 4) Loyalty summary (last 30 days) — FIXED for your schema
-- loyalty_ledger has account_id (NOT user_id). Join loyalty_accounts for user_id.
-- -----------------------------------------------------------------------------
create or replace view public.admin_loyalty_summary as
with last30 as (
  select *
  from public.loyalty_ledger
  where created_at >= (now() - interval '30 days')
),
earned as (
  select coalesce(sum(amount), 0)::bigint as points_earned
  from last30
  where entry_type in ('award','earn','credit')
),
redeemed as (
  select coalesce(sum(abs(amount)), 0)::bigint as points_redeemed
  from last30
  where entry_type in ('redeem','debit')
),
active_users as (
  select count(distinct a.user_id)::bigint as active_users
  from last30 l
  join public.loyalty_accounts a on a.id = l.account_id
  where a.user_id is not null
)
select
  (select points_earned from earned) as points_earned_30d,
  (select points_redeemed from redeemed) as points_redeemed_30d,
  (select active_users from active_users) as active_users_30d;

comment on view public.admin_loyalty_summary is
'Admin: 30-day loyalty activity summary from loyalty_ledger joined to loyalty_accounts.';

-- -----------------------------------------------------------------------------
-- 5) Loyalty liability
-- Simple liability model: sum of all loyalty_accounts.balance (points) and account count.
-- If your points have a $ conversion later, add it here.
-- -----------------------------------------------------------------------------
create or replace view public.admin_loyalty_liability as
select
  count(*)::bigint as accounts_count,
  coalesce(sum(balance), 0)::bigint as total_points_liability,
  coalesce(avg(balance), 0)::numeric(12,2) as avg_points_per_account
from public.loyalty_accounts;

comment on view public.admin_loyalty_liability is
'Admin: Loyalty liability snapshot from loyalty_accounts balances.';

-- -----------------------------------------------------------------------------
-- 6) Risk snapshot (last 24h)
-- Uses checkout_rate_limits + abandoned_cart_sessions as signals.
-- -----------------------------------------------------------------------------
create or replace view public.admin_risk_snapshot as
with rate_limits as (
  select
    count(*)::bigint as rows_24h,
    coalesce(sum(attempts), 0)::bigint as total_attempts,
    count(*) filter (where attempts >= 10)::bigint as high_attempt_users
  from public.checkout_rate_limits
  where created_at >= (now() - interval '24 hours')
     or last_attempt_at >= (now() - interval '24 hours')
),
abandoned as (
  select
    count(*)::bigint as abandoned_sessions_24h,
    count(*) filter (where recovered is true)::bigint as recovered_sessions_24h,
    coalesce(sum(cart_value_cents), 0)::bigint as abandoned_value_cents_24h
  from public.abandoned_cart_sessions
  where created_at >= (now() - interval '24 hours')
)
select
  (select rows_24h from rate_limits) as rate_limit_rows_24h,
  (select total_attempts from rate_limits) as rate_limit_attempts_24h,
  (select high_attempt_users from rate_limits) as high_attempt_users_24h,
  (select abandoned_sessions_24h from abandoned) as abandoned_sessions_24h,
  (select recovered_sessions_24h from abandoned) as recovered_sessions_24h,
  (select abandoned_value_cents_24h from abandoned) as abandoned_value_cents_24h;

comment on view public.admin_risk_snapshot is
'Admin: Risk snapshot (24h) from checkout_rate_limits + abandoned_cart_sessions.';

-- -----------------------------------------------------------------------------
-- 7) Fraud snapshot (last 7 days)
-- Uses fraud_logs table you already have.
-- -----------------------------------------------------------------------------
create or replace view public.admin_fraud_snapshot as
select
  count(*)::bigint as fraud_events_7d,
  count(*) filter (where reason ilike '%mismatch%')::bigint as mismatch_events_7d,
  coalesce(avg(abs(coalesce(stripe_total,0) - coalesce(server_total,0))), 0)::numeric(12,2) as avg_delta_cents_7d,
  max(created_at) as last_event_at
from public.fraud_logs
where created_at >= (now() - interval '7 days');

comment on view public.admin_fraud_snapshot is
'Admin: Fraud snapshot (7d) from fraud_logs.';

-- -----------------------------------------------------------------------------
-- 8) Executive snapshot (current)
-- Combines:
--  - net revenue (30d) from admin_revenue_summary
--  - gross profit signal from admin_profit_snapshot singleton
-- -----------------------------------------------------------------------------
create or replace view public.admin_executive_snapshot as
with rev as (
  select coalesce(sum(net_revenue_cents), 0)::bigint as net_revenue_30d_cents
  from public.admin_revenue_summary
),
profit as (
  select total_gross_profit_cents::bigint as total_gross_profit_cents
  from public.admin_profit_snapshot
  where singleton_id = true
)
select
  (select net_revenue_30d_cents from rev) as net_revenue_30d_cents,
  (select total_gross_profit_cents from profit) as total_gross_profit_cents,
  now() as generated_at;

comment on view public.admin_executive_snapshot is
'Admin: Executive snapshot combining 30d net revenue with gross profit snapshot singleton.';

commit;