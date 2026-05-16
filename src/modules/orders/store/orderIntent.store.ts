// src/modules/orders/store/orderIntent.store.ts
// =============================================================================
// Order Intent Store — customer order setup state
// =============================================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OrderFulfillmentType = 'pickup' | 'delivery';
export type PickupTimingOption = 'asap' | '15_min' | '30_min' | '45_min' | 'scheduled';
export type DeliveryAvailability = 'coming_soon' | 'available';

export type OrderIntentState = {
  fulfillmentType: OrderFulfillmentType;
  pickupTiming: PickupTimingOption;
  scheduledPickupAt: string | null;
  deliveryAvailability: DeliveryAvailability;
  deliveryAddress: string | null;

  setFulfillmentType: (type: OrderFulfillmentType) => void;
  setPickupTiming: (timing: PickupTimingOption) => void;
  setScheduledPickupAt: (iso: string | null) => void;
  setDeliveryAddress: (address: string | null) => void;
  resetOrderIntent: () => void;
};

const DEFAULT_STATE = {
  fulfillmentType: 'pickup' as OrderFulfillmentType,
  pickupTiming: 'asap' as PickupTimingOption,
  scheduledPickupAt: null,
  deliveryAvailability: 'coming_soon' as DeliveryAvailability,
  deliveryAddress: null,
};

export const useOrderIntentStore = create<OrderIntentState>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      setFulfillmentType: (type) => {
        set((state) => {
          if (type === 'delivery' && state.deliveryAvailability !== 'available') {
            return { ...state, fulfillmentType: 'pickup' };
          }

          return { ...state, fulfillmentType: type };
        });
      },

      setPickupTiming: (timing) => {
        set((state) => ({
          ...state,
          pickupTiming: timing,
          scheduledPickupAt: timing === 'scheduled' ? state.scheduledPickupAt : null,
        }));
      },

      setScheduledPickupAt: (iso) => {
        set((state) => ({
          ...state,
          pickupTiming: iso ? 'scheduled' : state.pickupTiming,
          scheduledPickupAt: iso,
        }));
      },

      setDeliveryAddress: (address) => {
        set((state) => ({
          ...state,
          deliveryAddress: address?.trim() ? address.trim() : null,
        }));
      },

      resetOrderIntent: () => {
        set(DEFAULT_STATE);
      },
    }),
    {
      name: 'sofis-order-intent-v1',
      version: 1,
      partialize: (state) => ({
        fulfillmentType: state.fulfillmentType,
        pickupTiming: state.pickupTiming,
        scheduledPickupAt: state.scheduledPickupAt,
        deliveryAddress: state.deliveryAddress,
      }),
    },
  ),
);

export function getPickupTimingLabel(timing: PickupTimingOption): string {
  if (timing === 'asap') return 'ASAP';
  if (timing === '15_min') return '15 min';
  if (timing === '30_min') return '30 min';
  if (timing === '45_min') return '45 min';
  return 'Schedule later';
}