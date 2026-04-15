begin;

alter table public.pending_carts
  alter column pricing_snapshot set not null,
  alter column pricing_snapshot set default '{}'::jsonb;

alter table public.pending_carts
  alter column pricing_hash drop not null;

alter table public.pending_carts
  alter column currency set default 'usd';

alter table public.pending_carts
  alter column total_cents set default 0;

alter table public.pending_carts
  alter column subtotal_cents set default 0;

alter table public.pending_carts
  alter column discount_cents set default 0;

alter table public.pending_carts
  alter column tax_cents set default 0;

alter table public.pending_carts
  add column if not exists stripe_session_id text,
  add column if not exists idempotency_key text;

alter table public.pending_carts
  add column if not exists guest_email text,
  add column if not exists guest_token text;

create unique index if not exists pending_carts_user_idempotency_unique
  on public.pending_carts (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists pending_carts_stripe_session_id_idx
  on public.pending_carts (stripe_session_id);

commit;