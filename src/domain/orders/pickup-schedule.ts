// src/domain/orders/pickup-schedule.ts
// =============================================================================
// DOMAIN MODEL: PickupSchedule
// =============================================================================
// Layer 2 of 3 in the pickup domain stack.
//
// Contains ONLY:
//   - The PickupSchedule discriminated union (AsapPickup | ScheduledPickup)
//   - Constructors: ASAP_PICKUP, scheduledPickup()
//   - Type narrowing predicates: isAsapPickup(), isScheduledPickup()
//   - Display formatting: formatPickupSchedule()
//
// Contains NOTHING about:
//   - How to convert to a transport string (that's the adapter layer)
//   - How to convert to a DB value (that's the adapter layer)
//   - Checkout request bodies, order persistence, Stripe metadata
//
// Dependency rule:
//   ✅ Imports from: 'src/domain/value-objects/pickup-time' only
//   ❌ Never import from: domain/adapters/, checkout/, orders/, Stripe, React
// =============================================================================

import { toIsoTimestamp, type IsoTimestamp } from '../value-objects/pickup-time';

// Re-export IsoTimestamp so consumers of this file don't need the value-object
// import path unless they're explicitly working with raw timestamps.
export type { IsoTimestamp };

// =============================================================================
// DISCRIMINATED UNION
// =============================================================================
// Replaces the ambiguous `pickup_time?: string | null` pattern that caused
// the pickup_time = NULL bug. The old model conflated four different states:
//   undefined  — "not set" (transport layer)
//   null       — "ASAP" (DB layer)
//   "asap"     — UI sentinel (leaked into network layer, the root bug)
//   ISO string — valid scheduled time
//
// The new model has exactly two states, both structurally unambiguous.

/** The customer wants their order as soon as possible. */
export type AsapPickup = {
  readonly mode: 'asap';
};

/** The customer has selected a specific future pickup time. */
export type ScheduledPickup = {
  readonly mode: 'scheduled';
  /**
   * UTC ISO 8601 at seconds precision.
   * Always constructed via scheduledPickup() — never set directly.
   */
  readonly time: IsoTimestamp;
};

/** A pickup scheduling intent. Always one of two states — no null, no sentinel. */
export type PickupSchedule = AsapPickup | ScheduledPickup;

// =============================================================================
// CONSTRUCTORS
// =============================================================================
// These are the ONLY valid ways to create a PickupSchedule value.
// Never construct `{ mode: 'asap' }` or `{ mode: 'scheduled', time: ... }`
// inline — always call one of these so validation is guaranteed.

/**
 * Canonical singleton for ASAP orders.
 * Frozen so it can be safely compared by reference where needed.
 */
export const ASAP_PICKUP: AsapPickup = Object.freeze({ mode: 'asap' as const });

/**
 * Constructs a ScheduledPickup from a raw ISO string.
 * Validates via toIsoTimestamp() — throws TypeError if the string is invalid.
 *
 * @param isoString - A parseable date string; will be normalised to seconds precision
 * @throws TypeError if isoString is not a valid date
 */
export function scheduledPickup(isoString: string): ScheduledPickup {
  return Object.freeze({
    mode: 'scheduled' as const,
    time: toIsoTimestamp(isoString),
  });
}

// =============================================================================
// TYPE NARROWING
// =============================================================================

/** Returns true when `p` is an ASAP order. Narrows the type to AsapPickup. */
export function isAsapPickup(p: PickupSchedule): p is AsapPickup {
  return p.mode === 'asap';
}

/** Returns true when `p` is a scheduled order. Narrows the type to ScheduledPickup. */
export function isScheduledPickup(p: PickupSchedule): p is ScheduledPickup {
  return p.mode === 'scheduled';
}

// =============================================================================
// DISPLAY FORMATTING
// =============================================================================
// Belongs in the domain model because it expresses business meaning ("ASAP"
// is a display label tied to the domain concept, not a transport detail).

/**
 * Returns a human-readable string for use in UI and logs.
 * ASAP → "ASAP"
 * Scheduled → localised time string, e.g. "6:30 PM"
 */
export function formatPickupSchedule(
  schedule: PickupSchedule,
  locale = 'en-US',
): string {
  if (schedule.mode === 'asap') return 'ASAP';
  return new Date(schedule.time).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  });
}