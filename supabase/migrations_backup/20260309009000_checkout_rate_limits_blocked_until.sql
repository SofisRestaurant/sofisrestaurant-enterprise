alter table public.checkout_rate_limits
  add column if not exists blocked_until timestamptz;

create index if not exists checkout_rate_limits_blocked_until_idx
  on public.checkout_rate_limits (blocked_until);

comment on column public.checkout_rate_limits.blocked_until is
  'If set and in the future, requests from this user are blocked until this time.';