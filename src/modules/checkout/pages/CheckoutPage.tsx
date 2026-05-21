// src/modules/checkout/pages/CheckoutPage.tsx
// Checkout orchestrator — state, effects, and handlers only. UI lives in components/page/.
//
// [FIX 2026-05-20] Added pending checkout lock guard for guest checkout.
// If a Stripe session was already created (user hit back, reloaded, or
// returned after redirect), the page now shows a recovery UI instead of
// allowing a duplicate payment. The lock is set immediately before redirect
// to Stripe and cleared only when OrderSuccess confirms the order.

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { type LoyaltyRedeemValue } from '@/modules/checkout/components/RewardsRedeem';
import { useCheckoutRouter } from '@/modules/checkout/hooks/useCheckoutRouter';
import {
  getAvailableCredits,
  getLoyaltyProfile,
  calculatePointsPreview,
  type UserCredit,
  type LoyaltyProfile,
  type LoyaltyPreview,
} from '@/modules/checkout/api/checkout.api';
import { getLoyaltyAccount } from '@/modules/checkout/api/loyalty-account.api';
import {
  isCheckoutSuccess,
  isOtpRequired,
  isCheckoutBlocked,
} from '@/modules/checkout/types/checkout.types';
import type {
  PromoState,
  OrderType,
  OrderDetailsState,
} from '@/modules/checkout/types/checkout-page.types';
import {
  CHECKOUT_STORAGE,
  CHECKOUT_LIMITS,
  safeLocalGet,
  safeLocalSet,
  safeLocalRemove,
  getPendingCheckoutLock,
  setPendingCheckoutLock,
  clearPendingCheckoutLock,
  type PendingCheckoutLock,
} from '@/modules/checkout/utils/checkoutPageStorage';
import {
  clampInt,
  normalizePromo,
  safeMoneyCents,
  computeDisplayLineTotalCents,
  formatOrderTypeLabel,
} from '@/modules/checkout/utils/checkoutPageFormatters';

import { CheckoutEmptyState } from '@/modules/checkout/components/page/CheckoutEmptyState';
import { CheckoutFlowContent } from '@/modules/checkout/components/page/CheckoutFlowContent';
import { CheckoutFooter } from '@/modules/checkout/components/page/CheckoutFooter';
import { CheckoutHeader } from '@/modules/checkout/components/page/CheckoutHeader';
import { CheckoutShell } from '@/modules/checkout/components/page/CheckoutShell';
import { CheckoutSummaryRail } from '@/modules/checkout/components/page/CheckoutSummaryRail';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { useCart } from '@/modules/cart/hooks/useCart';
import { formatCents } from '@/modules/cart/utils/cart.utils';
import {
  getPickupTimingDate,
  getPickupTimingLabel,
  useOrderIntentStore,
} from '@/modules/orders/store/orderIntent.store';

const CHECKOUT_PROGRESS_STEPS = 4;

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { items } = useCart();
  const { user, isAuthenticated } = useAuth();
  const isGuest = !isAuthenticated;

  const {
    checkout,
    reset,
    otpChallenge,
    retryWithToken,
    guestPhase,
    isLoading,
    error: routerError,
  } = useCheckoutRouter();

  const fulfillmentType = useOrderIntentStore((state) => state.fulfillmentType);
  const pickupTiming = useOrderIntentStore((state) => state.pickupTiming);
  const deliveryAvailability = useOrderIntentStore((state) => state.deliveryAvailability);
  const openOrderIntentSheet = useOrderIntentStore((state) => state.openMobileSheet);

  const showChallenge = guestPhase.tag === 'otp_required' || guestPhase.tag === 'retrying';
  const showBlocked = guestPhase.tag === 'blocked';
  const hasItems = Array.isArray(items) && items.length > 0;

  // ── [FIX] Pending checkout lock — prevents duplicate guest payment ────────
  const [pendingLock, setPendingLockState] = useState<PendingCheckoutLock | null>(() =>
    isGuest ? getPendingCheckoutLock() : null,
  );

  // Re-check lock when returning to this page (e.g. via popstate / back button)
  useEffect(() => {
    if (!isGuest) {
      setPendingLockState(null);
      return;
    }
    const onFocus = () => setPendingLockState(getPendingCheckoutLock());
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onFocus);
    };
  }, [isGuest]);

  const handleCancelPendingCheckout = useCallback(() => {
    clearPendingCheckoutLock();
    setPendingLockState(null);
  }, []);

  const handleContinueToPayment = useCallback(() => {
    if (pendingLock?.sessionUrl) {
      window.location.assign(pendingLock.sessionUrl);
    }
  }, [pendingLock]);
  // ── End pending lock ──────────────────────────────────────────────────────

  const subtotalCents = useMemo(() => {
    if (!hasItems) return 0;
    return items.reduce((sum, item) => sum + computeDisplayLineTotalCents(item), 0);
  }, [items, hasItems]);

  const estimatedTaxCents = useMemo(() => Math.round(subtotalCents * 0.095), [subtotalCents]);

  const estimatedTotalCents = useMemo(
    () => subtotalCents + estimatedTaxCents,
    [subtotalCents, estimatedTaxCents],
  );

  const itemCount = useMemo(() => {
    if (!hasItems) return 0;
    return items.reduce((acc, item) => acc + clampInt(item.quantity, 0, 10_000), 0);
  }, [items, hasItems]);

  const effectiveOrderType = useMemo<OrderType>(() => {
    if (fulfillmentType === 'delivery' && deliveryAvailability === 'available') {
      return 'delivery';
    }
    return 'pickup';
  }, [fulfillmentType, deliveryAvailability]);

  const pickupTimingLabel = useMemo(() => getPickupTimingLabel(pickupTiming), [pickupTiming]);

  const orderSummarySubtitle = useMemo(() => {
    if (effectiveOrderType === 'delivery') return 'Delivery';
    return `Pickup · ${pickupTimingLabel}`;
  }, [effectiveOrderType, pickupTimingLabel]);

  const [orderDetails, setOrderDetails] = useState<OrderDetailsState>(() => {
    const storedType = safeLocalGet(CHECKOUT_STORAGE.ORDER_TYPE);
    const storedNotes = safeLocalGet(CHECKOUT_STORAGE.NOTES);

    const fallbackType: OrderType =
      storedType === 'pickup' || storedType === 'delivery' || storedType === 'dine_in'
        ? storedType
        : 'pickup';

    return {
      orderType: fallbackType,
      notes: typeof storedNotes === 'string' ? storedNotes.slice(0, CHECKOUT_LIMITS.NOTES_MAX) : '',
    };
  });

  useEffect(() => {
    setOrderDetails((current) =>
      current.orderType === effectiveOrderType
        ? current
        : { ...current, orderType: effectiveOrderType },
    );
  }, [effectiveOrderType]);

  useEffect(() => {
    safeLocalSet(CHECKOUT_STORAGE.ORDER_TYPE, orderDetails.orderType);
  }, [orderDetails.orderType]);

  useEffect(() => {
    if (!orderDetails.notes) safeLocalRemove(CHECKOUT_STORAGE.NOTES);
    else safeLocalSet(CHECKOUT_STORAGE.NOTES, orderDetails.notes);
  }, [orderDetails.notes]);

  const [promo, setPromo] = useState<PromoState>(() => {
    const stored = safeLocalGet(CHECKOUT_STORAGE.PROMO);
    return { code: stored ? normalizePromo(stored) : '', applied: false, error: null };
  });

  const onPromoChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const code = normalizePromo(event.target.value);
    setPromo({ code, applied: false, error: null });
    if (code) safeLocalSet(CHECKOUT_STORAGE.PROMO, code);
    else safeLocalRemove(CHECKOUT_STORAGE.PROMO);
  }, []);

  const onPromoApply = useCallback(() => {
    if (promo.code.trim()) {
      setPromo((current) => ({ ...current, applied: true, error: null }));
    }
  }, [promo.code]);

  const onPromoClear = useCallback(() => {
    setPromo({ code: '', applied: false, error: null });
    safeLocalRemove(CHECKOUT_STORAGE.PROMO);
  }, []);

  const onPromoKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        onPromoApply();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onPromoClear();
      }
    },
    [onPromoApply, onPromoClear],
  );

  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [challengeEmail, setChallengeEmail] = useState<string | null>(null);

  useEffect(() => {
    if (guestPhase.tag === 'otp_required' && challengeEmail === null) {
      setChallengeEmail(guestEmail.trim().toLowerCase() || null);
    }
    if (guestPhase.tag === 'idle') {
      setChallengeEmail(null);
    }
  }, [guestPhase.tag, guestEmail, challengeEmail]);

  const [credits, setCredits] = useState<UserCredit[]>([]);
  const [selectedCredit, setSelectedCredit] = useState<string | null>(() =>
    safeLocalGet(CHECKOUT_STORAGE.CREDIT),
  );
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [creditsError, setCreditsError] = useState<string | null>(null);

  const creditsAvailableCents = useMemo(
    () => credits.reduce((sum, credit) => sum + safeMoneyCents(credit.amount_cents), 0),
    [credits],
  );

  const [loyaltyProfile, setLoyaltyProfile] = useState<LoyaltyProfile | null>(null);
  const [loyaltyPreview, setLoyaltyPreview] = useState<LoyaltyPreview | null>(null);
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [loyaltyAccountId, setLoyaltyAccountId] = useState('');
  const [recentlyRedeemed, setRecentlyRedeemed] = useState(false);
  const [loyaltyIntent, setLoyaltyIntent] = useState<LoyaltyRedeemValue>({
    applyPoints: false,
    pointsToRedeem: 0,
    loyaltyAccountId: '',
  });

  const loadCredits = useCallback(async () => {
    setCreditsLoading(true);
    setCreditsError(null);

    try {
      const rows = await getAvailableCredits();
      const clean = (rows ?? []).filter(
        (credit) => typeof credit?.id === 'string' && credit.id.length > 0,
      );

      setCredits(clean);

      if (selectedCredit && !clean.some((credit) => credit.id === selectedCredit)) {
        setSelectedCredit(null);
        safeLocalRemove(CHECKOUT_STORAGE.CREDIT);
      }
    } catch {
      setCredits([]);
      setCreditsError('Unable to load credits right now.');
    } finally {
      setCreditsLoading(false);
    }
  }, [selectedCredit]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCreditsLoading(false);
      return;
    }

    let alive = true;
    void loadCredits().finally(() => {
      if (!alive) return;
    });

    return () => {
      alive = false;
    };
  }, [isAuthenticated, loadCredits]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let alive = true;
    void getLoyaltyProfile().then((profile) => {
      if (alive) setLoyaltyProfile(profile);
    });

    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    setLoyaltyPreview(
      subtotalCents > 0 ? calculatePointsPreview(subtotalCents, loyaltyProfile) : null,
    );
  }, [subtotalCents, loyaltyProfile]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let alive = true;
    void getLoyaltyAccount().then((account) => {
      if (!alive || !account) return;

      setLoyaltyBalance(account.balance);
      setLoyaltyAccountId(account.accountId);

      if (account.lastRedeemAt) {
        const hoursSince = (Date.now() - new Date(account.lastRedeemAt).getTime()) / 36e5;
        setRecentlyRedeemed(hoursSince < 24);
      }
    });

    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!loyaltyAccountId) return;
    setLoyaltyIntent((prev) => ({ ...prev, loyaltyAccountId }));
  }, [loyaltyAccountId]);

  useEffect(() => {
    if (!selectedCredit) safeLocalRemove(CHECKOUT_STORAGE.CREDIT);
    else safeLocalSet(CHECKOUT_STORAGE.CREDIT, selectedCredit);
  }, [selectedCredit]);

  const handleCheckout = useCallback(async () => {
    // [FIX] Prevent duplicate payment if a lock already exists
    const existingLock = isGuest ? getPendingCheckoutLock() : null;
    if (existingLock) {
      setPendingLockState(existingLock);
      return;
    }

    const pickupTime =
      effectiveOrderType === 'pickup'
        ? (getPickupTimingDate(pickupTiming) ?? undefined)
        : undefined;

    const result = await checkout({
      guestEmail: guestEmail || undefined,
      orderType: effectiveOrderType,
      notes: orderDetails.notes || null,
      pickupTime,
      promoCode: promo.applied ? promo.code : undefined,
      creditId: isGuest ? undefined : (selectedCredit ?? undefined),
      loyalty: loyaltyIntent,
      guestPhone: smsOptIn ? guestPhone : undefined,
      smsOptIn,
    });

    if (isCheckoutSuccess(result)) {
      // [FIX] Store pending checkout lock before redirecting to Stripe.
      // This prevents duplicate payment if the user navigates back.
      if (isGuest && result.sessionId) {
        setPendingCheckoutLock(result.sessionId, result.url);
        setPendingLockState({
          sessionId: result.sessionId,
          sessionUrl: result.url,
          createdAt: Date.now(),
        });
      }

      window.location.assign(result.url);
      return;
    }

    if (!isOtpRequired(result) && !isCheckoutBlocked(result)) {
      if (result.code === 'promo_invalid' || result.code === 'promo_not_found') {
        setPromo((prev) => ({
          ...prev,
          applied: false,
          error: result.error || 'Invalid promo code.',
        }));
      }
    }
  }, [
    checkout,
    guestEmail,
    guestPhone,
    smsOptIn,
    effectiveOrderType,
    pickupTiming,
    orderDetails.notes,
    promo.applied,
    promo.code,
    selectedCredit,
    loyaltyIntent,
    isGuest,
  ]);

  const copySummary = useCallback(async () => {
    if (!hasItems) return;

    const pickupTime =
      effectiveOrderType === 'pickup'
        ? (getPickupTimingDate(pickupTiming) ?? undefined)
        : undefined;

    const lines = [
      `Sofi's - Checkout Summary`,
      `Type: ${formatOrderTypeLabel(effectiveOrderType)}`,
    ];

    if (effectiveOrderType === 'pickup') {
      lines.push(`Pickup: ${pickupTimingLabel}`);
      if (pickupTime) {
        lines.push(
          `Estimated ready time: ${new Date(pickupTime).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })}`,
        );
      }
    }

    for (const item of items) {
      lines.push(
        `- ${item.name} x${clampInt(item.quantity, 1, 100)} - ${formatCents(
          computeDisplayLineTotalCents(item),
        )}`,
      );
    }

    lines.push(`Subtotal: ${formatCents(subtotalCents)}`);
    lines.push(`Final total confirmed by Stripe.`);

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      // Clipboard may be unavailable in some browsers.
    }
  }, [hasItems, items, subtotalCents, effectiveOrderType, pickupTiming, pickupTimingLabel]);

  return (
    <CheckoutShell>
      <CheckoutHeader
        isGuest={isGuest}
        userName={user?.name ?? null}
        hasItems={hasItems}
        estimatedTotalCents={estimatedTotalCents}
        activeStep={CHECKOUT_PROGRESS_STEPS}
        totalSteps={CHECKOUT_PROGRESS_STEPS}
      />

      {/* ── [FIX] Pending checkout recovery for guests ────────────────────────
           If a Stripe session was already created, show recovery UI instead of
           allowing a second payment. The user can continue to the existing
           Stripe session or cancel and start fresh.                           */}
      {pendingLock && isGuest ? (
        <div className="mx-auto max-w-md space-y-4 py-10 text-center">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/30">
              <span className="text-3xl">💳</span>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold text-white">Payment already started</h2>
            <p className="mt-1 text-sm text-neutral-400">
              A checkout session is already active for this order. You can continue to the payment
              page or cancel and start over.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleContinueToPayment}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl
                         bg-amber-500 py-3 text-sm font-bold text-neutral-950
                         hover:shadow-[0_0_18px_4px_rgba(245,158,11,0.35)]
                         focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-amber-400 focus-visible:ring-offset-2
                         focus-visible:ring-offset-neutral-950"
            >
              Continue to Payment
            </button>
            <button
              type="button"
              onClick={handleCancelPendingCheckout}
              className="inline-flex w-full items-center justify-center rounded-xl
                         bg-white/8 py-3 text-sm font-semibold text-white
                         hover:bg-white/12 focus-visible:outline-none
                         focus-visible:ring-2 focus-visible:ring-white/30"
            >
              Cancel &amp; Start Over
            </button>
            <p className="text-xs text-neutral-600">
              If you already completed payment, your order is being confirmed. Check{' '}
              <button
                type="button"
                onClick={() => navigate('/account/orders')}
                className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
              >
                your orders
              </button>{' '}
              or{' '}
              <button
                type="button"
                onClick={() => navigate('/find-order')}
                className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
              >
                find your order
              </button>{' '}
              for status.
            </p>
          </div>
        </div>
      ) : !hasItems ? (
        <CheckoutEmptyState onBrowseMenu={() => navigate('/menu')} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
          <CheckoutFlowContent
            isGuest={isGuest}
            userEmail={user?.email ?? ''}
            userName={user?.name ?? null}
            guestEmail={guestEmail}
            guestPhone={guestPhone}
            smsOptIn={smsOptIn}
            onGuestEmailChange={setGuestEmail}
            onGuestPhoneChange={setGuestPhone}
            onSmsToggle={() => setSmsOptIn((value) => !value)}
            effectiveOrderType={effectiveOrderType}
            pickupTimingLabel={pickupTimingLabel}
            orderSummarySubtitle={orderSummarySubtitle}
            fulfillmentType={fulfillmentType}
            deliveryAvailability={deliveryAvailability}
            onChangePickup={openOrderIntentSheet}
            notes={orderDetails.notes}
            onNotesChange={(notes) => setOrderDetails((current) => ({ ...current, notes }))}
            onPrint={() => window.print()}
            onCopySummary={() => void copySummary()}
            promo={promo}
            onPromoChange={onPromoChange}
            onPromoApply={onPromoApply}
            onPromoClear={onPromoClear}
            onPromoKeyDown={onPromoKeyDown}
            loyaltyPreview={loyaltyPreview}
            recentlyRedeemed={recentlyRedeemed}
            loyaltyBalance={loyaltyBalance}
            loyaltyAccountId={loyaltyAccountId}
            subtotalCents={subtotalCents}
            onLoyaltyChange={setLoyaltyIntent}
            credits={credits}
            creditsLoading={creditsLoading}
            creditsError={creditsError}
            creditsAvailableCents={creditsAvailableCents}
            selectedCredit={selectedCredit}
            onSelectCredit={setSelectedCredit}
            onRemoveCredit={() => setSelectedCredit(null)}
            onRetryCredits={() => void loadCredits()}
          />

          <CheckoutSummaryRail
            items={items}
            itemCount={itemCount}
            subtotalCents={subtotalCents}
            estimatedTaxCents={estimatedTaxCents}
            estimatedTotalCents={estimatedTotalCents}
            isGuest={isGuest}
            guestEmail={guestEmail}
            hasItems={hasItems}
            isLoading={isLoading}
            routerError={routerError}
            showChallenge={showChallenge}
            showBlocked={showBlocked}
            otpChallenge={otpChallenge}
            challengeEmail={challengeEmail}
            isAuthenticated={isAuthenticated}
            userId={user?.id ?? null}
            onCheckout={handleCheckout}
            onRetryWithToken={(token) => void retryWithToken(token)}
            onReset={reset}
          />

          <CheckoutFooter isAuthenticated={isAuthenticated} />
        </div>
      )}
    </CheckoutShell>
  );
}