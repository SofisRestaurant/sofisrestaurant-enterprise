begin;

create or replace function public.increment_promo_usage_if_available(p_promo_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  updated_count int;
begin
  update public.promotions
  set current_uses = current_uses + 1
  where id = p_promo_id
    and (max_uses is null or current_uses < max_uses)
  returning 1 into updated_count;

  return updated_count = 1;
end;
$$;

revoke all on function public.increment_promo_usage_if_available(uuid) from public;
grant execute on function public.increment_promo_usage_if_available(uuid) to service_role;

comment on function public.increment_promo_usage_if_available(uuid) is
'Atomically increments promotions.current_uses if max_uses not exceeded; returns true if reserved.';

commit;