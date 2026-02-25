// src/lib/supabase/auth.api.ts

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
   Helpers
========================= */

function logAuth(message: string, extra?: unknown) {
  console.log(`🔐 [AUTH] ${message}`, extra ?? '')
}

/* =========================
   Auth API
========================= */

export const authAPI = {
  /* -------------------------
     Sign In
  -------------------------- */
async signIn(
  credentials: SignInData
): Promise<ApiResponse<{ user: User; session: Session }>> {
  logAuth("Attempt login", credentials.email)

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/login-guard`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(credentials),
    }
  )

  const result = await res.json()

  if (!res.ok) {
    console.error("❌ Guard blocked login:", result.error)
    return {
      data: null,
      error: {
        name: "AuthError",
        message: result.error || "Login failed",
      } as AuthError,
    }
  }

  // 🔐 Apply session returned from guard
 const { error: sessionError } = await supabase.auth.setSession(result.session)
if (sessionError) {
  return { data: null, error: sessionError }
}

// 🔐 Wait for session to be fully applied
await new Promise<void>((resolve) => {
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.access_token === result.session.access_token) {
      sub.subscription.unsubscribe()
      resolve()
    }
  })
})

  if (sessionError) {
    return {
      data: null,
      error: sessionError,
    }
  }

  const { data: userData } = await supabase.auth.getUser()

  if (!userData.user) {
    return {
      data: null,
      error: {
        name: "AuthError",
        message: "User not found after login",
      } as AuthError,
    }
  }

  logAuth("Login success", userData.user.id)

  return {
    data: {
      user: userData.user,
      session: result.session,
    },
    error: null,
  }
},

  /* -------------------------
     Sign Up
  -------------------------- */
  async signUp(
  payload: SignUpData
): Promise<ApiResponse<{ user: User; session: Session | null }>> {
  const { email, password, fullName } = payload

  logAuth("Attempt signup", email)

  // 🔐 PASSWORD GUARD
  const guardRes = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/password-guard`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ email, password }),
  }
)

  const guardData = await guardRes.json()

  if (!guardRes.ok) {
  console.log("⛔ GUARD BLOCKED SIGNUP");
  return {
    data: null,
    error: {
      name: "PasswordError",
      message: guardData.error || "Password validation failed",
    } as AuthError,
  }
}

  // ✅ Safe to continue
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  })

  if (error) {
    console.error("❌ Signup failed:", error.message)
    return { data: null, error }
  }

  if (!data.user) {
    return {
      data: null,
      error: {
        name: "AuthError",
        message: "Signup failed",
      } as AuthError,
    }
  }

  logAuth("Signup success", data.user.id)

  return {
    data: {
      user: data.user,
      session: data.session,
    },
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
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) console.error('❌ Google login failed:', error.message)

    return {
      data: null,
      error,
    }
  },

  /* -------------------------
     Sign Out
  -------------------------- */
  async signOut(): Promise<ApiResponse<null>> {
    logAuth('Signing out')

    const { error } = await supabase.auth.signOut()

    if (error) console.error('❌ Sign out failed:', error.message)

    return {
      data: null,
      error,
    }
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

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) console.error('❌ Password update failed:', error.message)

    return { data: null, error }
  },

  /* -------------------------
     Update Profile Metadata
  -------------------------- */
  async updateProfile(updates: {
    full_name?: string
    avatar_url?: string
  }): Promise<ApiResponse<null>> {
    logAuth('Updating profile metadata')

    const { error } = await supabase.auth.updateUser({
      data: updates,
    })

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

    return {
      data: data.session,
      error: null,
    }
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

    return {
      data: data.user,
      error: null,
    }
  },

  /* -------------------------
     OTP Verify
  -------------------------- */
  async verifyOtp(
    email: string,
    token: string,
    type: 'email' | 'recovery'
  ): Promise<ApiResponse<null>> {
    logAuth('Verifying OTP')

    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type,
    })

    if (error) console.error('❌ OTP failed:', error.message)

    return { data: null, error }
  },

  /* -------------------------
     Resend Verification
  -------------------------- */
  async resendVerificationEmail(
    email: string
  ): Promise<ApiResponse<null>> {
    logAuth('Resending verification', email)

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    })

    if (error) console.error('❌ Resend failed:', error.message)

    return { data: null, error }
  },

  /* -------------------------
     Auth Listener
  -------------------------- */
  onAuthStateChange(
    callback: (event: string, session: Session | null) => void
  ) {
    return supabase.auth.onAuthStateChange(callback)
  },
}