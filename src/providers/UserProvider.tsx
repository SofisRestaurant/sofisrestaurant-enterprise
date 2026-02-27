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
import type { User as SupabaseUser, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/supabaseClient'
import { UserContext } from '@/contexts/UserContext'
import type { AppUser, UserContextValue, UserRole } from '@/contexts/userTypes'
import { mapSupabaseUser } from '@/utils/mapSupabaseUserToAppUser'
import { getMyProfile, updateMyProfile } from '@/lib/supabase/db/profile.api'
import type { Profile } from '@/types/profile'
import { authAPI } from '@/lib/supabase/auth.api';
import {
  loadProfileCache,
  saveProfileCache,
  clearProfileCache,
} from '@/lib/cache/profileCache'

// ============================================================================
// TYPES
// ============================================================================

interface UserProviderProps {
  children: ReactNode
}

// ============================================================================
// PURE HELPERS
// ============================================================================

function mergeUser(
  authUser: SupabaseUser | null,
  profile: Profile | null
): AppUser | null {
  const base = mapSupabaseUser(authUser)
  if (!base) return null;
  return {
    ...base,
    name: profile?.full_name ?? base.name,
    phone: profile?.phone ?? base.phone ?? null,
    role: (profile?.role ?? base.role ?? 'customer') as AppUser['role'],
  };
}

function logAuthEvent(event: string) {
  if (import.meta.env.DEV) {
    console.log(`🔐 [AUTH] ${event}`);
  }
}

// Only these events represent a genuine new user session (apply cache, fetch profile)
const SIGN_IN_EVENTS = new Set<AuthChangeEvent>(['SIGNED_IN', 'USER_UPDATED'])

// Token refresh: update session ref only — don't touch user/profile state
const TOKEN_EVENTS = new Set<AuthChangeEvent>(['TOKEN_REFRESHED'])

// ============================================================================
// PROVIDER
// ============================================================================

export function UserProvider({ children }: UserProviderProps) {
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const requestIdRef = useRef(0);

  // Security system refs
  const sessionManagerRef = useRef<SessionManager | null>(null);
  const activityRef = useRef<ActivityTracker | null>(null);
  const forceLogoutCleanupRef = useRef<(() => void) | null>(null);

  // Stable ref so the auth listener never needs to re-subscribe when
  // applyUser is recreated by useCallback
  const applyUserRef = useRef<
    (u: SupabaseUser | null, s: Session | null, event?: AuthChangeEvent) => void
  >(() => {});

  // ==========================================================
  // PROFILE MANAGEMENT
  // ==========================================================

  const fetchProfileSafe = useCallback(async (authUser: SupabaseUser) => {
    const req = ++requestIdRef.current;

    try {
      const p = await getMyProfile(authUser.id);
      if (req !== requestIdRef.current) return; // superseded

      setProfile(p);
      setUser(mergeUser(authUser, p));
      saveProfileCache(p);
    } catch {
      if (req !== requestIdRef.current) return;
      setProfile(null);
      setUser(mergeUser(authUser, null));
    }
  }, []);

  const refreshProfile = useCallback(async (): Promise<void> => {
    if (!supabaseUser) return;
    await fetchProfileSafe(supabaseUser);
  }, [supabaseUser, fetchProfileSafe]);

  const updateProfileAction = useCallback(
    async (input: Pick<Profile, 'full_name' | 'phone'>): Promise<Profile> => {
      if (!supabaseUser) throw new Error('Not authenticated');
      const updated = await updateMyProfile(supabaseUser.id, input);
      setProfile(updated);
      setUser(mergeUser(supabaseUser, updated));
      saveProfileCache(updated);
      return updated;
    },
    [supabaseUser],
  );

  // ==========================================================
  // SECURITY TEARDOWN (synchronous — always call before signOut)
  // ==========================================================

  const teardownSecurity = useCallback(() => {
    sessionManagerRef.current?.stop();
    forceLogoutCleanupRef.current?.();
    forceLogoutCleanupRef.current = null;
  }, []);

  // ==========================================================
  // APPLY USER — core state transition
  // ==========================================================

  const applyUser = useCallback(
    (u: SupabaseUser | null, s: Session | null, event?: AuthChangeEvent) => {
      requestIdRef.current++; // cancel any in-flight profile fetch

      setSupabaseUser(u);
      setSession(s);

      // ── Signed out ────────────────────────────────────────────────────
      if (!u) {
        setUser(null);
        setProfile(null);
        clearProfileCache();
        teardownSecurity();
        logAuthEvent('signed_out');
        return;
      }

      // ── Token refresh only — session ref updated above, nothing else ──
      if (event && TOKEN_EVENTS.has(event)) {
        logAuthEvent(`token_refreshed uid=${u.id}`);
        if (s) sessionManagerRef.current?.start(s);
        return;
      }

      // ── New login or user update ───────────────────────────────────────
      // Optimistically set user without profile while fetch is in flight
      setUser(mergeUser(u, null));

      // Apply cache only on genuine sign-in (not token refreshes)
      const isNewLogin = !event || SIGN_IN_EVENTS.has(event);
      if (isNewLogin) {
        const cached = loadProfileCache();
        if (cached) {
          setProfile(cached);
          setUser(mergeUser(u, cached));
        }
      }

      fetchProfileSafe(u);

      if (s) sessionManagerRef.current?.start(s);

      // Re-subscribe to force-logout for this user (clears previous subscription)
      forceLogoutCleanupRef.current?.();
      forceLogoutCleanupRef.current = subscribeToForceLogout(u.id, async () => {
        logAuthEvent('admin_forced_logout');
        teardownSecurity();
        await supabase.auth.signOut();
      });

      logAuthEvent(`applied uid=${u.id} event=${event ?? 'init'}`);
      logAuthEvent(`applied uid=${u.id} event=${event ?? 'init'}`);
      logAuthEvent(`applied uid=${u.id} event=${event ?? 'init'}`);
    },
    [fetchProfileSafe, teardownSecurity],
  );
  // Keep stable ref current so listener never needs to re-subscribe
  useEffect(() => {
    applyUserRef.current = applyUser;
  });

  // ==========================================================
  // SECURITY SYSTEMS INITIALIZATION
  // ==========================================================

  useEffect(() => {
    sessionManagerRef.current = new SessionManager({
      onExpire: async () => {
        logAuthEvent('session_expired');
        teardownSecurity();
        await supabase.auth.signOut();
        clearProfileCache();
      },
      onRefresh: (newSession) => {
        logAuthEvent('session_refreshed');
        setSession(newSession);
        sessionManagerRef.current?.start(newSession);
      },
    });

    activityRef.current = new ActivityTracker(60, async () => {
      logAuthEvent('idle_timeout');
      teardownSecurity();
      await supabase.auth.signOut();
    });

    activityRef.current.start();

    return () => {
      sessionManagerRef.current?.stop();
      activityRef.current?.stop();
      forceLogoutCleanupRef.current?.();
    };
  }, [teardownSecurity]);

  // ==========================================================
  // AUTH STATE LISTENER
  // ==========================================================

  useEffect(() => {
    let mounted = true;
    let initResolved = false;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        applyUserRef.current(data.session?.user ?? null, data.session);
      } finally {
        if (mounted) {
          initResolved = true;
          setLoading(false);
        }
      }
    };

    init();

   const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
     if (!mounted) return;

     // 🔹 Prevent duplicate initial session handling
     if (event === 'INITIAL_SESSION') {
       if (initResolved) return;
       applyUserRef.current(session?.user ?? null, session, event);
       setLoading(false);
       return;
     }

     // 🔹 Token refresh succeeded
     if (event === 'TOKEN_REFRESHED') {
       applyUserRef.current(session?.user ?? null, session, event);
       return;
     }

     // 🔹 Handle signed out cleanly (refresh token invalid, manual logout, etc)
     if (event === 'SIGNED_OUT') {
       clearProfileCache();
       applyUserRef.current(null, null, event);
       return;
     }

     // 🔹 Default case (SIGNED_IN, USER_UPDATED, etc)
     applyUserRef.current(session?.user ?? null, session, event);
   });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  // ==========================================================
  // AUTH ACTIONS
  // ==========================================================

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await authAPI.signIn({ email, password });
    if (error) throw error;

    // ── THE FIX: wait for session to be established before resolving ──
    // Without this, navigate() in AuthModal fires before onAuthStateChange
    // has run applyUser(), so isAuthenticated is still false when AuthGuard
    // checks it. This was the root cause of the mobile redirect bug.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user) {
      throw new Error('Session not established after sign-in');
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await authAPI.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    // Tear down security systems synchronously before calling Supabase,
    // so there's no window where they run without an active user.
    teardownSecurity();
    clearProfileCache();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, [teardownSecurity]);

  const resetPassword = useCallback(async (email: string, options?: { redirectTo?: string }) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: options?.redirectTo,
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const refreshSession = useCallback(async () => {
    const { error } = await supabase.auth.refreshSession();
    if (error) throw error;
  }, []);

  const updateMetadata = useCallback(async (metadata: Record<string, unknown>) => {
    const { error } = await supabase.auth.updateUser({ data: metadata });
    if (error) throw error;
  }, []);

  // ==========================================================
  // CONTEXT VALUE
  // ==========================================================

  const role: UserRole = (user?.role as UserRole) ?? 'guest';
  const isAuthenticated = !!user;
  const isAdmin = role === 'admin';

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
    ],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export default UserProvider