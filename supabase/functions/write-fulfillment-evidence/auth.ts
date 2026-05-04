// PATH: supabase/functions/write-fulfillment-evidence/auth.ts
// =============================================================================
// MIGRATED: replaced local createClient(url, serviceRoleKey) factory with
// supabaseAdmin() from _shared. createServiceClient() is removed entirely.
// createAnonClient() is preserved — it uses the anon key + user JWT for RLS.
//
// All exported function signatures are unchanged — callers are unaffected.
// =============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin }                      from '../_shared/supabaseAdmin.ts';

// ---------------------------------------------------------------------------
// Anon client (user-JWT bound, RLS enforced) — unchanged
// ---------------------------------------------------------------------------

export function createAnonClient(supabaseUrl: string, anonKey: string, jwt: string): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

// ---------------------------------------------------------------------------
// Service client — migrated to supabaseAdmin()
//
// The supabaseUrl / serviceRoleKey parameters are kept in the signature so
// existing call sites in index.ts compile without changes. They are ignored
// internally — supabaseAdmin() reads env vars directly, which is the correct
// server-side pattern.
//
// Once index.ts is updated to call createServiceClient() with no arguments,
// these parameters can be removed in a follow-up cleanup.
// ---------------------------------------------------------------------------

// FIX: removed deno-lint-ignore no-unused-vars — _ prefix convention is
// sufficient; the lint directive is now dead and triggers ban-unused-ignore.
export function createServiceClient(_supabaseUrl?: string, _serviceRoleKey?: string): SupabaseClient {
  return supabaseAdmin();
}

// ---------------------------------------------------------------------------
// Auth helpers — unchanged
// ---------------------------------------------------------------------------

export function getBearerToken(authHeader: string): string | null {
  const trimmed = authHeader.trim();
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function getAuthenticatedUser(
  anonClient: SupabaseClient,
  jwt: string,
): Promise<string | null> {
  const result = await anonClient.auth.getUser(jwt);
  return result.data?.user?.id ?? null;
}

export async function getProfileRole(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<{ data: { role: string } | null; error: unknown }> {
  const { data, error } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  return { data: data as { role: string } | null, error };
}