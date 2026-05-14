// src/features/auth/components/AuthCallback.tsx
// ============================================================================
// AUTH CALLBACK — Supabase OAuth code exchange handler
// ============================================================================
// WHY THIS EXISTS:
//   When a user signs in with Google (or any OAuth provider), Supabase redirects
//   back to your app at /auth/callback?code=xxxx
//
//   Without this route, React Router hits the * wildcard → NotFound → 404 flash.
//
//   This component:
//   1. Shows a spinner immediately (no flicker, no 404)
//   2. Waits for UserProvider to exchange the code via onAuthStateChange
//   3. Navigates to the intended destination once authenticated
//   4. Falls back to / on error with a clean message
//
// FLOW:
//   Google picks account
//     → Supabase redirects to /auth/callback?code=xxxx
//     → This component renders (spinner shown)
//     → Supabase SDK exchanges code for session in the background
//     → onAuthStateChange fires SIGNED_IN in UserProvider
//     → loading becomes false + user is set
//     → useEffect here detects auth state and navigates to redirectPath or /account
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUserContext } from '@/contexts/useUserContext';

// How long to wait before showing an error (ms)
const TIMEOUT_MS = 12_000;

export default function AuthCallback() {
  const navigate      = useNavigate();
  const [params]      = useSearchParams();
  const { user, loading } = useUserContext();

  const [timedOut, setTimedOut] = useState(false);
  const navigatedRef = useRef(false);

  // The redirect destination — callers can pass ?redirect=/some/path
  const redirectTo = (() => {
    const raw = params.get('redirect') ?? '/account';
    // Safety: only allow relative internal paths
    if (!raw.startsWith('/') || raw.startsWith('//')) return '/account';
    return raw;
  })();

  // ── Navigate once authenticated ───────────────────────────────────────────
  useEffect(() => {
    // Still bootstrapping — wait
    if (loading) return;
    // Already navigated — don't double-navigate
    if (navigatedRef.current) return;

    if (user) {
      navigatedRef.current = true;
      void navigate(redirectTo, { replace: true });
    }
    // If loading is done and user is still null, the timeout below will fire
  }, [user, loading, navigate, redirectTo]);

  // ── Safety timeout — don't spin forever ──────────────────────────────────
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!navigatedRef.current) setTimedOut(true);
    }, TIMEOUT_MS);

    return () => window.clearTimeout(id);
  }, []);

  // ── Error state ───────────────────────────────────────────────────────────
  if (timedOut) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
        style={{ background: 'var(--color-cream-100, #faf6ef)' }}
      >
        <div className="max-w-sm">
          <p className="text-lg font-semibold" style={{ color: 'var(--color-ink-900, #1c1915)' }}>
            Sign-in took too long
          </p>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-ink-500, #8a7a6a)' }}>
            The session could not be established. Please try signing in again.
          </p>
          <button
            type="button"
            onClick={() => {
              void navigate('/', { replace: true });
            }}
            className="mt-6 rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors"
            style={{
              background: 'var(--color-accent, #d4af37)',
              color: 'var(--color-ink-900, #1c1915)',
            }}
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  // ── Loading state (default — shown during OAuth code exchange) ────────────
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4"
      style={{ background: 'var(--color-cream-100, #faf6ef)' }}
      role="status"
      aria-label="Completing sign-in"
    >
      {/* Spinner */}
      <div
        className="h-10 w-10 animate-spin rounded-full border-4"
        style={{
          borderColor:    'rgba(212,175,55,0.2)',
          borderTopColor: 'var(--color-accent, #d4af37)',
        }}
        aria-hidden="true"
      />
      <p
        className="text-sm font-medium"
        style={{ color: 'var(--color-ink-500, #8a7a6a)' }}
      >
        Completing sign-in…
      </p>
    </div>
  );
}