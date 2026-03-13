// src/features/auth/components/LoginModal.tsx
// ============================================================================
// LOGIN MODAL — Production hardened (2026)
// ============================================================================
// Goals:
//  • No-misused-promises safe (void wrapper on submit)
//  • Strong typing (FormEvent<HTMLFormElement>)
//  • Better UX: trims email, disables while loading, clears error on input
//  • Robust error mapping (Supabase auth errors)
//  • Accessibility: labels, aria, autofill, focus, keyboard-friendly
//  • Safe callback orchestration + prevents double-submit
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void; // legacy / direct usage
  onLoginSuccess?: () => void; // AuthModals coordinator
  onSwitchToSignup?: () => void; // AuthModals coordinator
  onForgotPassword?: () => void; // AuthModals coordinator
}

type AuthErrorLike = { message?: string; status?: number; name?: string; code?: string };

function normalizeAuthError(err: unknown): string {
  const e = err as AuthErrorLike | null;

  const msg = typeof e?.message === 'string' ? e.message : '';
  const lower = msg.toLowerCase();

  if (lower.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (lower.includes('email not confirmed')) return 'Please confirm your email before signing in.';
  if (lower.includes('too many requests'))
    return 'Too many attempts. Please wait a moment and try again.';
  if (lower.includes('network') || lower.includes('fetch'))
    return 'Network error. Please check your connection.';

  return msg || 'Something went wrong. Please try again.';
}

export default function LoginModal({
  isOpen,
  onClose,
  onSuccess,
  onLoginSuccess,
  onSwitchToSignup,
  onForgotPassword,
}: LoginModalProps) {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPass, setShowPass] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const submitBtnRef = useRef<HTMLButtonElement | null>(null);

  const emailTrimmed = useMemo(() => email.trim(), [email]);
  const canSubmit = useMemo(() => {
    return !loading && emailTrimmed.length > 0 && password.length > 0;
  }, [loading, emailTrimmed, password]);

  // Reset on open/close for predictable UX
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setLoading(false);
    setShowPass(false);

    // Focus email for fast login
    const t = window.setTimeout(() => {
      emailInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(t);
  }, [isOpen]);

  // Clear error as user edits
  useEffect(() => {
    if (!error) return;
    // If user is interacting, clear the banner to reduce friction
    // (We do not clear on every render; only on input changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password]);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (loading) return;

      setError(null);
      setLoading(true);

      try {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: emailTrimmed,
          password,
        });

        if (authError) {
          setError(normalizeAuthError(authError));
          return;
        }

        // Success callbacks (coordinator first, then legacy)
        onLoginSuccess?.();
        onSuccess?.();

        onClose();
      } catch (err) {
        setError(normalizeAuthError(err));
      } finally {
        setLoading(false);
      }
    },
    [emailTrimmed, password, loading, onClose, onSuccess, onLoginSuccess],
  );

  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      // no-misused-promises: keep handler sync, run async via void
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

  if (!isOpen) return null;

  return (
    <div
      className="w-full overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Login"
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Header */}
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

      {/* Form */}
      <form onSubmit={onSubmit} className="px-8 py-7 space-y-5">
        {error ? (
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
            {error}
          </div>
        ) : null}

        {/* Email */}
        <div>
          <label
            htmlFor="login-email"
            className="block text-xs uppercase mb-1"
            style={{
              letterSpacing: 'var(--tracking-label)',
              color: 'var(--color-ink-500)',
            }}
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
            className="w-full px-4 py-2 outline-none transition-all"
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
          <div className="flex justify-between items-center mb-1">
            <label
              htmlFor="login-password"
              className="text-xs uppercase"
              style={{
                letterSpacing: 'var(--tracking-label)',
                color: 'var(--color-ink-500)',
              }}
            >
              Password
            </label>

            {onForgotPassword ? (
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs"
                style={{ color: 'var(--color-brand)' }}
              >
                Forgot password?
              </button>
            ) : null}
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
              className="w-full px-4 py-2 pr-16 outline-none transition-all"
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

        {/* Actions */}
        <div className="space-y-3">
          <button
            ref={submitBtnRef}
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
            {loading ? 'Signing in…' : 'Sign In'}
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

      {/* Footer */}
      <div className="px-8 pb-7 text-center text-sm">
        <span style={{ color: 'var(--color-ink-500)' }}>Don&apos;t have an account?</span>{' '}
        {onSwitchToSignup ? (
          <button
            type="button"
            onClick={handleSwitchToSignup}
            style={{ color: 'var(--color-brand)', fontWeight: 600 }}
          >
            Create one
          </button>
        ) : null}
      </div>
    </div>
  );
}
