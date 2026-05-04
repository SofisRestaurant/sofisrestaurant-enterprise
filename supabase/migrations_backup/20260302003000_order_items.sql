begin;

-- =============================================================================
-- ORDER ITEMS (normalized)
-- - Source-of-truth for item analytics, kitchen stats, and reporting
-- - Populated from orders.cart_items JSON once an order is paid/succeeded
-- =============================================================================

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),

  -- parent order
  order_id uuid not null references public.orders(id) on delete cascade,

  -- stable line identity within an order (0..N-1)
  line_index int not null,

  -- item identity (nullable because historic cart JSON might not have it)
  menu_item_id uuid null,

  -- display + analytics
  name text not null,
  quantity int not null check (quantity > 0 and quantity <= 100),

  -- cents
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),

  -- structured extras (keep flexible)
  modifiers jsonb not null default '[]'::jsonb,
  notes text null,

  -- integrity hook (optional but recommended if your cart includes it)
  pricing_hash text null,

  created_at timestamptz not null default now()
);

-- One row per (order_id, line_index) so the trigger can be safely re-run idempotently.
create unique index if not exists order_items_order_line_unique
  on public.order_items(order_id, line_index);

create index if not exists order_items_order_id_idx
  on public.order_items(order_id);

create index if not exists order_items_menu_item_id_idx
  on public.order_items(menu_item_id);

create index if not exists order_items_created_at_idx
  on public.order_items(created_at);

create index if not exists order_items_name_idx
  on public.order_items(name);

-- =============================================================================
-- Trigger: populate order_items from orders.cart_items after paid/succeeded
-- =============================================================================

create or replace function public.sync_order_items_from_order_cart()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  items jsonb;
  itm jsonb;
  i int := 0;
  qty int;
  unit_cents bigint;
  line_cents bigint;
  mid uuid;
  nm text;
  note text;
  mods jsonb;
  ph text;
begin
  -- Only when paid/succeeded
  if new.payment_status not in ('paid','succeeded') then
    return new;
  end if;

  items := new.cart_items;

  if items is null or jsonb_typeof(items) <> 'array' then
    return new;
  end if;

  -- Wipe then rebuild for this order (simple, deterministic).
  -- This avoids partial/duplicate states if cart_items changed before payment settled.
  delete from public.order_items where order_id = new.id;

  for itm in select value from jsonb_array_elements(items)
  loop
    -- quantity (default 1)
    qty :=
      greatest(
        1,
        coalesce(
          nullif((itm->>'quantity')::int, 0),
          nullif((itm->>'qty')::int, 0),
          1
        )
      );

    -- name (required)
    nm := coalesce(
      nullif(itm->>'name',''),
      nullif(itm->>'title',''),
      nullif(itm->>'item_name',''),
      'Unknown Item'
    );

    -- menu_item_id (best-effort; different shapes over time)
    begin
      mid := nullif(coalesce(itm->>'menuItemId', itm->>'menu_item_id', itm->>'item_id', itm->>'id'), '')::uuid;
    exception when others then
      mid := null;
    end;

    -- per-unit cents (try common keys)
    unit_cents :=
      coalesce(
        nullif((itm->>'unitPriceCents')::bigint, 0),
        nullif((itm->>'unit_price_cents')::bigint, 0),
        nullif((itm->>'price_cents')::bigint, 0),
        nullif((itm->>'unit_amount')::bigint, 0),
        nullif((itm->>'base_price')::bigint, 0),
        0
      );

    -- line total cents (prefer explicit if present)
    line_cents :=
      coalesce(
        nullif((itm->>'lineTotalCents')::bigint, 0),
        nullif((itm->>'line_total_cents')::bigint, 0),
        nullif((itm->>'total_cents')::bigint, 0),
        (unit_cents * qty::bigint)
      );

    -- notes
    note := nullif(coalesce(itm->>'notes', itm->>'special_instructions', itm->>'note'), '');

    -- modifiers (store raw; app can interpret)
    mods :=
      case
        when jsonb_typeof(itm->'modifiers') = 'array' then (itm->'modifiers')
        else '[]'::jsonb
      end;

    -- pricing hash (optional)
    ph := nullif(coalesce(itm->>'pricingHash', itm->>'pricing_hash'), '');

    insert into public.order_items(
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
    )
    values (
      new.id,
      i,
      mid,
      nm,
      qty,
      unit_cents,
      line_cents,
      mods,
      note,
      ph
    );

    i := i + 1;
  end loop;

  return new;
end;
$$;

-- Trigger fires on insert OR when payment_status/cart_items changes
drop trigger if exists trg_sync_order_items_from_order_cart on public.orders;

create trigger trg_sync_order_items_from_order_cart
after insert or update of payment_status, cart_items
on public.orders
for each row
execute function public.sync_order_items_from_order_cart();

commit;