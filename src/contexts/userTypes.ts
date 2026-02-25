// src/contexts/userTypes.ts
import type { Session, User as SupabaseUser } from '@supabase/supabase-js'
import type { Profile } from '@/types/profile'

/* =========================================================
   USER ROLES
========================================================= */

export type UserRole =  'guest' | 'customer' | 'staff' | 'admin'

/* =========================================================
   APP USER (what the UI consumes)
========================================================= */

export interface AppUser {
  id: string
  email: string
  name?: string
  phone?: string | null
  role: UserRole
  avatarUrl?: string
  createdAt?: string
}

/* =========================================================
   PROFILE UPDATE INPUT
========================================================= */

export type UpdateProfileInput = {
  full_name: string | null
  phone: string | null
}

/* =========================================================
   USER CONTEXT CONTRACT
========================================================= */

export interface UserContextValue {
  /** Main user object UI should rely on */
  user: AppUser | null

  /** Raw auth user */
  supabaseUser: SupabaseUser | null

  /** Active session */
  session: Session | null   // ⭐⭐⭐ REQUIRED FIX

  /** DB profile */
  profile: Profile | null

  /** True while bootstrapping */
  loading: boolean

  /* =======================================================
     DERIVED STATE
  ======================================================= */

  isAuthenticated: boolean
  isAdmin: boolean
  role: UserRole

  setUser: (user: AppUser | null) => void

  /* =======================================================
     AUTH ACTIONS
  ======================================================= */

  signIn: (email: string, password: string) => Promise<void>

  signUp: (
    email: string,
    password: string,
    name: string
  ) => Promise<void>

  signOut: () => Promise<void>

  resetPassword: (
    email: string,
    options?: { redirectTo?: string }
  ) => Promise<void>

  updatePassword: (newPassword: string) => Promise<void>

  refreshSession: () => Promise<void>

  updateMetadata: (metadata: Record<string, unknown>) => Promise<void>

  /* =======================================================
     PROFILE ACTIONS
  ======================================================= */

  refreshProfile: () => Promise<void>

  updateProfile: (input: UpdateProfileInput) => Promise<Profile>
}

// Force module mode
export {}