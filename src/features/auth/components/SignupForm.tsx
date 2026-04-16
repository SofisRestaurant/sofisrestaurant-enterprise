// src/features/auth/components/SignupForm.tsx
// ============================================================================
// SIGNUP FORM — Passwordless (2026)
// ============================================================================
// Used inside SignupModal or anywhere a standalone auth form is needed.
// Google OAuth primary, magic link email fallback. No passwords.
// ============================================================================

import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';
import { GoogleSignInButton } from '@/features/auth/components/GoogleSignInButton';

interface SignupFormProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

type Stage = 'idle' | 'sending' | 'sent' | 'error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignupForm({ onSuccess, onSwitchToLogin }: SignupFormProps) {
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState('');

  const emailValid = EMAIL_RE.test(email.trim());

  const handleMagicLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!emailValid || stage === 'sending') return;

    setStage('sending');
    setError('');

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
  };

  if (stage === 'sent') {
    return (
      <div className="space-y-4 text-center py-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#d97706"
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
          <p className="font-semibold text-white">Magic link sent!</p>
          <p className="mt-1 text-sm text-zinc-400">
            Check your inbox at <span className="text-white">{email.trim()}</span>. The link expires
            in 10 minutes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setStage('idle');
            setEmail('');
          }}
          className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Google — primary */}
      <GoogleSignInButton
        label="Sign up with Google"
        onBeforeRedirect={onSuccess}
        onError={(err) => setError(err.message)}
      />

      {/* Divider */}
      <div className="relative flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          or continue with email
        </span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      {/* Magic link */}
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
            className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label
            htmlFor="signup-email"
            className="block text-xs font-semibold uppercase tracking-wider text-zinc-500"
          >
            Email address
          </label>
          <input
            id="signup-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition-all focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/15"
          />
        </div>

        <button
          type="submit"
          disabled={!emailValid || stage === 'sending'}
          className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-black shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-400 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {stage === 'sending' ? 'Sending link…' : 'Send magic link'}
        </button>
      </form>

      <p className="text-center text-xs text-zinc-600">
        No password, no spam. Just a secure link to your inbox.
      </p>

      <p className="text-center text-sm text-zinc-500">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="font-semibold text-amber-400 hover:text-amber-300 transition-colors"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}