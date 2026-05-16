// src/modules/orders/store/orderIntent.store.ts
// =============================================================================
// Order Intent Store — single source of truth for the customer's order setup.
//
// Why this exists:
//   The TopBar OrderIntentSelector, the MobileOrderIntentSheet, and the
//   CheckoutPage all need to agree on:
//     - whether the customer wants pickup or delivery
//     - which pickup timing they picked (ASAP / 15 / 30 / 45 / scheduled)
//     - whether delivery is actually available (today: "coming_soon")
//     - whether the mobile bottom-sheet is open
//
//   Without a shared store the customer would have to choose pickup time twice
//   (once in the nav, once at checkout) and the two could disagree. This store
//   collapses that to one place and exposes pure helpers so checkout, the
//   summary card, and the selector all format things identically.
//
// Safety:
//   - setFulfillmentType('delivery') is a no-op (falls back to pickup) unless
//     deliveryAvailability === 'available'. The UI may also be disabled, but
//     this is a defensive double-lock at the store layer.
//   - Persistence only includes non-sensitive UX preferences. mobileSheetOpen
//     is intentionally NOT persisted (we never want a sheet to flash open on
//     load). deliveryAvailability is NOT persisted because it should be
//     decided by current backend/ops state, not stale localStorage.
//   - Persistence is SSR-safe and tolerant of localStorage being unavailable
//     (private mode, sandboxed iframe, quota errors).
// =============================================================================

import { create } from 'zustand';
import { createJSONStorage, persist, type PersistStorage } from 'zustand/middleware';

// ─────────────────────────── Public types ────────────────────────────────────

export type FulfillmentType = 'pickup' | 'delivery';

export type PickupTimingOption = 'asap' | '15_min' | '30_min' | '45_min' | 'scheduled';

export type DeliveryAvailability = 'coming_soon' | 'available';

export type OrderIntentSummaryInput = {
  fulfillmentType: FulfillmentType;
  pickupTiming: PickupTimingOption;
  deliveryAvailability: DeliveryAvailability;
};

export type OrderIntentState = {
  fulfillmentType: FulfillmentType;
  pickupTiming: PickupTimingOption;
  deliveryAvailability: DeliveryAvailability;
  mobileSheetOpen: boolean;

  setFulfillmentType: (next: FulfillmentType) => void;
  setPickupTiming: (next: PickupTimingOption) => void;
  setDeliveryAvailability: (next: DeliveryAvailability) => void;
  openMobileSheet: () => void;
  closeMobileSheet: () => void;
  toggleMobileSheet: () => void;
  resetOrderIntent: () => void;
};

// ─────────────────────────── Defaults ────────────────────────────────────────

const DEFAULT_FULFILLMENT: FulfillmentType = 'pickup';
const DEFAULT_PICKUP_TIMING: PickupTimingOption = 'asap';
const DEFAULT_DELIVERY_AVAILABILITY: DeliveryAvailability = 'coming_soon';

// ─────────────────────────── Persistence ─────────────────────────────────────

type PersistedOrderIntent = {
  fulfillmentType: FulfillmentType;
  pickupTiming: PickupTimingOption;
};

/**
 * Returns a storage object suitable for zustand persist that is SSR-safe and
 * tolerant of localStorage being unavailable (Safari private mode, sandboxed
 * iframes, quota errors). Falls back to an in-memory no-op store.
 */
function safeStorage(): Storage {
  const noop: Storage = {
    length: 0,
    clear: () => undefined,
    getItem: () => null,
    key: () => null,
    removeItem: () => undefined,
    setItem: () => undefined,
  };

  if (typeof window === 'undefined') return noop;

  try {
    const probeKey = '__sofis_oi_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return window.localStorage;
  } catch {
    return noop;
  }
}

const persistedStorage: PersistStorage<PersistedOrderIntent> | undefined = createJSONStorage(
  () => safeStorage(),
);

// ─────────────────────────── Store ───────────────────────────────────────────

export const useOrderIntentStore = create<OrderIntentState>()(
  persist(
    (set, get) => ({
      fulfillmentType: DEFAULT_FULFILLMENT,
      pickupTiming: DEFAULT_PICKUP_TIMING,
      deliveryAvailability: DEFAULT_DELIVERY_AVAILABILITY,
      mobileSheetOpen: false,

      setFulfillmentType: (next) => {
        // Defensive: if delivery is not available, never let state flip to delivery.
        if (next === 'delivery' && get().deliveryAvailability !== 'available') {
          set({ fulfillmentType: 'pickup' });
          return;
        }
        set({ fulfillmentType: next });
      },

      setPickupTiming: (next) => {
        set({ pickupTiming: next });
      },

      setDeliveryAvailability: (next) => {
        set((state) => {
          // If delivery is being switched OFF while delivery is the selected
          // fulfillment, bring the customer back to a safe pickup state.
          if (next !== 'available' && state.fulfillmentType === 'delivery') {
            return { deliveryAvailability: next, fulfillmentType: 'pickup' };
          }
          return { deliveryAvailability: next };
        });
      },

      openMobileSheet: () => set({ mobileSheetOpen: true }),
      closeMobileSheet: () => set({ mobileSheetOpen: false }),
      toggleMobileSheet: () => set((state) => ({ mobileSheetOpen: !state.mobileSheetOpen })),

      resetOrderIntent: () =>
        set({
          fulfillmentType: DEFAULT_FULFILLMENT,
          pickupTiming: DEFAULT_PICKUP_TIMING,
          deliveryAvailability: DEFAULT_DELIVERY_AVAILABILITY,
          mobileSheetOpen: false,
        }),
    }),
    {
      name: 'sofis.orderIntent.v1',
      version: 1,
      storage: persistedStorage,
      partialize: (state): PersistedOrderIntent => ({
        fulfillmentType: state.fulfillmentType,
        pickupTiming: state.pickupTiming,
      }),
    },
  ),
);

// ─────────────────────────── Pure helpers ────────────────────────────────────
// These are exported so the selector, the bottom sheet, the checkout summary,
// and the copy-to-clipboard summary all render identical text.

/** Short display label for a pickup timing option (e.g. "ASAP", "15 min"). */
export function getPickupTimingLabel(option: PickupTimingOption): string {
  switch (option) {
    case 'asap':
      return 'ASAP';
    case '15_min':
      return '15 min';
    case '30_min':
      return '30 min';
    case '45_min':
      return '45 min';
    case 'scheduled':
      return 'Schedule later';
  }
}

/** Longer helper sentence shown under each pickup option in pickers. */
export function getPickupTimingHelper(option: PickupTimingOption): string {
  switch (option) {
    case 'asap':
      return 'Fastest available pickup';
    case '15_min':
      return 'Pickup in about 15 minutes';
    case '30_min':
      return 'Pickup in about 30 minutes';
    case '45_min':
      return 'Pickup in about 45 minutes';
    case 'scheduled':
      return 'Coming soon';
  }
}

/**
 * Convert a pickup timing option into an ISO timestamp the checkout call can
 * send to the backend.
 *
 *   - 'asap'      → null  (server treats missing pickupTime as ASAP)
 *   - '15_min'    → now + 15 min, ISO
 *   - '30_min'    → now + 30 min, ISO
 *   - '45_min'    → now + 45 min, ISO
 *   - 'scheduled' → null  (real scheduling UI not implemented yet)
 *
 * Returns null for ASAP and scheduled so the caller can coerce with `?? undefined`
 * when passing into the checkout payload.
 */
export function getPickupTimingDate(
  option: PickupTimingOption,
  now: Date = new Date(),
): string | null {
  const base = now.getTime();
  switch (option) {
    case '15_min':
      return new Date(base + 15 * 60_000).toISOString();
    case '30_min':
      return new Date(base + 30 * 60_000).toISOString();
    case '45_min':
      return new Date(base + 45 * 60_000).toISOString();
    case 'asap':
    case 'scheduled':
      return null;
  }
}

/** Display label for a fulfillment type. */
export function getFulfillmentLabel(type: FulfillmentType): string {
  return type === 'delivery' ? 'Delivery' : 'Pickup';
}

/** One-line summary suitable for headers, pills, and copy-paste summaries. */
export function getOrderIntentSummary(input: OrderIntentSummaryInput): string {
  const deliveryActive =
    input.fulfillmentType === 'delivery' && input.deliveryAvailability === 'available';
  if (deliveryActive) return 'Delivery';
  return `Pickup · ${getPickupTimingLabel(input.pickupTiming)}`;
}