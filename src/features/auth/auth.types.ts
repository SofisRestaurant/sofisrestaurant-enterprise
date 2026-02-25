import { User as SupabaseUser } from '@supabase/supabase-js'

export interface User extends SupabaseUser {
  role?: UserRole
  profile?: UserProfile
}

export type UserRole = 'customer' | 'staff' | 'admin'

export interface UserProfile {
  id: string
  user_id: string
  full_name?: string
  phone?: string
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface SignupCredentials {
  email: string
  password: string
  fullName?: string
}

export interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  role: UserRole
  logout: () => Promise<void>
  isAdmin: boolean
  signIn: (credentials: LoginCredentials) => Promise<void>
  signUp: (credentials: SignupCredentials) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (
  email: string,
  options?: { redirectTo?: string }
) => Promise<void>
}