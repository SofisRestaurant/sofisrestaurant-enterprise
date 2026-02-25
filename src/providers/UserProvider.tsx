// src/providers/UserProvider.tsx
import { SessionManager } from '@/security/SessionManager'
import { ActivityTracker } from '@/security/ActivityTracker'
import { subscribeToForceLogout } from '@/security/ForceLogoutListener'
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  useCallback,
  useRef,
} from 'react'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/supabaseClient'
import { UserContext } from '@/contexts/UserContext'
import type { AppUser, UserContextValue, UserRole } from '@/contexts/userTypes'
import { mapSupabaseUser } from '@/utils/mapSupabaseUserToAppUser'
import { getMyProfile, updateMyProfile } from '@/lib/supabase/db/profile.api'
import type { Profile } from '@/types/profile'
import { authAPI } from "@/lib/supabase/auth.api"
import {
  loadProfileCache,
  saveProfileCache,
  clearProfileCache,
} from '@/lib/cache/profileCache'

interface UserProviderProps {
  children: ReactNode
}

function mergeUser(
  authUser: SupabaseUser | null,
  profile: Profile | null
): AppUser | null {
  const base = mapSupabaseUser(authUser)
  if (!base) return null

  return {
    ...base,
    name: profile?.full_name ?? base.name,
    phone: profile?.phone ?? base.phone ?? null,
    role: profile?.role ?? base.role ?? 'customer',
  }
}

function logAuthEvent(event: string) {
  console.log(`🔐 [AUTH] ${event}`)
}

export function UserProvider({ children }: UserProviderProps) {
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null)
  const [user, setUser] = useState<AppUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const requestIdRef = useRef(0)
  
  // Security system refs
  const sessionManagerRef = useRef<SessionManager | null>(null)
  const activityRef = useRef<ActivityTracker | null>(null)
  const forceLogoutCleanupRef = useRef<(() => void) | null>(null)

  // ==========================================================
  // PROFILE MANAGEMENT
  // ==========================================================
  const fetchProfileSafe = useCallback(async (authUser: SupabaseUser) => {
    const req = ++requestIdRef.current

    try {
      const p = await getMyProfile(authUser.id)
      if (req !== requestIdRef.current) return

      setProfile(p)
      setUser(mergeUser(authUser, p))
      saveProfileCache(p)
    } catch {
      if (req !== requestIdRef.current) return
      setProfile(null)
      setUser(mergeUser(authUser, null))
    }
  }, [])

  const refreshProfile = useCallback(async (): Promise<void> => {
    if (!supabaseUser) return
    await fetchProfileSafe(supabaseUser)
  }, [supabaseUser, fetchProfileSafe])

  const updateProfileAction = useCallback(
    async (input: Pick<Profile, 'full_name' | 'phone'>): Promise<Profile> => {
      if (!supabaseUser) throw new Error('Not authenticated')

      const updated = await updateMyProfile(supabaseUser.id, input)
      setProfile(updated)
      setUser(mergeUser(supabaseUser, updated))
      saveProfileCache(updated)
      return updated
    },
    [supabaseUser]
  )

  // ==========================================================
  // USER SESSION HANDLER
  // ==========================================================
  const applyUser = useCallback(
    (u: SupabaseUser | null, s: Session | null) => {
      requestIdRef.current++
      setSupabaseUser(u)
      setSession(s)

      if (!u) {
        setUser(null)
        setProfile(null)
        clearProfileCache()
        
        // Cleanup security systems
        sessionManagerRef.current?.stop()
        forceLogoutCleanupRef.current?.()
        forceLogoutCleanupRef.current = null
        
        return
      }

      setUser(mergeUser(u, null))

      const cached = loadProfileCache()
      if (cached) {
        setProfile(cached)
        setUser(mergeUser(u, cached))
      }

      fetchProfileSafe(u)

      // Start session security
      if (s) {
        sessionManagerRef.current?.start(s)
      }

      // Subscribe to force logout
      forceLogoutCleanupRef.current?.()
      forceLogoutCleanupRef.current = subscribeToForceLogout(u.id, async () => {
        logAuthEvent('admin_forced_logout')
        await supabase.auth.signOut()
      })
    },
    [fetchProfileSafe]
  )

  // ==========================================================
  // SECURITY SYSTEMS INITIALIZATION
  // ==========================================================
  useEffect(() => {
    // Initialize SessionManager
    sessionManagerRef.current = new SessionManager({
      onExpire: async () => {
        logAuthEvent('session_expired')
        await supabase.auth.signOut()
        clearProfileCache()
      },
      onRefresh: (newSession) => {
        logAuthEvent('session_refreshed')
        setSession(newSession)
        sessionManagerRef.current?.start(newSession)
      },
    })

    // Initialize ActivityTracker (60 minutes idle timeout)
    activityRef.current = new ActivityTracker(60, async () => {
      logAuthEvent('idle_timeout')
      await supabase.auth.signOut()
    })

    activityRef.current.start()

    return () => {
      sessionManagerRef.current?.stop()
      activityRef.current?.stop()
      forceLogoutCleanupRef.current?.()
    }
  }, [])

  // ==========================================================
  // AUTH STATE LISTENER
  // ==========================================================
  useEffect(() => {
    let mounted = true

    const init = async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return

      applyUser(data.session?.user ?? null, data.session)
      setLoading(false)
    }

    init()

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return
      applyUser(session?.user ?? null, session)
      setLoading(false)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [applyUser])


 // ==========================================================
// AUTH ACTIONS
// ==========================================================

const signIn = useCallback(
  async (email: string, password: string) => {
    const { error } = await authAPI.signIn({ email, password })
    if (error) throw error
  },
  []
)

const signUp = useCallback(
  async (email: string, password: string) => {
    const { error } = await authAPI.signUp({
      email,
      password,
    })
    if (error) throw error
  },
  []
)

const signOut = useCallback(async () => {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
  clearProfileCache()
}, [])

const resetPassword = useCallback(
  async (email: string, options?: { redirectTo?: string }) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: options?.redirectTo,
    })
    if (error) throw error
  },
  []
)

const updatePassword = useCallback(async (password: string) => {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}, [])

const refreshSession = useCallback(async () => {
  const { error } = await supabase.auth.refreshSession()
  if (error) throw error
}, [])

const updateMetadata = useCallback(
  async (metadata: Record<string, unknown>) => {
    const { error } = await supabase.auth.updateUser({ data: metadata })
    if (error) throw error
  },
  []
)

  // ==========================================================
  // CONTEXT VALUE
  // ==========================================================
  const role: UserRole = (user?.role as UserRole) ?? 'guest'
  const isAuthenticated = !!user
  const isAdmin = role === 'admin'

  const value = useMemo<UserContextValue>(
    () => ({
      user,
      supabaseUser,
      profile,
      session,
      loading,
      isAuthenticated,
      isAdmin,
      role,
      setUser,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      refreshSession,
      updateMetadata,
      refreshProfile,
      updateProfile: updateProfileAction,
    }),
    [
      user,
      supabaseUser,
      profile,
      session,
      loading,
      isAuthenticated,
      isAdmin,
      role,
      signIn,
      signUp,
      signOut,
      resetPassword,
      updatePassword,
      refreshSession,
      updateMetadata,
      refreshProfile,
      updateProfileAction,
    ]
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export default UserProvider