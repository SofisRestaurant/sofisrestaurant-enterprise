import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ProfileRoleRow } from './types.ts';

export function createAnonClient(supabaseUrl: string, anonKey: string, jwt: string): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

export function createServiceClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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
  if (result.error !== null || result.data.user === null) return null;
  return result.data.user.id;
}

export async function getProfileRole(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<{ data: ProfileRoleRow | null; error: Error | null }> {
  const result = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle<ProfileRoleRow>();

  return { data: result.data, error: result.error };
}