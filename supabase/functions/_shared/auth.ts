// supabase/functions/_shared/auth.ts
// =============================================================================
// Shared JWT extraction + validation for all auth edge functions.
// Import as: import { extractUser, requireAuth } from '../_shared/auth.ts'
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthUser {
  id:    string;
  email: string | undefined;
  role:  string;
}
export async function requireAdmin(req: Request): Promise<AuthUser> {
  const user = await requireAuth(req)

  const svc = serviceClient()

  const { data: profile, error } = await svc
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (error || !profile || profile.role !== 'admin') {
    throw new AuthError('FORBIDDEN', 'Admin privileges required', 403)
  }

  return user
}
/**
 * Extract and validate the Bearer token from the Authorization header.
 * Returns the Supabase user if valid, throws a typed error if not.
 */
export async function requireAuth(req: Request): Promise<AuthUser> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('MISSING_TOKEN', 'Authorization header required', 401);
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    throw new AuthError('MISSING_TOKEN', 'Bearer token is empty', 401);
  }

  // Validate token against Supabase auth (user client — uses the caller's JWT)
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );

  const { data: { user }, error } = await userClient.auth.getUser();

  if (error || !user) {
    throw new AuthError('INVALID_TOKEN', 'Token is invalid or expired', 401);
  }

  return {
    id:    user.id,
    email: user.email,
    role:  (user.app_metadata?.role as string) ?? 'user',
  };
}

/**
 * Create a service-role Supabase client for privileged DB operations.
 * Never expose the service role key to the client.
 */
export function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

/** Typed auth error — maps to HTTP status codes */
export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}