// src/features/auth/components/LoginModal.tsx
// ============================================================================
// AUTH MODAL — Passwordless (2026)
// ============================================================================
// Two auth methods only:
//   1. Google OAuth  — one click, primary CTA
//   2. Magic link    — email → OTP link, no password ever
//
// Sign in and sign up are the same flow — passwordless means no distinction.
// ============================================================================

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useUserContext } from '@/contexts/useUserContext';
import { supabase } from '@/lib/supabase/supabaseClient';
import { GoogleSignInButton } from '@/features/auth/components/GoogleSignInButton';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onLoginSuccess?: () => void;
  onSwitchToSignup?: () => void;
  onForgotPassword?: () => void;
}

type Stage = 'idle' | 'sending' | 'sent' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginModal({
  isOpen,
  onClose,
  onSuccess,
  onLoginSuccess,
}: LoginModalProps) {
  const { signInWithGoogle } = useUserContext();

  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const emailValid = EMAIL_RE.test(email.trim());

  // Focus email input on open
  useEffect(() => {
    if (!isOpen) return;
    setEmail('');
    setStage('idle');
    setError(null);
    const t = setTimeout(() => emailRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [isOpen]);

  const handleSuccess = useCallback(() => {
    onLoginSuccess?.();
    onSuccess?.();
    onClose();
  }, [onLoginSuccess, onSuccess, onClose]);

  // Magic link
  const handleMagicLink = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!emailValid || stage === 'sending') return;

      setStage('sending');
      setError(null);

      try {
        const { error: err } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            shouldCreateUser: true,
          },
        });
        if (err) throw err;
        setStage('sent');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        setStage('error');
      }
    },
    [email, emailValid, stage],
  );

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to Sofi's"
      className="w-full overflow-hidden"
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--color-border)',
      }}
    >
      {/* Header */}
      <div className="px-8 pt-8 pb-6" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <p
          className="mb-1 text-xs font-bold uppercase tracking-[0.18em]"
          style={{ color: 'var(--color-ink-400)' }}
        >
          Sofi's Kitchen
        </p>
        <h2
          className="text-[1.65rem] leading-tight"
          style={{
            fontFamily: 'var(--font-display)',
            letterSpacing: 'var(--tracking-display)',
            color: 'var(--color-ink-900)',
          }}
        >
          {stage === 'sent' ? 'Check your email' : 'Welcome back'}
        </h2>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--color-ink-500)' }}>
          {stage === 'sent'
            ? `We sent a sign-in link to ${email.trim()}`
            : 'Sign in or create an account — no password needed.'}
        </p>
      </div>

      <div className="px-8 py-7 space-y-5">
        {stage === 'sent' ? (
          // ── Sent state ──────────────────────────────────────────────────────
          <div className="space-y-4 text-center">
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: 'var(--color-ember-50)' }}
            >
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-ember-500)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-ink-800)' }}>
                Magic link sent
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-500)' }}>
                Click the link in your email to sign in instantly. It expires in 10 minutes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setStage('idle');
                setEmail('');
              }}
              className="text-sm font-medium"
              style={{ color: 'var(--color-brand)' }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            {/* ── Google — primary CTA ──────────────────────────────────── */}
            <GoogleSignInButton
              label="Continue with Google"
              onBeforeRedirect={handleSuccess}
              onError={(err) => {
                setError(err.message);
                setStage('error');
              }}
            />

            {/* ── Divider ───────────────────────────────────────────────── */}
            <div className="relative flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: 'var(--color-border)' }} />
              <span
                className="text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--color-ink-400)' }}
              >
                or continue with email
              </span>
              <div className="h-px flex-1" style={{ background: 'var(--color-border)' }} />
            </div>

            {/* ── Magic link form ───────────────────────────────────────── */}
            <form
              onSubmit={(e) => {
                void handleMagicLink(e);
              }}
              className="space-y-3"
              noValidate
            >
              {error && (
                <div
                  role="alert"
                  className="rounded-lg px-4 py-3 text-sm"
                  style={{
                    background: 'var(--color-error-50)',
                    color: 'var(--color-error)',
                    border: '1px solid var(--color-error)',
                  }}
                >
                  {error}
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: 'var(--color-ink-500)' }}
                >
                  Email address
                </label>
                <input
                  ref={emailRef}
                  id="auth-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                    if (stage === 'error') setStage('idle');
                  }}
                  placeholder="you@example.com"
                  className="w-full px-4 py-2.5 text-sm outline-none transition-all"
                  style={{
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--color-border-mid)',
                    background: 'var(--color-surface-alt)',
                    color: 'var(--color-ink-900)',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={!emailValid || stage === 'sending'}
                className="w-full py-2.5 text-sm font-semibold transition-all"
                style={{
                  borderRadius: 'var(--radius-btn)',
                  background: emailValid ? 'var(--color-accent)' : 'var(--color-border-mid)',
                  color: emailValid ? 'var(--color-ink-900)' : 'var(--color-ink-500)',
                  boxShadow: emailValid ? 'var(--shadow-gold)' : 'none',
                  cursor: emailValid ? 'pointer' : 'not-allowed',
                  opacity: stage === 'sending' ? 0.7 : 1,
                }}
              >
                {stage === 'sending' ? 'Sending link…' : 'Send magic link'}
              </button>
            </form>

            {/* ── Privacy note ─────────────────────────────────────────── */}
            <p className="text-center text-xs" style={{ color: 'var(--color-ink-400)' }}>
              No password, no spam. Just a secure link to your inbox.
            </p>
          </>
        )}
      </div>

      {/* Close */}
      {stage !== 'sent' && (
        <div className="px-8 pb-7 text-center">
          <button
            type="button"
            onClick={onClose}
            className="text-sm"
            style={{ color: 'var(--color-ink-400)' }}
          >
            Cancel
          </button>
        </div>
      )}

      {stage === 'sent' && (
        <div className="px-8 pb-7 text-center">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold py-2.5 px-6 transition-all"
            style={{
              borderRadius: 'var(--radius-btn)',
              border: '1px solid var(--color-border-mid)',
              color: 'var(--color-ink-700)',
            }}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}