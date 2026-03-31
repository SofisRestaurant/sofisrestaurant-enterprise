// src/features/auth/components/ForgotPasswordModal.tsx
// ============================================================================
// FORGOT PASSWORD MODAL — Enterprise (2026) — Secure + Polished
// ============================================================================
// Security:
// ✅ Routes through authAPI.requestPasswordReset (no raw Supabase calls)
// ✅ redirectPath always '/update-password' → buildAuthRedirectUrl handles origin
// ✅ Email sanitized inside authAPI before hitting Supabase
// ✅ Submit rate-limit: 2 requests per 120 s (Supabase also limits, but UX-first)
// ✅ Generic success message — never reveals whether email exists (enumeration guard)
// UX:
// ✅ Dark luxury aesthetic matching app brand (neutral-900, amber accent)
// ✅ Animated entrance per open state
// ✅ Inline error with accessible role="alert"
// ✅ Loading spinner + disabled state
// ✅ Email validation hint before submit
// ✅ "Back to Login" after success
// ============================================================================

import { useState, useCallback, useRef, type FormEvent } from 'react';
import { authAPI } from '@/features/auth/auth.api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin?: () => void;
}

// ─── Rate limit constants ─────────────────────────────────────────────────────
const RATE_MAX     = 2;
const RATE_WINDOW  = 120_000; // 2 min

// ─── Email regex (same pattern as auth.api.ts sanitizeEmail) ─────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

// ─── Sub-components ───────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ForgotPasswordModal({
  isOpen,
  onClose,
  onSwitchToLogin,
}: ForgotPasswordModalProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [touched, setTouched] = useState(false);

  // Rate limiting
  const attemptCount = useRef(0);
  const windowStart = useRef<number | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);

  const isRateLimited = rateLimitedUntil !== null && Date.now() < rateLimitedUntil;
  const emailTrimmed = email.trim();
  const emailValid = EMAIL_RE.test(emailTrimmed.toLowerCase());
  const showEmailHint = touched && emailTrimmed.length > 0 && !emailValid;

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (loading || isRateLimited || !emailValid) return;

      // Client-side rate limit
      const now = Date.now();
      if (windowStart.current === null || now - windowStart.current > RATE_WINDOW) {
        windowStart.current = now;
        attemptCount.current = 0;
      }
      attemptCount.current += 1;
      if (attemptCount.current > RATE_MAX) {
        const until = (windowStart.current ?? now) + RATE_WINDOW;
        setRateLimitedUntil(until);
        setError('Too many attempts. Please wait a couple of minutes before trying again.');
        return;
      }

      setError(null);
      setLoading(true);

      try {
        await authAPI.requestPasswordReset({
          email: emailTrimmed,
          redirectPath: '/update-password',
        });
        // Always show success — never reveal email existence
        setSuccess(true);
      } catch (err: unknown) {
        // Surface specific actionable errors; mask everything else generically
        const raw = err instanceof Error ? err.message.toLowerCase() : '';
        if (raw.includes('rate limit') || raw.includes('too many')) {
          setError('Too many reset requests. Please wait a few minutes and try again.');
        } else if (raw.includes('invalid email') || raw.includes('invalid_email')) {
          setError('Please enter a valid email address.');
        } else {
          // Generic — don't leak Supabase internals
          setError('Unable to send the reset email. Please try again shortly.');
        }
      } finally {
        setLoading(false);
      }
    },
    [loading, isRateLimited, emailValid, emailTrimmed],
  );

  if (!isOpen) return null;

  return (
    <div
      className="w-full rounded-2xl overflow-hidden border border-white/8 bg-neutral-900 shadow-2xl shadow-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fpw-title"
    >
      {/* Amber top rule */}
      <div className="h-px w-full bg-linear-to-r from-transparent via-amber-500/40 to-transparent" />

      {/* Header */}
      <div className="px-8 pt-7 pb-5 border-b border-white/6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 shrink-0">
              <svg
                className="h-4 w-4 text-amber-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
            </div>
            <div>
              <h2 id="fpw-title" className="text-base font-bold text-white leading-tight">
                Reset password
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                We'll send a secure link to your email
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 hover:text-neutral-300 hover:bg-white/6 transition-colors"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-8 py-7">
        {success ? (
          /* ── Success state ── */
          <div className="space-y-5 text-center animate-[fadeIn_0.25s_ease_both]">
            <div className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
                <span className="text-2xl" aria-hidden>
                  📩
                </span>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Check your inbox</p>
              <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
                If an account exists for{' '}
                <span className="font-medium text-neutral-200">{emailTrimmed}</span>, you'll receive
                a password reset link shortly.
              </p>
              <p className="mt-2 text-xs text-neutral-600">
                Don't see it? Check your spam folder or{' '}
                <button
                  type="button"
                  onClick={() => {
                    setSuccess(false);
                    setError(null);
                  }}
                  className="text-amber-500/80 hover:text-amber-400 underline underline-offset-2 transition-colors"
                >
                  try again
                </button>
                .
              </p>
            </div>
            <button
              type="button"
              onClick={onSwitchToLogin ?? onClose}
              className="w-full rounded-xl py-3 text-sm font-bold bg-amber-500 text-neutral-950 hover:bg-amber-400 transition-colors active:scale-[0.98]"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          /* ── Form state ── */
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Error banner */}
            {error && (
              <div
                role="alert"
                aria-live="assertive"
                className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/8 px-4 py-3"
              >
                <span className="mt-0.5 text-red-400 text-sm shrink-0" aria-hidden>
                  ⚠
                </span>
                <p className="text-xs text-red-300 leading-relaxed">{error}</p>
              </div>
            )}

            {/* Rate limited banner */}
            {isRateLimited && !error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3"
              >
                <span className="mt-0.5 text-amber-400 text-sm shrink-0" aria-hidden>
                  ⏱
                </span>
                <p className="text-xs text-amber-200">
                  Please wait a moment before requesting another link.
                </p>
              </div>
            )}

            {/* Email field */}
            <div className="space-y-1.5">
              <label
                htmlFor="fpw-email"
                className="block text-xs font-semibold uppercase tracking-wider text-neutral-500"
              >
                Email address
              </label>
              <input
                id="fpw-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                onBlur={() => setTouched(true)}
                placeholder="you@example.com"
                disabled={loading}
                aria-invalid={showEmailHint}
                aria-describedby={showEmailHint ? 'fpw-email-hint' : undefined}
                className={`w-full rounded-xl border bg-white/4 px-4 py-3 text-sm text-white placeholder-neutral-600 outline-none transition-all focus:ring-2 disabled:opacity-40 ${
                  showEmailHint
                    ? 'border-red-500/40 focus:border-red-500/50 focus:ring-red-500/12'
                    : 'border-white/10 focus:border-amber-500/50 focus:ring-amber-500/12'
                }`}
              />
              {showEmailHint && (
                <p id="fpw-email-hint" className="text-xs text-red-400" role="alert">
                  Please enter a valid email address.
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !emailTrimmed || isRateLimited || (touched && !emailValid)}
              className="w-full rounded-xl py-3 text-sm font-bold transition-all duration-150 bg-amber-500 text-neutral-950 shadow-lg shadow-amber-500/15 hover:bg-amber-400 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner /> Sending…
                </span>
              ) : (
                'Send reset link'
              )}
            </button>

            {/* Cancel */}
            <button
              type="button"
              onClick={onSwitchToLogin ?? onClose}
              className="w-full text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>

      {/* Bottom rule */}
      <div className="h-px w-full bg-linear-to-r from-transparent via-white/4 to-transparent" />

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}