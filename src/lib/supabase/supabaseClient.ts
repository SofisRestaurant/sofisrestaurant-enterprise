import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/lib/config/env';

import type { Database } from './database.types';

const SUPABASE_GLOBAL_HEADERS = {
  'x-application-name': env.app.name,
} as const;

export const REALTIME_SUBSCRIBE_STATES = {
  CLOSED: 'CLOSED',
  CHANNEL_ERROR: 'CHANNEL_ERROR',
  SUBSCRIBED: 'SUBSCRIBED',
  TIMED_OUT: 'TIMED_OUT',
} as const;

export type RealtimeSubscribeState =
  (typeof REALTIME_SUBSCRIBE_STATES)[keyof typeof REALTIME_SUBSCRIBE_STATES];

export function isRealtimeSubscribed(
  value: unknown,
): value is typeof REALTIME_SUBSCRIBE_STATES.SUBSCRIBED {
  return value === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED;
}

export function isRealtimeSubscribeState(value: unknown): value is RealtimeSubscribeState {
  return (
    value === REALTIME_SUBSCRIBE_STATES.CLOSED ||
    value === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
    value === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED ||
    value === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
  );
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.supabase.url,
  env.supabase.publishableKey,
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      persistSession: true,
      storageKey: 'sofis-auth-token',
    },
    global: {
      headers: SUPABASE_GLOBAL_HEADERS,
    },
  },
);

declare global {
  interface Window {
    supabase: SupabaseClient<Database> | undefined;
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.supabase = supabase;
  console.info('[supabase] connected to:', env.supabase.url);
}