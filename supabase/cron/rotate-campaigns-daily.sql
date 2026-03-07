-- PATH: supabase/cron/rotate-campaigns-daily.sql

-- Schedules the daily rotation. Safe to run multiple times.
do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'rotate_campaigns_daily'
  ) then
    perform cron.schedule(
      'rotate_campaigns_daily',
      '5 0 * * *',
      $$select public.rotate_daily_campaigns();$$
    );
  end if;

  -- Optional safety net (hourly); uncomment if desired.
  -- if not exists (
  --   select 1
  --   from cron.job
  --   where jobname = 'rotate_campaigns_hourly_safety'
  -- ) then
  --   perform cron.schedule(
  --     'rotate_campaigns_hourly_safety',
  --     '7 * * * *',
  --     $$select public.rotate_daily_campaigns();$$
  --   );
  -- end if;
end $$;