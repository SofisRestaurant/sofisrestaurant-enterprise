import { MapPin, Tag } from 'lucide-react';

import { useCartStore } from '@/modules/cart/store/cart.store';
import {
  getOrderIntentSummary,
  useOrderIntentStore,
} from '@/modules/orders/store/orderIntent.store';

import { cartInsetCard } from '../cartStyles';

export function CartFulfillmentStrip() {
  const fulfillmentType = useOrderIntentStore((s) => s.fulfillmentType);
  const pickupTiming = useOrderIntentStore((s) => s.pickupTiming);
  const deliveryAvailability = useOrderIntentStore((s) => s.deliveryAvailability);
  const promotion = useCartStore((s) => s.promotion);

  const intentSummary = getOrderIntentSummary({
    fulfillmentType,
    pickupTiming,
    deliveryAvailability,
  });

  const promoCode = promotion?.code?.trim();

  return (
    <div className="mx-4 mb-3 shrink-0 space-y-2">
      <div className={`${cartInsetCard} flex items-center gap-3 px-3.5 py-3`}>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-400/15 text-ember-700"
          aria-hidden="true"
        >
          <MapPin className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-ink-400">
            Fulfillment
          </p>
          <p className="mt-0.5 truncate text-sm font-bold text-ink-900">{intentSummary}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-500">
            Confirmed at checkout — change timing in the menu bar anytime.
          </p>
        </div>
      </div>

      {promoCode ? (
        <div
          className={`${cartInsetCard} flex items-center gap-2.5 border-gold-200/80 bg-gold-50/60 px-3.5 py-2.5`}
        >
          <Tag className="h-4 w-4 shrink-0 text-ember-600" strokeWidth={2.25} aria-hidden="true" />
          <p className="text-xs font-semibold text-ink-800">
            Promo <span className="font-black text-ember-700">{promoCode}</span> applied to your
            bag
          </p>
        </div>
      ) : null}
    </div>
  );
}
