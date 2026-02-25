// src/utils/mapSupabaseUserToAppUser.ts
import type { User as SupabaseUser } from '@supabase/supabase-js'
import type { AppUser, UserRole } from '@/contexts/userTypes'

export function mapSupabaseUser(user: SupabaseUser | null): AppUser | null {
  if (!user) return null

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>

  const name =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    undefined // ✅ was null

  const avatarUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url.trim()) ||
    undefined // ✅ was null

  const role = (meta.role as UserRole) || 'customer'

  return {
    id: user.id,
    email: user.email ?? '',
    name, // ✅ string | undefined
    role,
    avatarUrl, // ✅ string | undefined
    createdAt: user.created_at ?? null,
  }
}

export default mapSupabaseUser