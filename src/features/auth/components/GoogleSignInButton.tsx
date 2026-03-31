// src/features/auth/components/GoogleSignInButton.tsx
// ============================================================================
// GOOGLE SIGN-IN BUTTON
// ============================================================================
// Single responsibility: trigger the Google OAuth flow via Supabase.
//
// Flow:
//   Click → signInWithGoogle() → Supabase OAuth redirect → Google
//        → callback URL → Supabase exchanges code for session
//        → UserProvider picks up SIGNED_IN event automatically
//
// Usage:
//   <GoogleSignInButton />
//   <GoogleSignInButton label="Sign up with Google" redirectPath="/account" />
//   <GoogleSignInButton variant="icon-only" />
// ============================================================================

import { useState, useCallback } from 'react';
import { useUserContext } from '@/contexts/useUserContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoogleSignInButtonProps {
  /** Button label. Default: "Continue with Google" */
  label?: string;
  /** Where Supabase redirects after Google approves. Default: /account */
  redirectPath?: string;
  /** "full" shows logo + text; "icon-only" shows logo only (44×44px). Default: "full" */
  variant?: 'full' | 'icon-only';
  /** Extra Tailwind classes merged onto the button element */
  className?: string;
  /** Called right before the OAuth redirect fires — use to close modals */
  onBeforeRedirect?: () => void;
  /** Called if the OAuth call throws before the redirect happens */
  onError?: (error: Error) => void;
}

// ─── Google logo (official brand colours, inline SVG — no CDN needed) ────────

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────

export function GoogleSignInButton({
  label          = 'Continue with Google',
  redirectPath,
  variant        = 'full',
  className      = '',
  onBeforeRedirect,
  onError,
}: GoogleSignInButtonProps) {
  const { signInWithGoogle } = useUserContext();
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    try {
      onBeforeRedirect?.();
      // Navigates the browser to Google — setLoading(false) only runs on error.
      await signInWithGoogle({ redirectPath });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error('Google sign-in failed');
      onError?.(error);
      setLoading(false);
    }
  }, [loading, signInWithGoogle, redirectPath, onBeforeRedirect, onError]);

  const isIconOnly = variant === 'icon-only';

  return (
    <button
      type="button"
      onClick={() => { void handleClick(); }}
      disabled={loading}
      aria-label={isIconOnly ? 'Sign in with Google' : undefined}
      className={[
        'relative inline-flex items-center justify-center gap-3',
        'rounded-xl border font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        isIconOnly ? 'h-11 w-11' : 'h-11 w-full px-4 text-sm',
        'border-gray-300 bg-white text-gray-700',
        'hover:bg-gray-50 hover:border-gray-400',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'active:scale-[0.98]',
        'shadow-sm',
        className,
      ].filter(Boolean).join(' ')}
    >
      {loading ? (
        <svg
          className="h-5 w-5 animate-spin text-gray-500"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      ) : (
        <GoogleLogo size={20} />
      )}

      {!isIconOnly && (
        <span>{loading ? 'Redirecting…' : label}</span>
      )}
    </button>
  );
}

export default GoogleSignInButton;