// src/features/auth/components/LoginModal.tsx
// ============================================================================
// LOGIN MODAL — Production hardened (2026)
// ============================================================================
// ✅ Uses useUserContext().signIn — UserProvider is notified, state updates correctly
// ✅ Uses useUserContext().signInWithGoogle — Google OAuth through the same path
// ✅ No direct supabase.auth calls — all auth goes through authAPI via UserProvider
// ✅ No-misused-promises safe (void wrapper on submit)
// ✅ Accessibility: labels, aria, autofill, focus, keyboard-friendly
// ✅ Error cleared on input change
// ✅ Rate-limit lockout with countdown timer
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useUserContext } from '@/contexts/useUserContext';
import { GoogleSignInButton } from '@/features/auth/components/GoogleSignInButton';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onLoginSuccess?: () => void;
  onSwitchToSignup?: () => void;
  onForgotPassword?: () => void;
}

// ─── Error normalizer ─────────────────────────────────────────────────────────

function normalizeAuthError(err: unknown): string {
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const lower = msg.toLowerCase();

  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
    return 'Incorrect email or password.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.';
  }
  if (lower.includes('too many') || lower.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Network error. Please check your connection.';
  }

  return msg || 'Something went wrong. Please try again.';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginModal({
  isOpen,
  onClose,
  onSuccess,
  onLoginSuccess,
  onSwitchToSignup,
  onForgotPassword,
}: LoginModalProps) {
  // ✅ Pull signIn and signInWithGoogle from UserProvider — NOT from supabase directly
  const { signIn, signInWithGoogle } = useUserContext();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rate-limit lockout
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const emailTrimmed = useMemo(() => email.trim(), [email]);
  const isBlocked = blockedUntil !== null && Date.now() < blockedUntil;

  const canSubmit = !loading && !isBlocked && emailTrimmed.length > 0 && password.length > 0;

  // ── Countdown timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!blockedUntil) return;
    const id = setInterval(() => {
      const remaining = Math.max(0, blockedUntil - Date.now());
      setTimeLeft(remaining);
      if (remaining === 0) {
        setBlockedUntil(null);
        setError(null);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [blockedUntil]);

  // ── Reset state on open ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setLoading(false);
    setShowPass(false);
    const t = window.setTimeout(() => emailInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  // ── Success helper ─────────────────────────────────────────────────────────
  const handleSuccess = useCallback(() => {
    onLoginSuccess?.();
    onSuccess?.();
    onClose();
  }, [onLoginSuccess, onSuccess, onClose]);

  // ── Email/password submit ──────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!canSubmit) return;

      setError(null);
      setLoading(true);

      try {
        // ✅ Goes through UserProvider → authAPI → Supabase
        // UserProvider's onAuthStateChange listener picks up SIGNED_IN automatically
        await signIn(emailTrimmed, password);
        handleSuccess();
      } catch (err: unknown) {
        const msg = normalizeAuthError(err);
        if (/too many|rate limit/i.test(msg)) {
          setBlockedUntil(Date.now() + 5 * 60 * 1000);
        }
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [canSubmit, signIn, emailTrimmed, password, handleSuccess],
  );

  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      void handleSubmit(e);
    },
    [handleSubmit],
  );

  const handleForgotPassword = useCallback(() => {
    setError(null);
    onForgotPassword?.();
  }, [onForgotPassword]);

  const handleSwitchToSignup = useCallback(() => {
    setError(null);
    onSwitchToSignup?.();
  }, [onSwitchToSignup]);

  const formatTime = (ms: number) => {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div
      className="w-full overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* ── Header ── */}
      <div className="px-8 pt-8 pb-6" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <h2
          className="text-2xl"
          style={{
            fontFamily: 'var(--font-display)',
            letterSpacing: 'var(--tracking-display)',
            color: 'var(--color-ink-900)',
          }}
        >
          Welcome Back
        </h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-ink-500)' }}>
          Sign in to your Sofi&apos;s account
        </p>
      </div>

      <div className="px-8 py-7 space-y-5">
        {/* ── Google OAuth button ── */}
        <GoogleSignInButton
          label="Continue with Google"
          // Close the modal before navigating to Google so it doesn't flash on return
          onBeforeRedirect={handleSuccess}
          onError={(err) => setError(err.message)}
          // ✅ signInWithGoogle is called inside GoogleSignInButton via useUserContext()
          // — it goes through UserProvider → authAPI → Supabase, same as signIn
        />

        {/* ── Divider ── */}
        <div className="relative flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: 'var(--color-border)' }} />
          <span
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color: 'var(--color-ink-400)' }}
          >
            or
          </span>
          <div className="h-px flex-1" style={{ background: 'var(--color-border)' }} />
        </div>

        {/* ── Email / password form ── */}
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {error && (
            <div
              className="rounded-md p-3 text-sm"
              role="alert"
              aria-live="polite"
              style={{
                background: 'var(--color-error-50)',
                color: 'var(--color-error)',
                border: '1px solid var(--color-error)',
              }}
            >
              {isBlocked && timeLeft > 0
                ? `Too many attempts. Try again in ${formatTime(timeLeft)}`
                : error}
            </div>
          )}

          {/* Email */}
          <div>
            <label
              htmlFor="login-email"
              className="block text-xs uppercase mb-1"
              style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--color-ink-500)' }}
            >
              Email
            </label>
            <input
              ref={emailInputRef}
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                if (error) setError(null);
                setEmail(e.target.value);
              }}
              placeholder="you@email.com"
              disabled={isBlocked}
              className="w-full px-4 py-2 outline-none transition-all disabled:opacity-60"
              style={{
                borderRadius: 'var(--radius-input)',
                border: '1px solid var(--color-border-mid)',
                background: 'var(--color-surface-alt)',
                color: 'var(--color-ink-900)',
              }}
            />
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="login-password"
                className="text-xs uppercase"
                style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--color-ink-500)' }}
              >
                Password
              </label>
              {onForgotPassword && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs"
                  style={{ color: 'var(--color-brand)' }}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <input
                id="login-password"
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => {
                  if (error) setError(null);
                  setPassword(e.target.value);
                }}
                placeholder="••••••••"
                disabled={isBlocked}
                className="w-full px-4 py-2 pr-16 outline-none transition-all disabled:opacity-60"
                style={{
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--color-border-mid)',
                  background: 'var(--color-surface-alt)',
                  color: 'var(--color-ink-900)',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sm"
                style={{ color: 'var(--color-ink-300)' }}
                aria-label={showPass ? 'Hide password' : 'Show password'}
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Submit */}
          <div className="space-y-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-3 font-semibold transition-all"
              style={{
                borderRadius: 'var(--radius-btn)',
                background: canSubmit ? 'var(--color-accent)' : 'var(--color-border-mid)',
                color: 'var(--color-ink-900)',
                boxShadow: canSubmit ? 'var(--shadow-gold)' : 'none',
                opacity: canSubmit ? 1 : 0.7,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
              }}
            >
              {loading ? 'Signing in…' : isBlocked ? `Locked (${formatTime(timeLeft)})` : 'Sign In'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-sm font-semibold transition-all"
              style={{
                borderRadius: 'var(--radius-btn)',
                border: '1px solid var(--color-border-mid)',
                background: 'transparent',
                color: 'var(--color-ink-700)',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      {/* ── Footer ── */}
      <div className="px-8 pb-7 text-center text-sm">
        <span style={{ color: 'var(--color-ink-500)' }}>Don&apos;t have an account?</span>{' '}
        {onSwitchToSignup && (
          <button
            type="button"
            onClick={handleSwitchToSignup}
            style={{ color: 'var(--color-brand)', fontWeight: 600 }}
          >
            Create one
          </button>
        )}
      </div>
    </div>
  );
}