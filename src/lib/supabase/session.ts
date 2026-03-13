// src/lib/supabase/session.ts
// =============================================================================
// Session helpers — single source of truth for JWT access tokens
// - Always returns a fresh access token when possible
// - Never returns expired/stale tokens without attempting refresh
// =============================================================================

import { supabase } from './supabaseClient';

export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;

  let token = data.session?.access_token ?? null;
  if (token) return token;

  // Attempt refresh if session missing/stale
  const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
  if (refreshErr) return null;

  token = refreshed.session?.access_token ?? null;
  return token;
}

export async function requireAccessToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new Error('Missing session access token');
  return token;
}
