// PATH: supabase/functions/admin-gateway/lib/auth.ts
// =============================================================================
// MIGRATED: replaced inline createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
// with createAnonClient() from _shared/supabase.ts.
// Function signature and behavior are identical — call sites unchanged.
// =============================================================================

import { createAnonClient } from '../../_shared/supabase.ts';

export async function verifyAdmin(authHeader: string) {
  const token = authHeader.replace('Bearer ', '').trim();

  // MIGRATED: createAnonClient() reads SUPABASE_URL + SUPABASE_ANON_KEY
  // from the shared env() helper — no inline Deno.env.get calls.
  const supabase = createAnonClient(token);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) throw new Error('Unauthorized');

  const { data: isAdmin } = await supabase.rpc('is_admin', {
    uid: user.id,
  });

  if (!isAdmin) throw new Error('Forbidden');

  return { user };
}