// src/modules/shared/domain/pickup.ts
// =============================================================================
// PICKUP SCHEDULE — domain primitive
// =============================================================================
// This file is the SINGLE SOURCE OF TRUTH for pickup scheduling concepts.
// It has NO imports from checkout, orders, or Stripe — it is a pure domain
// primitive that both checkout (intent) and orders (persistence) depend on.
//
// Ownership rules:
//   ✅ This file owns: PickupSchedule, IsoTimestamp, serialisation helpers
//   ❌ checkout.types.ts must NOT redefine pickup logic
//   ❌ order.types.ts must NOT redefine pickup logic
//   ✅ Both import FROM here — never the other way around
//
// Import path: '@/modules/shared/domain/pickup'
// =============================================================================

// =============================================================================
// BRANDED PRIMITIVE: IsoTimestamp
// =============================================================================
// A UTC ISO 8601 string at seconds precision: "2026-04-24T18:30:00Z"
// Cannot be constructed from a raw string — must go through toIsoTimestamp().

declare const __isoTimestampBrand: unique symbol;
export type IsoTimestamp = string & { readonly [__isoTimestampBrand]: 'IsoTimestamp' };

/**
 * Validates and normalises a raw string to an IsoTimestamp.
 * Strips milliseconds for stable idempotency-key hashing.
 * Throws TypeError if the value is not a parseable date.
 */
export function toIsoTimestamp(raw: string): IsoTimestamp {
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    throw new TypeError(`toIsoTimestamp: not a valid date — "${raw}"`);
  }
  // Normalise to seconds precision: "2026-04-22T18:30:00.000Z" → "2026-04-22T18:30:00Z"
  return new Date(Math.floor(ms / 1000) * 1000)
    .toISOString()
    .replace('.000Z', 'Z') as IsoTimestamp;
}

/**
 * Returns true if the raw string is a valid IsoTimestamp without throwing.
 * Use for conditional checks; use toIsoTimestamp() when you need the value.
 */
export function isIsoTimestamp(raw: string): raw is IsoTimestamp {
  try {
    toIsoTimestamp(raw);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// PICKUP SCHEDULE — discriminated union
// =============================================================================
// Replaces `pickup_time?: string | null` everywhere in the system.
//
// The old model had three ambiguous representations:
//   undefined  — "not set" at the transport layer
//   null       — "ASAP" at the DB layer
//   "asap"     — UI sentinel string that leaked into the network layer (bug)
//   ISO string — valid scheduled time
//
// The new model is structurally unambiguous:
//   { mode: 'asap' }                              — ASAP, always
//   { mode: 'scheduled'; time: IsoTimestamp }     — scheduled, always valid
//
// A value of type PickupSchedule is ALWAYS one of these two. There is no
// third state, no sentinel string, no nullable confusion.

export type AsapPickup = {
  readonly mode: 'asap';
};

export type ScheduledPickup = {
  readonly mode: 'scheduled';
  /** UTC ISO 8601 at seconds precision. Constructed via scheduledPickup(). */
  readonly time: IsoTimestamp;
};

export type PickupSchedule = AsapPickup | ScheduledPickup;

// ─── Constructors ─────────────────────────────────────────────────────────────
// These are the ONLY valid construction paths. Never construct the object
// literals directly — always use these so validation is guaranteed.

/** Canonical singleton for ASAP orders. Use this, not { mode: 'asap' }. */
export const ASAP_PICKUP: AsapPickup = Object.freeze({ mode: 'asap' as const });

/**
 * Constructs a ScheduledPickup from a raw ISO string.
 * Validates and normalises the string — throws if invalid.
 */
export function scheduledPickup(isoString: string): ScheduledPickup {
  return Object.freeze({ mode: 'scheduled' as const, time: toIsoTimestamp(isoString) });
}

// ─── Type narrowing ───────────────────────────────────────────────────────────

export function isAsapPickup(p: PickupSchedule): p is AsapPickup {
  return p.mode === 'asap';
}

export function isScheduledPickup(p: PickupSchedule): p is ScheduledPickup {
  return p.mode === 'scheduled';
}

// =============================================================================
// SERIALISATION HELPERS
// =============================================================================
// Three helpers, one for each serialisation boundary. These are the ONLY
// places in the system where PickupSchedule crosses a domain boundary.
// All call sites that touch pickup_time MUST use one of these — never
// access .time directly or compare against string literals.

/**
 * TRANSPORT LAYER (frontend → Edge Function request body)
 *
 * Returns the ISO string for scheduled orders, or undefined for ASAP.
 * undefined is correct here: JSON.stringify drops undefined values, so the
 * key is completely absent from the request body for ASAP orders.
 *
 * ❌ Never: `pickup_time: schedule.mode === 'asap' ? 'asap' : schedule.time`
 * ✅ Always: `...(t => t ? { pickup_time: t } : {})(pickupScheduleToTransport(schedule))`
 */
export function pickupScheduleToTransport(
  schedule: PickupSchedule,
): IsoTimestamp | undefined {
  return schedule.mode === 'scheduled' ? schedule.time : undefined;
}

/**
 * DB LAYER (Edge Function → Postgres TIMESTAMPTZ column)
 *
 * Returns the ISO string for scheduled orders, or null for ASAP.
 * null is the correct Postgres representation for "no scheduled time".
 *
 * ❌ Never write "asap" or any sentinel string to this column.
 */
export function pickupScheduleToDb(schedule: PickupSchedule): IsoTimestamp | null {
  return schedule.mode === 'scheduled' ? schedule.time : null;
}

/**
 * DESERIALISATION (DB / Stripe metadata → PickupSchedule)
 *
 * Reconstructs a PickupSchedule from a raw string value read from the DB or
 * Stripe session metadata. Never throws — malformed input becomes ASAP, with
 * an optional callback for logging the reason.
 *
 * Sentinel strings ("asap", "now", "null") are explicitly mapped to ASAP.
 * This is the defense-in-depth layer at the read boundary.
 *
 * @param raw       - Raw string from DB column or Stripe metadata
 * @param onInvalid - Optional callback for observability (reason, original value)
 */
export function pickupScheduleFromRaw(
  raw: string | null | undefined,
  onInvalid?: (reason: 'empty' | 'sentinel' | 'not_a_date', value: string) => void,
): PickupSchedule {
  if (!raw || raw.trim().length === 0) {
    return ASAP_PICKUP;
  }

  // Guard against UI sentinel strings. These must never reach persistence, but
  // the deserialisation boundary is the last line of defence.
  const lower = raw.trim().toLowerCase();
  if (lower === 'asap' || lower === 'now' || lower === 'null') {
    onInvalid?.('sentinel', raw);
    return ASAP_PICKUP;
  }

  const ms = Date.parse(raw.trim());
  if (!Number.isFinite(ms)) {
    onInvalid?.('not_a_date', raw);
    return ASAP_PICKUP;
  }

  return scheduledPickup(raw.trim());
}

/**
 * Formats a PickupSchedule for display in UI or logs.
 * Returns "ASAP" or a localised time string.
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