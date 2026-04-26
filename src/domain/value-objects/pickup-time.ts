// src/domain/value-objects/pickup-time.ts
// =============================================================================
// VALUE OBJECT: IsoTimestamp
// =============================================================================
// Layer 1 of 3 in the pickup domain stack.
//
// Contains ONLY:
//   - The IsoTimestamp branded type
//   - toIsoTimestamp() — validation + normalisation
//   - isIsoTimestamp() — predicate guard
//
// Contains NOTHING about:
//   - What ASAP or scheduled means (that's the domain model layer)
//   - How to serialise for transport / DB (that's the adapter layer)
//   - Checkout intent, order persistence, Stripe, React
//
// Dependency rule:
//   ✅ Zero imports from this codebase.
//   ✅ Safe to import from anywhere — value-objects are the absolute bottom.
//   ❌ Never import from domain/order/, domain/adapters/, checkout/, orders/
// =============================================================================

// =============================================================================
// BRANDED TYPE
// =============================================================================
// Using a unique symbol brand makes IsoTimestamp structurally incompatible
// with plain `string` at the type level. A raw string cannot be passed where
// an IsoTimestamp is required — the value must go through toIsoTimestamp().

declare const __isoTimestampBrand: unique symbol;

/**
 * A UTC ISO 8601 string normalised to seconds precision.
 * Example: "2026-04-24T18:30:00Z"
 *
 * Must be constructed via toIsoTimestamp() — never cast directly.
 */
export type IsoTimestamp = string & { readonly [__isoTimestampBrand]: 'IsoTimestamp' };

// =============================================================================
// VALIDATION + CONSTRUCTION
// =============================================================================

/**
 * Validates a raw string and returns a normalised IsoTimestamp.
 *
 * Normalisation rules:
 *   - Milliseconds are stripped: ".000Z" → "Z"
 *   - Sub-second precision is dropped for stable idempotency-key hashing
 *     and consistency with what the Stripe webhook parser expects
 *
 * @throws TypeError if the string is not a parseable date
 */
export function toIsoTimestamp(raw: string): IsoTimestamp {
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    throw new TypeError(`toIsoTimestamp: not a valid date — "${raw}"`);
  }
  // Floor to seconds, then strip the trailing ".000Z" that toISOString() adds.
  return new Date(Math.floor(ms / 1000) * 1000)
    .toISOString()
    .replace('.000Z', 'Z') as IsoTimestamp;
}

/**
 * Returns true if `raw` is a parseable date string, false otherwise.
 * Does not throw. Use this for conditional checks.
 * Use toIsoTimestamp() when you need the validated value.
 */
export function isIsoTimestamp(raw: string): raw is IsoTimestamp {
  const ms = Date.parse(raw);
  return Number.isFinite(ms);
}