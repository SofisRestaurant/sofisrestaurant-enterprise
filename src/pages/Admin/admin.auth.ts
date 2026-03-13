// src/pages/Admin/admin.auth.ts
// =============================================================================
// Admin auth utilities — single place to enforce admin gate on client
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';
import { ADMIN_PATHS } from './admin.constants';

export type AdminAuthResult =
  | { ok: true; userId: string; firstName: string }
  | {
      ok: false;
      redirectTo: string;
      reason: 'no-session' | 'not-admin' | 'profile-missing' | 'unknown';
    };

/**
 * Performs:
 * 1) session check
 * 2) rpc('is_admin', { uid })
 * 3) profile load (first name for UI)
 */
export async function verifyAdminAccess(): Promise<AdminAuthResult> {
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return { ok: false, redirectTo: ADMIN_PATHS.login, reason: 'no-session' };

    const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin', { uid });
    if (adminErr) return { ok: false, redirectTo: ADMIN_PATHS.login, reason: 'unknown' };
    if (!isAdmin) return { ok: false, redirectTo: '/', reason: 'not-admin' };

    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', uid)
      .single();

    if (profErr) return { ok: false, redirectTo: ADMIN_PATHS.login, reason: 'profile-missing' };

    const firstName = (prof?.full_name?.split(' ')[0] ?? 'Admin').trim() || 'Admin';
    return { ok: true, userId: uid, firstName };
  } catch {
    return { ok: false, redirectTo: ADMIN_PATHS.login, reason: 'unknown' };
  }
}

/**
 * Subscribe to auth changes; calls onSignOut when session becomes null.
 */
export function subscribeToAdminSession(onSignOut: () => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_e, session) => {
    if (!session) onSignOut();
  });
  return () => data.subscription.unsubscribe();
}
