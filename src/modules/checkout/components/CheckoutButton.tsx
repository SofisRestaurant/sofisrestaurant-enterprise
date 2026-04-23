// ============================================================================
// src/modules/checkout/components/CheckoutButton.tsx
// CheckoutButton — Enterprise UX (2026) + Review Order Modal (Production Ready)
// ----------------------------------------------------------------------------
// Security / behavior guarantees:
// - useCheckoutRouter() is the single checkout executor + redirect source
//     - isAuthenticated → create-checkout (Bearer token, loyalty/promo/credit OK)
//     - !isAuthenticated + valid guestEmail → create-checkout-guest (no auth header)
// - Strict runtime guards for cart shape + resilient totals display
// - Double-submit protection + cooldown-safe retry behavior
// - No token/session logging
// - Accessible modal: ESC, outside click, focus restore, focus trap-lite
// - Scroll lock handled centrally through useScrollLock
// ✅ i18n: all user-visible strings via useTranslation()
//
// GUEST MODE (2026 addition):
// - Accepts optional guestEmail prop from CheckoutPage
// - When !isAuthenticated: uses guestEmail as the checkout identity
// - Button enabled when guestEmail is a valid email (not auth state)
// - Guest path never sends Authorization header, customer_uid, promo, credit,
//   or loyalty — three layers deep: router strips, guest hook rejects, server 422s.
// - No "Log in to pay" shown to guests — replaced with email validation
// ============================================================================

import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CreditCard,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  X,
} from 'lucide-react';
import type { LoyaltyRedeemValue } from '@/modules/checkout/components/RewardsRedeem';

import { env } from '@/lib/config/env';
import { useCheckoutRouter } from '@/modules/checkout/hooks/useCheckoutRouter';
import { useUserContext } from '@/contexts/useUserContext';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useScrollLock } from '@/lib/ui/useScrollLock';
import { useTranslation } from '@/i18n/useTranslation';

import type { CartItem, CartModifier } from '@/modules/cart/types/cart.types';
import { cartItemKey } from '@/modules/cart/types/cart.types';

// ============================================================================
// Types
// ============================================================================

type OrderType = 'pickup' | 'delivery' | 'dine_in';

type CheckoutButtonProps = {
  promoCode?: string;
  creditId?: string;
  orderType?: OrderType;
  notes?: string | null;
  loyalty?: LoyaltyRedeemValue;
  reviewFirst?: boolean;
  onPromoError?: (msg: string) => void;
  className?: string;
  disabled?: boolean;
  pickupTime?: string;
  /** Guest mode: email entered by unauthenticated user. Enables checkout when valid. */
  guestEmail?: string;
};

type CountdownState = {
  secondsLeft: number;
  untilMs: number;
} | null;

type UnknownRecord = Record<string, unknown>;

// ============================================================================
// Helpers
// ============================================================================

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePromo(code?: string | null): string | undefined {
  const normalized = asTrimmedString(code).toUpperCase();
  return normalized || undefined;
}

function normalizeCreditId(id?: string | null): string | undefined {
  const normalized = asTrimmedString(id);
  return normalized || undefined;
}

function normalizeOrderType(value: unknown): OrderType {
  return value === 'delivery' || value === 'dine_in' || value === 'pickup' ? value : 'pickup';
}

/** RFC-lite email check — UX only, server validates authoritatively */
function isValidEmail(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const s = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 320;
}

function isLoyaltyRelatedMessage(message: string): boolean {
  return /(loyalty|points|redeem|reserve)/i.test(message);
}

function isPromoRelatedMessage(message: string): boolean {
  return /(promo|coupon|code|discount)/i.test(message);
}

function isCreditRelatedMessage(message: string): boolean {
  return /(credit|balance|voucher)/i.test(message);
}

function safeSecondsLeft(untilMs: number): number {
  return Math.max(0, Math.ceil((untilMs - Date.now()) / 1000));
}

function formatCents(cents: number): string {
  const safeValue = Number.isFinite(cents) ? cents : 0;
  return (safeValue / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function safeTrim(value: unknown, max = 600): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function isCartModifier(value: unknown): value is CartModifier {
  if (!isRecord(value)) return false;

  const idOk = typeof value.id === 'string' && value.id.trim().length > 0;
  const groupOk = value.groupId === undefined || typeof value.groupId === 'string';
  const nameOk = value.name === undefined || typeof value.name === 'string';
  const priceOk =
    value.priceAdjustment === undefined ||
    (typeof value.priceAdjustment === 'number' && Number.isFinite(value.priceAdjustment));

  return idOk && groupOk && nameOk && priceOk;
}

function isCartItem(value: unknown): value is CartItem {
  if (!isRecord(value)) return false;

  const okId = typeof value.menuItemId === 'string' && value.menuItemId.trim().length > 0;
  const okName = typeof value.name === 'string';
  const okQty = typeof value.quantity === 'number' && Number.isFinite(value.quantity);
  const okUnit = typeof value.unitPriceCents === 'number' && Number.isFinite(value.unitPriceCents);
  const okMods = Array.isArray(value.modifiers) && value.modifiers.every(isCartModifier);
  const okLine =
    value.lineTotalCents === undefined ||
    (typeof value.lineTotalCents === 'number' && Number.isFinite(value.lineTotalCents));

  return okId && okName && okQty && okUnit && okMods && okLine;
}

function safeModifierPriceAdjustment(modifier: CartModifier): number {
  return typeof modifier.priceAdjustmentCents === 'number' &&
    Number.isFinite(modifier.priceAdjustmentCents)
    ? Math.round(modifier.priceAdjustmentCents)
    : 0;
}

function safeLineTotalCents(item: CartItem): number {
  if (typeof item.lineTotalCents === 'number' && Number.isFinite(item.lineTotalCents)) {
    return Math.max(0, Math.round(item.lineTotalCents));
  }

  const quantity = clampInt(item.quantity, 1, 100);
  const unitPrice = Math.max(0, Math.round(item.unitPriceCents));
  const modifierTotal = Array.isArray(item.modifiers)
    ? item.modifiers.reduce(
        (sum, modifier) => sum + Math.max(0, safeModifierPriceAdjustment(modifier)),
        0,
      )
    : 0;

  return (unitPrice + modifierTotal) * quantity;
}

function sumCartSubtotalCents(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + safeLineTotalCents(item), 0);
}

function modifierLabel(modifiers: CartModifier[]): string {
  if (!Array.isArray(modifiers) || modifiers.length === 0) return '';

  const names = modifiers
    .map((modifier) => (typeof modifier.name === 'string' ? modifier.name.trim() : ''))
    .filter(Boolean);

  return names.join(', ');
}

// ============================================================================
// Focus trap-lite
// ============================================================================

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];

  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.hasAttribute('disabled')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    return true;
  });
}

// ============================================================================
// Component
// ============================================================================

function CheckoutButton({
  promoCode,
  creditId,
  orderType = 'pickup',
  notes = null,
  loyalty,
  reviewFirst = true,
  onPromoError,
  className,
  disabled: disabledProp = false,
  pickupTime,
  guestEmail,
}: CheckoutButtonProps) {
  const { t } = useTranslation();
  const normalizedOrderType = normalizeOrderType(orderType);

  const { user, loading: authLoading, isAuthenticated } = useUserContext();
  const cart = useCart();

  // ── ROUTING LAYER ─────────────────────────────────────────────────────────
  // useCheckoutRouter picks auth vs guest endpoint based on session state.
  //   Auth  → create-checkout       (Bearer header, loyalty/promo/credit OK)
  //   Guest → create-checkout-guest (no Authorization header, no promo/credit/loyalty)
  const {
    redirectToCheckout,
    isLoading,
    error,
    errorCode,
    canRetry,
    retryAfter,
    reset,
    canCheckout,
    mode,
  } = useCheckoutRouter();

  const mountedRef = useRef(true);
  const inflightRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const lastActiveElRef = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const [countdown, setCountdown] = useState<CountdownState>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  useScrollLock({ enabled: reviewOpen, token: 'checkout-review-modal' });

  const modalTitleId = useId();
  const modalDescId = useId();

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current !== null) {
        window.clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  const safeItems = useMemo<CartItem[]>(() => {
    const rawItems = cart.items;
    if (!Array.isArray(rawItems)) return [];
    return rawItems.filter(isCartItem);
  }, [cart.items]);

  const normalizedPromo = useMemo(() => normalizePromo(promoCode), [promoCode]);
  const normalizedCreditId = useMemo(() => normalizeCreditId(creditId), [creditId]);
  const safeNotesPreview = useMemo(() => safeTrim(notes, 400), [notes]);

  const stripeEnabled = Boolean(env?.stripe?.enabled);

  // ── Identity resolution ───────────────────────────────────────────────────
  // isAuthed: true for logged-in users.
  // For guests, we check guestEmail validity instead.
  const isAuthed = Boolean(isAuthenticated && user?.id);
  const guestEmailValid = !isAuthed && isValidEmail(guestEmail);

  // canProceed: either logged in OR guest with valid email
  const canProceed = isAuthed || guestEmailValid;

  const hasItems = safeItems.length > 0;

  useEffect(() => {
    reset();
  }, [normalizedPromo, normalizedCreditId, reset]);

  useEffect(() => {
    if (retryTimerRef.current !== null) {
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

        if (retryTimerRef.current !== null) {
          window.clearInterval(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        return;
      }

      setCountdown({ secondsLeft, untilMs });
    };

    tick();

    retryTimerRef.current = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      tick();
    }, 250);

    return () => {
      if (retryTimerRef.current !== null) {
        window.clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [retryAfter, reset]);

  useEffect(() => {
    if (!reviewOpen) return;

    lastActiveElRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTimeout = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setReviewOpen(false);
        return;
      }

      if (event.key !== 'Tab') return;

      const root = modalRef.current;
      const focusable = getFocusable(root);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey) {
        if (!active || active === first || !root?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (!active || active === last || !root?.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimeout);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [reviewOpen]);

  useEffect(() => {
    if (reviewOpen) return;

    const previous = lastActiveElRef.current;
    if (!previous || typeof previous.focus !== 'function') return;

    const timeout = window.setTimeout(() => {
      previous.focus();
    }, 0);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [reviewOpen]);

  const cooldownSeconds = countdown?.secondsLeft ?? 0;
  const disabledBecauseCooldown = cooldownSeconds > 0;

  // ── Disabled state ────────────────────────────────────────────────────────
  // canProceed = isAuthed || guestEmailValid.
  // Guests with a valid email are allowed to proceed (no more "Log in to pay").
  const disabled =
    disabledProp ||
    authLoading ||
    !stripeEnabled ||
    !canProceed ||
    !canCheckout ||
    !hasItems ||
    isLoading ||
    disabledBecauseCooldown ||
    inflightRef.current;

  // ── Button label ──────────────────────────────────────────────────────────
  // Guest branch shows "Enter email to continue" instead of "Log in to pay".
  const buttonLabel = useMemo(() => {
    if (!stripeEnabled) return t('checkout.button.unavailable');
    if (authLoading) return t('checkout.button.loading');
    if (!hasItems) return t('checkout.button.cartEmpty');
    if (!canProceed && !isAuthed) return t('checkout.button.emailRequired'); // guest: enter email
    if (isLoading) return t('checkout.button.processing');
    if (disabledBecauseCooldown) return t('checkout.button.retryIn', { seconds: cooldownSeconds });
    return reviewFirst ? t('checkout.button.reviewOrder') : t('checkout.button.proceedToPayment');
  }, [
    stripeEnabled,
    authLoading,
    hasItems,
    canProceed,
    isAuthed,
    isLoading,
    disabledBecauseCooldown,
    cooldownSeconds,
    reviewFirst,
    t,
  ]);

  const orderTypeLabel = t(`checkout.orderType.${normalizedOrderType}`);

  const reviewSubtotalCents = useMemo(() => sumCartSubtotalCents(safeItems), [safeItems]);

  const reviewSubtotalLabel = useMemo(() => {
    const formatted =
      typeof cart.subtotalFormatted === 'string' ? cart.subtotalFormatted.trim() : '';
    return formatted || formatCents(reviewSubtotalCents);
  }, [cart.subtotalFormatted, reviewSubtotalCents]);

  const reviewTotalLabel = useMemo(() => {
    const formatted = typeof cart.totalFormatted === 'string' ? cart.totalFormatted.trim() : '';
    return formatted || formatCents(reviewSubtotalCents);
  }, [cart.totalFormatted, reviewSubtotalCents]);

  const handleRetry = useCallback(() => {
    if (disabledBecauseCooldown) return;
    reset();
  }, [disabledBecauseCooldown, reset]);

  // ── doCheckout ────────────────────────────────────────────────────────────
  // The router decides which edge function to hit. We just assemble args.
  //   Auth:  { customer_uid, orderType, notes, promoCode, creditId, loyalty }
  //   Guest: { guestEmail, orderType, notes }   — no customer_uid, no promo/credit/loyalty
  const doCheckout = useCallback(async () => {
    if (disabled) return;

    if (!stripeEnabled) {
      onPromoError?.(t('checkout.error.unavailableToast'));
      return;
    }

    if (inflightRef.current) return;
    inflightRef.current = true;

    try {
      if (isAuthed && user) {
        // AUTH PATH → useAuthCheckout → create-checkout (Bearer)
        await redirectToCheckout({
          customer_uid: user.id,
          orderType: normalizedOrderType,
          notes,
          promoCode: normalizedPromo,
          promoId: undefined,
          creditId: normalizedCreditId,
          loyalty,
        });
      } else {
        // GUEST PATH → useGuestCheckout → create-checkout-guest (no auth header)
        // Router validates guestEmail; no customer_uid, no loyalty/promo/credit.
        await redirectToCheckout({
          guestEmail,
          orderType: normalizedOrderType,
          notes,
        });
      }
    } catch (checkoutError: unknown) {
      const message =
        checkoutError instanceof Error ? checkoutError.message : t('checkout.error.checkoutFailed');

      if (
        onPromoError &&
        (isPromoRelatedMessage(message) ||
          isCreditRelatedMessage(message) ||
          isLoyaltyRelatedMessage(message))
      ) {
        onPromoError(message);
      }
    } finally {
      inflightRef.current = false;
    }
  }, [
    disabled,
    stripeEnabled,
    isAuthed,
    user,
    guestEmail,
    redirectToCheckout,
    normalizedPromo,
    normalizedCreditId,
    normalizedOrderType,
    notes,
    onPromoError,
    t,
    loyalty,
  ]);

  const handlePrimaryClick = useCallback(() => {
    if (disabled) return;

    if (reviewFirst) {
      setReviewOpen(true);
      return;
    }

    void doCheckout();
  }, [disabled, reviewFirst, doCheckout]);

  const shimmerEnabled = !prefersReducedMotion();

  // ── Loading skeleton ───────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <button
        type="button"
        disabled
        aria-busy="true"
        className={cx(
          'w-full cursor-not-allowed select-none rounded-xl border border-zinc-200 bg-zinc-100 px-6 py-4 text-zinc-500',
          className,
        )}
      >
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-base font-semibold">{t('checkout.button.loading')}</span>
        </div>
      </button>
    );
  }

  // ── Stripe not configured ──────────────────────────────────────────────────
  if (!stripeEnabled) {
    return (
      <div className={cx('space-y-3', className)} aria-live="polite">
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">
              {t('checkout.error.notConfiguredTitle')}
            </p>
            <p className="mt-1 text-xs text-amber-800">{t('checkout.error.notConfiguredBody')}</p>
          </div>
        </div>

        <button
          type="button"
          disabled
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 opacity-50"
        >
          <span className="flex items-center justify-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            {t('checkout.button.unavailable')}
          </span>
        </button>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={cx('space-y-3', className)} aria-live="polite">
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-900">{error}</p>
            {errorCode ? (
              <p className="mt-1 text-xs text-red-700">
                {t('checkout.error.codeLabel', { code: errorCode })}
              </p>
            ) : null}
            {disabledBecauseCooldown ? (
              <p className="mt-1 text-xs text-red-700">
                {t('checkout.error.waitToRetry', { seconds: cooldownSeconds })}
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
              'transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10',
              disabledBecauseCooldown && 'cursor-not-allowed opacity-50 hover:bg-white',
            )}
          >
            <span className="flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4" />
              {disabledBecauseCooldown
                ? t('checkout.error.retryIn', { seconds: cooldownSeconds })
                : t('checkout.error.tryAgain')}
            </span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={reset}
          className="w-full text-sm text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-900"
        >
          {t('checkout.error.back')}
        </button>
      </div>
    );
  }

  // ── Primary button + review modal ──────────────────────────────────────────
  return (
    <>
      <button
        type="button"
        onClick={handlePrimaryClick}
        disabled={disabled}
        aria-disabled={disabled}
        aria-busy={isLoading ? 'true' : 'false'}
        data-checkout-mode={mode}
        className={cx(
          'group relative w-full overflow-hidden rounded-xl px-6 py-4 transition',
          'bg-linear-to-r from-zinc-900 to-zinc-800 shadow-sm',
          'hover:from-zinc-800 hover:to-zinc-700',
          'focus:outline-none focus:ring-2 focus:ring-zinc-900/20',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        style={{
          color: '#ffffff',
          background: disabled ? '#71717a' : undefined,
        }}
      >
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/70">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : null}

        <div className="relative flex items-center justify-center gap-3">
          {isAuthed ? <CreditCard className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          <span className="text-base font-semibold">{buttonLabel}</span>

          {shimmerEnabled ? (
            <span
              aria-hidden="true"
              className={cx(
                'pointer-events-none absolute -inset-y-8 -left-24 w-24 rotate-12 bg-white/10 blur-xl',
                'transition-transform duration-700',
                !disabled && 'group-hover:translate-x-28rem',
              )}
            />
          ) : null}
        </div>
      </button>

      {reviewOpen ? (
        <div
          className="fixed inset-0 z-80 flex items-center justify-center bg-black/50 p-4"
          data-modal-root="true"
          role="dialog"
          aria-modal="true"
          aria-labelledby={modalTitleId}
          aria-describedby={modalDescId}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setReviewOpen(false);
            }
          }}
        >
          <div ref={modalRef} className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            {/* Modal header */}
            <div className="flex items-start justify-between border-b border-zinc-200 p-5">
              <div className="min-w-0">
                <h3 id={modalTitleId} className="text-lg font-semibold text-zinc-900">
                  {t('checkout.modal.title')}
                </h3>
                <p id={modalDescId} className="mt-1 text-xs text-zinc-600">
                  {t('checkout.modal.description')}
                </p>
              </div>

              <button
                ref={closeBtnRef}
                type="button"
                aria-label={t('checkout.modal.close')}
                onClick={() => setReviewOpen(false)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="max-h-[60vh] overflow-y-auto p-5">
              {!hasItems ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                  {t('checkout.modal.emptyCart')}
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {safeItems.map((item) => {
                      const key = cartItemKey(item.menuItemId, item.modifiers);
                      const modifiersText = modifierLabel(item.modifiers);

                      return (
                        <div key={key} className="rounded-xl border border-zinc-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-zinc-900">
                                {item.name}
                              </p>

                              {modifiersText ? (
                                <p className="mt-1 text-xs text-zinc-600">{modifiersText}</p>
                              ) : null}

                              {item.notes ? (
                                <p className="mt-1 text-xs text-zinc-500">
                                  {t('checkout.modal.notePrefix')}
                                  {String(item.notes).slice(0, 200)}
                                </p>
                              ) : null}
                            </div>

                            <div className="shrink-0 text-right">
                              <p className="text-sm font-semibold text-zinc-900">
                                {formatCents(safeLineTotalCents(item))}
                              </p>
                              <p className="mt-1 text-xs text-zinc-500">
                                {t('checkout.modal.qtyLabel', {
                                  qty: clampInt(item.quantity, 1, 100),
                                })}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Totals */}
                  <div className="mt-5 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600">{t('checkout.modal.subtotal')}</span>
                      <span className="font-semibold text-zinc-900 tabular-nums">
                        {reviewSubtotalLabel}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-zinc-700">{t('checkout.modal.estimatedTotal')}</span>
                      <span className="text-base font-bold text-zinc-900 tabular-nums">
                        {reviewTotalLabel}
                      </span>
                    </div>

                    <p className="mt-2 text-[11px] text-zinc-500">
                      {t('checkout.modal.totalDisclaimer')}
                    </p>
                  </div>

                  {/* Order meta */}
                  <div className="mt-4 space-y-1 text-xs text-zinc-600">
                    <div className="flex items-center justify-between">
                      <span>{t('checkout.modal.orderType')}</span>
                      <span className="font-semibold text-zinc-900">{orderTypeLabel}</span>
                    </div>

                    {/* Promo/credit rows only render on auth path — guest can't use them */}
                    {normalizedPromo && isAuthed ? (
                      <div className="flex items-center justify-between">
                        <span>{t('checkout.modal.promoCode')}</span>
                        <span className="font-semibold text-zinc-900">{normalizedPromo}</span>
                      </div>
                    ) : null}

                    {normalizedCreditId && isAuthed ? (
                      <div className="flex items-center justify-between">
                        <span>{t('checkout.modal.credit')}</span>
                        <span className="font-semibold text-zinc-900">
                          {t('checkout.modal.creditApplied')}
                        </span>
                      </div>
                    ) : null}

                    {safeNotesPreview ? (
                      <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-3">
                        <p className="text-[11px] font-semibold text-zinc-800">
                          {t('checkout.modal.notesLabel')}
                        </p>
                        <p className="mt-1 text-[11px] text-zinc-600">{safeNotesPreview}</p>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex flex-col gap-3 border-t border-zinc-200 p-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 sm:w-auto"
              >
                {t('checkout.modal.back')}
              </button>

              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setReviewOpen(false);
                  void doCheckout();
                }}
                className={cx(
                  'w-full rounded-xl px-5 py-3 text-sm font-semibold sm:w-auto',
                  'hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-zinc-900/20',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
                style={{
                  backgroundColor: disabled ? '#71717a' : '#18181b',
                  color: '#ffffff',
                }}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  {isLoading ? t('checkout.modal.processing') : t('checkout.modal.payWithCard')}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default memo(CheckoutButton);