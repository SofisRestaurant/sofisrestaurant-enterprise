-- =============================================================================
-- V2: Award Points (Atomic, Idempotent, Ledger-Safe)
-- =============================================================================

create or replace function public.v2_award_points(
  p_user_id uuid,
  p_amount integer,
  p_admin_id uuid,
  p_reference_id uuid default null,
  p_idempotency_key text default null
)
returns table(
  new_balance integer,
  new_lifetime integer,
  new_tier text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account loyalty_accounts%rowtype;
  v_new_balance integer;
  v_new_lifetime integer;
  v_new_tier text;
begin

  if p_amount <= 0 then
    raise exception 'Award amount must be positive';
  end if;

  -- Idempotency protection
  if p_idempotency_key is not null then
    if exists (
      select 1
      from loyalty_ledger
      where idempotency_key = p_idempotency_key
    ) then
      return query
      select balance, lifetime_earned, tier
      from loyalty_accounts
      where user_id = p_user_id;
      return;
    end if;
  end if;

  -- Lock account row
  select *
  into v_account
  from loyalty_accounts
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'Loyalty account not found';
  end if;

  v_new_balance := v_account.balance + p_amount;
  v_new_lifetime := v_account.lifetime_earned + p_amount;

  -- Tier recalculation
  v_new_tier :=
    case
      when v_new_lifetime >= 5000 then 'platinum'
      when v_new_lifetime >= 2000 then 'gold'
      when v_new_lifetime >= 500 then 'silver'
      else 'bronze'
    end;

  update loyalty_accounts
  set
    balance = v_new_balance,
    lifetime_earned = v_new_lifetime,
    tier = v_new_tier,
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
    p_amount,
    v_new_balance,
    'earn',
    'admin',
    p_reference_id,
    p_admin_id,
    p_idempotency_key,
    v_new_tier,
    v_account.streak,
    jsonb_build_object(
      'awarded_at', now(),
      'awarded_by', p_admin_id
    )
  );

  return query
  select v_new_balance, v_new_lifetime, v_new_tier;

end;
$$;