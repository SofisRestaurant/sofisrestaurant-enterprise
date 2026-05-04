begin;

create or replace function public.increment_promo_usage_if_available(p_promo_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer := 0;
begin
  update public.promotions
  set
    current_uses = coalesce(current_uses, 0) + 1,
    updated_at = now()
  where id = p_promo_id
    and (
      max_uses is null
      or coalesce(current_uses, 0) < max_uses
    );

  get diagnostics updated_count = row_count;

  return updated_count = 1;
end;
$$;

revoke all on function public.increment_promo_usage_if_available(uuid) from public;
grant execute on function public.increment_promo_usage_if_available(uuid) to service_role;

comment on function public.increment_promo_usage_if_available(uuid) is
'Atomically increments promotions.current_uses if max_uses is not exceeded; returns true when the usage counter was incremented.';

commit;