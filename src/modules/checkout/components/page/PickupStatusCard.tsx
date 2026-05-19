import { Link } from 'react-router-dom';
import type { OrderType } from '@/modules/checkout/types/checkout-page.types';
import { formatOrderTypeLabel } from '@/modules/checkout/utils/checkoutPageFormatters';
import { checkoutInsetCard, checkoutPillButton } from './checkoutStyles';

type PickupStatusCardProps = {
  effectiveOrderType: OrderType;
  pickupTimingLabel: string;
  fulfillmentType: string;
  deliveryAvailability: string;
  onChangePickup: () => void;
};

export function PickupStatusCard({
  effectiveOrderType,
  pickupTimingLabel,
  fulfillmentType,
  deliveryAvailability,
  onChangePickup,
}: PickupStatusCardProps) {
  return (
    <div className={checkoutInsetCard + ' p-4'}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink-400">
            Fulfillment
          </p>
          <p className="mt-1 text-lg font-black text-ink-900">
            {formatOrderTypeLabel(effectiveOrderType)}
          </p>

          {effectiveOrderType === 'pickup' && (
            <p className="mt-1 text-sm text-ink-500">
              Pickup time{' '}
              <span className="font-bold text-ink-800">{pickupTimingLabel}</span>
            </p>
          )}

          {fulfillmentType === 'delivery' && deliveryAvailability !== 'available' && (
            <p className="mt-3 rounded-xl border border-gold-200 bg-gold-50 px-3 py-2 text-xs font-semibold text-ember-700">
              Delivery is coming soon. This order will be prepared for pickup.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            type="button"
            onClick={onChangePickup}
            className="rounded-full bg-ink-900 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-ember-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-600/50 md:hidden"
            aria-label="Change pickup timing"
          >
            Change
          </button>
          <Link to="/menu" className={checkoutPillButton}>
            Add more
          </Link>
        </div>
      </div>

      <p className="mt-3 hidden text-[11px] leading-5 text-ink-400 md:block">
        To change pickup timing, use the order setup selector in the top navigation before payment.
      </p>
    </div>
  );
}

