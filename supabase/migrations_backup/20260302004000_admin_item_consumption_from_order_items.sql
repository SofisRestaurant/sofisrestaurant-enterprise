begin;

create or replace view public.admin_item_consumption as
select
  oi.name as item_name,
  sum(oi.quantity)::bigint as qty_sold,
  sum(oi.line_total_cents)::bigint as revenue_impact_cents,
  count(distinct oi.order_id)::bigint as orders_with_item
from public.order_items oi
join public.orders o
  on o.id = oi.order_id
where o.payment_status in ('paid','succeeded')
  and o.created_at >= (now() - interval '30 days')
group by oi.name
order by revenue_impact_cents desc
limit 50;

comment on view public.admin_item_consumption is
'Admin: top items by revenue impact from normalized order_items (paid orders only, 30d).';

commit;