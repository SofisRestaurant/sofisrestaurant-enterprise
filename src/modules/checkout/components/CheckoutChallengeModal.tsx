// src/modules/checkout/components/CheckoutChallengeModal.tsx
// =============================================================================
// Inline OTP challenge component — renders when create-checkout returns
// code: 'otp_required'.
//
// This is NOT the same as PhoneVerification.tsx (which is optional, decorative,
// and runs before checkout). This component is a mandatory gate: the user
// cannot proceed to payment until OTP succeeds and a challenge_token is issued.
//
// UX design:
//   • Rendered inline below CheckoutButton — no page navigation, no modal overlay.
//   • Phone step → OTP step → done (challenge_token stored in parent state).
//   • Parent calls onToken(challengeToken) → retries checkout automatically.
//   • 60-second client-side resend cooldown (server enforces 3/10min).
//   • "Change number" available at OTP step to restart without page refresh.
//   • Timed expiry warning: if expiresAt is within 2 minutes, shows countdown.
//
// Props:
//   nonce       — from OtpChallengePayload (passed through from create-checkout response)
//   expiresAt   — ISO string, challenge TTL
//   userId      — null for guests
//   guestEmail  — used for identity key derivation on guest path
//   onToken     — called with the challenge_token when OTP succeeds
//   onExpired   — called when the challenge TTL expires (parent re-initiates checkout)
// =============================================================================

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type KeyboardEvent,
} from 'react';
import { ShieldCheck, Phone, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import {
  sendChallengeOtp,
  issueChallengeToken,
  buildCheckoutIdentityKey,
} from '../risk/challengeClient';
import type { ChallengeStep } from '../types/otp.types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckoutChallengeModalProps {
  nonce:      string;
  expiresAt:  string;
  userId:     string | null;
  guestEmail: string | null;
  onToken:    (challengeToken: string) => void;
  onExpired:  () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

function formatPhone(e164: string): string {
  if (e164.startsWith('+1') && e164.length === 12) {
    const n = e164.slice(2);
    return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
  }
  return e164;
}

const RESEND_COOLDOWN_S = 60;

// ─── Component ────────────────────────────────────────────────────────────────

export function CheckoutChallengeModal({
  nonce,
  expiresAt,
  userId,
  guestEmail,
  onToken,
  onExpired,
}: CheckoutChallengeModalProps) {
  const [step,           setStep]     = useState<ChallengeStep>('phone');
  const [phoneInput,     setPhone]    = useState('');
  const [canonicalPhone, setCanon]    = useState('');
  const [otpInput,       setOtp]      = useState('');
  const [loading,        setLoading]  = useState(false);
  const [error,          setError]    = useState<string | null>(null);
  const [resendCooldown, setCooldown] = useState(0);
  const [secsRemaining,  setSecs]     = useState<number | null>(null);

  const otpRef      = useRef<HTMLInputElement>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Challenge TTL countdown ─────────────────────────────────────────────
  useEffect(() => {
    const expiry = new Date(expiresAt).getTime();

    const tick = () => {
      const secs = Math.floor((expiry - Date.now()) / 1000);
      if (secs <= 0) {
        clearInterval(expiryRef.current!);
        onExpired();
        return;
      }
      setSecs(secs);
    };

    tick();
    expiryRef.current = setInterval(tick, 1000);
    return () => clearInterval(expiryRef.current!);
  }, [expiresAt, onExpired]);

  // ── Resend cooldown timer ────────────────────────────────────────────────
  const startCooldown = useCallback(() => {
    setCooldown(RESEND_COOLDOWN_S);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) { clearInterval(cooldownRef.current!); return 0; }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => () => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
  }, []);

  // ── Send OTP ─────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    setError(null);
    if (!phoneInput.trim()) {
      setError('Please enter your phone number.');
      return;
    }
    setLoading(true);
    try {
      const result = await sendChallengeOtp(phoneInput.trim());
      if (!result.ok) { setError(result.error); return; }
      setCanon(result.normalizedPhone);
      setStep('otp');
      startCooldown();
      setTimeout(() => otpRef.current?.focus(), 80);
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [phoneInput, startCooldown]);

  // ── Resend ────────────────────────────────────────────────────────────────
  const handleResend = useCallback(async () => {
    if (resendCooldown > 0 || loading) return;
    setOtp('');
    setError(null);
    setLoading(true);
    try {
      const result = await sendChallengeOtp(canonicalPhone);
      if (!result.ok) { setError(result.error); return; }
      if (result.normalizedPhone) setCanon(result.normalizedPhone);
      startCooldown();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [canonicalPhone, resendCooldown, loading, startCooldown]);

  // ── Verify OTP + issue challenge token ────────────────────────────────────
  const handleVerify = useCallback(async (code: string) => {
    setError(null);
    if (code.length < 4) {
      setError('Please enter the full verification code.');
      return;
    }
    setLoading(true);
    try {
      const identityKey = await buildCheckoutIdentityKey(userId, guestEmail);
      if (!identityKey) {
        setError('Unable to verify identity. Please refresh and try again.');
        return;
      }

      const result = await issueChallengeToken({
        phone:       canonicalPhone,
        code,
        nonce,
        identityKey,
      });

      if (!result.ok) {
        if ('valid' in result && result.valid === false) {
          setError('Incorrect code. Please try again.');
          setOtp('');
          return;
        }
        setError(result.error ?? 'Verification failed. Please try again.');
        return;
      }

      setStep('done');
      // Small delay so the success state is visible before the parent retries.
      setTimeout(() => onToken(result.challengeToken), 600);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [canonicalPhone, nonce, userId, guestEmail, onToken]);

  const handleOtpChange = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setOtp(digits);
    setError(null);
    if (digits.length === 6) {
      setTimeout(() => handleVerify(digits), 80);
    }
  }, [handleVerify]);

  const handlePhoneKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void handleSend(); }
  }, [handleSend]);

  // ─────────────────────────────────────────────────────────────────────────

  const expiryWarning = secsRemaining !== null && secsRemaining <= 120
    ? `Verification expires in ${secsRemaining}s`
    : null;

  return (
    <div className="rounded-2xl border border-(--color-ember-200) bg-white p-5 shadow-[0_2px_8px_0_rgb(0_0_0/0.06)]">

      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className={cx(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          step === 'done' ? 'bg-(--color-success-bg)' : 'bg-(--color-ember-50)',
        )}>
          {step === 'done'
            ? <ShieldCheck className="h-5 w-5 text-(--color-success)" strokeWidth={1.75} />
            : <Phone className="h-5 w-5 text-(--color-ember-600)" strokeWidth={1.75} />
          }
        </div>
        <div>
          <p className="text-sm font-semibold text-(--color-ink-900)">
            {step === 'phone' && 'Verify your phone to continue'}
            {step === 'otp'   && 'Enter your code'}
            {step === 'done'  && 'Verified — resuming checkout'}
          </p>
          <p className="text-xs text-(--color-ink-400)">
            {step === 'phone' && 'A quick security check for this order'}
            {step === 'otp'   && `Code sent to ${formatPhone(canonicalPhone)}`}
            {step === 'done'  && 'Your order is being processed'}
          </p>
        </div>
      </div>

      {/* Expiry warning */}
      {expiryWarning && step !== 'done' && (
        <div className="mb-3 rounded-lg border border-(--color-amber-200) bg-(--color-amber-50) px-3 py-2">
          <p className="text-xs font-medium text-(--color-amber-800)">
            ⏱ {expiryWarning}
          </p>
        </div>
      )}

      {/* Phone step */}
      {step === 'phone' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phoneInput}
              onChange={(e) => { setPhone(e.target.value); setError(null); }}
              onKeyDown={handlePhoneKeyDown}
              placeholder="+1 (555) 555-5555"
              disabled={loading}
              className={cx('input flex-1', error && 'input-error')}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={loading || !phoneInput.trim()}
              className="btn btn-primary px-4"
            >
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ArrowRight className="h-4 w-4" />
              }
            </button>
          </div>
          {error && <p className="input-error-msg">{error}</p>}
          <p className="text-xs text-(--color-ink-300)">
            One-time code sent via SMS. Standard rates may apply.
          </p>
        </div>
      )}

      {/* OTP step */}
      {step === 'otp' && (
        <div className="space-y-3">
          <input
            ref={otpRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={otpInput}
            onChange={(e) => handleOtpChange(e.target.value)}
            placeholder="6-digit code"
            autoComplete="one-time-code"
            disabled={loading}
            className={cx(
              'input w-full text-center text-lg tracking-[0.3em]',
              error && 'input-error',
            )}
          />

          {error && <p className="input-error-msg">{error}</p>}

          <button
            type="button"
            onClick={() => void handleVerify(otpInput)}
            disabled={loading || otpInput.length < 4}
            className="btn btn-primary w-full"
          >
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying…
                </span>
              : 'Verify and continue'
            }
          </button>

          <div className="flex items-center justify-between text-xs text-(--color-ink-400)">
            <button
              type="button"
              onClick={() => { setStep('phone'); setOtp(''); setError(null); setCooldown(0); }}
              className="hover:text-(--color-ink-700) transition-colors"
            >
              ← Change number
            </button>
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={loading || resendCooldown > 0}
              className={cx(
                'flex items-center gap-1 transition-colors',
                resendCooldown > 0
                  ? 'text-(--color-ink-200) cursor-not-allowed'
                  : 'hover:text-(--color-ink-700)',
              )}
            >
              <RefreshCw className="h-3 w-3" />
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>
        </div>
      )}

      {/* Done step */}
      {step === 'done' && (
        <div className="flex items-center gap-2 rounded-xl bg-(--color-success-bg) px-4 py-3">
          <ShieldCheck className="h-4 w-4 shrink-0 text-(--color-success)" strokeWidth={1.75} />
          <p className="text-sm font-medium text-(--color-success)">
            {formatPhone(canonicalPhone)} verified
          </p>
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-(--color-success)" />
        </div>
      )}
    </div>
  );
}