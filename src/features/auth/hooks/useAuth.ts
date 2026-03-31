// src/features/auth/hooks/useAuth.ts
// ============================================================================
// USE AUTH — Canonical auth hook for UI components (2026)
// ============================================================================
// This is the hook Header.tsx and all UI components should use.
// It reads exclusively from UserProvider — never calls Supabase directly.
//
// Flow:
//   Header / UI component
//     ↓
//   useAuth()            ← this file
//     ↓
//   UserProvider         ← single source of truth
//     ↓
//   authAPI / Supabase   ← never touched by UI
//
// Returns:
//   user          — AppUser | null  (merged auth + profile shape)
//   profile       — Profile | null  (raw DB profile row)
//   session       — Session | null  (Supabase session)
//   loading       — boolean
//   isAuthenticated
//   isAdmin
//   role
//   signIn / signUp / signOut
//   resetPassword / updatePassword
//   refreshProfile / updateProfile
// ============================================================================

import { useUserContext } from '@/contexts/useUserContext';

export function useAuth() {
  const ctx = useUserContext();
  return ctx;
}

export default useAuth;