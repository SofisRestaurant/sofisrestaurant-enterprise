// src/features/auth/hooks/useAuthState.ts
// ============================================================================
// AUTH STATE — READS FROM USER PROVIDER (NO DIRECT SUPABASE CALLS)
// ============================================================================

import { useUserContext } from '@/contexts/useUserContext'

interface AuthState {
  user: ReturnType<typeof useUserContext>['supabaseUser']
  session: ReturnType<typeof useUserContext>['session']
  loading: boolean
  isAuthenticated: boolean
}

/**
 * This hook NO LONGER talks to Supabase.
 * UserProvider is the single source of truth.
 */
export function useAuthState(): AuthState {
  const { supabaseUser, session, loading, isAuthenticated } =
    useUserContext()

  return {
    user: supabaseUser,
    session,
    loading,
    isAuthenticated,
  }
}

/**
 * Compatibility helper
 */
export function useUser() {
  const { supabaseUser, loading } = useUserContext()
  return { user: supabaseUser, loading }
}