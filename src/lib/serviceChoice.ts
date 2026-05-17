// =============================================================================
// src/lib/serviceChoice.ts
// =============================================================================
//
// Smart service-choice persistence for Sofi's Restaurant.
//
// Purpose:
// - Remember whether the guest prefers pickup, delivery, or browsing.
// - Avoid annoying repeat popups.
// - Keep logic separate from UI.
// - Safe for SSR/build because every browser API access is guarded.
// - Database-ready: the event names here can later be sent to Supabase analytics.
//
// Behavior:
// - If user selects pickup/delivery: hide modal for 7 days.
// - If user clicks "Just browsing": hide modal for 24 hours.
// - If storage fails: modal still works in-memory.
// =============================================================================

export type ServiceChoiceMode = 'pickup' | 'delivery' | 'browse';

export type ServiceChoiceRecord = {
  mode: ServiceChoiceMode;
  selectedAt: number;
  expiresAt: number;
};

const SERVICE_CHOICE_KEY = 'sofis.serviceChoice.v1';
const SERVICE_DISMISSED_KEY = 'sofis.serviceChoice.dismissedUntil.v1';

const DAY_MS = 24 * 60 * 60 * 1000;

const PICKED_TTL_MS = 7 * DAY_MS;
const BROWSE_TTL_MS = 1 * DAY_MS;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function now(): number {
  return Date.now();
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getServiceChoice(): ServiceChoiceRecord | null {
  if (!canUseStorage()) return null;

  const record = safeJsonParse<ServiceChoiceRecord>(window.localStorage.getItem(SERVICE_CHOICE_KEY));

  if (!record) return null;

  if (!record.mode || !record.selectedAt || !record.expiresAt) {
    clearServiceChoice();
    return null;
  }

  if (record.expiresAt <= now()) {
    clearServiceChoice();
    return null;
  }

  return record;
}

export function saveServiceChoice(mode: ServiceChoiceMode): ServiceChoiceRecord {
  const selectedAt = now();

  const record: ServiceChoiceRecord = {
    mode,
    selectedAt,
    expiresAt: selectedAt + (mode === 'browse' ? BROWSE_TTL_MS : PICKED_TTL_MS),
  };

  if (canUseStorage()) {
    try {
      window.localStorage.setItem(SERVICE_CHOICE_KEY, JSON.stringify(record));

      if (mode === 'browse') {
        window.localStorage.setItem(SERVICE_DISMISSED_KEY, String(record.expiresAt));
      } else {
        window.localStorage.removeItem(SERVICE_DISMISSED_KEY);
      }
    } catch {
      // Do nothing. UI can still continue.
    }
  }

  return record;
}

export function clearServiceChoice(): void {
  if (!canUseStorage()) return;

  try {
    window.localStorage.removeItem(SERVICE_CHOICE_KEY);
    window.localStorage.removeItem(SERVICE_DISMISSED_KEY);
  } catch {
    // No-op.
  }
}

export function shouldShowServiceChoiceModal(pathname: string): boolean {
  if (typeof window === 'undefined') return false;

  const path = pathname.toLowerCase();

  const blockedRoutes = ['/checkout', '/cart', '/bag', '/admin', '/auth', '/order-success'];

  if (blockedRoutes.some((route) => path.startsWith(route))) {
    return false;
  }

  const existingChoice = getServiceChoice();

  if (existingChoice) {
    return false;
  }

  if (canUseStorage()) {
    const dismissedUntil = Number(window.localStorage.getItem(SERVICE_DISMISSED_KEY) ?? 0);

    if (Number.isFinite(dismissedUntil) && dismissedUntil > now()) {
      return false;
    }
  }

  return true;
}

export function getSavedServiceMode(): ServiceChoiceMode | null {
  return getServiceChoice()?.mode ?? null;
}

// Future Supabase-ready event names.
// Later, these can be sent to an analytics_events table.
export const SERVICE_CHOICE_EVENTS = {
  viewed: 'service_choice_viewed',
  pickupSelected: 'service_choice_pickup_selected',
  deliverySelected: 'service_choice_delivery_selected',
  browseSelected: 'service_choice_browse_selected',
  closed: 'service_choice_closed',
} as const;

export type ServiceChoiceEventName =
  (typeof SERVICE_CHOICE_EVENTS)[keyof typeof SERVICE_CHOICE_EVENTS];