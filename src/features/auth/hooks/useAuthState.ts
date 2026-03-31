// src/features/auth/hooks/useAuthState.ts
// ============================================================================
// AUTH STATE HOOK — Reads from UserProvider (no direct Supabase calls)
// ============================================================================
// Flow:
//   UI component → useAuthState() → UserProvider → authAPI → Supabase
//
// The previous version of this file had the entire auth.api.ts source
// (~850 lines) prepended to the hook by accident. That is removed.
// The canonical auth API lives at: src/features/auth/auth.api.ts
// ============================================================================

import { useUserContext } from '@/contexts/useUserContext';

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Primary auth state hook.
 * Returns the full context shape from UserProvider — never calls Supabase.
 * Includes: user, profile, session, loading, isAuthenticated, isAdmin, role,
 * signIn, signUp, signOut, resetPassword, updatePassword, refreshProfile, etc.
 *
 * Prefer this over useAuth() — they are equivalent aliases.
 */
export function useAuthState() {
  return useUserContext();
}

/**
 * Minimal hook — raw Supabase user + loading state only.
 * Use when you only need to check login status, not the full user shape.
 * Prefer useAuth() / useAuthState() when you also need profile, role, or actions.
 */
export function useUser() {
  const { supabaseUser, loading } = useUserContext();
  return { user: supabaseUser, loading };
}