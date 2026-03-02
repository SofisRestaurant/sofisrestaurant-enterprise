// src/components/checkout/CheckoutButton.tsx
// ============================================================================
// CheckoutButton — Production Grade (2026)
// ----------------------------------------------------------------------------
// Goals:
// - Strict, typed props + resilient runtime guards
// - Uses useCheckout() as the single source of truth for state + effects
// - Safe auth gating (no checkout attempt without authenticated user)
// - Stripe env gating (never hard-crash app if key missing)
// - Idempotent UX (prevents double submit / rapid clicks / stale retries)
// - Clean error routing:
//    • promo-specific errors forwarded to parent via onPromoError
//    • all other errors rendered inline
// - Accessible UI (aria-live, focus rings, keyboard-friendly)
// - Defensive rate-limit countdown + reset behavior
// - No cart mutation pre-redirect (assumes useCheckout handles redirect)
// ============================================================================

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CreditCard, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';

import { env } from '@/lib/config/env';
import { useCheckout } from '@/hooks/useCheckout'
import { useUserContext } from '@/contexts/useUserContext';

// ============================================================================
// Types
// ============================================================================

type CheckoutButtonProps = {
  promoCode?: string;
  creditId?: string;
  onPromoError?: (msg: string) => void;
  className?: string;
  disabled?: boolean;
};

type CountdownState = {
  secondsLeft: number;
  untilMs: number;
} | null;

// ============================================================================
// Helpers (pure)
// ============================================================================

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function normalizePromo(code?: string): string | undefined {
  const v = (code ?? '').trim().toUpperCase();
  return v ? v : undefined;
}

function normalizeCreditId(id?: string): string | undefined {
  const v = (id ?? '').trim();
  return v ? v : undefined;
}

function isPromoRelatedMessage(msg: string): boolean {
  return /(promo|coupon|code|discount)/i.test(msg);
}

function safeSecondsLeft(untilMs: number): number {
  const diff = Math.ceil((untilMs - Date.now()) / 1000);
  return Math.max(0, diff);
}

// ============================================================================
// Component
// ============================================================================

function CheckoutButton({
  promoCode,
  creditId,
  onPromoError,
  className,
  disabled: disabledProp = false,
}: CheckoutButtonProps) {
  const { user, loading: authLoading, isAuthenticated } = useUserContext();

  const { checkout, isLoading, error, errorCode, canRetry, retryAfter, reset, canCheckout } =
    useCheckout();

  // --------------------------------------------------------------------------
  // Stripe config gate (prevents app crash + prevents checkout attempts)
  // --------------------------------------------------------------------------
  const stripeEnabled = Boolean(env?.stripe?.enabled);

  // --------------------------------------------------------------------------
  // Refs: mount safety, click-deduping, and timers
  // --------------------------------------------------------------------------
  const mountedRef = useRef(true);
  const inflightRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);

  const [countdown, setCountdown] = useState<CountdownState>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) window.clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    };
  }, []);

  // --------------------------------------------------------------------------
  // Normalize inputs (stable)
  // --------------------------------------------------------------------------
  const normalizedPromo = useMemo(() => normalizePromo(promoCode), [promoCode]);
  const normalizedCreditId = useMemo(() => normalizeCreditId(creditId), [creditId]);

  // If the user edits promo/credit, clear prior hook error/cooldown state.
  useEffect(() => {
    reset();
  }, [normalizedPromo, normalizedCreditId, reset]);

  // --------------------------------------------------------------------------
  // Retry countdown (rate-limit UX)
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (retryTimerRef.current) {
      window.clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (!retryAfter || retryAfter <= 0) {
      setCountdown(null);
      return;
    }

    const untilMs = Date.now() + retryAfter;

    const tick = () => {
      if (!mountedRef.current) return;

      const secondsLeft = safeSecondsLeft(untilMs);

      if (secondsLeft <= 0) {
        setCountdown(null);
        reset();
        if (retryTimerRef.current) window.clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
        return;
      }

      setCountdown({ secondsLeft, untilMs });
    };

    tick();
    retryTimerRef.current = window.setInterval(tick, 250);

    return () => {
      if (retryTimerRef.current) window.clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    };
  }, [retryAfter, reset]);

  // --------------------------------------------------------------------------
  // Derived UI state
  // --------------------------------------------------------------------------
  const isAuthed = Boolean(isAuthenticated && user?.id);
  const cooldownSeconds = countdown?.secondsLeft ?? 0;
  const disabledBecauseCooldown = cooldownSeconds > 0;

  const disabled =
    disabledProp ||
    authLoading ||
    !stripeEnabled ||
    !isAuthed ||
    !canCheckout ||
    isLoading ||
    disabledBecauseCooldown ||
    inflightRef.current;

  const buttonLabel = useMemo(() => {
    if (!stripeEnabled) return 'Checkout unavailable';
    if (authLoading) return 'Loading…';
    if (!isAuthed) return 'Log in to pay';
    if (isLoading) return 'Creating secure checkout…';
    if (disabledBecauseCooldown) return `Retry in ${cooldownSeconds}s`;
    return 'Proceed to Payment';
  }, [stripeEnabled, authLoading, isAuthed, isLoading, disabledBecauseCooldown, cooldownSeconds]);

  // --------------------------------------------------------------------------
  // Actions
  // --------------------------------------------------------------------------
  const handleCheckout = useCallback(async () => {
    if (disabled) return;

    // Stripe must be configured (never throw here—show UI error)
    if (!stripeEnabled) {
      onPromoError?.('Checkout is temporarily unavailable. Please try again later.');
      return;
    }

    if (!isAuthed || !user) {
      window.alert('Please log in to continue');
      return;
    }

    inflightRef.current = true;

    try {
      await checkout({
        customer_uid: user.id,
        email: user.email,
        name: user.name ?? undefined,
        phone: (user as unknown as { phone?: string | null })?.phone ?? undefined,
        promo_code: normalizedPromo,
        credit_id: normalizedCreditId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Checkout failed';
      if (onPromoError && isPromoRelatedMessage(msg)) onPromoError(msg);
      // all other errors are handled by the hook's `error` state
    } finally {
      inflightRef.current = false;
    }
  }, [
    disabled,
    stripeEnabled,
    isAuthed,
    user,
    checkout,
    normalizedPromo,
    normalizedCreditId,
    onPromoError,
  ]);

  const handleRetry = useCallback(() => {
    if (disabledBecauseCooldown) return;
    reset();
  }, [disabledBecauseCooldown, reset]);

  // ========================================================================
  // Render: Auth loading skeleton button
  // ========================================================================

  if (authLoading) {
    return (
      <button
        type="button"
        disabled
        className={cx(
          'w-full select-none rounded-xl border border-zinc-200 bg-zinc-100 px-6 py-4 text-zinc-500',
          'cursor-not-allowed',
          className,
        )}
        aria-busy="true"
      >
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-base font-semibold">Loading…</span>
        </div>
      </button>
    );
  }

  // ========================================================================
  // Render: Stripe missing (friendly, non-crashing)
  // ========================================================================

  if (!stripeEnabled) {
    return (
      <div className={cx('space-y-3', className)} aria-live="polite">
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">Checkout is not configured.</p>
            <p className="mt-1 text-xs text-amber-800">
              Missing <span className="font-mono">VITE_STRIPE_PUBLIC_KEY</span>. Add it in Netlify
              env vars and redeploy.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled
          className={cx(
            'w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900',
            'opacity-50 cursor-not-allowed',
          )}
        >
          <span className="flex items-center justify-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Checkout unavailable
          </span>
        </button>
      </div>
    );
  }

  // ========================================================================
  // Render: Error state (hook-owned)
  // ========================================================================

  if (error) {
    return (
      <div className={cx('space-y-3', className)} aria-live="polite">
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-900">{error}</p>
            {errorCode ? <p className="mt-1 text-xs text-red-700">Code: {errorCode}</p> : null}
            {disabledBecauseCooldown ? (
              <p className="mt-1 text-xs text-red-700">
                Please wait {cooldownSeconds}s before retrying.
              </p>
            ) : null}
          </div>
        </div>

        {canRetry ? (
          <button
            type="button"
            onClick={handleRetry}
            disabled={disabledBecauseCooldown}
            className={cx(
              'w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900',
              'transition hover:bg-zinc-50',
              'focus:outline-none focus:ring-2 focus:ring-zinc-900/10',
              disabledBecauseCooldown && 'cursor-not-allowed opacity-50 hover:bg-white',
            )}
          >
            <span className="flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4" />
              {disabledBecauseCooldown ? `Retry in ${cooldownSeconds}s` : 'Try Again'}
            </span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={reset}
          className="w-full text-sm text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-900"
        >
          ← Back to checkout
        </button>
      </div>
    );
  }

  // ========================================================================
  // Render: Normal state
  // ========================================================================

  return (
    <button
      type="button"
      onClick={handleCheckout}
      disabled={disabled}
      className={cx(
        'group relative w-full overflow-hidden rounded-xl px-6 py-4 text-white',
        'bg-linear-to-r from-zinc-900 to-zinc-800',
        'shadow-sm transition',
        'hover:from-zinc-800 hover:to-zinc-700',
        'focus:outline-none focus:ring-2 focus:ring-zinc-900/20',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:from-zinc-900 disabled:hover:to-zinc-800',
        className,
      )}
      aria-disabled={disabled}
      aria-busy={isLoading ? 'true' : 'false'}
    >
      {/* Loading overlay */}
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/70">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : null}

      <div className="relative flex items-center justify-center gap-3">
        {isAuthed ? <CreditCard className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}

        <span className="text-base font-semibold">{buttonLabel}</span>

        {/* Subtle shimmer */}
        <span
          aria-hidden="true"
          className={cx(
            'pointer-events-none absolute -inset-y-8 -left-24 w-24 rotate-12 bg-white/10 blur-xl',
            'transition-transform duration-700',
            !disabled && 'group-hover:translate-x-28rem',
          )}
        />
      </div>
    </button>
  );
}

export default memo(CheckoutButton);