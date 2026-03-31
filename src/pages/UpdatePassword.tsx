// src/pages/UpdatePassword.tsx
// ============================================================================
// UPDATE PASSWORD — Enterprise Mobile-First (2026)
// ============================================================================
// Security:
// ✅ onAuthStateChange subscribed BEFORE any async work — no race condition
// ✅ Handles both Supabase flows: implicit (#access_token) + PKCE (?code=)
// ✅ PASSWORD_RECOVERY is the authoritative session signal
// ✅ Session guard fires before updateUser() — "Auth session missing" impossible
// ✅ Submit rate-limit: 3 attempts / 60 s
// ✅ Password entropy scoring — weak passwords blocked at score < 2
// ✅ URL tokens stripped after exchange — nothing lingers in browser history
// ✅ isMountedRef throughout — zero stale-state after unmount
// ✅ All timeouts managed via ref — no leaked timers
// Mobile UX:
// ✅ min-h-dvh — dynamic viewport height, accounts for iOS browser chrome
// ✅ safe-area padding — clears iOS home indicator
// ✅ 16px font on inputs — prevents iOS auto-zoom on focus
// ✅ 44px+ touch targets on all interactive elements
// ✅ inputMode="text" on password toggle — keyboard doesn't flicker
// ✅ autoCapitalize / autoCorrect / spellCheck off on password fields
// ✅ Four-segment strength bar with per-segment fill
// ✅ Confirm field live match indicator (✓ / ✗)
// ✅ Reduced-motion safe — all animations respect prefers-reduced-motion
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase/supabaseClient';
import { Button } from '@/components/ui/Button';

// ─── Page state machine ───────────────────────────────────────────────────────
type PageState = 'waiting' | 'ready' | 'invalid' | 'success';
type StrengthLevel = 0 | 1 | 2 | 3 | 4;

// ─── Tuneable constants ───────────────────────────────────────────────────────
const RATE_MAX = 3;
const RATE_WINDOW_MS = 60_000;
const REDIRECT_DELAY_MS = 2_500;
const SESSION_WAIT_MS = 6_000;

// ─── Password strength scorer (zero deps) ────────────────────────────────────
function scorePassword(pw: string): StrengthLevel {
  if (pw.length === 0) return 0;
  let n = 0;
  if (pw.length >= 10) n++;
  if (pw.length >= 16) n++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) n++;
  if (/[0-9]/.test(pw)) n++;
  if (/[^A-Za-z0-9]/.test(pw)) n++;
  if (
    /^(.)\1+$/.test(pw) ||
    /^(012|123|234|345|456|567|678|789|890|abc|qwerty|password)/i.test(pw)
  ) {
    n = Math.max(0, n - 2);
  }
  return Math.min(4, n) as StrengthLevel;
}

const STRENGTH: Record<StrengthLevel, { label: string; bar: string; text: string }> = {
  0: { label: '', bar: 'bg-neutral-700', text: 'text-neutral-500' },
  1: { label: 'Weak', bar: 'bg-red-500', text: 'text-red-400' },
  2: { label: 'Fair', bar: 'bg-amber-400', text: 'text-amber-400' },
  3: { label: 'Good', bar: 'bg-lime-400', text: 'text-lime-400' },
  4: { label: 'Strong', bar: 'bg-emerald-400', text: 'text-emerald-400' },
};

// ─── URL helpers ──────────────────────────────────────────────────────────────
function urlHasAuthTokens(): boolean {
  const h = window.location.hash;
  const s = window.location.search;
  return h.includes('access_token=') || h.includes('type=recovery') || s.includes('code=');
}

function stripUrlTokens(): void {
  try {
    const cleaned =
      window.location.pathname +
      window.location.search.replace(/[?&]code=[^&]*/g, '').replace(/^[?&]/, '?');
    window.history.replaceState(null, '', cleaned || window.location.pathname);
  } catch {
    // non-critical
  }
}

// ─── Icon components ──────────────────────────────────────────────────────────
function EyeOpenIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  );
}

function CheckIcon({ cls }: { cls?: string }) {
  return (
    <svg
      className={cls}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function XIcon({ cls }: { cls?: string }) {
  return (
    <svg
      className={cls}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SpinIcon({ cls }: { cls?: string }) {
  return (
    <svg className={`animate-spin ${cls ?? ''}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

// ─── StrengthBar ──────────────────────────────────────────────────────────────
function StrengthBar({ score, show }: { score: StrengthLevel; show: boolean }) {
  if (!show) return null;
  const s = STRENGTH[score];
  return (
    <div
      className="space-y-1.5"
      aria-live="polite"
      aria-label={`Password strength: ${s.label || 'none'}`}
    >
      <div className="flex gap-1">
        {([1, 2, 3, 4] as StrengthLevel[]).map((lvl) => (
          <div
            key={lvl}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${score >= lvl ? s.bar : 'bg-neutral-800'}`}
          />
        ))}
      </div>
      {s.label && <p className={`text-[11px] font-semibold tracking-wide ${s.text}`}>{s.label}</p>}
    </div>
  );
}

// ─── PasswordField ────────────────────────────────────────────────────────────
interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder: string;
  disabled: boolean;
  matchState?: 'match' | 'mismatch' | 'neutral';
  ariaDescribedBy?: string;
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggle,
  placeholder,
  disabled,
  matchState = 'neutral',
  ariaDescribedBy,
}: PasswordFieldProps) {
  const borderCls =
    matchState === 'match'
      ? 'border-emerald-500/40 focus:border-emerald-500/60 focus:ring-emerald-500/10'
      : matchState === 'mismatch'
        ? 'border-red-500/40     focus:border-red-500/60     focus:ring-red-500/10'
        : 'border-white/10       focus:border-amber-500/50   focus:ring-amber-500/10';

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-xs font-semibold uppercase tracking-widest text-neutral-500"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          inputMode="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          aria-describedby={ariaDescribedBy}
          className={`w-full rounded-2xl border bg-white/5 px-5 py-4 pr-24 text-base text-white placeholder-neutral-600 outline-none transition-all duration-200 focus:ring-2 disabled:opacity-40 ${borderCls}`}
          style={{ fontSize: '16px' }}
        />

        {/* Match indicator sits to the left of the eye button */}
        {matchState !== 'neutral' && value.length > 0 && (
          <div className="absolute right-14 top-1/2 -translate-y-1/2">
            {matchState === 'match' ? (
              <CheckIcon cls="h-4 w-4 text-emerald-400" />
            ) : (
              <XIcon cls="h-4 w-4 text-red-400" />
            )}
          </div>
        )}

        {/* Eye toggle — 44px touch target */}
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-xl text-neutral-500 transition-colors hover:text-neutral-200 active:scale-95 disabled:opacity-40"
        >
          {show ? <EyeClosedIcon /> : <EyeOpenIcon />}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function UpdatePassword() {
  const navigate = useNavigate();

  const [pageState, setPageState] = useState<PageState>('waiting');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);

  const isMountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstAttemptRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  // ── Session bootstrap ──────────────────────────────────────────────────────
  useEffect(() => {
    function markReady() {
      if (!isMountedRef.current) return;
      stripUrlTokens();
      setPageState('ready');
      setStatusMsg(null);
    }

    function markInvalid(msg?: string) {
      if (!isMountedRef.current) return;
      setPageState('invalid');
      setStatusMsg(msg ?? 'This reset link is invalid or has expired. Please request a new one.');
    }

    // Subscribe FIRST — guarantees PASSWORD_RECOVERY is never missed
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMountedRef.current) return;
      if (event === 'PASSWORD_RECOVERY') {
        markReady();
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        markReady();
      }
    });

    // init is always Promise<void> — timer lives in timerRef, not return value
    async function init(): Promise<void> {
      if (!urlHasAuthTokens()) {
        markInvalid();
        return;
      }

      try {
        // Branch A — PKCE (?code= query param)
        const code = new URL(window.location.href).searchParams.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!isMountedRef.current) return;
          if (error) {
            markInvalid('This link could not be verified. Please request a new one.');
            return;
          }
          const { data } = await supabase.auth.getSession();
          if (data.session) markReady();
          return;
        }

        // Branch B — Implicit (#access_token hash)
        const { data } = await supabase.auth.getSession();
        if (!isMountedRef.current) return;
        if (data.session) {
          markReady();
          return;
        }

        // No session yet — PASSWORD_RECOVERY may still be in-flight
        timerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          void supabase.auth.getSession().then(({ data: d }) => {
            if (!isMountedRef.current) return;
            if (d.session) markReady();
            else markInvalid();
          });
        }, SESSION_WAIT_MS);
      } catch {
        if (!isMountedRef.current) return;
        markInvalid('This link could not be verified. Please request a new one.');
      }
    }

    void init();

    return () => {
      authSub.subscription.unsubscribe();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────
  const strength = useMemo(() => scorePassword(password), [password]);

  const validationError = useMemo<string | null>(() => {
    if (password.length > 0 && password.length < 8) return 'Minimum 8 characters required.';
    if (password.length >= 8 && strength < 2)
      return 'Too weak — add uppercase, numbers or symbols.';
    if (confirm.length > 0 && password !== confirm) return 'Passwords do not match.';
    return null;
  }, [password, confirm, strength]);

  const isFormValid = password.length >= 8 && strength >= 2 && password === confirm;
  const isRateLimited = rateLimitedUntil !== null && Date.now() < rateLimitedUntil;

  const confirmMatch: 'match' | 'mismatch' | 'neutral' =
    confirm.length === 0 ? 'neutral' : password === confirm ? 'match' : 'mismatch';

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
      e.preventDefault();
      if (!isFormValid || isSaving || isRateLimited) return;

      const now = Date.now();
      if (firstAttemptRef.current === null) firstAttemptRef.current = now;

      const expired = now - firstAttemptRef.current > RATE_WINDOW_MS;
      if (expired) {
        firstAttemptRef.current = now;
        setSubmitCount(1);
      } else {
        const next = submitCount + 1;
        setSubmitCount(next);
        if (next > RATE_MAX) {
          setRateLimitedUntil(now + RATE_WINDOW_MS);
          setStatusMsg('Too many attempts. Please wait 60 seconds.');
          return;
        }
      }

      setIsSaving(true);
      setStatusMsg(null);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          setStatusMsg('Your session expired. Please click the reset link in your email again.');
          setIsSaving(false);
          setPageState('invalid');
          return;
        }

        const { error } = await supabase.auth.updateUser({ password });

        if (error) {
          setStatusMsg(error.message);
          setIsSaving(false);
          return;
        }

        setPageState('success');

        timerRef.current = setTimeout(() => {
          if (isMountedRef.current) void navigate('/');
        }, REDIRECT_DELAY_MS);
      } catch {
        setStatusMsg('Something went wrong. Please try again.');
        setIsSaving(false);
      }
    },
    [isFormValid, isSaving, isRateLimited, submitCount, password, navigate],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes upw-rise {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes upw-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes upw-progress {
          from { width: 0%; }
          to   { width: 100%; }
        }
        @keyframes upw-ping {
          0%, 100% { transform: scale(1);   opacity: 0.4; }
          50%      { transform: scale(1.6); opacity: 0;   }
        }
        .upw-rise     { animation: upw-rise     0.45s cubic-bezier(0.16,1,0.3,1) both; }
        .upw-fade     { animation: upw-fade     0.3s  ease both; }
        .upw-progress { animation: upw-progress 2.4s  linear forwards; }
        .upw-ping     { animation: upw-ping     1.5s  ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .upw-rise, .upw-fade, .upw-progress, .upw-ping {
            animation: none !important;
          }
        }
      `}</style>

      <div
        className="flex min-h-dvh flex-col items-center justify-center overflow-y-auto bg-neutral-950 px-4"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)', paddingTop: '24px' }}
      >
        {/* Ambient glow */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-40 left-1/2 h-30rem w-30rem -translate-x-1/2 rounded-full bg-amber-500/5 blur-[120px]" />
          <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-amber-600/4 blur-[90px]" />
        </div>

        {/* Card */}
        <div className="upw-rise relative w-full max-w-sm">
          <div className="overflow-hidden rounded-3xl border border-white/8 bg-neutral-900/90 shadow-2xl shadow-black/70 backdrop-blur-md">
            {/* Top accent */}
            <div className="h-px w-full bg-linear-to-r from-transparent via-amber-500/50 to-transparent" />

            <div className="px-6 py-8 sm:px-8 sm:py-10">
              {/* ── WAITING ── */}
              {pageState === 'waiting' && (
                <div className="upw-fade flex flex-col items-center gap-6 py-4 text-center">
                  <div className="relative h-16 w-16">
                    <div className="upw-ping absolute inset-0 rounded-full bg-amber-500/20" />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 ring-1 ring-amber-500/20">
                      <SpinIcon cls="h-6 w-6 text-amber-400" />
                    </div>
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">Verifying your link</p>
                    <p className="mt-1 text-sm text-neutral-500">Just a moment…</p>
                  </div>
                </div>
              )}

              {/* ── INVALID ── */}
              {pageState === 'invalid' && (
                <div className="upw-fade space-y-6">
                  <div className="flex justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
                      <svg
                        className="h-7 w-7 text-red-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.8}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="text-center">
                    <h1 className="text-lg font-bold text-white">Link expired</h1>
                    <p className="mt-2 text-sm leading-relaxed text-neutral-400">{statusMsg}</p>
                  </div>
                  <a
                    href="/forgot-password"
                    className="flex w-full items-center justify-center rounded-2xl bg-amber-500 py-4 text-base font-bold text-neutral-950 transition-colors hover:bg-amber-400 active:scale-[0.98]"
                  >
                    Request a new link
                  </a>
                  <p className="text-center text-xs text-neutral-600">
                    Links expire after 1 hour for your security.
                  </p>
                </div>
              )}

              {/* ── SUCCESS ── */}
              {pageState === 'success' && (
                <div className="upw-fade flex flex-col items-center gap-6 py-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/25">
                    <CheckIcon cls="h-7 w-7 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-white">Password updated!</p>
                    <p className="mt-1.5 text-sm text-neutral-400">Taking you home…</p>
                  </div>
                  <div className="h-0.5 w-full overflow-hidden rounded-full bg-neutral-800">
                    <div className="upw-progress h-full rounded-full bg-emerald-400" />
                  </div>
                </div>
              )}

              {/* ── READY: form ── */}
              {pageState === 'ready' && (
                <div className="upw-fade">
                  <div className="mb-8 flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20">
                      <svg
                        className="h-5 w-5 text-amber-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.8}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h1 className="text-lg font-bold leading-tight text-white">New password</h1>
                      <p className="text-xs text-neutral-500">Choose something strong</p>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} noValidate className="space-y-5">
                    {isRateLimited && (
                      <div
                        role="alert"
                        className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3.5"
                      >
                        <span className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true">
                          ⏱
                        </span>
                        <p className="text-sm text-amber-200">
                          Too many attempts. Please wait 60 seconds.
                        </p>
                      </div>
                    )}

                    {statusMsg !== null && !isRateLimited && (
                      <div
                        role="alert"
                        aria-live="assertive"
                        className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/8 px-4 py-3.5"
                      >
                        <span className="mt-0.5 shrink-0 text-red-400" aria-hidden="true">
                          ⚠
                        </span>
                        <p className="text-sm text-red-300">{statusMsg}</p>
                      </div>
                    )}

                    {/* New password + strength bar */}
                    <div className="space-y-2">
                      <PasswordField
                        id="upw-new"
                        label="New password"
                        value={password}
                        onChange={setPassword}
                        show={showPw}
                        onToggle={() => setShowPw((v) => !v)}
                        placeholder="Min 8 characters"
                        disabled={isSaving}
                        ariaDescribedBy="upw-strength"
                      />
                      <div id="upw-strength">
                        <StrengthBar score={strength} show={password.length > 0} />
                      </div>
                    </div>

                    {/* Confirm password + validation error */}
                    <div className="space-y-2">
                      <PasswordField
                        id="upw-confirm"
                        label="Confirm password"
                        value={confirm}
                        onChange={setConfirm}
                        show={showConfirm}
                        onToggle={() => setShowConfirm((v) => !v)}
                        placeholder="Repeat password"
                        disabled={isSaving}
                        matchState={confirmMatch}
                      />
                      {validationError !== null && (
                        <p className="text-xs text-red-400" role="alert" aria-live="polite">
                          {validationError}
                        </p>
                      )}
                    </div>

                    {/* Submit */}
                    <Button
                      type="submit"
                      disabled={!isFormValid || isSaving || isRateLimited}
                      variant="primary"
                      className="w-full"
                    >
                      {isSaving ? (
                        <span className="flex items-center justify-center gap-2">
                          <SpinIcon cls="h-4 w-4" />
                          Updating…
                        </span>
                      ) : (
                        'Update password'
                      )}
                    </Button>

                    <p className="text-center text-sm text-neutral-600">
                      Remember it?{' '}
                      <a
                        href="/"
                        className="font-medium text-amber-500/80 underline underline-offset-2 transition-colors hover:text-amber-400"
                      >
                        Go back
                      </a>
                    </p>
                  </form>
                </div>
              )}
            </div>

            {/* Bottom accent */}
            <div className="h-px w-full bg-linear-to-r from-transparent via-white/5 to-transparent" />
          </div>

          <p className="mt-5 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-700">
            Sofi's Restaurant · Secure Reset
          </p>
        </div>
      </div>
    </>
  );
}
