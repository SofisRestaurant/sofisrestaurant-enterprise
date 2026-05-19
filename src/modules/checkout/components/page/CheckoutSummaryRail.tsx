import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { CartItem } from '@/modules/cart/types/cart.types';
import CheckoutButton from '@/modules/checkout/components/CheckoutButton';
import { CheckoutChallengeModal } from '@/modules/checkout/components/CheckoutChallengeModal';
import { fadeUp } from './animations';
import { BlockedOrderCard } from './BlockedOrderCard';
import { CheckoutAgreementText } from './CheckoutAgreementText';
import { CheckoutTrustNote } from './CheckoutTrustNote';
import { GuestPostCheckoutNudge } from './GuestPostCheckoutNudge';
import { OrderItemsList } from './OrderItemsList';
import { OrderTotals } from './OrderTotals';
import { checkoutEyebrow, checkoutPanel } from './checkoutStyles';

export type CheckoutSummaryRailProps = {
  items: CartItem[];
  itemCount: number;
  subtotalCents: number;
  estimatedTaxCents: number;
  estimatedTotalCents: number;
  isGuest: boolean;
  guestEmail: string;
  hasItems: boolean;
  isLoading: boolean;
  routerError: string | null;
  showChallenge: boolean;
  showBlocked: boolean;
  otpChallenge: { nonce: string; expiresAt: string } | null;
  challengeEmail: string | null;
  isAuthenticated: boolean;
  userId: string | null;
  onCheckout: () => Promise<void>;
  onRetryWithToken: (token: string) => void;
  onReset: () => void;
};

export function CheckoutSummaryRail({
  items,
  itemCount,
  subtotalCents,
  estimatedTaxCents,
  estimatedTotalCents,
  isGuest,
  guestEmail,
  hasItems,
  isLoading,
  routerError,
  showChallenge,
  showBlocked,
  otpChallenge,
  challengeEmail,
  isAuthenticated,
  userId,
  onCheckout,
  onRetryWithToken,
  onReset,
}: CheckoutSummaryRailProps) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-20">
      <motion.section
        custom={4}
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className={checkoutPanel}
      >
        <div className="border-b border-cream-200 bg-gold-50/50 px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={checkoutEyebrow}>Your bag</p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-ink-900">Order summary</h2>
              <p className="mt-1 text-xs text-ink-400">
                {itemCount} item{itemCount === 1 ? '' : 's'}
              </p>
            </div>
            <Link
              to="/menu"
              className="shrink-0 rounded-full border border-cream-300 bg-white px-3 py-1.5 text-xs font-black text-ink-500 shadow-sm transition hover:bg-cream-50 hover:text-ember-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-600/40"
            >
              Edit menu
            </Link>
          </div>
        </div>

        <OrderItemsList items={items} embedded />

        <OrderTotals
          embedded
          subtotalCents={subtotalCents}
          estimatedTaxCents={estimatedTaxCents}
          estimatedTotalCents={estimatedTotalCents}
        />

        <div className="border-t border-cream-200 px-5 py-5">
          <div className="mb-4">
            <p className={checkoutEyebrow}>Payment</p>
            <h3 className="mt-1 text-lg font-black tracking-tight text-ink-900">Place secure order</h3>
            <p className="mt-1 text-sm text-ink-500">Stripe confirms the final total before payment.</p>
          </div>

          <div className="space-y-4">
            <AnimatePresence>
              {showChallenge && otpChallenge ? (
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
                    userId={isAuthenticated ? userId : null}
                    guestEmail={challengeEmail}
                    onToken={(token) => onRetryWithToken(token)}
                    onExpired={onReset}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {showBlocked ? (
                <motion.div
                  key="blocked"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <BlockedOrderCard onReset={onReset} />
                </motion.div>
              ) : null}
            </AnimatePresence>

            {!showChallenge && !showBlocked ? (
              <CheckoutButton
                onCheckout={onCheckout}
                isLoading={isLoading}
                disabled={!hasItems}
              />
            ) : null}

            {routerError && !showChallenge && !showBlocked ? (
              <p
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-700"
                role="alert"
              >
                {routerError}
              </p>
            ) : null}

            <CheckoutTrustNote />
            <CheckoutAgreementText isGuest={isGuest} />
          </div>
        </div>
      </motion.section>

      {isGuest ? (
        <motion.div custom={6} variants={fadeUp} initial="hidden" animate="visible">
          <GuestPostCheckoutNudge email={guestEmail} />
        </motion.div>
      ) : null}
    </aside>
  );
}
