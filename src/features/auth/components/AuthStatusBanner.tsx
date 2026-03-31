// src/features/auth/components/AuthStatusBanner.tsx
// ============================================================================
// AUTH STATUS BANNER
// ============================================================================
// Import paths updated:
//   '../api/auth.api'    → '@/features/auth/auth.api'
//   '../api/session.api' → '@/features/auth/auth.api'
// Both signOut and the session snapshot API now come from the same file.
// Everything else unchanged.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useModal } from '@/components/ui/useModal';

import {
  signOut,
  getSessionStateSnapshot,
  subscribeToSessionChanges,
  type SessionStateSnapshot,
} from '@/features/auth/auth.api';

export interface AuthStatusBannerProps {
  redirectTo?: string;
  title?: string;
  subtitle?: string;
  showWhenAuthenticated?: boolean;
  showWhenAnonymous?: boolean;
  allowSignup?: boolean;
  compact?: boolean;
  className?: string;
  onSignedOut?: () => void;
  onSignedIn?: (snapshot: SessionStateSnapshot) => void;
}

interface BannerState {
  loading: boolean;
  signingOut: boolean;
  snapshot: SessionStateSnapshot | null;
  error: string | null;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function normalizeInternalRedirectPath(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value === '') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || /^(https?:)?\/\//i.test(value)) {
    return fallback;
  }
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) return fallback;
  }
  return value;
}

function getCurrentRelativeUrl(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function syncRedirectQueryParam(redirectTo?: string): void {
  if (typeof window === 'undefined') return;
  const fallback = getCurrentRelativeUrl();
  const safeRedirect = normalizeInternalRedirectPath(redirectTo, fallback);
  const url = new URL(window.location.href);
  url.searchParams.set('redirect', safeRedirect);
  window.history.replaceState(
    window.history.state,
    document.title,
    `${url.pathname}${url.search}${url.hash}`,
  );
}

const INITIAL_STATE: BannerState = { loading: true, signingOut: false, snapshot: null, error: null };

export function AuthStatusBanner({
  redirectTo,
  title,
  subtitle,
  showWhenAuthenticated = true,
  showWhenAnonymous = true,
  allowSignup = true,
  compact = false,
  className,
  onSignedOut,
  onSignedIn,
}: AuthStatusBannerProps) {
  const { openModal } = useModal();
  const mountedRef = useRef(true);
  const [state, setState] = useState<BannerState>(INITIAL_STATE);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let active = true;

    void getSessionStateSnapshot()
      .then((snapshot) => {
        if (!active || !mountedRef.current) return;
        setState({ loading: false, signingOut: false, snapshot, error: null });
        if (snapshot.status === 'authenticated') onSignedIn?.(snapshot);
      })
      .catch((error: unknown) => {
        if (!active || !mountedRef.current) return;
        setState({
          loading: false,
          signingOut: false,
          snapshot: null,
          error: error instanceof Error ? error.message : 'Unable to load your session.',
        });
      });

    const unsubscribe = subscribeToSessionChanges((snapshot) => {
      if (!mountedRef.current) return;
      setState((current) => ({ ...current, loading: false, snapshot, error: null }));
      if (snapshot.status === 'authenticated') onSignedIn?.(snapshot);
    });

    return () => { active = false; unsubscribe(); };
  }, [onSignedIn]);

  const handleOpenLogin = useCallback(() => {
    syncRedirectQueryParam(redirectTo);
    openModal('login');
  }, [openModal, redirectTo]);

  const handleOpenSignup = useCallback(() => {
    syncRedirectQueryParam(redirectTo);
    openModal('signup');
  }, [openModal, redirectTo]);

  const handleSignOut = useCallback(async () => {
    setState((current) => ({ ...current, signingOut: true, error: null }));
    try {
      await signOut();
      if (!mountedRef.current) return;
      setState((current) => ({ ...current, signingOut: false }));
      onSignedOut?.();
    } catch (error: unknown) {
      if (!mountedRef.current) return;
      setState((current) => ({
        ...current,
        signingOut: false,
        error: error instanceof Error ? error.message : 'Unable to sign out.',
      }));
    }
  }, [onSignedOut]);

  const bannerCopy = useMemo(() => {
    if (state.snapshot?.status === 'authenticated') {
      const email = state.snapshot.user?.email ?? 'Signed-in guest';
      return {
        title: title ?? 'You are signed in',
        subtitle: subtitle ?? `Your session is active as ${email}. You can continue securely from here.`,
      };
    }
    return {
      title: title ?? 'Sign in for a faster checkout experience',
      subtitle: subtitle ?? 'Save your progress, manage orders, and access loyalty features from one account.',
    };
  }, [state.snapshot, subtitle, title]);

  if (state.loading) {
    return (
      <section
        className={cx('rounded-2xl border border-zinc-800 bg-[#050509] text-zinc-100', compact ? 'p-3' : 'p-4 sm:p-5', className)}
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex items-center gap-3">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-zinc-100">Checking your session</p>
            <p className="text-sm text-zinc-400">Please wait while we verify your sign-in state.</p>
          </div>
        </div>
      </section>
    );
  }

  if (state.snapshot?.status === 'authenticated' && !showWhenAuthenticated) return null;
  if (state.snapshot?.status !== 'authenticated' && !showWhenAnonymous) return null;

  return (
    <section
      className={cx('rounded-2xl border border-zinc-800 bg-[#050509] text-zinc-100 shadow-[0_0_0_1px_rgba(15,23,42,0.9)]', compact ? 'p-3.5' : 'p-4 sm:p-5', className)}
      aria-live="polite"
      role="status"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
            {state.snapshot?.status === 'authenticated' ? 'Authenticated' : 'Guest session'}
          </div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-100 sm:text-lg">{bannerCopy.title}</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-400">{bannerCopy.subtitle}</p>
          {state.error && (
            <p className="mt-3 text-sm font-medium text-red-300" role="alert">{state.error}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {state.snapshot?.status === 'authenticated' ? (
            <>
              <span className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300">
                {state.snapshot.user?.displayName ?? state.snapshot.user?.email ?? 'Signed in'}
              </span>
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050509] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => { void handleSignOut(); }}
                disabled={state.signingOut}
              >
                {state.signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050509]"
                onClick={handleOpenLogin}
              >
                Sign in
              </button>
              {allowSignup && (
                <button
                  type="button"
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050509]"
                  onClick={handleOpenSignup}
                >
                  Create account
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default AuthStatusBanner;