// src/features/auth/components/AuthGate.tsx
// ============================================================================
// AUTH GATE
// ============================================================================
// Import path updated: '../api/session.api' → '@/features/auth/auth.api'
// Everything else unchanged.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useModal } from '@/components/ui/useModal';

import {
  getSessionStateSnapshot,
  subscribeToSessionChanges,
  type SessionStateSnapshot,
} from '@/features/auth/auth.api';

type AuthGateReason = 'anonymous' | 'email_unverified' | 'missing_role';

export interface AuthGateProps {
  children: ReactNode;
  redirectTo?: string;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
  allowSignup?: boolean;
  requireEmailVerified?: boolean;
  requiredRole?: string | readonly string[];
  title?: string;
  description?: string;
  className?: string;
  onAuthorized?: (snapshot: SessionStateSnapshot) => void;
  onUnauthorized?: (reason: AuthGateReason, snapshot: SessionStateSnapshot | null) => void;
}

interface GateState {
  loading: boolean;
  snapshot: SessionStateSnapshot | null;
  error: string | null;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function normalizeInternalRedirectPath(
  input: string | null | undefined,
  fallback: string,
): string {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value) return fallback;
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

function normalizeRequiredRoles(input: string | readonly string[] | undefined): readonly string[] {
  if (!input) return [];
  if (typeof input === 'string') {
    const value = input.trim().toLowerCase();
    return value ? [value] : [];
  }
  return input.map((role) => role.trim().toLowerCase()).filter((role) => role.length > 0);
}

function getUnauthorizedReason(
  snapshot: SessionStateSnapshot | null,
  requiredRoles: readonly string[],
  requireEmailVerified: boolean,
): AuthGateReason {
  if (!snapshot || snapshot.status !== 'authenticated' || !snapshot.user) return 'anonymous';
  if (requireEmailVerified && !snapshot.user.emailConfirmedAt) return 'email_unverified';
  if (requiredRoles.length > 0) {
    const currentRole = snapshot.user.role?.trim().toLowerCase() ?? '';
    if (!requiredRoles.includes(currentRole)) return 'missing_role';
  }
  return 'anonymous';
}

const INITIAL_STATE: GateState = { loading: true, snapshot: null, error: null };

export function AuthGate({
  children,
  redirectTo,
  fallback,
  loadingFallback,
  allowSignup = true,
  requireEmailVerified = false,
  requiredRole,
  title,
  description,
  className,
  onAuthorized,
  onUnauthorized,
}: AuthGateProps) {
  const { openModal } = useModal();
  const mountedRef = useRef(true);
  const lastOutcomeRef = useRef<string>('');
  const [state, setState] = useState<GateState>(INITIAL_STATE);

  const normalizedRequiredRoles = useMemo(
    () => normalizeRequiredRoles(requiredRole),
    [requiredRole],
  );

  const isAuthorized = useMemo(() => {
    if (state.snapshot?.status !== 'authenticated' || !state.snapshot.user) return false;
    if (requireEmailVerified && !state.snapshot.user.emailConfirmedAt) return false;
    if (normalizedRequiredRoles.length > 0) {
      const currentRole = state.snapshot.user.role?.trim().toLowerCase() ?? '';
      return normalizedRequiredRoles.includes(currentRole);
    }
    return true;
  }, [normalizedRequiredRoles, requireEmailVerified, state.snapshot]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let active = true;

    void getSessionStateSnapshot()
      .then((snapshot) => {
        if (!active || !mountedRef.current) return;
        setState({ loading: false, snapshot, error: null });
      })
      .catch((error: unknown) => {
        if (!active || !mountedRef.current) return;
        setState({
          loading: false,
          snapshot: null,
          error: error instanceof Error ? error.message : 'Unable to verify your session.',
        });
      });

    const unsubscribe = subscribeToSessionChanges((snapshot) => {
      if (!mountedRef.current) return;
      setState({ loading: false, snapshot, error: null });
    });

    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (state.loading) return;

    if (isAuthorized && state.snapshot) {
      const outcomeKey = `authorized:${state.snapshot.user?.id ?? 'unknown'}`;
      if (lastOutcomeRef.current !== outcomeKey) {
        lastOutcomeRef.current = outcomeKey;
        onAuthorized?.(state.snapshot);
      }
      return;
    }

    const reason = getUnauthorizedReason(state.snapshot, normalizedRequiredRoles, requireEmailVerified);
    const outcomeKey = `unauthorized:${reason}:${state.snapshot?.user?.id ?? 'guest'}`;
    if (lastOutcomeRef.current !== outcomeKey) {
      lastOutcomeRef.current = outcomeKey;
      onUnauthorized?.(reason, state.snapshot);
    }
  }, [isAuthorized, normalizedRequiredRoles, onAuthorized, onUnauthorized, requireEmailVerified, state.loading, state.snapshot]);

  const handleOpenLogin = useCallback(() => {
    syncRedirectQueryParam(redirectTo);
    openModal('login');
  }, [openModal, redirectTo]);

  const handleOpenSignup = useCallback(() => {
    syncRedirectQueryParam(redirectTo);
    openModal('signup');
  }, [openModal, redirectTo]);

  if (state.loading) {
    return (
      <>
        {loadingFallback ?? (
          <section
            className={cx('rounded-2xl border border-zinc-800 bg-[#050509] p-6 text-zinc-100', className)}
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="flex items-center gap-3">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-amber-400" aria-hidden="true" />
              <div>
                <p className="text-base font-semibold text-zinc-100">Verifying access</p>
                <p className="text-sm text-zinc-400">We're checking your session before rendering this content.</p>
              </div>
            </div>
          </section>
        )}
      </>
    );
  }

  if (isAuthorized) return <>{children}</>;
  if (fallback) return <>{fallback}</>;

  const unauthorizedReason = getUnauthorizedReason(state.snapshot, normalizedRequiredRoles, requireEmailVerified);

  const resolvedTitle =
    title ??
    (unauthorizedReason === 'email_unverified'
      ? 'Verify your email to continue'
      : unauthorizedReason === 'missing_role'
        ? 'You do not have access to this area'
        : 'Sign in to continue');

  const resolvedDescription =
    description ??
    (state.error
      ? state.error
      : unauthorizedReason === 'email_unverified'
        ? 'This area requires a verified email address before access is granted.'
        : unauthorizedReason === 'missing_role'
          ? 'Your current account does not include the required role for this screen.'
          : 'Please sign in or create an account to access this content.');

  return (
    <section
      className={cx('rounded-2xl border border-zinc-800 bg-[#050509] p-6 text-zinc-100 shadow-[0_0_0_1px_rgba(15,23,42,0.9)]', className)}
      aria-live="polite"
      role={state.error ? 'alert' : 'status'}
    >
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/70 text-lg font-semibold text-amber-300">
          {unauthorizedReason === 'missing_role' ? '!' : '🔐'}
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-100">{resolvedTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{resolvedDescription}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {unauthorizedReason === 'anonymous' && (
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
          {unauthorizedReason === 'email_unverified' && (
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050509]"
              onClick={handleOpenLogin}
            >
              Re-open sign-in
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

export default AuthGate;