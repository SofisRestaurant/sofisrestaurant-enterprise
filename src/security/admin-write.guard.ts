// src/security/admin-write.guard.ts
// ============================================================================
// ADMIN WRITE GUARD
// ============================================================================
// Guards all admin write operations (create, update, delete) against:
//   1. Missing session
//   2. Non-admin role
//   3. Expired session token
//
// Usage:
//   await adminWriteGuard()  // throws AdminAuthError if not authorized
//
// Pattern follows AdminLayout.tsx: checks profiles.role === 'admin'.
// ============================================================================

import { supabase } from '@/lib/supabase/supabaseClient'

// ─────────────────────────────────────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────────────────────────────────────

export class AdminAuthError extends Error {
  constructor(message: string, public code: 'NO_SESSION' | 'NOT_ADMIN' | 'SESSION_EXPIRED') {
    super(message)
    this.name = 'AdminAuthError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify the current user is an authenticated admin.
 * Call this at the top of every admin write operation.
 * Throws AdminAuthError if any check fails.
 */
export async function adminWriteGuard(): Promise<string> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()

  if (sessionError || !session?.user?.id) {
    throw new AdminAuthError('No active session. Please sign in.', 'NO_SESSION')
  }

  // Token expiry check
  const expiresAt = session.expires_at
  if (expiresAt && expiresAt * 1000 < Date.now()) {
    throw new AdminAuthError('Session expired. Please sign in again.', 'SESSION_EXPIRED')
  }

  // Role check — mirrors AdminLayout.tsx verification
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (profileError || profile?.role !== 'admin') {
    throw new AdminAuthError('Admin access required.', 'NOT_ADMIN')
  }

  return session.user.id
}

/**
 * Non-throwing version — returns null if not admin, userId if admin.
 */
export async function tryAdminWriteGuard(): Promise<string | null> {
  try {
    return await adminWriteGuard()
  } catch {
    return null
  }
}

/**
 * React hook-friendly wrapper — returns admin status synchronously
 * from a pre-fetched role value (to avoid async in render paths).
 */
export function assertAdminRole(role: string | undefined | null): void {
  if (role !== 'admin') {
    throw new AdminAuthError('Admin access required.', 'NOT_ADMIN')
  }
}