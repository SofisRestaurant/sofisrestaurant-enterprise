// src/lib/supabase/auth.api.ts
// =============================================================================
// AUTH API — Production Grade (2026)
// =============================================================================
// Key upgrades:
// - ✅ login-guard is a gate only (rate-limit / lockout / anti-bot), NOT a session issuer
// - ✅ never calls supabase.auth.setSession() from a custom payload
//   (prevents refresh-token bugs + random 403 -> signed_out)
// - ✅ consistent error normalization + safe JSON parsing
// - ✅ strongly-typed, minimal surface area
// - ✅ optional requestId propagation if your guards return it
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient'
import type { User, Session, AuthError } from '@supabase/supabase-js'

/* =========================
   Shared Response Type
========================= */

export interface ApiResponse<T> {
  data: T | null
  error: AuthError | null
}

/* =========================
   Payload Types
========================= */

export interface SignUpData {
  email: string
  password: string
  fullName?: string
}

export interface SignInData {
  email: string
  password: string
}

/* =========================
   Internal Helpers
========================= */

type GuardOk = { ok: true; requestId?: string }
type GuardFail = { ok: false; error?: string; code?: string; requestId?: string }
type GuardResponse = GuardOk | GuardFail

function logAuth(message: string, extra?: unknown) {
  console.log(`🔐 [AUTH] ${message}`, extra ?? '')
}

function env(key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string {
  const v = (import.meta as any).env?.[key] as string | undefined
  return (v ?? '').trim()
}

function asAuthError(message: string, name = 'AuthError'): AuthError {
  return { name, message } as AuthError
}

async function safeJson(res: Response): Promise<unknown> {
  const ct = (res.headers.get('content-type') ?? '').toLowerCase()
  if (!ct.includes('application/json')) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

function guardHeaders(): Record<string, string> {
  const url = env('VITE_SUPABASE_URL')
  const anon = env('VITE_SUPABASE_ANON_KEY')
  if (!url || !anon) {
    // Do not throw; keep client resilient. Caller will get a friendly error.
    return {
      'Content-Type': 'application/json',
      'x-application-name': 'sofis-restaurant-v2',
    }
  }

  // NOTE: Edge Functions often expect apikey; Authorization is not required for guard endpoints,
  // but keeping it as anon is harmless if your server expects it.
  return {
    'Content-Type': 'application/json',
    apikey: anon,
    Authorization: `Bearer ${anon}`,
    'x-application-name': 'sofis-restaurant-v2',
  }
}

/**
 * Gate requests through an Edge Function guard.
 * This MUST NOT return a "session" used in supabase.auth.setSession().
 */
async function callGuard(
  path: 'login-guard' | 'password-guard',
  body: unknown,
): Promise<GuardResponse> {
  const baseUrl = env('VITE_SUPABASE_URL')
  if (!baseUrl) return { ok: false, error: 'Missing VITE_SUPABASE_URL', code: 'ENV_MISSING' }

  const res = await fetch(`${baseUrl}/functions/v1/${path}`, {
    method: 'POST',
    headers: guardHeaders(),
    body: JSON.stringify(body),
  })

  const data = (await safeJson(res)) as any

  if (res.ok) {
    // If your guard returns structured envelopes, preserve requestId when present.
    const requestId = typeof data?.requestId === 'string' ? data.requestId : undefined
    return { ok: true, requestId }
  }

  // Normalize known server shapes:
  const msg =
    (typeof data?.error === 'string' && data.error) ||
    (typeof data?.message === 'string' && data.message) ||
    `Request blocked (${res.status})`

  const code = typeof data?.code === 'string' ? data.code : `HTTP_${res.status}`
  const requestId = typeof data?.requestId === 'string' ? data.requestId : undefined

  return { ok: false, error: msg, code, requestId }
}

/* =========================
   Auth API
========================= */

export const authAPI = {
  /* -------------------------
     Sign In (PRODUCTION SAFE)
     - Guard first
     - Real Supabase signInWithPassword second
  -------------------------- */
  async signIn(credentials: SignInData): Promise<ApiResponse<{ user: User; session: Session }>> {
    logAuth('Attempt login', credentials.email)

    // 1) Guard (rate limit / lockout / anti-bot)
    const gate = await callGuard('login-guard', credentials)
    if (!gate.ok) {
      console.error('❌ Guard blocked login:', gate.code, gate.error, gate.requestId ?? '')
      return { data: null, error: asAuthError(gate.error ?? 'Login blocked') }
    }

    // 2) Real Supabase login (supabase-js owns refresh tokens + session rotation)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    })

    if (error) {
      console.error('❌ Supabase login failed:', error.message)
      return { data: null, error }
    }

    if (!data?.user || !data?.session) {
      return { data: null, error: asAuthError('Login failed: missing session') }
    }

    logAuth('Login success', data.user.id)

    return {
      data: { user: data.user, session: data.session },
      error: null,
    }
  },

  /* -------------------------
     Sign Up
  -------------------------- */
  async signUp(payload: SignUpData): Promise<ApiResponse<{ user: User; session: Session | null }>> {
    const { email, password, fullName } = payload
    logAuth('Attempt signup', email)

    // Guard password policy / known-bad patterns / etc.
    const gate = await callGuard('password-guard', { email, password })
    if (!gate.ok) {
      console.log('⛔ GUARD BLOCKED SIGNUP', gate.code, gate.requestId ?? '')
      return { data: null, error: asAuthError(gate.error ?? 'Password validation failed', 'PasswordError') }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      console.error('❌ Signup failed:', error.message)
      return { data: null, error }
    }

    if (!data.user) {
      return { data: null, error: asAuthError('Signup failed') }
    }

    logAuth('Signup success', data.user.id)

    return {
      data: { user: data.user, session: data.session },
      error: null,
    }
  },

  /* -------------------------
     Google OAuth
  -------------------------- */
  async signInWithGoogle(): Promise<ApiResponse<null>> {
    logAuth('Google OAuth start')

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) console.error('❌ Google login failed:', error.message)
    return { data: null, error }
  },

  /* -------------------------
     Sign Out
  -------------------------- */
  async signOut(): Promise<ApiResponse<null>> {
    logAuth('Signing out')

    const { error } = await supabase.auth.signOut()
    if (error) console.error('❌ Sign out failed:', error.message)

    return { data: null, error }
  },

  /* -------------------------
     Reset Password
  -------------------------- */
  async resetPassword(email: string): Promise<ApiResponse<null>> {
    logAuth('Password reset requested', email)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    })

    if (error) console.error('❌ Reset failed:', error.message)
    return { data: null, error }
  },

  /* -------------------------
     Update Password
  -------------------------- */
  async updatePassword(newPassword: string): Promise<ApiResponse<null>> {
    logAuth('Updating password')

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) console.error('❌ Password update failed:', error.message)

    return { data: null, error }
  },

  /* -------------------------
     Update Profile Metadata
  -------------------------- */
  async updateProfile(updates: { full_name?: string; avatar_url?: string }): Promise<ApiResponse<null>> {
    logAuth('Updating profile metadata')

    const { error } = await supabase.auth.updateUser({ data: updates })
    if (error) console.error('❌ Profile update failed:', error.message)

    return { data: null, error }
  },

  /* -------------------------
     Get Session
  -------------------------- */
  async getSession(): Promise<ApiResponse<Session>> {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.error('❌ Get session failed:', error.message)
      return { data: null, error }
    }
    return { data: data.session, error: null }
  },

  /* -------------------------
     Get User
  -------------------------- */
  async getUser(): Promise<ApiResponse<User>> {
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      console.error('❌ Get user failed:', error.message)
      return { data: null, error }
    }
    return { data: data.user, error: null }
  },

  /* -------------------------
     OTP Verify
  -------------------------- */
  async verifyOtp(email: string, token: string, type: 'email' | 'recovery'): Promise<ApiResponse<null>> {
    logAuth('Verifying OTP')

    const { error } = await supabase.auth.verifyOtp({ email, token, type })
    if (error) console.error('❌ OTP failed:', error.message)

    return { data: null, error }
  },

  /* -------------------------
     Resend Verification
  -------------------------- */
  async resendVerificationEmail(email: string): Promise<ApiResponse<null>> {
    logAuth('Resending verification', email)

    const { error } = await supabase.auth.resend({ type: 'signup', email })
    if (error) console.error('❌ Resend failed:', error.message)

    return { data: null, error }
  },

  /* -------------------------
     Auth Listener
  -------------------------- */
  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange(callback)
  },
}