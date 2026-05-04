-- supabase/migrations/20260301001000_admin_metrics_views.sql
-- =============================================================================
-- Admin metrics views (built from existing canonical tables)
-- Source-of-truth tables:
--   - public.orders (cart_items jsonb, totals in integer cents)
--   - public.fraud_logs
--   - public.financial_transactions
--   - public.loyalty_ledger
--
-- Notes:
--   - order_items table does not exist in this project, so item analytics are
--     derived from orders.cart_items JSON.
--   - These are VIEWS (fast iteration). If you later want speed, convert heavy
--     ones to MATERIALIZED VIEW + refresh schedule.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0) Helpers via CTE patterns: paid orders
-- We standardize “paid” as payment_status in ('paid','succeeded')
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1) Revenue summary (daily, last 30 days)
-- -----------------------------------------------------------------------------
create or replace view public.admin_revenue_summary as
with paid as (
  select
    created_at::date as day,
    amount_total::bigint as amount_total_cents
  from public.orders
  where payment_status in ('paid', 'succeeded')
)
select
  day,
  count(*)::int as orders_count,
  sum(amount_total_cents)::bigint as revenue_cents,
  avg(amount_total_cents)::numeric(12,2) as avg_order_value_cents
from paid
where day >= (current_date - interval '30 days')::date
group by day
order by day asc;

comment on view public.admin_revenue_summary is
'Admin: daily revenue/volume based on paid orders (orders.payment_status = paid/succeeded)';

-- -----------------------------------------------------------------------------
-- 2) Item consumption (top items by revenue impact)
-- Derived from orders.cart_items JSONB
-- -----------------------------------------------------------------------------
create or replace view public.admin_item_consumption as
with paid_orders as (
  select
    o.id as order_id,
    o.created_at,
    o.amount_total::bigint as order_total_cents,
    o.cart_items
  from public.orders o
  where o.payment_status in ('paid', 'succeeded')
    and o.cart_items is not null
),
items as (
  select
    po.order_id,
    po.created_at,
    -- each JSON array element is one cart line item
    (jsonb_array_elements(po.cart_items)) as item
  from paid_orders po
),
normalized as (
  select
    order_id,
    created_at,
    -- name
    coalesce(
      item->>'name',
      item->>'title',
      item->>'item_name',
      'Unknown Item'
    ) as item_name,

    -- quantity (default 1)
    greatest(
      1,
      coalesce(
        nullif((item->>'quantity')::int, 0),
        nullif((item->>'qty')::int, 0),
        1
      )
    ) as quantity,

    -- Try multiple known per-unit price keys (cents)
    -- If your cart stores dollars, you can adapt, but your app looks cents-based.
    coalesce(
      (item->>'unitPriceCents')::bigint,
      (item->>'unit_price_cents')::bigint,
      (item->>'unit_price')::bigint,
      (item->>'base_price')::bigint,
      (item->>'price_cents')::bigint,
      (item->>'price')::bigint,
      0
    ) as unit_price_cents,

    -- If the cart stores a line total already
    coalesce(
      (item->>'lineTotalCents')::bigint,
      (item->>'line_total_cents')::bigint,
      (item->>'total_cents')::bigint,
      (item->>'line_total')::bigint,
      null
    ) as line_total_cents
  from items
),
scored as (
  select
    item_name,
    sum(quantity)::bigint as units,
    -- Revenue impact:
    -- prefer line_total_cents if present; else unit_price_cents * quantity
    sum(
      coalesce(line_total_cents, unit_price_cents * quantity)
    )::bigint as revenue_impact_cents,
    count(*)::bigint as line_count
  from normalized
  where item_name is not null
  group by item_name
)
select
  item_name,
  units,
  revenue_impact_cents,
  line_count
from scored
order by revenue_impact_cents desc
limit 50;

comment on view public.admin_item_consumption is
'Admin: top items by revenue impact derived from orders.cart_items JSON (paid orders only)';

-- -----------------------------------------------------------------------------
-- 3) Hourly heatmap (orders + revenue by hour for last 30 days)
-- -----------------------------------------------------------------------------
create or replace view public.admin_hourly_heatmap as
with paid as (
  select
    date_trunc('hour', created_at) as hour_bucket,
    extract(hour from created_at)::int as hour_of_day,
    amount_total::bigint as amount_total_cents
  from public.orders
  where payment_status in ('paid', 'succeeded')
    and created_at >= (now() - interval '30 days')
)
select
  hour_of_day,
  count(*)::int as orders_count,
  sum(amount_total_cents)::bigint as revenue_cents
from paid
group by hour_of_day
order by hour_of_day asc;

comment on view public.admin_hourly_heatmap is
'Admin: hourly distribution (0-23) for paid orders over last 30 days';

-- -----------------------------------------------------------------------------
-- 4) Loyalty summary (last 30 days activity + balances)
-- Uses loyalty_ledger only (safe even if loyalty_accounts changes later)
-- -----------------------------------------------------------------------------
create or replace view public.admin_loyalty_summary as
with last30 as (
  select l.*
  from public.loyalty_ledger l
  where l.created_at >= (now() - interval '30 days')
),
earned as (
  select coalesce(sum(l.amount), 0)::bigint as points_earned
  from last30 l
  where l.entry_type in ('award','earn','credit')
),
redeemed as (
  select coalesce(sum(abs(l.amount)), 0)::bigint as points_redeemed
  from last30 l
  where l.entry_type in ('redeem','debit')
),
active_users as (
  select count(distinct a.user_id)::bigint as active_users
  from last30 l
  join public.loyalty_accounts a
    on a.id = l.account_id
  where a.user_id is not null
)
select
  (select points_earned   from earned)       as points_earned_30d,
  (select points_redeemed from redeemed)     as points_redeemed_30d,
  (select active_users    from active_users) as active_users_30d;

comment on view public.admin_loyalty_summary is
'Admin: 30-day loyalty activity summary from loyalty_ledger (via loyalty_accounts.user_id)';
-- -----------------------------------------------------------------------------
-- 5) Loyalty liability
-- If you have loyalty_accounts table (you do), sum its balance.
-- -----------------------------------------------------------------------------
create or replace view public.admin_loyalty_liability as
select
  coalesce(sum(balance), 0)::bigint as points_outstanding,
  coalesce(count(*), 0)::bigint as accounts_count
from public.loyalty_accounts;

comment on view public.admin_loyalty_liability is
'Admin: total outstanding loyalty points from loyalty_accounts.balance';

-- -----------------------------------------------------------------------------
-- 6) Risk snapshot
-- Uses financial_transactions.transaction_type + recent orders cancellations
-- -----------------------------------------------------------------------------
create or replace view public.admin_risk_snapshot as
with last30_tx as (
  select *
  from public.financial_transactions
  where created_at >= (now() - interval '30 days')
),
tx_counts as (
  select
    count(*) filter (where transaction_type ilike '%dispute%')::int as disputes,
    count(*) filter (where transaction_type ilike '%fail%')::int as failed_payments,
    count(*) filter (where transaction_type ilike '%refund%')::int as refunds
  from last30_tx
),
order_counts as (
  select
    count(*) filter (where status ilike '%cancel%')::int as cancelled_orders
  from public.orders
  where created_at >= (now() - interval '30 days')
)
select
  (select disputes from tx_counts) as disputes,
  (select failed_payments from tx_counts) as failed_payments,
  (select refunds from tx_counts) as refunds,
  (select cancelled_orders from order_counts) as cancelled_orders;

comment on view public.admin_risk_snapshot is
'Admin: last-30-day disputes/failed payments/refunds from financial_transactions + cancellations from orders';

-- -----------------------------------------------------------------------------
-- 7) Fraud snapshot
-- fraud_logs columns: id, user_id, reason, metadata, created_at, totals
-- -----------------------------------------------------------------------------
create or replace view public.admin_fraud_snapshot as
with last30 as (
  select *
  from public.fraud_logs
  where created_at >= (now() - interval '30 days')
),
last24 as (
  select *
  from public.fraud_logs
  where created_at >= (now() - interval '24 hours')
)
select
  (select count(*)::int from last30) as total_events_30d,
  (select count(*)::int from last24) as total_events_24h;

comment on view public.admin_fraud_snapshot is
'Admin: fraud events volume (24h + 30d) from fraud_logs';

-- -----------------------------------------------------------------------------
-- 8) Executive snapshot
-- Common KPIs used by your health engine: avg_order_value_cents, total revenue, etc.
-- -----------------------------------------------------------------------------
create or replace view public.admin_executive_snapshot as
with paid30 as (
  select
    amount_total::bigint as amount_total_cents,
    amount_subtotal::bigint as amount_subtotal_cents,
    amount_tax::bigint as amount_tax_cents,
    created_at
  from public.orders
  where payment_status in ('paid', 'succeeded')
    and created_at >= (now() - interval '30 days')
)
select
  coalesce(sum(amount_total_cents), 0)::bigint as revenue_total_cents_30d,
  coalesce(sum(amount_subtotal_cents), 0)::bigint as revenue_subtotal_cents_30d,
  coalesce(sum(amount_tax_cents), 0)::bigint as tax_total_cents_30d,
  coalesce(avg(amount_total_cents), 0)::numeric(12,2) as avg_order_value_cents,
  coalesce(count(*), 0)::bigint as orders_count_30d
from paid30;

comment on view public.admin_executive_snapshot is
'Admin: top-level KPIs over last 30 days from paid orders';

commit;