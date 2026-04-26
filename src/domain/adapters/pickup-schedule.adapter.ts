// src/domain/adapters/pickup-schedule.adapter.ts
// =============================================================================
// ADAPTER: PickupSchedule ↔ external representations
// =============================================================================
// Layer 3 of 3 in the pickup domain stack.
//
// This file is the ONLY place in the codebase that converts a PickupSchedule
// to or from an external format (transport wire body, Postgres column, Stripe
// metadata). All serialisation and deserialisation logic lives here.
//
// Contains:
//   - toTransport()  — PickupSchedule → wire body value (IsoTimestamp | undefined)
//   - toDb()         — PickupSchedule → Postgres TIMESTAMPTZ value (IsoTimestamp | null)
//   - fromRaw()      — raw string / null → PickupSchedule (never throws)
//
// Contains NOTHING about:
//   - What ASAP or scheduled means as a business concept (domain/order layer)
//   - React, hooks, cart state, checkout UI
//
// Dependency rule:
//   ✅ Imports from: domain/value-objects/, domain/order/
//   ❌ Never import from: checkout/, orders/, Stripe SDK, React, Supabase client
//
// Why serialisation is NOT in the domain model:
//   The domain model (pickup-schedule.ts) expresses business meaning.
//   Serialisation expresses boundary contracts. Mixing them would eventually
//   create circular imports as checkout/ and orders/ both tried to import
//   the same domain file for different reasons.
// =============================================================================

import {
  ASAP_PICKUP,
  scheduledPickup,
  type PickupSchedule,
} from '../orders/pickup-schedule';

import type { IsoTimestamp } from '../value-objects/pickup-time';

// Re-export the types adapters consumers typically need so they have a single
// import path for "pickup scheduling at a boundary".
export type { PickupSchedule, IsoTimestamp };
export { ASAP_PICKUP, scheduledPickup } from '../orders/pickup-schedule';

// =============================================================================
// toTransport — PickupSchedule → request body / Stripe metadata value
// =============================================================================
//
// Returns the IsoTimestamp for scheduled orders, or undefined for ASAP.
//
// undefined is intentional: JSON.stringify drops undefined values, so when
// this is spread into a request body or metadata object, the key is completely
// absent for ASAP orders. A missing key and explicit null have different
// semantics in Stripe metadata — omission is the unambiguous contract.
//
// Usage pattern (the ONLY correct way to write pickup_time into a request):
//
//   const pt = toTransport(schedule);
//   const body = {
//     order_type: 'pickup',
//     ...(pt ? { pickup_time: pt } : {}),
//   };
//
// ❌ Never:  pickup_time: schedule.mode === 'asap' ? null : schedule.time
// ❌ Never:  pickup_time: schedule.mode === 'asap' ? 'asap' : schedule.time
// ✅ Always: ...(pt => pt ? { pickup_time: pt } : {})(toTransport(schedule))

export function toTransport(schedule: PickupSchedule): IsoTimestamp | undefined {
  return schedule.mode === 'scheduled' ? schedule.time : undefined;
}

// =============================================================================
// toDb — PickupSchedule → Postgres TIMESTAMPTZ column value
// =============================================================================
//
// Returns the IsoTimestamp for scheduled orders, or null for ASAP.
// null is the correct Postgres representation for "no scheduled time".
//
// ❌ Never write "asap" or any sentinel string to this column.
// ❌ Never write undefined — Postgres NULL must be explicit.

export function toDb(schedule: PickupSchedule): IsoTimestamp | null {
  return schedule.mode === 'scheduled' ? schedule.time : null;
}

// =============================================================================
// fromRaw — raw DB / metadata value → PickupSchedule
// =============================================================================
//
// Reconstructs a PickupSchedule from a raw string read from:
//   - Postgres orders.pickup_time column
//   - Stripe session metadata "pickup_time" key
//   - Any other external source
//
// Contract:
//   - Never throws. Malformed input becomes ASAP_PICKUP.
//   - Sentinel strings ("asap", "now", "null") → ASAP_PICKUP + optional callback.
//   - null / undefined / empty → ASAP_PICKUP (normal case for ASAP orders).
//   - Unparseable string → ASAP_PICKUP + optional callback.
//   - Valid ISO string → ScheduledPickup with validated IsoTimestamp.
//
// The optional `onInvalid` callback is for logging at the call site. The adapter
// itself does not log — it has no knowledge of the logging system.
//
// @param raw       - Raw value from DB column, Stripe metadata, or network body
// @param onInvalid - Optional; called when a non-empty value fails validation
//
// Typical call site (webhook):
//
//   const schedule = fromRaw(
//     session.metadata?.pickup_time,
//     (reason, value) => log('warn', 'webhook_pickup_time_invalid', { reason, value }),
//   );
//   const dbValue = toDb(schedule); // null for ASAP, ISO string for scheduled

export function fromRaw(
  raw: string | null | undefined,
  onInvalid?: (
    reason: 'sentinel' | 'not_a_date',
    value: string,
  ) => void,
): PickupSchedule {
  // null / undefined / empty string → ASAP (the normal case)
  if (!raw || raw.trim().length === 0) {
    return ASAP_PICKUP;
  }

  // Sentinel strings that must never reach persistence. Guard them explicitly
  // so the not_a_date branch never fires for known-bad values — allows callers
  // to distinguish "someone sent 'asap'" from "someone sent garbage".
  const lower = raw.trim().toLowerCase();
  if (lower === 'asap' || lower === 'now' || lower === 'null') {
    onInvalid?.('sentinel', raw);
    return ASAP_PICKUP;
  }

  // Attempt to parse as a date.
  try {
    return scheduledPickup(raw.trim());
  } catch {
    onInvalid?.('not_a_date', raw);
    return ASAP_PICKUP;
  }
}