// src/features/auth/components/SignupModal.tsx
// =============================================================================
// SIGNUP MODAL — Production Grade (Matches Login)
// =============================================================================

import { useState, useCallback, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';

interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

export default function SignupModal({
  isOpen,
  onClose,
  onSuccess,
  onSwitchToLogin,
}: SignupModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (loading) return;

      setError(null);

      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }

      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }

      setLoading(true);

      try {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) {
          setError(error.message);
          return;
        }

        onSuccess?.();
        onClose();
      } catch {
        setError('Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [email, password, confirm, loading, onClose, onSuccess],
  );

  if (!isOpen) return null;

  return (
    <div className="w-full rounded-2xl bg-gray-900 border border-white/8 shadow-2xl overflow-hidden">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="px-8 pt-8 pb-6 border-b border-white/6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">✨</span>
          <h2 className="text-lg font-bold text-white tracking-tight">Create account</h2>
        </div>
        <p className="text-sm text-gray-500 ml-9">Join Sofi’s and start ordering</p>
      </div>

      {/* ── Form ─────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} noValidate className="px-8 py-7 space-y-5">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3"
          >
            <span className="mt-0.5 text-red-400 text-sm">⚠</span>
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Email */}
        <div className="space-y-1.5">
          <label
            htmlFor="signup-email"
            className="block text-xs font-semibold uppercase tracking-wider text-gray-500"
          >
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="you@example.com"
            className={inputClass}
          />
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label
            htmlFor="signup-password"
            className="block text-xs font-semibold uppercase tracking-wider text-gray-500"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="signup-password"
              type={showPass ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="••••••••"
              className={`${inputClass} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors p-1"
            >
              {showPass ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <label
            htmlFor="signup-confirm"
            className="block text-xs font-semibold uppercase tracking-wider text-gray-500"
          >
            Confirm Password
          </label>
          <div className="relative">
            <input
              id="signup-confirm"
              type={showConfirm ? 'text' : 'password'}
              required
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError(null);
              }}
              placeholder="••••••••"
              className={`${inputClass} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors p-1"
            >
              {showConfirm ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !email || !password || !confirm}
          className={[
            'w-full rounded-xl py-3 text-sm font-bold transition-all duration-150',
            'bg-amber-500 text-black shadow-lg shadow-amber-500/20',
            'hover:bg-amber-400 active:scale-[0.98]',
            'disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none',
          ].join(' ')}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner />
              Creating account…
            </span>
          ) : (
            'Create account'
          )}
        </button>
      </form>

      {/* ── Footer ───────────────────────────────────────── */}
      <div className="px-8 pb-7 text-center">
        <p className="text-sm text-gray-500">
          Already have an account?{' '}
          <button
            type="button"
            onClick={() => onSwitchToLogin?.()}
            className="text-amber-400 font-semibold hover:text-amber-300 transition-colors"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}

const inputClass = [
  'w-full rounded-xl border border-white/10 bg-white/4',
  'px-4 py-3 text-sm text-white placeholder-gray-600',
  'outline-none transition-all',
  'focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/15',
].join(' ');

function Eye() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
