// src/lib/supabase/session.ts
// =============================================================================
// Session helpers — keep JWT handling consistent everywhere
// =============================================================================

import { supabase } from './supabaseClient'

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function requireAccessToken(): Promise<string> {
  const token = await getAccessToken()
  if (!token) throw new Error('Missing session access token')
  return token
}