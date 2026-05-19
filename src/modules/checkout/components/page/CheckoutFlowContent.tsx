import type { ChangeEvent, KeyboardEvent } from 'react';
import type { LoyaltyPreview, UserCredit } from '@/modules/checkout/api/checkout.api';
import { RewardsRedeem, type LoyaltyRedeemValue } from '@/modules/checkout/components/RewardsRedeem';
import type { OrderType, PromoState } from '@/modules/checkout/types/checkout-page.types';
import { AuthContactStrip } from './AuthContactStrip';
import { CheckoutFlowPanel } from './CheckoutFlowPanel';
import { CheckoutFlowSection } from './CheckoutFlowSection';
import { CheckoutKitchenNotes } from './CheckoutKitchenNotes';
import { CreditsSection } from './CreditsSection';
import { GuestContactStrip } from './GuestContactStrip';
import { LoyaltyEarnBanner } from './LoyaltyEarnBanner';
import { OptionalSignupValueCard } from './OptionalSignupValueCard';
import { PickupStatusCard } from './PickupStatusCard';
import { PromoSection } from './PromoSection';
import { checkoutPillButton } from './checkoutStyles';

export type CheckoutFlowContentProps = {
  isGuest: boolean;
  userEmail: string;
  userName: string | null;
  guestEmail: string;
  guestPhone: string;
  smsOptIn: boolean;
  onGuestEmailChange: (value: string) => void;
  onGuestPhoneChange: (value: string) => void;
  onSmsToggle: () => void;
  effectiveOrderType: OrderType;
  pickupTimingLabel: string;
  orderSummarySubtitle: string;
  fulfillmentType: string;
  deliveryAvailability: string;
  onChangePickup: () => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  onPrint: () => void;
  onCopySummary: () => void;
  promo: PromoState;
  onPromoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPromoApply: () => void;
  onPromoClear: () => void;
  onPromoKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  loyaltyPreview: LoyaltyPreview | null;
  recentlyRedeemed: boolean;
  loyaltyBalance: number;
  loyaltyAccountId: string;
  subtotalCents: number;
  onLoyaltyChange: (value: LoyaltyRedeemValue) => void;
  credits: UserCredit[];
  creditsLoading: boolean;
  creditsError: string | null;
  creditsAvailableCents: number;
  selectedCredit: string | null;
  onSelectCredit: (id: string) => void;
  onRemoveCredit: () => void;
  onRetryCredits: () => void;
};

export function CheckoutFlowContent(props: CheckoutFlowContentProps) {
  const rewardsStep = props.isGuest ? 3 : 4;

  return (
    <CheckoutFlowPanel>
      <CheckoutFlowSection
        step={1}
        eyebrow="Contact"
        title={props.isGuest ? 'How should we reach you?' : 'Your contact info'}
        subtitle={
          props.isGuest
            ? 'Receipt, order updates, and optional rewards setup.'
            : 'Receipt and order updates.'
        }
      >
        {props.isGuest ? <OptionalSignupValueCard /> : null}
        {props.isGuest ? (
          <GuestContactStrip
            embedded
            email={props.guestEmail}
            onEmailChange={props.onGuestEmailChange}
            phone={props.guestPhone}
            onPhoneChange={props.onGuestPhoneChange}
            smsOptIn={props.smsOptIn}
            onSmsToggle={props.onSmsToggle}
          />
        ) : (
          <AuthContactStrip
            embedded
            email={props.userEmail}
            name={props.userName}
            phone={props.guestPhone}
            onPhoneChange={props.onGuestPhoneChange}
            smsOptIn={props.smsOptIn}
            onSmsToggle={props.onSmsToggle}
          />
        )}
      </CheckoutFlowSection>

      <CheckoutFlowSection
        step={2}
        eyebrow="Pickup"
        title="Pickup details"
        subtitle={props.orderSummarySubtitle}
      >
        <PickupStatusCard
          effectiveOrderType={props.effectiveOrderType}
          pickupTimingLabel={props.pickupTimingLabel}
          fulfillmentType={props.fulfillmentType}
          deliveryAvailability={props.deliveryAvailability}
          onChangePickup={props.onChangePickup}
        />
        <CheckoutKitchenNotes notes={props.notes} onNotesChange={props.onNotesChange} />
        <CheckoutUtilityActions onPrint={props.onPrint} onCopySummary={props.onCopySummary} />
      </CheckoutFlowSection>

      <CheckoutFlowSection
        step={3}
        eyebrow="Savings"
        title="Promo code"
        subtitle="Verified securely by the server at checkout."
        isLast={props.isGuest}
      >
        <PromoSection
          embedded
          promo={props.promo}
          onPromoChange={props.onPromoChange}
          onPromoApply={props.onPromoApply}
          onPromoClear={props.onPromoClear}
          onPromoKeyDown={props.onPromoKeyDown}
        />
      </CheckoutFlowSection>

      {!props.isGuest ? (
        <CheckoutFlowSection
          step={rewardsStep}
          eyebrow="Rewards"
          title="Rewards & credits"
          subtitle="Applied by the server. Final balance confirmed at payment."
          isLast
        >
          <CheckoutRewardsBlock {...props} />
        </CheckoutFlowSection>
      ) : null}
    </CheckoutFlowPanel>
  );
}

function CheckoutUtilityActions({
  onPrint,
  onCopySummary,
}: {
  onPrint: () => void;
  onCopySummary: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onPrint} className={checkoutPillButton}>
        Print / Save PDF
      </button>
      <button type="button" onClick={onCopySummary} className={checkoutPillButton}>
        Copy summary
      </button>
    </div>
  );
}

function CheckoutRewardsBlock(props: CheckoutFlowContentProps) {
  return (
    <div className="space-y-4">
      {props.loyaltyPreview ? <LoyaltyEarnBanner embedded preview={props.loyaltyPreview} /> : null}
      {props.recentlyRedeemed ? (
        <p className="rounded-2xl border border-gold-200 bg-gold-50 px-4 py-3 text-xs font-semibold text-ember-700">
          You recently redeemed points. Your balance reflects that.
        </p>
      ) : null}
      {props.loyaltyBalance > 0 && props.loyaltyAccountId ? (
        <RewardsRedeem
          balance={props.loyaltyBalance}
          accountId={props.loyaltyAccountId}
          subtotalCents={props.subtotalCents}
          onChange={props.onLoyaltyChange}
        />
      ) : null}
      <CreditsSection
        embedded
        credits={props.credits}
        creditsLoading={props.creditsLoading}
        creditsError={props.creditsError}
        creditsAvailableCents={props.creditsAvailableCents}
        selectedCredit={props.selectedCredit}
        onSelectCredit={props.onSelectCredit}
        onRemoveCredit={props.onRemoveCredit}
        onRetry={props.onRetryCredits}
      />
    </div>
  );
}
