begin;

-- Backfill normalized order_items for existing paid/succeeded orders
-- This reuses the trigger function by forcing an update that touches payment_status.
update public.orders
set payment_status = payment_status
where payment_status in ('paid','succeeded')
  and cart_items is not null;

commit;