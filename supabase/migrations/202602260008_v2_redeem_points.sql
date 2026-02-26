-- =============================================================================
-- V2: Redeem Points (Atomic, Idempotent, Balance-Safe)
-- =============================================================================

create or replace function public.v2_redeem_points(
  p_account_id uuid,
  p_admin_id uuid,
  p_amount integer,
  p_idempotency_key text default null,
  p_reference_id uuid default null
)
returns table(
  new_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account loyalty_accounts%rowtype;
  v_new_balance integer;
begin

  if p_amount <= 0 then
    raise exception 'Redeem amount must be positive';
  end if;

  -- Idempotency protection
  if p_idempotency_key is not null then
    if exists (
      select 1
      from loyalty_ledger
      where idempotency_key = p_idempotency_key
    ) then
      return query
      select balance
      from loyalty_accounts
      where id = p_account_id;
      return;
    end if;
  end if;

  -- Lock account row
  select *
  into v_account
  from loyalty_accounts
  where id = p_account_id
  for update;

  if not found then
    raise exception 'Loyalty account not found';
  end if;

  if v_account.balance < p_amount then
    raise exception 'Insufficient loyalty balance';
  end if;

  v_new_balance := v_account.balance - p_amount;

  update loyalty_accounts
  set
    balance = v_new_balance,
    last_activity = now(),
    updated_at = now()
  where id = v_account.id;

  insert into loyalty_ledger (
    account_id,
    amount,
    balance_after,
    entry_type,
    source,
    reference_id,
    admin_id,
    idempotency_key,
    tier_at_time,
    streak_at_time,
    metadata
  )
  values (
    v_account.id,
    -p_amount,
    v_new_balance,
    'redeem',
    'admin',
    p_reference_id,
    p_admin_id,
    p_idempotency_key,
    v_account.tier,
    v_account.streak,
    jsonb_build_object(
      'redeemed_at', now(),
      'redeemed_by', p_admin_id
    )
  );

  return query
  select v_new_balance;

end;
$$;