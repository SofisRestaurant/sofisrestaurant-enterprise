// src/modules/checkout/components/PhoneVerification.tsx
// =============================================================================
// Phone OTP UI — optional step in checkout.
//
// State model fix: after a successful OTP send, the backend returns
// `normalizedPhone` (canonical E.164). The frontend stores that value
// and uses it for all subsequent calls (check, resend).
// Frontend input is never used after the first send call.
//
// Resend cooldown: 60-second client-side timer prevents button spam
// (backend also enforces 3 per 10 min server-side).
// =============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { ShieldCheck, Phone, ArrowRight, Loader2, X } from 'lucide-react';
import { invokeEdge } from '@/lib/supabase/invoke';

type VerifyStep = 'phone' | 'otp' | 'verified';

interface SendResponse {
  ok:              boolean;
  normalizedPhone?: string;  // canonical E.164 returned by backend
  status?:         string;
  error?:          string;
}

interface CheckResponse {
  ok:     boolean;
  valid?: boolean;
  error?: string;
}

interface PhoneVerificationProps {
  onVerified: (phone: string) => void;
  onSkip?:    () => void;
  orderId?:   string;
}

const RESEND_COOLDOWN_S = 60;

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

function formatDisplay(e164: string): string {
  if (e164.startsWith('+1') && e164.length === 12) {
    const n = e164.slice(2);
    return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
  }
  return e164;
}

export function PhoneVerification({ onVerified, onSkip, orderId }: PhoneVerificationProps) {
  const [step,        setStep]      = useState<VerifyStep>('phone');
  const [phoneInput,  setPhone]     = useState('');
  const [otpInput,    setOtp]       = useState('');

  // ✅ FIX: canonicalPhone stores the E.164 form returned by the backend
  // after a successful send. All subsequent API calls use this, never phoneInput.
  const [canonicalPhone, setCanonical] = useState('');

  const [loading,     setLoading]   = useState(false);
  const [error,       setError]     = useState<string | null>(null);

  // Resend cooldown
  const [resendCooldown, setResendCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const otpRef = useRef<HTMLInputElement>(null);

  // ── Cooldown timer ──────────────────────────────────────────────────────

  const startCooldown = useCallback(() => {
    setResendCooldown(RESEND_COOLDOWN_S);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

  // ── Send OTP ────────────────────────────────────────────────────────────

  const handleSendOtp = useCallback(async () => {
    setError(null);
    if (!phoneInput.trim()) {
      setError('Please enter your phone number.');
      return;
    }

    setLoading(true);
    try {
      // Send raw input — backend normalizes and returns canonical form
      const res = await invokeEdge<SendResponse>('verify-phone', {
        action: 'send',
        phone:  phoneInput,
      });

      if (!res?.ok) {
        setError(res?.error ?? 'Failed to send code. Please try again.');
        return;
      }

      // ✅ Store canonical E.164 from backend, not from frontend input
      const canonical = res.normalizedPhone ?? phoneInput;
      setCanonical(canonical);
      setStep('otp');
      startCooldown();
      setTimeout(() => otpRef.current?.focus(), 100);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [phoneInput, startCooldown]);

  // ── Check OTP ───────────────────────────────────────────────────────────

  const handleCheckOtp = useCallback(async () => {
    setError(null);
    if (otpInput.length < 4) {
      setError('Please enter the full verification code.');
      return;
    }

    setLoading(true);
    try {
      // ✅ Uses canonicalPhone (E.164 from backend), not phoneInput
      const res = await invokeEdge<CheckResponse>('verify-phone', {
        action:   'check',
        phone:    canonicalPhone,
        code:     otpInput,
        order_id: orderId ?? null,
      });

      if (!res?.ok) {
        setError(res?.error ?? 'Verification failed.');
        return;
      }
      if (!res.valid) {
        setError('Incorrect code. Please try again.');
        setOtp('');
        return;
      }

      setStep('verified');
      setTimeout(() => onVerified(canonicalPhone), 500);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [otpInput, canonicalPhone, orderId, onVerified]);

  // ── Resend OTP ──────────────────────────────────────────────────────────

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0 || loading) return;
    setOtp('');
    setError(null);
    setLoading(true);

    try {
      // ✅ Uses canonicalPhone for resend — not phoneInput
      const res = await invokeEdge<SendResponse>('verify-phone', {
        action: 'send',
        phone:  canonicalPhone,
      });

      if (!res?.ok) {
        setError(res?.error ?? 'Failed to resend. Please try again.');
        return;
      }

      // Backend may return an updated canonical (same in practice, but consistent)
      if (res.normalizedPhone) setCanonical(res.normalizedPhone);
      startCooldown();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [resendCooldown, loading, canonicalPhone, startCooldown]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="w-full rounded-2xl border border-(--color-cream-300) bg-white p-6 shadow-(--shadow-sm)">

      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-(--color-ember-50)">
            {step === 'verified'
              ? <ShieldCheck className="h-5 w-5 text-(--color-success)" strokeWidth={1.75} />
              : <Phone className="h-5 w-5 text-(--color-ember-600)" strokeWidth={1.75} />
            }
          </div>
          <div>
            <p className="text-sm font-semibold text-(--color-ink-900)">
              {step === 'phone'    && 'Get SMS order updates'}
              {step === 'otp'     && 'Enter your code'}
              {step === 'verified' && 'Phone verified!'}
            </p>
            <p className="text-xs text-(--color-ink-400)">
              {step === 'phone'    && "Optional — we'll text when your order is ready"}
              {step === 'otp'     && `Code sent to ${formatDisplay(canonicalPhone)}`}
              {step === 'verified' && "You'll receive SMS updates on your order"}
            </p>
          </div>
        </div>

        {onSkip && step !== 'verified' && (
          <button type="button" onClick={onSkip}
            className="text-(--color-ink-300) transition-colors hover:text-(--color-ink-600)"
            aria-label="Skip phone verification"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Phone step */}
      {step === 'phone' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="tel"
              inputMode="tel"
              value={phoneInput}
              onChange={(e) => { setPhone(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSendOtp(); }}
              placeholder="+1 (555) 555-5555"
              autoComplete="tel"
              disabled={loading}
              className={cx('input flex-1', error && 'input-error')}
            />
            <button
              type="button"
              onClick={() => void handleSendOtp()}
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

          {onSkip && (
            <button type="button" onClick={onSkip}
              className="w-full text-center text-xs text-(--color-ink-300) transition-colors hover:text-(--color-ink-600)"
            >
              Skip — I don&apos;t want SMS updates
            </button>
          )}
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
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              setOtp(val);
              setError(null);
              if (val.length === 6) setTimeout(() => void handleCheckOtp(), 100);
            }}
            placeholder="6-digit code"
            autoComplete="one-time-code"
            disabled={loading}
            className={cx('input text-center text-lg tracking-[0.3em]', error && 'input-error')}
          />

          {error && <p className="input-error-msg">{error}</p>}

          <button
            type="button"
            onClick={() => void handleCheckOtp()}
            disabled={loading || otpInput.length < 4}
            className="btn btn-primary w-full"
          >
            {loading
              ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</span>
              : 'Verify code'
            }
          </button>

          <div className="flex justify-between text-xs text-(--color-ink-400)">
            <button type="button"
              onClick={() => { setStep('phone'); setOtp(''); setError(null); setResendCooldown(0); }}
              className="transition-colors hover:text-(--color-ink-700)"
            >
              ← Change number
            </button>

            {/* Resend with cooldown */}
            <button type="button"
              onClick={() => void handleResend()}
              disabled={loading || resendCooldown > 0}
              className={cx(
                'transition-colors',
                resendCooldown > 0
                  ? 'text-(--color-ink-200) cursor-not-allowed'
                  : 'hover:text-(--color-ink-700)',
              )}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>
        </div>
      )}

      {/* Verified */}
      {step === 'verified' && (
        <div className="flex items-center gap-2 rounded-xl bg-(--color-success-bg) px-4 py-3">
          <ShieldCheck className="h-4 w-4 shrink-0 text-(--color-success)" strokeWidth={1.75} />
          <p className="text-sm font-medium text-(--color-success)">
            {formatDisplay(canonicalPhone)} verified — you&apos;ll get SMS updates
          </p>
        </div>
      )}
    </div>
  );
}