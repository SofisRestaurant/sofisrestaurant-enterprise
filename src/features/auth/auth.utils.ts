// src/features/auth/auth.utils.ts
import type { AppUser } from '@/contexts/userTypes'

/**
 * Safe human display name for UI (supports your AppUser shape).
 */
export function getUserDisplayName(user: AppUser | null | undefined): string {
  if (!user) return 'Guest'
  if (user.name && user.name.trim()) return user.name.trim()
  if (user.email && user.email.includes('@')) return user.email.split('@')[0]
  return 'User'
}

/**
 * Normalize Supabase / network / unknown auth errors into a user-friendly message.
 * (Named export required by ForgotPasswordModal.tsx)
 */
export function formatAuthError(err: unknown): string {
  // Supabase errors often come as { message, status, ... }
  const message =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message ?? '')
        : ''

  const m = message.toLowerCase()

  // Common, friendly mappings
  if (!message) return 'Something went wrong. Please try again.'
  if (m.includes('invalid login credentials')) return 'Invalid email or password.'
  if (m.includes('email not confirmed')) return 'Please confirm your email before signing in.'
  if (m.includes('user already registered')) return 'An account with this email already exists.'
  if (m.includes('password should be at least')) return 'Your password is too short.'
  if (m.includes('rate limit') || m.includes('too many requests'))
    return 'Too many attempts. Please wait a moment and try again.'
  if (m.includes('network') || m.includes('fetch')) return 'Network error. Check your connection and try again.'

  // Default: show the original message (cleaned)
  return message
}