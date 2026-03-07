select * from order_events limit 5;-- PATH: supabase/cron/rotate-campaigns-daily.sql

-- ==========================================================
-- Sofi's Restaurant V2 (2026)
-- Daily Campaign Rotation Cron Job
-- ==========================================================
-- Schedules the campaign rotation function that selects
-- the featured campaign per placement each day.
--
-- Safe to run multiple times (idempotent).
-- Requires the pg_cron extension enabled in Supabase.
-- ==========================================================

begin;

-- Ensure pg_cron is available
create extension if not exists pg_cron;

-- Remove existing job if it already exists (prevents duplicates)
do $$
declare
  existing_job_id int;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'rotate_campaigns_daily'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

-- Schedule rotation every day at 00:05 UTC
select cron.schedule(
  'rotate_campaigns_daily',
  '5 0 * * *',
  $$select public.rotate_daily_campaigns();$$
);

commit;