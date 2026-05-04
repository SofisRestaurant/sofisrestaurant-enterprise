create table if not exists public.admin_profit_snapshot (
  singleton_id boolean primary key default true,
  total_gross_profit_cents bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint admin_profit_snapshot_singleton check (singleton_id = true)
);

insert into public.admin_profit_snapshot (singleton_id, total_gross_profit_cents)
values (true, 0)
on conflict (singleton_id) do nothing;
