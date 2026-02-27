// src/features/auth/components/ForgotPasswordModal.tsx
// ============================================================================
// FORGOT PASSWORD MODAL
// ============================================================================
// Props aligned to AuthModals.tsx usage:
//   onSwitchToLogin — added (AuthModals passes this; was missing from props)
// ============================================================================

import { useState, useCallback, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin?: () => void; // AuthModals coordinator
}

export default function ForgotPasswordModal({
  isOpen,
  onClose,
  onSwitchToLogin,
}: ForgotPasswordModalProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (loading) return;

      setError(null);
      setLoading(true);

      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/update-password`,
        });

        if (error) {
          setError(error.message);
          return;
        }
        setSuccess(true);
      } catch {
        setError('Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [email, loading],
  );

  if (!isOpen) return null;

  return (
    <div className="w-full rounded-2xl bg-gray-900 border border-white/8 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-white/6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">🔐</span>
          <h2 className="text-lg font-bold text-white tracking-tight">Reset password</h2>
        </div>
        <p className="text-sm text-gray-500 ml-9">We'll send you a reset link</p>
      </div>

      {/* Body */}
      <div className="px-8 py-7">
        {success ? (
          <div className="space-y-5 text-center">
            <div className="text-4xl">📩</div>
            <p className="text-sm text-gray-400">
              If an account exists for{' '}
              <span className="text-white font-medium">{email.trim()}</span>, you'll receive a reset
              email shortly.
            </p>
            <button
              type="button"
              onClick={onSwitchToLogin ?? onClose}
              className="w-full rounded-xl py-3 text-sm font-bold bg-amber-500 text-black hover:bg-amber-400 transition-all active:scale-[0.98]"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3"
              >
                <span className="mt-0.5 text-red-400 text-sm">⚠</span>
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="reset-email"
                className="block text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email}
              className={[
                'w-full rounded-xl py-3 text-sm font-bold transition-all duration-150',
                'bg-amber-500 text-black shadow-lg shadow-amber-500/20',
                'hover:bg-amber-400 active:scale-[0.98]',
                'disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none',
              ].join(' ')}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner /> Sending…
                </span>
              ) : (
                'Send reset link'
              )}
            </button>

            <button
              type="button"
              onClick={onSwitchToLogin ?? onClose}
              className="w-full text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </form>
        )}
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

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
