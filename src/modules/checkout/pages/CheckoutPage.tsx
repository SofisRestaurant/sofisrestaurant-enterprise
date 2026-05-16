// src/modules/checkout/pages/CheckoutPage.tsx
// =============================================================================
// CheckoutPage
// =============================================================================
// Current ownership:
// - CheckoutPage orchestrates checkout state, loyalty/rewards, contact,
//   promo, order summary, and payment CTA.
// - Order intent is owned by useOrderIntentStore and controlled from TopBar /
//   MobileOrderIntentSheet.
// - Embedded Stripe is supported without deleting the hosted redirect flow.
//
// Embedded Stripe behavior:
// - Hosted mode: server returns url, then we redirect with window.location.assign.
// - Embedded mode: server returns clientSecret, then this page renders
//   <EmbeddedStripePayment /> inside the payment section.
// - OTP challenge and blocked states still take priority.
// - No Stripe URL is used before the router/server finishes verification.
//
// Security invariants preserved:
// - Stripe payment finalization remains webhook-owned.
// - CheckoutButton is unmounted during OTP challenge and blocked state.
// - challenge_token lives only in CheckoutChallengeModal state + router memory.
// - guest_token continuity remains inside useGuestCheckout.
// - Client never calculates authoritative totals.
// =============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

// ── Checkout module ───────────────────────────────────────────────────────────
import CheckoutButton from '@/modules/checkout/components/CheckoutButton';
import { CheckoutChallengeModal } from '@/modules/checkout/components/CheckoutChallengeModal';
import EmbeddedStripePayment from '@/modules/checkout/components/EmbeddedStripePayment';
import {
  RewardsRedeem,
  type LoyaltyRedeemValue,
} from '@/modules/checkout/components/RewardsRedeem';
import { useCheckoutRouter } from '@/modules/checkout/hooks/useCheckoutRouter';
import {
  calculatePointsPreview,
  getAvailableCredits,
  getLoyaltyProfile,
  type LoyaltyPreview,
  type LoyaltyProfile,
  type UserCredit,
} from '@/modules/checkout/api/checkout.api';
import { getLoyaltyAccount } from '@/modules/checkout/api/loyalty-account.api';
import {
  isCheckoutBlocked,
  isCheckoutSuccess,
  isOtpRequired,
} from '@/modules/checkout/types/checkout.types';

// ── Page types ────────────────────────────────────────────────────────────────
import type {
  OrderDetailsState,
  OrderType,
  PromoState,
} from '@/modules/checkout/types/checkout-page.types';

// ── Page storage ──────────────────────────────────────────────────────────────
import {
  CHECKOUT_LIMITS,
  CHECKOUT_STORAGE,
  safeLocalGet,
  safeLocalRemove,
  safeLocalSet,
} from '@/modules/checkout/utils/checkoutPageStorage';

// ── Page formatters ───────────────────────────────────────────────────────────
import {
  clampInt,
  computeDisplayLineTotalCents,
  formatOrderTypeLabel,
  normalizePromo,
  safeMoneyCents,
} from '@/modules/checkout/utils/checkoutPageFormatters';

// ── Page sub-components ───────────────────────────────────────────────────────
import { fadeUp } from '@/modules/checkout/components/page/animations';
import { AuthContactStrip } from '@/modules/checkout/components/page/AuthContactStrip';
import { BlockedOrderCard } from '@/modules/checkout/components/page/BlockedOrderCard';
import { CreditsSection } from '@/modules/checkout/components/page/CreditsSection';
import { GuestContactStrip } from '@/modules/checkout/components/page/GuestContactStrip';
import { GuestPostCheckoutNudge } from '@/modules/checkout/components/page/GuestPostCheckoutNudge';
import { LoyaltyEarnBanner } from '@/modules/checkout/components/page/LoyaltyEarnBanner';
import { OrderItemsList } from '@/modules/checkout/components/page/OrderItemsList';
import { OrderTotals } from '@/modules/checkout/components/page/OrderTotals';
import { PromoSection } from '@/modules/checkout/components/page/PromoSection';
import { SectionCard } from '@/modules/checkout/components/page/SectionCard';
import { SectionHeader } from '@/modules/checkout/components/page/SectionHeader';

// ── Other modules ─────────────────────────────────────────────────────────────
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useCart } from '@/modules/cart/hooks/useCart';
import { formatCents } from '@/modules/cart/utils/cart.utils';
import {
  getPickupTimingDate,
  getPickupTimingLabel,
  useOrderIntentStore,
} from '@/modules/orders/store/orderIntent.store';

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

  const [embeddedClientSecret, setEmbeddedClientSecret] = useState<string | null>(null);
  const [checkoutContractError, setCheckoutContractError] = useState<string | null>(null);

  const showChallenge = guestPhase.tag === 'otp_required' || guestPhase.tag === 'retrying';
  const showBlocked = guestPhase.tag === 'blocked';

  const hasItems = Array.isArray(items) && items.length > 0;

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
    return items.reduce((sum, item) => sum + clampInt(item.quantity, 0, 10_000), 0);
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

  // ── Order details ──────────────────────────────────────────────────────────
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
        : {
            ...current,
            orderType: effectiveOrderType,
          },
    );
  }, [effectiveOrderType]);

  useEffect(() => {
    safeLocalSet(CHECKOUT_STORAGE.ORDER_TYPE, orderDetails.orderType);
  }, [orderDetails.orderType]);

  useEffect(() => {
    if (!orderDetails.notes) safeLocalRemove(CHECKOUT_STORAGE.NOTES);
    else safeLocalSet(CHECKOUT_STORAGE.NOTES, orderDetails.notes);
  }, [orderDetails.notes]);

  // ── Promo ──────────────────────────────────────────────────────────────────
  const [promo, setPromo] = useState<PromoState>(() => {
    const stored = safeLocalGet(CHECKOUT_STORAGE.PROMO);
    return { code: stored ? normalizePromo(stored) : '', applied: false, error: null };
  });

  const clearEmbeddedCheckout = useCallback(() => {
    setEmbeddedClientSecret(null);
    setCheckoutContractError(null);
  }, []);

  const onPromoChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      clearEmbeddedCheckout();

      const code = normalizePromo(event.target.value);
      setPromo({ code, applied: false, error: null });

      if (code) safeLocalSet(CHECKOUT_STORAGE.PROMO, code);
      else safeLocalRemove(CHECKOUT_STORAGE.PROMO);
    },
    [clearEmbeddedCheckout],
  );

  const onPromoApply = useCallback(() => {
    if (!promo.code.trim()) return;

    clearEmbeddedCheckout();
    setPromo((current) => ({ ...current, applied: true, error: null }));
  }, [promo.code, clearEmbeddedCheckout]);

  const onPromoClear = useCallback(() => {
    clearEmbeddedCheckout();
    setPromo({ code: '', applied: false, error: null });
    safeLocalRemove(CHECKOUT_STORAGE.PROMO);
  }, [clearEmbeddedCheckout]);

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

  // ── Guest/contact state ────────────────────────────────────────────────────
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);

  const handleGuestEmailChange = useCallback(
    (value: string) => {
      clearEmbeddedCheckout();
      setGuestEmail(value);
    },
    [clearEmbeddedCheckout],
  );

  const handleGuestPhoneChange = useCallback(
    (value: string) => {
      clearEmbeddedCheckout();
      setGuestPhone(value);
    },
    [clearEmbeddedCheckout],
  );

  const handleSmsToggle = useCallback(() => {
    clearEmbeddedCheckout();
    setSmsOptIn((current) => !current);
  }, [clearEmbeddedCheckout]);

  // Frozen identity email for OTP token binding.
  const [challengeEmail, setChallengeEmail] = useState<string | null>(null);

  useEffect(() => {
    if (guestPhase.tag === 'otp_required' && challengeEmail === null) {
      setChallengeEmail(guestEmail.trim().toLowerCase() || null);
    }

    if (guestPhase.tag === 'idle') {
      setChallengeEmail(null);
    }
  }, [guestPhase.tag, guestEmail, challengeEmail]);

  // ── Auth: credits ──────────────────────────────────────────────────────────
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

  const handleSelectCredit = useCallback(
    (id: string) => {
      clearEmbeddedCheckout();
      setSelectedCredit(id);
    },
    [clearEmbeddedCheckout],
  );

  const handleRemoveCredit = useCallback(() => {
    clearEmbeddedCheckout();
    setSelectedCredit(null);
  }, [clearEmbeddedCheckout]);

  // ── Auth: loyalty ──────────────────────────────────────────────────────────
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

  const handleLoyaltyChange = useCallback(
    (next: LoyaltyRedeemValue) => {
      clearEmbeddedCheckout();
      setLoyaltyIntent(next);
    },
    [clearEmbeddedCheckout],
  );

  // Clear embedded session when cart or fulfillment inputs change.
  useEffect(() => {
    clearEmbeddedCheckout();
  }, [items, effectiveOrderType, pickupTiming, clearEmbeddedCheckout]);

  // ── Data loading: credits ──────────────────────────────────────────────────
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

  // ── Data loading: loyalty ──────────────────────────────────────────────────
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
    setLoyaltyIntent((current) => ({ ...current, loyaltyAccountId }));
  }, [loyaltyAccountId]);

  useEffect(() => {
    if (!selectedCredit) safeLocalRemove(CHECKOUT_STORAGE.CREDIT);
    else safeLocalSet(CHECKOUT_STORAGE.CREDIT, selectedCredit);
  }, [selectedCredit]);

  // ── Checkout trigger ───────────────────────────────────────────────────────
  const handleCheckout = useCallback(async () => {
    setCheckoutContractError(null);
    setEmbeddedClientSecret(null);

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
      if (result.clientSecret) {
        setEmbeddedClientSecret(result.clientSecret);
        return;
      }

      if (result.url) {
        window.location.assign(result.url);
        return;
      }

      setCheckoutContractError(
        'Checkout started, but the payment session was missing. Please try again.',
      );
      return;
    }

    if (!isOtpRequired(result) && !isCheckoutBlocked(result)) {
      if (result.code === 'promo_invalid' || result.code === 'promo_not_found') {
        setPromo((current) => ({
          ...current,
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

  // ── Copy summary ───────────────────────────────────────────────────────────
  const copySummary = useCallback(async () => {
    if (!hasItems) return;

    const pickupTime =
      effectiveOrderType === 'pickup'
        ? (getPickupTimingDate(pickupTiming) ?? undefined)
        : undefined;

    const lines = [
      `Sofi's — Checkout Summary`,
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
        `- ${item.name} x${clampInt(item.quantity, 1, 100)} — ${formatCents(
          computeDisplayLineTotalCents(item),
        )}`,
      );
    }

    lines.push(`Subtotal: ${formatCents(subtotalCents)}`);
    lines.push(`Final total confirmed by Stripe.`);

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      // Clipboard is optional.
    }
  }, [hasItems, items, subtotalCents, effectiveOrderType, pickupTiming, pickupTimingLabel]);

  const paymentError = checkoutContractError ?? routerError;

  return (
    <main className="relative mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-7"
      >
        {isGuest ? (
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-(--color-ink-900)">Checkout</h1>
            <p className="mt-1 text-sm text-(--color-ink-400)">Fast, secure, no account needed.</p>
          </div>
        ) : (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-(--color-ember-500)">
              Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-(--color-ink-900)">Your Order</h1>
            <p className="mt-1 text-sm text-(--color-ink-400)">
              Your details are saved. Rewards applied automatically.
            </p>
          </div>
        )}
      </motion.header>

      {!hasItems ? (
        <SectionCard index={0}>
          <div className="p-10 text-center">
            <p className="text-(--color-ink-500)">Your cart is empty.</p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/menu')}
                className="btn btn-primary px-5 py-2.5 text-sm"
              >
                Browse Menu
              </button>
              <Link to="/" className="btn btn-ghost px-5 py-2.5 text-sm">
                Home
              </Link>
            </div>
          </div>
        </SectionCard>
      ) : (
        <div className="space-y-3">
          <SectionCard index={0}>
            <SectionHeader
              title="Order Summary"
              subtitle={`${itemCount} item${itemCount !== 1 ? 's' : ''}`}
              right={
                <Link
                  to="/menu"
                  className="text-xs text-(--color-ink-400) underline hover:text-(--color-ink-700)"
                >
                  Edit
                </Link>
              }
            />

            <OrderItemsList items={items} />

            <OrderTotals
              subtotalCents={subtotalCents}
              estimatedTaxCents={estimatedTaxCents}
              estimatedTotalCents={estimatedTotalCents}
            />
          </SectionCard>

          <SectionCard index={1}>
            <SectionHeader title="Order details" subtitle={orderSummarySubtitle} />

            <div className="space-y-5 px-5 py-5">
              <div className="rounded-2xl border border-(--color-cream-200) bg-(--color-cream-50) p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-(--color-ink-400)">
                      Fulfillment
                    </p>

                    <p className="mt-1 text-sm font-bold text-(--color-ink-900)">
                      {formatOrderTypeLabel(effectiveOrderType)}
                    </p>

                    {effectiveOrderType === 'pickup' && (
                      <p className="mt-1 text-xs text-(--color-ink-500)">
                        Pickup time: <span className="font-semibold">{pickupTimingLabel}</span>
                      </p>
                    )}

                    {fulfillmentType === 'delivery' && deliveryAvailability !== 'available' && (
                      <p className="mt-2 text-xs font-medium text-(--color-gold-700)">
                        Delivery is coming soon. This order will be prepared for pickup.
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={openOrderIntentSheet}
                      className="rounded-full border border-(--color-cream-300) bg-white px-3 py-1.5 text-xs font-semibold text-(--color-ink-600) transition-colors hover:bg-(--color-cream-50) hover:text-(--color-ember-700) md:hidden"
                      aria-label="Change pickup timing"
                    >
                      Change
                    </button>

                    <Link
                      to="/menu"
                      className="rounded-full border border-(--color-cream-300) bg-white px-3 py-1.5 text-xs font-semibold text-(--color-ink-600) transition-colors hover:bg-(--color-cream-50) hover:text-(--color-ember-700)"
                    >
                      Add more
                    </Link>
                  </div>
                </div>

                <p className="mt-3 hidden text-[11px] leading-5 text-(--color-ink-400) md:block">
                  To change pickup timing, use the order setup selector in the top navigation before
                  payment.
                </p>
              </div>

              <div>
                <label
                  htmlFor="checkout-notes"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-(--color-ink-400)"
                >
                  Kitchen notes{' '}
                  <span className="text-[11px] font-normal normal-case text-(--color-ink-300)">
                    (optional)
                  </span>
                </label>

                <textarea
                  id="checkout-notes"
                  value={orderDetails.notes}
                  onChange={(event) => {
                    clearEmbeddedCheckout();
                    setOrderDetails((current) => ({
                      ...current,
                      notes: String(event.target.value).slice(0, CHECKOUT_LIMITS.NOTES_MAX),
                    }));
                  }}
                  rows={2}
                  placeholder="No onions, mild salsa, sauce on the side…"
                  className="input w-full resize-none"
                />

                <div className="mt-1 flex justify-end">
                  <span className="text-[11px] tabular-nums text-(--color-ink-300)">
                    {orderDetails.notes.length}/{CHECKOUT_LIMITS.NOTES_MAX}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-lg border border-(--color-cream-300) bg-white px-3 py-2 text-xs font-medium text-(--color-ink-600) hover:bg-(--color-cream-50)"
                >
                  Print / Save PDF
                </button>

                <button
                  type="button"
                  onClick={() => void copySummary()}
                  className="rounded-lg border border-(--color-cream-300) bg-white px-3 py-2 text-xs font-medium text-(--color-ink-600) hover:bg-(--color-cream-50)"
                >
                  Copy summary
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard index={2}>
            {isGuest ? (
              <>
                <SectionHeader title="Contact" subtitle="For your receipt and order updates" />
                <GuestContactStrip
                  email={guestEmail}
                  onEmailChange={handleGuestEmailChange}
                  phone={guestPhone}
                  onPhoneChange={handleGuestPhoneChange}
                  smsOptIn={smsOptIn}
                  onSmsToggle={handleSmsToggle}
                />
              </>
            ) : (
              <>
                <SectionHeader title="Your info" />
                <AuthContactStrip
                  email={user?.email ?? ''}
                  name={user?.name ?? null}
                  phone={guestPhone}
                  onPhoneChange={handleGuestPhoneChange}
                  smsOptIn={smsOptIn}
                  onSmsToggle={handleSmsToggle}
                />
              </>
            )}
          </SectionCard>

          <SectionCard index={3}>
            <SectionHeader title="Promo Code" subtitle="Verified by the server at checkout" />
            <PromoSection
              promo={promo}
              onPromoChange={onPromoChange}
              onPromoApply={onPromoApply}
              onPromoClear={onPromoClear}
              onPromoKeyDown={onPromoKeyDown}
            />
          </SectionCard>

          {!isGuest && (
            <SectionCard index={4}>
              {loyaltyPreview && <LoyaltyEarnBanner preview={loyaltyPreview} />}

              <SectionHeader
                title="Rewards & Credits"
                subtitle="Applied by the server. Final balance confirmed at payment."
              />

              <div className="space-y-4 px-5 py-4">
                {recentlyRedeemed && (
                  <p className="rounded-xl border border-(--color-gold-200) bg-(--color-gold-50) px-3 py-2.5 text-xs text-(--color-gold-700)">
                    ✨ You recently redeemed points. Your balance reflects that.
                  </p>
                )}

                {loyaltyBalance > 0 && loyaltyAccountId && (
                  <RewardsRedeem
                    balance={loyaltyBalance}
                    accountId={loyaltyAccountId}
                    subtotalCents={subtotalCents}
                    onChange={handleLoyaltyChange}
                  />
                )}

                <CreditsSection
                  credits={credits}
                  creditsLoading={creditsLoading}
                  creditsError={creditsError}
                  creditsAvailableCents={creditsAvailableCents}
                  selectedCredit={selectedCredit}
                  onSelectCredit={handleSelectCredit}
                  onRemoveCredit={handleRemoveCredit}
                  onRetry={() => void loadCredits()}
                />
              </div>
            </SectionCard>
          )}

          <SectionCard
            index={isGuest ? 4 : 5}
            className="border-(--color-ember-200) bg-linear-to-b from-white to-(--color-cream-50)"
          >
            <div className="space-y-3 px-5 py-5">
              <AnimatePresence>
                {showChallenge && otpChallenge && (
                  <motion.div
                    key="otp-challenge"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <CheckoutChallengeModal
                      key={otpChallenge.nonce}
                      nonce={otpChallenge.nonce}
                      expiresAt={otpChallenge.expiresAt}
                      userId={isAuthenticated && user?.id ? user.id : null}
                      guestEmail={challengeEmail}
                      onToken={(token) => void retryWithToken(token)}
                      onExpired={() => reset()}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showBlocked && (
                  <motion.div
                    key="blocked"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <BlockedOrderCard onReset={reset} />
                  </motion.div>
                )}
              </AnimatePresence>

              {!showChallenge && !showBlocked && embeddedClientSecret && (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-(--color-cream-200) bg-white p-3">
                    <p className="mb-3 text-sm font-bold text-(--color-ink-900)">
                      Select payment method
                    </p>
                    <EmbeddedStripePayment clientSecret={embeddedClientSecret} />
                  </div>

                  <button
                    type="button"
                    onClick={clearEmbeddedCheckout}
                    className="w-full rounded-xl border border-(--color-cream-300) bg-white px-4 py-2.5 text-sm font-semibold text-(--color-ink-600) transition-colors hover:bg-(--color-cream-50) hover:text-(--color-ember-700)"
                  >
                    Edit order details
                  </button>
                </div>
              )}

              {!showChallenge && !showBlocked && !embeddedClientSecret && (
                <CheckoutButton
                  onCheckout={handleCheckout}
                  isLoading={isLoading}
                  disabled={!hasItems}
                />
              )}

              {paymentError && !showChallenge && !showBlocked && (
                <p className="text-center text-sm font-medium text-(--color-error)" role="alert">
                  {paymentError}
                </p>
              )}

              <p className="text-center text-[11px] text-(--color-ink-300)">
                🔒 Secure payment via Stripe. Card details are never stored on our servers.
              </p>
            </div>
          </SectionCard>

          {isGuest && (
            <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
              <GuestPostCheckoutNudge email={guestEmail} />
            </motion.div>
          )}

          <motion.div custom={6} variants={fadeUp} initial="hidden" animate="visible">
            <div className="px-1 py-2 text-center">
              <p className="text-xs text-(--color-ink-400)">
                Need help?{' '}
                <a
                  href="mailto:sofisrestaurante@gmail.com"
                  className="underline hover:text-(--color-ink-700)"
                >
                  Email us
                </a>
                {' · '}
                <Link to="/contact" className="underline hover:text-(--color-ink-700)">
                  Contact form
                </Link>
                {isAuthenticated && (
                  <>
                    {' · '}
                    <Link to="/account/orders" className="underline hover:text-(--color-ink-700)">
                      Order history
                    </Link>
                  </>
                )}
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </main>
  );
}