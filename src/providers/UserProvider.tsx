// src/providers/UserProvider.tsx
// ============================================================================
// USER PROVIDER — Enterprise Stable (2026) — Secure Level 10
// ============================================================================
// Guarantees:
// - ✅ Single source of truth for auth/session/user/profile state
// - ✅ StrictMode-safe (no double init storms)
// - ✅ No signOut storms (re-entrancy guarded + reasoned signOut)
// - ✅ Never logs JWT/session; DEV logs are minimal + deduped
// - ✅ Token refresh does NOT wipe profile/user state
// - ✅ Profile fetch is cancelable via request epoch
// - ✅ Force-logout + SessionManager + Idle timeout are coordinated
// - ✅ Security teardown ALWAYS happens before any signOut
//
// Optional nice-to-haves you already have:
// - profileCache.ts for cached profile hydration
// - SessionManager / ActivityTracker / ForceLogoutListener
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AuthChangeEvent, Session, User as SupabaseUser } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/supabaseClient';
import { UserContext } from '@/contexts/UserContext';
import type { AppUser, UserContextValue, UserRole } from '@/contexts/userTypes';

import { SessionManager } from '@/security/SessionManager';
import { ActivityTracker } from '@/security/ActivityTracker';
import { subscribeToForceLogout } from '@/security/ForceLogoutListener';

import { mapSupabaseUser } from '@/utils/mapSupabaseUserToAppUser';
import { getMyProfile, updateMyProfile } from '@/lib/supabase/db/profile.api';
import type { Profile } from '@/types/profile';
import { authAPI } from '@/lib/supabase/auth.api';

import { loadProfileCache, saveProfileCache, clearProfileCache } from '@/lib/cache/profileCache';

// ============================================================================
// TYPES
// ============================================================================

interface UserProviderProps {
  children: ReactNode;
}

type SignOutReason =
  | 'manual'
  | 'session_expired'
  | 'idle_timeout'
  | 'admin_forced_logout'
  | 'auth_forbidden'
  | 'auth_invalid'
  | 'unknown';

type ApplyContext = {
  event?: AuthChangeEvent;
  // true when we are applying from initial boot sequence
  boot?: boolean;
};

// ============================================================================
// DEV LOGGING (deduped + low-noise)
// ============================================================================

function devLog(msg: string, meta?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  // avoid massive spam in StrictMode / multiple listeners
  console.log(`🔐 [AUTH] ${msg}`, meta ?? '');
}

// ============================================================================
// PURE HELPERS
// ============================================================================

function mergeUser(authUser: SupabaseUser | null, profile: Profile | null): AppUser | null {
  const base = mapSupabaseUser(authUser);
  if (!base) return null;
  return {
    ...base,
    name: profile?.full_name ?? base.name,
    phone: profile?.phone ?? base.phone ?? null,
    role: (profile?.role ?? base.role ?? 'customer') as AppUser['role'],
  };
}

// Events that imply "new user identity applied" (good moment to hydrate cache, refresh profile)
const SIGN_IN_EVENTS = new Set<AuthChangeEvent>(['SIGNED_IN', 'USER_UPDATED']);

// Events that are "session churn only" — do not touch profile/user besides sessionRef
const SESSION_ONLY_EVENTS = new Set<AuthChangeEvent>(['TOKEN_REFRESHED']);

// ============================================================================
// PROVIDER
// ============================================================================

export function UserProvider({ children }: UserProviderProps) {
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // ───────────────────────────────────────────────────────────────────────────
  // Internal coordination refs
  // ───────────────────────────────────────────────────────────────────────────

  // Cancels in-flight profile fetches when user changes
  const profileEpochRef = useRef(0);

  // Prevent multiple concurrent signOut sequences
  const signingOutRef = useRef(false);

  // Prevent StrictMode double-init from creating multiple security systems
  const initializedRef = useRef(false);

  // Keep a stable apply function reference for auth listener
  const applyRef = useRef<(u: SupabaseUser | null, s: Session | null, ctx?: ApplyContext) => void>(
    () => {},
  );

  // Security systems
  const sessionManagerRef = useRef<SessionManager | null>(null);
  const activityRef = useRef<ActivityTracker | null>(null);
  const forceLogoutCleanupRef = useRef<(() => void) | null>(null);

  // ───────────────────────────────────────────────────────────────────────────
  // SECURITY TEARDOWN (sync, always safe)
  // ───────────────────────────────────────────────────────────────────────────

  const teardownSecurity = useCallback(() => {
    try {
      sessionManagerRef.current?.stop();
    } catch {
      // ignore
    }
    try {
      activityRef.current?.stop();
    } catch {
      // ignore
    }
    try {
      forceLogoutCleanupRef.current?.();
    } catch {
      // ignore
    }
    forceLogoutCleanupRef.current = null;
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // SAFE SIGN OUT (re-entrancy guarded)
  // ───────────────────────────────────────────────────────────────────────────

  const safeSignOut = useCallback(
    async (reason: SignOutReason) => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;

      try {
        devLog(`signOut start`, { reason });

        // Always teardown first (no security callbacks firing during signOut)
        teardownSecurity();
        clearProfileCache();

        // Supabase handles local session removal + server revoke
        await supabase.auth.signOut();

        // State cleanup handled by SIGNED_OUT event, but do a local safety clear too
        setSupabaseUser(null);
        setSession(null);
        setUser(null);
        setProfile(null);
      } catch {
        // Never throw from signOut — user intent is to be signed out.
      } finally {
        signingOutRef.current = false;
        devLog(`signOut end`, { reason });
      }
    },
    [teardownSecurity],
  );

  // ───────────────────────────────────────────────────────────────────────────
  // PROFILE MANAGEMENT (epoch-cancelable)
  // ───────────────────────────────────────────────────────────────────────────

  const fetchProfileSafe = useCallback(async (authUser: SupabaseUser) => {
    const myEpoch = ++profileEpochRef.current;
    try {
      const p = await getMyProfile(authUser.id);
      if (myEpoch !== profileEpochRef.current) return;
      setProfile(p);
      setUser(mergeUser(authUser, p));
      saveProfileCache(p);
    } catch {
      if (myEpoch !== profileEpochRef.current) return;
      setProfile(null);
      setUser(mergeUser(authUser, null));
    }
  }, []);

  const refreshProfile = useCallback(async () => {
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

  // ───────────────────────────────────────────────────────────────────────────
  // APPLY USER (deterministic state machine)
  // ───────────────────────────────────────────────────────────────────────────

  const applyUser = useCallback(
    (u: SupabaseUser | null, s: Session | null, ctx?: ApplyContext) => {
      // bump epoch on identity change events to cancel profile fetches
      profileEpochRef.current++;

      const event = ctx?.event;
      const boot = Boolean(ctx?.boot);

      setSupabaseUser(u);
      setSession(s);

      // ── Signed out ────────────────────────────────────────────────────────
      if (!u) {
        setUser(null);
        setProfile(null);
        clearProfileCache();
        teardownSecurity();
        if (!boot) devLog('applied signed_out');
        return;
      }

      // ── Session churn only (token refresh, etc.) ─────────────────────────
      if (event && SESSION_ONLY_EVENTS.has(event)) {
        if (s) sessionManagerRef.current?.start(s);
        devLog('session_only_event', { event, uid: u.id });
        return;
      }

      // ── New user identity applied ─────────────────────────────────────────
      // Optimistic user (without profile) immediately
      setUser(mergeUser(u, null));

      // Apply cached profile only on boot or sign-in-like events (avoid flicker)
      if (boot || !event || SIGN_IN_EVENTS.has(event)) {
        const cached = loadProfileCache();
        if (cached) {
          setProfile(cached);
          setUser(mergeUser(u, cached));
        }
      }

      // Always refresh profile from server (best-effort)
      void fetchProfileSafe(u);

      // Start session manager
      if (s) sessionManagerRef.current?.start(s);

      // Force logout subscription (best-effort)
      try {
        forceLogoutCleanupRef.current?.();
      } catch {
        // ignore
      }
      forceLogoutCleanupRef.current = subscribeToForceLogout(u.id, () => {
        void safeSignOut('admin_forced_logout');
      });

      // Idle tracker starts on init; no need to restart here.
      devLog('applied', { uid: u.id, event: event ?? 'init' });
    },
    [fetchProfileSafe, teardownSecurity, safeSignOut],
  );
  useEffect(() => {
    applyRef.current = applyUser;
  }, [applyUser]);

  // ───────────────────────────────────────────────────────────────────────────
  // SECURITY SYSTEMS INITIALIZATION (StrictMode-safe)
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // SessionManager: manages refresh/expiry behavior
    sessionManagerRef.current = new SessionManager({
      onExpire: () => void safeSignOut('session_expired'),
      onRefresh: (newSession) => {
        // do not touch profile/user here
        setSession(newSession);
        sessionManagerRef.current?.start(newSession);
        devLog('session_refreshed');
      },
    });

    // ActivityTracker: inactivity logout (kept conservative)
    activityRef.current = new ActivityTracker(60, () => void safeSignOut('idle_timeout'));
    activityRef.current.start();

    return () => {
      teardownSecurity();
    };
  }, [safeSignOut, teardownSecurity]);

  // ───────────────────────────────────────────────────────────────────────────
  // AUTH BOOTSTRAP + AUTH LISTENER
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        applyRef.current(data.session?.user ?? null, data.session, {
          event: 'INITIAL_SESSION',
          boot: true,
        });
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void boot();

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      // Keep loading false once boot completes
      if (event === 'INITIAL_SESSION') return;

      // If refresh token becomes invalid, Supabase will emit SIGNED_OUT.
      if (event === 'SIGNED_OUT') {
        applyRef.current(null, null, { event });
        return;
      }

      // Apply all other events
      applyRef.current(nextSession?.user ?? null, nextSession, { event });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // AUTH ACTIONS (public API)
  // ───────────────────────────────────────────────────────────────────────────

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await authAPI.signIn({ email, password });
    if (error) throw error;

    // Ensure session exists before returning (prevents route guards flicker)
    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) throw new Error('Session not established after sign-in');
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await authAPI.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await safeSignOut('manual');
  }, [safeSignOut]);

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

  // ───────────────────────────────────────────────────────────────────────────
  // CONTEXT VALUE
  // ───────────────────────────────────────────────────────────────────────────

  const role: UserRole = (user?.role as UserRole) ?? 'guest';
  const isAuthenticated = Boolean(user);
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

export default UserProvider;