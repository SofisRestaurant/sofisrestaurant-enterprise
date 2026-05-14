// src/modules/checkout/pages/CheckoutPage.tsx
// =============================================================================
// CHANGES FROM PRIOR VERSION:
//
//   [SPLIT] All helpers, sub-components, and the loyalty API call have been
//           extracted into their checkout-owned files. This file is now the
//           orchestrator only: state, effects, event handlers, render tree.
//
//   [SMS]   handleCheckout now passes guestPhone and smsOptIn to checkout()
//           for guest users only. Authenticated users receive undefined for
//           both fields and the router ignores them.
//           Dependency array updated accordingly.
//
// Security invariants preserved:
//   - No Stripe URL before verification (button is unmounted during challenge)
//   - challenge_token lives only in CheckoutChallengeModal state + router memory
//   - guest_token continuity preserved via sessionStorage (unchanged)
//   - pendingInputRef in useGuestCheckout preserves cart + phone across OTP cycle
// =============================================================================
import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

// ── Checkout module ────────────────────────────────────────────────────────────
import CheckoutButton from '@/modules/checkout/components/CheckoutButton';
import { CheckoutChallengeModal } from '@/modules/checkout/components/CheckoutChallengeModal';
import { PhoneVerification } from '@/modules/checkout/components/PhoneVerification';
import {
  RewardsRedeem,
  type LoyaltyRedeemValue,
} from '@/modules/checkout/components/RewardsRedeem';
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

// ── Page types ─────────────────────────────────────────────────────────────────
import type {
  PromoState,
  OrderType,
  OrderDetailsState,
} from '@/modules/checkout/types/checkout-page.types';

// ── Page storage ───────────────────────────────────────────────────────────────
import {
  CHECKOUT_STORAGE,
  CHECKOUT_LIMITS,
  safeLocalGet,
  safeLocalSet,
  safeLocalRemove,
} from '@/modules/checkout/utils/checkoutPageStorage';

// ── Page formatters ────────────────────────────────────────────────────────────
import {
  clampInt,
  normalizePromo,
  safeMoneyCents,
  computeDisplayLineTotalCents,
  formatOrderTypeLabel,
} from '@/modules/checkout/utils/checkoutPageFormatters';

// ── Page sub-components ────────────────────────────────────────────────────────
import { fadeUp } from '@/modules/checkout/components/page/animations';
import { SectionCard } from '@/modules/checkout/components/page/SectionCard';
import { SectionHeader } from '@/modules/checkout/components/page/SectionHeader';
import { PickupTimeSelector } from '@/modules/checkout/components/page/PickupTimeSelector';
import { BlockedOrderCard } from '@/modules/checkout/components/page/BlockedOrderCard';
import { GuestContactStrip } from '@/modules/checkout/components/page/GuestContactStrip';
import { AuthContactStrip } from '@/modules/checkout/components/page/AuthContactStrip';
import { LoyaltyEarnBanner } from '@/modules/checkout/components/page/LoyaltyEarnBanner';
import { OrderItemsList } from '@/modules/checkout/components/page/OrderItemsList';
import { OrderTotals } from '@/modules/checkout/components/page/OrderTotals';
import { PromoSection } from '@/modules/checkout/components/page/PromoSection';
import { CreditsSection } from '@/modules/checkout/components/page/CreditsSection';
import { GuestPostCheckoutNudge } from '@/modules/checkout/components/page/GuestPostCheckoutNudge';

// ── Other modules ──────────────────────────────────────────────────────────────
import { useCart } from '@/modules/cart/hooks/useCart';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { formatCents } from '@/modules/cart/utils/cart.utils';

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

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

  const showChallenge = guestPhase.tag === 'otp_required' || guestPhase.tag === 'retrying';
  const showBlocked = guestPhase.tag === 'blocked';

  const hasItems = Array.isArray(items) && items.length > 0;

  const subtotalCents = useMemo(() => {
    if (!hasItems) return 0;
    return items.reduce((sum, i) => sum + computeDisplayLineTotalCents(i), 0);
  }, [items, hasItems]);

  const estimatedTaxCents = useMemo(() => Math.round(subtotalCents * 0.095), [subtotalCents]);

  const estimatedTotalCents = useMemo(
    () => subtotalCents + estimatedTaxCents,
    [subtotalCents, estimatedTaxCents],
  );

  const itemCount = useMemo(() => {
    if (!hasItems) return 0;
    return items.reduce((acc, i) => acc + clampInt(i.quantity, 0, 10_000), 0);
  }, [items, hasItems]);

  // ── Order details ──────────────────────────────────────────────────────────
  const [orderDetails, setOrderDetails] = useState<OrderDetailsState>(() => {
    const storedType = safeLocalGet(CHECKOUT_STORAGE.ORDER_TYPE);
    const storedNotes = safeLocalGet(CHECKOUT_STORAGE.NOTES);
    const t: OrderType =
      storedType === 'pickup' || storedType === 'delivery' || storedType === 'dine_in'
        ? storedType
        : 'pickup';
    return {
      orderType: t,
      notes: typeof storedNotes === 'string' ? storedNotes.slice(0, CHECKOUT_LIMITS.NOTES_MAX) : '',
    };
  });

  const [pickupTime, setPickupTime] = useState<string | null>(null);

  useEffect(() => {
    if (orderDetails.orderType !== 'pickup') setPickupTime(null);
  }, [orderDetails.orderType]);

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

  const onPromoChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const code = normalizePromo(e.target.value);
    setPromo({ code, applied: false, error: null });
    if (code) safeLocalSet(CHECKOUT_STORAGE.PROMO, code);
    else safeLocalRemove(CHECKOUT_STORAGE.PROMO);
  }, []);

  const onPromoApply = useCallback(() => {
    if (promo.code.trim()) setPromo((p) => ({ ...p, applied: true, error: null }));
  }, [promo.code]);

  const onPromoClear = useCallback(() => {
    setPromo({ code: '', applied: false, error: null });
    safeLocalRemove(CHECKOUT_STORAGE.PROMO);
  }, []);

  const onPromoKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onPromoApply();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onPromoClear();
      }
    },
    [onPromoApply, onPromoClear],
  );

  // ── Guest state ────────────────────────────────────────────────────────────
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);

  // [FIX] Frozen identity email for OTP token binding.
  //
  // Captured when the phase enters 'otp_required'. Passed to the modal instead
  // of the live guestEmail state so that editing the email field while the
  // modal is open does not cause an identity mismatch on the retry call.
  //
  // Both client (buildCheckoutIdentityKey) and server (buildIdentityKey) apply
  // toLowerCase().trim() before hashing, so the captured value must match
  // the email in pendingInputRef.current (set by initiateGuestCheckout, which
  // normalises via `args.guestEmail!.trim().toLowerCase()`).
  //
  // Cleared on phase → 'idle' so a subsequent attempt with a different email
  // starts clean.
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
  const [creditsAvailableCents] = useMemo(
    () => [credits.reduce((s, c) => s + safeMoneyCents(c.amount_cents), 0)],
    [credits],
  );

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

  // ── Auth: phone verification ───────────────────────────────────────────────
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [phoneSkipped, setPhoneSkipped] = useState(false);

  // ── Data loading (auth only) ───────────────────────────────────────────────
  const loadCredits = useCallback(async () => {
    setCreditsLoading(true);
    setCreditsError(null);
    try {
      const rows = await getAvailableCredits();
      const clean = (rows ?? []).filter((c) => typeof c?.id === 'string' && c.id.length > 0);
      setCredits(clean);
      if (selectedCredit && !clean.some((c) => c.id === selectedCredit)) {
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
    void getLoyaltyProfile().then((p) => {
      if (alive) setLoyaltyProfile(p);
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
    void getLoyaltyAccount().then((acct) => {
      if (!alive || !acct) return;
      setLoyaltyBalance(acct.balance);
      setLoyaltyAccountId(acct.accountId);
      if (acct.lastRedeemAt) {
        const hoursSince = (Date.now() - new Date(acct.lastRedeemAt).getTime()) / 36e5;
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

  // ── handleCheckout — single checkout trigger ───────────────────────────────
  //
  // [SMS] guestPhone and smsOptIn are passed for guest users only.
  //       For authenticated users both are explicitly undefined and the router
  //       ignores them — the auth path is unchanged.
  //       useCheckoutRouter validates the phone before any network call when
  //       smsOptIn is true; the resulting routerError displays below the button.
  const handleCheckout = useCallback(async () => {
    const result = await checkout({
      guestEmail: guestEmail || undefined,
      orderType: orderDetails.orderType,
      notes: orderDetails.notes || null,
      pickupTime:
        orderDetails.orderType === 'pickup' && pickupTime != null ? pickupTime : undefined,
      promoCode: promo.applied ? promo.code : undefined,
      creditId: isGuest ? undefined : (selectedCredit ?? undefined),
      loyalty: loyaltyIntent,
      guestPhone: isGuest ? guestPhone : undefined,
      smsOptIn: isGuest ? smsOptIn : undefined,
    });

    if (isCheckoutSuccess(result)) {
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
    orderDetails,
    pickupTime,
    promo.applied,
    promo.code,
    selectedCredit,
    loyaltyIntent,
    isGuest,
  ]);

  // ── Copy summary ───────────────────────────────────────────────────────────
  const copySummary = useCallback(async () => {
    if (!hasItems) return;
    const lines = [
      `Sofi's — Checkout Summary`,
      `Type: ${formatOrderTypeLabel(orderDetails.orderType)}`,
    ];
    if (pickupTime) {
      lines.push(
        `Pickup: ${new Date(pickupTime).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        })}`,
      );
    }
    for (const item of items) {
      lines.push(
        `- ${item.name} x${clampInt(item.quantity, 1, 100)} — ${formatCents(computeDisplayLineTotalCents(item))}`,
      );
    }
    lines.push(`Subtotal: ${formatCents(subtotalCents)}`);
    lines.push(`Final total confirmed by Stripe.`);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      /* */
    }
  }, [hasItems, items, subtotalCents, orderDetails, pickupTime]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

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
            <p className="text-xs font-semibold uppercase tracking-widest text-(--color-ember-500) mb-1">
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
          {/* SECTION 1: ORDER REVIEW */}
          <SectionCard index={0}>
            <SectionHeader
              title="Order Summary"
              subtitle={`${itemCount} item${itemCount !== 1 ? 's' : ''}`}
              right={
                <Link
                  to="/menu"
                  className="text-xs text-(--color-ink-400) hover:text-(--color-ink-700) underline"
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

          {/* SECTION 2: ORDER TYPE + NOTES + PICKUP TIME */}
          <SectionCard index={1}>
            <SectionHeader title="Order details" />
            <div className="space-y-5 px-5 py-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-(--color-ink-400) mb-1.5">
                  Order type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['pickup', 'delivery', 'dine_in'] as const).map((t) => {
                    const active = orderDetails.orderType === t;
                    const comingSoon = t === 'delivery' || t === 'dine_in';
                    return (
                      <div key={t} className="relative">
                        <button
                          type="button"
                          disabled={comingSoon}
                          onClick={() =>
                            !comingSoon && setOrderDetails((s) => ({ ...s, orderType: t }))
                          }
                          className={[
                            'w-full rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all',
                            comingSoon
                              ? 'cursor-not-allowed border-(--color-cream-200) bg-(--color-cream-50) text-(--color-ink-300) select-none'
                              : active
                                ? 'border-(--color-ember-500) bg-(--color-ember-600) text-white shadow-sm'
                                : 'border-(--color-cream-300) bg-white text-(--color-ink-800) hover:border-(--color-ink-300) hover:bg-(--color-cream-50)',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          aria-pressed={active}
                        >
                          {formatOrderTypeLabel(t)}
                        </button>
                        {comingSoon && (
                          <span className="pointer-events-none absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-(--color-gold-400) px-2 py-px text-[9px] font-bold uppercase text-white shadow-sm tracking-wide">
                            Soon
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <AnimatePresence>
                {orderDetails.orderType === 'pickup' && (
                  <motion.div
                    key="pickup-time"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-xl border border-(--color-cream-200) bg-(--color-cream-50) p-4">
                      <PickupTimeSelector value={pickupTime} onChange={setPickupTime} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                <label
                  htmlFor="checkout-notes"
                  className="block text-xs font-semibold uppercase tracking-wide text-(--color-ink-400) mb-1.5"
                >
                  Kitchen notes{' '}
                  <span className="text-[11px] font-normal normal-case text-(--color-ink-300)">
                    (optional)
                  </span>
                </label>
                <textarea
                  id="checkout-notes"
                  value={orderDetails.notes}
                  onChange={(e) =>
                    setOrderDetails((s) => ({
                      ...s,
                      notes: String(e.target.value).slice(0, CHECKOUT_LIMITS.NOTES_MAX),
                    }))
                  }
                  rows={2}
                  placeholder="No onions, mild salsa, sauce on the side…"
                  className="input w-full resize-none"
                />
                <div className="mt-1 flex justify-end">
                  <span className="text-[11px] text-(--color-ink-300) tabular-nums">
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

          {/* SECTION 3: CONTACT */}
          <SectionCard index={2}>
            {isGuest ? (
              <>
                <SectionHeader title="Contact" subtitle="For your receipt and order updates" />
                <GuestContactStrip
                  email={guestEmail}
                  onEmailChange={setGuestEmail}
                  phone={guestPhone}
                  onPhoneChange={setGuestPhone}
                  smsOptIn={smsOptIn}
                  onSmsToggle={() => setSmsOptIn((v) => !v)}
                />
              </>
            ) : (
              <>
                <SectionHeader title="Your info" />
                <AuthContactStrip email={user?.email ?? ''} name={user?.name ?? null} />
                {!verifiedPhone && !phoneSkipped && (
                  <div className="border-t border-(--color-cream-200) px-5 py-4">
                    <PhoneVerification
                      onVerified={(phone) => setVerifiedPhone(phone)}
                      onSkip={() => setPhoneSkipped(true)}
                    />
                  </div>
                )}
                {verifiedPhone && (
                  <div className="border-t border-(--color-cream-200) px-5 py-3">
                    <div className="flex items-center justify-between rounded-xl border border-(--color-success) bg-(--color-success-bg) px-4 py-2.5">
                      <p className="text-sm font-medium text-(--color-success)">
                        📱 SMS updates active
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setVerifiedPhone(null);
                          setPhoneSkipped(false);
                        }}
                        className="text-xs text-(--color-success) underline"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </SectionCard>

          {/* SECTION 4: PROMO */}
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

          {/* SECTION 5: REWARDS (AUTH ONLY) */}
          {!isGuest && (
            <SectionCard index={4}>
              {loyaltyPreview && <LoyaltyEarnBanner preview={loyaltyPreview} />}
              <SectionHeader
                title="Rewards & Credits"
                subtitle="Applied by the server — final balance confirmed at payment"
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
                    onChange={setLoyaltyIntent}
                  />
                )}
                <CreditsSection
                  credits={credits}
                  creditsLoading={creditsLoading}
                  creditsError={creditsError}
                  creditsAvailableCents={creditsAvailableCents}
                  selectedCredit={selectedCredit}
                  onSelectCredit={(id) => setSelectedCredit(id)}
                  onRemoveCredit={() => setSelectedCredit(null)}
                  onRetry={() => void loadCredits()}
                />
              </div>
            </SectionCard>
          )}

          {/* SECTION 6: PAYMENT CTA
           *
           * Three mutually exclusive states:
           *
           *   Normal (idle / initiating):
           *     CheckoutButton visible, OTP modal absent.
           *
           *   Challenge (otp_required / retrying):
           *     CheckoutChallengeModal visible, CheckoutButton unmounted.
           *     Modal receives `challengeEmail` — frozen at OTP trigger —
           *     not the live `guestEmail` form state.
           *     key={otpChallenge.nonce} forces remount on fresh challenge.
           *
           *   Blocked:
           *     BlockedOrderCard visible, both button and modal absent.
           */}
          <SectionCard
            index={isGuest ? 4 : 5}
            className="border-(--color-ember-200) bg-linear-to-b from-white to-(--color-cream-50)"
          >
            <div className="px-5 py-5 space-y-3">
              {/* OTP challenge */}
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
                      // Pass the frozen email captured at OTP challenge start,
                      // not the live form state — prevents identity hash divergence
                      // if the user edits the email field while the modal is open.
                      guestEmail={challengeEmail}
                      onToken={(token) => void retryWithToken(token)}
                      onExpired={() => reset()}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Blocked */}
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

              {/* Normal checkout button — unmounted during challenge and blocked */}
              {!showChallenge && !showBlocked && (
                <CheckoutButton
                  onCheckout={handleCheckout}
                  isLoading={isLoading}
                  disabled={!hasItems}
                />
              )}

              {routerError && !showChallenge && !showBlocked && (
                <p className="text-sm text-center font-medium text-(--color-error)" role="alert">
                  {routerError}
                </p>
              )}

              <p className="text-center text-[11px] text-(--color-ink-300)">
                🔒 Secure payment via Stripe — card details never stored on our servers
              </p>
            </div>
          </SectionCard>

          {/* GUEST: POST-CTA NUDGE */}
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