import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { UserRole } from '@/contexts/userTypes'

export type AppUser = {
  id: string
  email: string | null
  name: string | null
  role: UserRole
  avatarUrl?: string | null
}

export interface UserContextValue {
  user: AppUser | null
  supabaseUser: SupabaseUser | null
  loading: boolean
  isAuthenticated: boolean
  isAdmin: boolean
  role: UserRole

  setUser: (user: AppUser | null) => void

  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>

  resetPassword: (
  email: string,
  options?: { redirectTo?: string }
) => Promise<void>
  updatePassword: (password: string) => Promise<void>

  refreshSession: () => Promise<void>
  updateMetadata: (updates: Record<string, unknown>) => Promise<void>
}