// src/features/auth/components/LoginForm.tsx
// ============================================================================
// LOGIN FORM — Email / password + Google OAuth
// ============================================================================

import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useUserContext } from '@/contexts/useUserContext';
import Button from '@/components/ui/Button';
import { GoogleSignInButton } from '@/features/auth/components/GoogleSignInButton';

export interface LoginFormProps {
  onSuccess: () => void;
  onSwitchToSignup: () => void;
  onForgotPassword: () => void;
  /** Passed through to Google OAuth so the user lands on the right page */
  redirectPath?: string;
}

export function LoginForm({
  onSuccess,
  onSwitchToSignup,
  onForgotPassword,
  redirectPath,
}: LoginFormProps) {
  const { signIn } = useUserContext();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  // ── Countdown timer for rate-limit lockout ─────────────────────────────────
  useEffect(() => {
    if (!blockedUntil) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, blockedUntil - Date.now());
      setTimeLeft(remaining);
      if (remaining === 0) {
        setBlockedUntil(null);
        setError(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [blockedUntil]);

  // ── Email/password submit ──────────────────────────────────────────────────
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (blockedUntil) return;
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await signIn(email, password);
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      if (/too many|rate limit/i.test(message)) {
        const lockTime = Date.now() + 5 * 60 * 1000;
        setBlockedUntil(lockTime);
        setError('Too many attempts. Please wait.');
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const isBlocked = !!blockedUntil;

  return (
    <div className="space-y-5">
      {/* ── Google OAuth ───────────────────────────────────────────────────── */}
      <GoogleSignInButton
        label="Continue with Google"
        redirectPath={redirectPath}
        onBeforeRedirect={onSuccess} // closes the modal before navigating away
        onError={(err) => setError(err.message)}
      />

      {/* ── Divider ───────────────────────────────────────────────────────── */}
      <div className="relative flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs font-medium uppercase tracking-wider text-gray-400">or</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {/* ── Email / password form ─────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {isBlocked && timeLeft > 0
                ? `Too many attempts. Try again in ${formatTime(timeLeft)}`
                : error}
            </span>
          </div>
        )}

        {/* Email */}
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-gray-700">
            Email Address
          </label>
          <div className="relative">
            <Mail
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isBlocked}
              className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="login-password"
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            Password
          </label>
          <div className="relative">
            <Lock
              className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
              aria-hidden="true"
            />
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isBlocked}
              className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-12 outline-none focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
            />
            <button
              type="button"
              disabled={isBlocked}
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Eye className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Forgot password */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-sm font-semibold text-orange-600 hover:text-orange-700"
          >
            Forgot password?
          </button>
        </div>

        <Button
          type="submit"
          disabled={isLoading || isBlocked}
          className="w-full"
          variant="primary"
          isLoading={isLoading}
        >
          {isBlocked ? `Locked (${formatTime(timeLeft)})` : 'Sign In'}
        </Button>

        <p className="mt-6 text-center text-sm text-gray-600">
          Don&apos;t have an account?{' '}
          <button
            type="button"
            onClick={onSwitchToSignup}
            className="font-semibold text-orange-600 hover:text-orange-700"
          >
            Sign up
          </button>
        </p>
      </form>
    </div>
  );
}

export default LoginForm;
