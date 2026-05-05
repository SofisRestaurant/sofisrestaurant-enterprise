-- =============================================================================
-- Migration: Pre-checkout adaptive risk gate tables
-- Run BEFORE deploying the edge function changes.
-- =============================================================================

-- ─── checkout_challenges ─────────────────────────────────────────────────────
--
-- Stores one-time-use OTP challenge nonces issued by verify-phone and consumed
-- by create-checkout on checkout retry.
--
-- One-time-use enforcement:
--   consumed_at IS NULL  → token not yet used
--   consumed_at IS NOT NULL → token consumed; any retry will be rejected
--
-- Atomic consumption is enforced in challenge-token.ts via:
--   UPDATE ... SET consumed_at = now()
--   WHERE id = <id> AND consumed_at IS NULL
-- which is serializable under Postgres row-level locking.
--
-- RLS strategy:
--   Service-role only (edge functions use SERVICE_ROLE_KEY).
--   No policy grants SELECT/INSERT/UPDATE to anon or authenticated roles.
--   The table contains no PII that maps back to a user without the nonce.
--
-- TTL pruning:
--   Rows expire after 10 minutes (enforced in application code).
--   Prune via pg_cron or a periodic Supabase scheduled function.
--   Safe to delete any row where expires_at < now() - interval '1 hour'.

create table if not exists public.checkout_challenges (
  id            uuid        not null default gen_random_uuid() primary key,
  nonce         text        not null unique,
  phone_e164    text        not null,
  identity_key  text        not null,   -- SHA-256 hex of userId or guestEmail
  issued_at     timestamptz not null default now(),
  expires_at    timestamptz not null,
  consumed_at   timestamptz,
  attempt_count int         not null default 0
);

-- Primary lookup: nonce → row (used by verifyChallengeToken)
create unique index if not exists uidx_checkout_challenges_nonce
  on public.checkout_challenges (nonce);

-- TTL cleanup query support: scan expired rows efficiently
create index if not exists idx_checkout_challenges_expires_at
  on public.checkout_challenges (expires_at)
  where consumed_at is null;

alter table public.checkout_challenges enable row level security;

comment on table public.checkout_challenges is
  'One-time-use OTP challenge nonces for the pre-checkout risk gate. '
  'Service-role access only. Prune expired rows hourly.';

comment on column public.checkout_challenges.identity_key is
  'SHA-256(userId) for auth users, SHA-256(guestEmail) for guests. '
  'Used to bind the token to a single identity — prevents token transfer between users.';

comment on column public.checkout_challenges.consumed_at is
  'Set atomically on first successful verification. '
  'NULL = unconsumed. NOT NULL = already used; reject any retry.';

-- ─── checkout_risk_events ─────────────────────────────────────────────────────
--
-- Rolling velocity tracking table. Rows are written on every checkout attempt
-- (fire-and-forget from trust-signals.ts via telemetry.ts). These rows power
-- the IP, device, and guest-email velocity checks in loadTrustSignals().
--
-- Write volume:
--   One row per checkout attempt. At typical restaurant scale (~1000 orders/day)
--   this table grows by ~1000 rows/day. Prune rows older than 24 hours.
--
-- Partial indexes:
--   Each velocity signal (IP, device, email) uses a covering partial index that
--   excludes NULL values. This keeps index size minimal and query latency low.
--
-- Partitioning:
--   If write volume exceeds ~50k rows/day, partition by day using
--   PARTITION BY RANGE (created_at). The partial indexes transfer cleanly.
--
-- RLS strategy:
--   Service-role only. Contains IP addresses and device fingerprints — not
--   accessible by any authenticated or anonymous role.

create table if not exists public.checkout_risk_events (
  id                 bigint      generated always as identity primary key,
  user_id            uuid        references auth.users (id) on delete set null,
  request_ip         text,
  device_fingerprint text,
  guest_email        text,       -- lowercased at write time
  risk_score         int,
  risk_action        text,       -- 'allow' | 'challenge' | 'block'
  created_at         timestamptz not null default now()
);

-- Velocity index: IP address
create index if not exists idx_risk_events_request_ip
  on public.checkout_risk_events (request_ip, created_at desc)
  where request_ip is not null;

-- Velocity index: device fingerprint
create index if not exists idx_risk_events_device_fingerprint
  on public.checkout_risk_events (device_fingerprint, created_at desc)
  where device_fingerprint is not null;

-- Velocity index: guest email
create index if not exists idx_risk_events_guest_email
  on public.checkout_risk_events (guest_email, created_at desc)
  where guest_email is not null;

-- TTL cleanup support
create index if not exists idx_risk_events_created_at
  on public.checkout_risk_events (created_at desc);

alter table public.checkout_risk_events enable row level security;

comment on table public.checkout_risk_events is
  'Rolling velocity tracking for the pre-checkout risk gate. '
  'Service-role access only. Prune rows older than 24 hours.';

-- ─── TTL cleanup jobs (pg_cron — enable if available) ────────────────────────
--
-- Uncomment after confirming pg_cron is enabled in your Supabase project:
--
-- select cron.schedule(
--   'prune-checkout-challenges',
--   '*/30 * * * *',
--   $$
--   delete from public.checkout_challenges
--   where expires_at < now() - interval '1 hour'
--   $$
-- );
--
-- select cron.schedule(
--   'prune-checkout-risk-events',
--   '0 * * * *',
--   $$
--   delete from public.checkout_risk_events
--   where created_at < now() - interval '24 hours'
--   $$
-- );
--
-- Alternative: schedule a Supabase Edge Function to run both deletes.
-- See: https://supabase.com/docs/guides/functions/schedule-functions