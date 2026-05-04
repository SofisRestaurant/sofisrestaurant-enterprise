begin;

alter table public.pending_carts
  add column if not exists stripe_session_id text null,
  add column if not exists idempotency_key text null;

comment on column public.pending_carts.stripe_session_id is
'Stripe Checkout Session ID created for this cart (idempotency replay).';

comment on column public.pending_carts.idempotency_key is
'Client-supplied idempotency key. Unique per user to prevent duplicate sessions.';

create unique index if not exists pending_carts_user_idempotency_unique
  on public.pending_carts (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists pending_carts_stripe_session_id_idx
  on public.pending_carts (stripe_session_id);

commit;