// src/features/auth/components/LoginModal.tsx
// ============================================================================
// LOGIN MODAL
// ============================================================================
// Props aligned to AuthModals.tsx usage:
//   onSwitchToSignup    — used by AuthModals to open signup
//   onForgotPassword    — used by AuthModals to open forgot-password
//   onLoginSuccess      — used by AuthModals for post-login redirect
//   onSuccess           — kept for direct usage outside AuthModals
// ============================================================================

import { useState, useCallback, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void; // legacy / direct usage
  onLoginSuccess?: () => void; // AuthModals coordinator
  onSwitchToSignup?: () => void; // AuthModals coordinator
  onForgotPassword?: () => void; // AuthModals coordinator
}

export default function LoginModal({
  isOpen,
  onClose,
  onSuccess,
  onLoginSuccess,
  onSwitchToSignup,
  onForgotPassword,
}: LoginModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (loading) return;

      setError(null);
      setLoading(true);

      try {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (authError) {
          setError('Incorrect email or password.');
          return;
        }

        // Call whichever success callback is provided
        onLoginSuccess?.();
        onSuccess?.();
        onClose();
      } catch {
        setError('Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [email, password, loading, onClose, onSuccess, onLoginSuccess],
  );

  if (!isOpen) return null;

  return (
    <div
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
          Sign in to your Sofi's account
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="px-8 py-7 space-y-5">
        {error && (
          <div
            className="rounded-md p-3 text-sm"
            style={{
              background: 'var(--color-error-50)',
              color: 'var(--color-error)',
              border: '1px solid var(--color-error)',
            }}
          >
            {error}
          </div>
        )}

        {/* Email */}
        <div>
          <label
            className="block text-xs uppercase mb-1"
            style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--color-ink-500)' }}
          >
            Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
              className="text-xs uppercase"
              style={{ letterSpacing: 'var(--tracking-label)', color: 'var(--color-ink-500)' }}
            >
              Password
            </label>
            {onForgotPassword && (
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-xs"
                style={{ color: 'var(--color-brand)' }}
              >
                Forgot password?
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2 pr-12 outline-none transition-all"
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
            >
              {showPass ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 font-semibold transition-all"
          style={{
            borderRadius: 'var(--radius-btn)',
            background: 'var(--color-accent)',
            color: 'var(--color-ink-900)',
            boxShadow: 'var(--shadow-gold)',
          }}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>

      {/* Footer */}
      <div className="px-8 pb-7 text-center text-sm">
        <span style={{ color: 'var(--color-ink-500)' }}>Don't have an account?</span>{' '}
        {onSwitchToSignup ? (
          <button
            type="button"
            onClick={onSwitchToSignup}
            style={{ color: 'var(--color-brand)', fontWeight: 600 }}
          >
            Create one
          </button>
        ) : null}
      </div>
    </div>
  );
}