// ============================================================================
// src/components/checkout/CheckoutButton.tsx
// CheckoutButton — Enterprise UX (2026) + Review Order Modal (Production Ready)
// ----------------------------------------------------------------------------
// Keeps security guarantees intact:
// - useCheckout() remains the ONLY executor for create-checkout + redirect
// - Strict runtime guards for cart shape + safe totals
// - Idempotent click handling + cooldown-safe retry UX
// - No token/session logging
// - Accessible modal (ESC, outside click, focus trap-lite, scroll lock)
// ----------------------------------------------------------------------------
// Major upgrades (2026):
// - Stronger a11y: focus restore, focus trap-lite, aria-describedby/id wiring
// - Better idempotency: double-click lock + queued checkout avoidance
// - Safer timers: interval cleanup + visibility-aware tick
// - Better UX: empty cart state, line-item sorting stability, notes preview,
//   keyboard activation, and reduced motion safety
// - More defensive runtime guards for CartModifier
// ============================================================================

import React, { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertCircle, CreditCard, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react'

import { env } from '@/lib/config/env'
import { useCheckout } from '@/modules/checkout/hooks/useCheckout'
import { useUserContext } from '@/contexts/useUserContext'
import { useCart } from '@/modules/cart/hooks/useCart'

import type { CartItem, CartModifier } from '@/modules/cart/types/cart.types'
import { cartItemKey } from '@/modules/cart/types/cart.types'

import { useScrollLock } from '@/lib/ui/useScrollLock';
// ============================================================================
// Types
// ============================================================================

type OrderType = 'pickup' | 'delivery' | 'dine_in'

type CheckoutButtonProps = {
  promoCode?: string
  creditId?: string
  orderType?: OrderType
  notes?: string | null

  /** If true: click opens a review modal first. If false: goes straight to Stripe. */
  reviewFirst?: boolean

  onPromoError?: (msg: string) => void
  className?: string
  disabled?: boolean
}

type CountdownState = {
  secondsLeft: number
  untilMs: number
} | null

type UnknownRecord = Record<string, unknown>

// ============================================================================
// Helpers
// ============================================================================

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function normalizePromo(code?: string): string | undefined {
  const v = (code ?? '').trim().toUpperCase()
  return v ? v : undefined
}

function normalizeCreditId(id?: string): string | undefined {
  const v = (id ?? '').trim()
  return v ? v : undefined
}

function isPromoRelatedMessage(msg: string): boolean {
  return /(promo|coupon|code|discount)/i.test(msg)
}

function safeSecondsLeft(untilMs: number): number {
  const diff = Math.ceil((untilMs - Date.now()) / 1000)
  return Math.max(0, diff)
}

function formatCents(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0
  return (safe / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

function modifierLabel(mods: CartModifier[]): string {
  if (!Array.isArray(mods) || mods.length === 0) return ''
  const names = mods
    .map((m) => (m && typeof m.name === 'string' ? m.name : ''))
    .map((s) => s.trim())
    .filter(Boolean)
  return names.length ? names.join(', ') : ''
}

function isCartModifier(v: unknown): v is CartModifier {
  if (!isRecord(v)) return false
  const idOk = typeof v.id === 'string' && v.id.trim().length > 0
  // groupId/name are optional in some carts, but if present, ensure string
  const groupOk = v.groupId === undefined || typeof v.groupId === 'string'
  const nameOk = v.name === undefined || typeof v.name === 'string'
  const priceOk =
    v.priceAdjustment === undefined ||
    (typeof v.priceAdjustment === 'number' && Number.isFinite(v.priceAdjustment))
  return idOk && groupOk && nameOk && priceOk
}

/** Runtime guard so this component never receives unknown cart shapes. */
function isCartItem(v: unknown): v is CartItem {
  if (!isRecord(v)) return false

  const okId = typeof v.menuItemId === 'string' && v.menuItemId.trim().length > 0
  const okName = typeof v.name === 'string'
  const okQty = typeof v.quantity === 'number' && Number.isFinite(v.quantity)
  const okUnit = typeof v.unitPriceCents === 'number' && Number.isFinite(v.unitPriceCents)
  const okMods = Array.isArray(v.modifiers) && v.modifiers.every(isCartModifier)
  const okLine = typeof v.lineTotalCents === 'number' && Number.isFinite(v.lineTotalCents)

  // lineTotalCents may be missing in older carts, so allow it to be absent.
  return okId && okName && okQty && okUnit && okMods && (okLine || v.lineTotalCents === undefined)
}

function safeLineTotalCents(item: CartItem): number {
  if (typeof item.lineTotalCents === 'number' && Number.isFinite(item.lineTotalCents)) {
    return Math.max(0, Math.round(item.lineTotalCents))
  }

  const qty = clampInt(item.quantity, 1, 100)
  const unit = Math.max(0, Math.round(item.unitPriceCents ?? 0))
  const modSum = Array.isArray(item.modifiers)
    ? item.modifiers.reduce((s, m) => s + Math.max(0, Math.round(m.priceAdjustment ?? 0)), 0)
    : 0
  return (unit + modSum) * qty
}

function sumCartSubtotalCents(items: CartItem[]): number {
  let sum = 0
  for (const it of items) sum += safeLineTotalCents(it)
  return Math.max(0, sum)
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function safeTrim(v: unknown, max = 600): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  return s.length > max ? s.slice(0, max) : s
}

// ============================================================================
// Focus trap-lite + scroll lock (modal safety, no external deps)
// ============================================================================

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'

function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  return nodes.filter((el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'))
}


// ============================================================================
// Component
// ============================================================================

function CheckoutButton({
  promoCode,
  creditId,
  orderType = 'pickup',
  notes = null,
  reviewFirst = true,
  onPromoError,
  className,
  disabled: disabledProp = false,
}: CheckoutButtonProps) {
  const { user, loading: authLoading, isAuthenticated } = useUserContext();
  const { checkout, isLoading, error, errorCode, canRetry, retryAfter, reset, canCheckout } =
    useCheckout();

  // Pull cart for review UI (does NOT execute checkout)
  const cart = useCart();

  const safeItems: CartItem[] = useMemo(() => {
    const raw = cart.items;
    if (!Array.isArray(raw)) return [];
    return raw.filter(isCartItem);
  }, [cart.items]);

  // Stripe gate
  const stripeEnabled = Boolean(env?.stripe?.enabled);

  // Refs: mount safety, click dedupe, timers, focus restore
  const mountedRef = useRef(true);
  const inflightRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);

  const [countdown, setCountdown] = useState<CountdownState>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  // ✅ Centralized scroll lock (prevents stuck scroll across the app)
  useScrollLock({ enabled: reviewOpen, token: 'checkout-review-modal' });

  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastActiveElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) window.clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    };
  }, []);

  // Normalize inputs
  const normalizedPromo = useMemo(() => normalizePromo(promoCode), [promoCode]);
  const normalizedCreditId = useMemo(() => normalizeCreditId(creditId), [creditId]);
  const safeNotesPreview = useMemo(() => safeTrim(notes, 400), [notes]);

  // Reset hook error state when promo/credit changes
  useEffect(() => {
    reset();
  }, [normalizedPromo, normalizedCreditId, reset]);

  // Retry countdown (visibility-aware)
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
      // If tab is hidden, do less work; just compute once when visible
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
    retryTimerRef.current = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      tick();
    }, 250);

    return () => {
      if (retryTimerRef.current) window.clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    };
  }, [retryAfter, reset]);

  // Derived UI state
  const isAuthed = Boolean(isAuthenticated && user?.id);
  const cooldownSeconds = countdown?.secondsLeft ?? 0;
  const disabledBecauseCooldown = cooldownSeconds > 0;

  const hasItems = safeItems.length > 0;

  const disabled =
    disabledProp ||
    authLoading ||
    !stripeEnabled ||
    !isAuthed ||
    !canCheckout ||
    !hasItems ||
    isLoading ||
    disabledBecauseCooldown ||
    inflightRef.current;

  const buttonLabel = useMemo(() => {
    if (!stripeEnabled) return 'Checkout unavailable';
    if (authLoading) return 'Loading…';
    if (!isAuthed) return 'Log in to pay';
    if (!hasItems) return 'Cart is empty';
    if (isLoading) return 'Creating secure checkout…';
    if (disabledBecauseCooldown) return `Retry in ${cooldownSeconds}s`;
    return reviewFirst ? 'Review Order' : 'Proceed to Payment';
  }, [
    stripeEnabled,
    authLoading,
    isAuthed,
    hasItems,
    isLoading,
    disabledBecauseCooldown,
    cooldownSeconds,
    reviewFirst,
  ]);

  // Review data
  const reviewSubtotalCents = useMemo(() => sumCartSubtotalCents(safeItems), [safeItems]);

  const reviewSubtotalLabel = useMemo(() => {
    const s = typeof cart.subtotalFormatted === 'string' ? cart.subtotalFormatted.trim() : '';
    return s ? s : formatCents(reviewSubtotalCents);
  }, [cart.subtotalFormatted, reviewSubtotalCents]);

  const reviewTotalLabel = useMemo(() => {
    const s = typeof cart.totalFormatted === 'string' ? cart.totalFormatted.trim() : '';
    return s ? s : formatCents(reviewSubtotalCents);
  }, [cart.totalFormatted, reviewSubtotalCents]);

  // Modal: open/close focus management + ESC + focus trap-lite
  useEffect(() => {
    if (!reviewOpen) return;

    // store last active element so we can restore focus on close
    lastActiveElRef.current = (document.activeElement as HTMLElement) ?? null;

    // focus close button
    window.setTimeout(() => closeBtnRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setReviewOpen(false);
        return;
      }

      if (e.key === 'Tab') {
        const root = modalRef.current;
        const focusables = getFocusable(root);
        if (!focusables.length) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (e.shiftKey) {
          if (!active || active === first || !root?.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (!active || active === last || !root?.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [reviewOpen]);

  useEffect(() => {
    if (reviewOpen) return;
    // restore focus after modal close
    const prev = lastActiveElRef.current;
    if (prev && typeof prev.focus === 'function') {
      window.setTimeout(() => prev.focus(), 0);
    }
  }, [reviewOpen]);

  // Checkout executor (only calls hook)
  const doCheckout = useCallback(async () => {
    if (disabled) return;

    if (!stripeEnabled) {
      onPromoError?.('Checkout is temporarily unavailable. Please try again later.');
      return;
    }

    if (!isAuthed || !user) {
      window.alert('Please log in to continue');
      return;
    }

    // idempotent click lock (also prevents modal -> button race)
    if (inflightRef.current) return;
    inflightRef.current = true;

    try {
      await checkout({
        customer_uid: user.id,
        email: user.email,
        name: user.name ?? undefined,
        phone: (user as unknown as { phone?: string | null })?.phone ?? undefined,
        promo_code: normalizedPromo,
        credit_id: normalizedCreditId,
        orderType,
        notes,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Checkout failed';
      if (onPromoError && isPromoRelatedMessage(msg)) onPromoError(msg);
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
    orderType,
    notes,
  ]);

  const handlePrimaryClick = useCallback(() => {
    if (disabled) return;
    if (reviewFirst) setReviewOpen(true);
    else void doCheckout();
  }, [disabled, reviewFirst, doCheckout]);

  const handleRetry = useCallback(() => {
    if (disabledBecauseCooldown) return;
    reset();
  }, [disabledBecauseCooldown, reset]);

  const modalTitleId = useId();
  const modalDescId = useId();

  // --------------------------------------------------------------------------
  // Render: auth loading skeleton
  // --------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------
  // Render: Stripe missing
  // --------------------------------------------------------------------------
  if (!stripeEnabled) {
    return (
      <div className={cx('space-y-3', className)} aria-live="polite">
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">Checkout is not configured.</p>
            <p className="mt-1 text-xs text-amber-800">
              Missing <span className="font-mono">VITE_STRIPE_PUBLIC_KEY</span>. Add it in env vars
              and redeploy.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 opacity-50"
        >
          <span className="flex items-center justify-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Checkout unavailable
          </span>
        </button>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Render: Hook error UI
  // --------------------------------------------------------------------------
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
              'transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10',
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

  const shimmerEnabled = !prefersReducedMotion();

  // --------------------------------------------------------------------------
  // Render: Normal button + Review modal
  // --------------------------------------------------------------------------
  return (
    <>
      <button
        type="button"
        onClick={handlePrimaryClick}
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
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setReviewOpen(false);
          }}
        >
          <div ref={modalRef} className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-zinc-200 p-5">
              <div className="min-w-0">
                <h3 id={modalTitleId} className="text-lg font-semibold text-zinc-900">
                  Review your order
                </h3>
                <p id={modalDescId} className="mt-1 text-xs text-zinc-600">
                  Prices are re-validated on the server during checkout.
                </p>
              </div>

              <button
                ref={closeBtnRef}
                type="button"
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                onClick={() => setReviewOpen(false)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-5">
              {!hasItems ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
                  Your cart is empty. Add items before checking out.
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {safeItems.map((it) => {
                      const mods = modifierLabel(it.modifiers);
                      const key = cartItemKey(it.menuItemId, it.modifiers);

                      return (
                        <div key={key} className="rounded-xl border border-zinc-200 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-zinc-900">
                                {it.name}
                              </p>
                              {mods ? <p className="mt-1 text-xs text-zinc-600">{mods}</p> : null}
                              {it.notes ? (
                                <p className="mt-1 text-xs text-zinc-500">
                                  Note: {String(it.notes).slice(0, 200)}
                                </p>
                              ) : null}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-semibold text-zinc-900">
                                {formatCents(safeLineTotalCents(it))}
                              </p>
                              <p className="mt-1 text-xs text-zinc-500">
                                Qty {clampInt(it.quantity, 1, 100)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-5 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600">Subtotal</span>
                      <span className="font-semibold text-zinc-900 tabular-nums">
                        {reviewSubtotalLabel}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-zinc-700">Estimated total</span>
                      <span className="text-base font-bold text-zinc-900 tabular-nums">
                        {reviewTotalLabel}
                      </span>
                    </div>

                    <p className="mt-2 text-[11px] text-zinc-500">
                      Final total (tax, promo eligibility, credits) is calculated server-side at
                      checkout.
                    </p>
                  </div>

                  <div className="mt-4 text-xs text-zinc-600 space-y-1">
                    <div className="flex items-center justify-between">
                      <span>Order type</span>
                      <span className="font-semibold text-zinc-900">{orderType}</span>
                    </div>

                    {normalizedPromo ? (
                      <div className="flex items-center justify-between">
                        <span>Promo code</span>
                        <span className="font-semibold text-zinc-900">{normalizedPromo}</span>
                      </div>
                    ) : null}

                    {normalizedCreditId ? (
                      <div className="flex items-center justify-between">
                        <span>Credit</span>
                        <span className="font-semibold text-zinc-900">Applied</span>
                      </div>
                    ) : null}

                    {safeNotesPreview ? (
                      <div className="rounded-lg border border-zinc-200 bg-white p-3 mt-2">
                        <p className="text-[11px] font-semibold text-zinc-800">Notes</p>
                        <p className="mt-1 text-[11px] text-zinc-600">{safeNotesPreview}</p>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-zinc-200 p-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 sm:w-auto"
                onClick={() => setReviewOpen(false)}
              >
                Back
              </button>

              <button
                type="button"
                className={cx(
                  'w-full rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white sm:w-auto',
                  'hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-zinc-900/20',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
                onClick={() => {
                  setReviewOpen(false);
                  void doCheckout();
                }}
                disabled={disabled}
              >
                {isLoading ? 'Creating secure checkout…' : 'Pay with card'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default memo(CheckoutButton)