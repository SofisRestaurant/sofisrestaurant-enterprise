begin;

alter table public.checkout_rate_limits
  add column if not exists blocked_until timestamptz null;

comment on column public.checkout_rate_limits.blocked_until is
'Rate limit: if set and in the future, requests are blocked.';

create index if not exists checkout_rate_limits_blocked_until_idx
  on public.checkout_rate_limits (blocked_until);

commit;