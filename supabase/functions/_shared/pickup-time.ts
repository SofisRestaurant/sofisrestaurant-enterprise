// supabase/functions/_shared/pickup-time.ts
// =============================================================================
// PICKUP TIME — shared validation + metadata helper
// =============================================================================
// Single source of truth for pickup_time rules across auth and guest pipelines.
//
// Contract:
//   ASAP      = pickup_time absent from wire body AND Stripe metadata
//   Scheduled = ISO 8601 UTC string, seconds precision
//
// This file is imported by:
//   - create-checkout/index.ts
//   - create-checkout-guest/index.ts
//
// The webhook (stripe-webhook/order-creation.ts) has its OWN parser with
// intentionally LOOSER tolerance. The webhook accepts paid orders even if the
// pickup time is stale — a paid order must never be dropped. That asymmetry
// is by design and must not be "unified" with this file.
// =============================================================================

// ─── Constants ────────────────────────────────────────────────────────────────

const TOLERANCE_MS  =  5 * 60 * 1000;      // 5 min past allowed (clock skew)
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000; // 24 h

// Sentinel strings that originate in the UI state machine. ASAP is represented
// by the ABSENCE of pickup_time — sending "asap" or "now" is always a frontend
// bug. Rejected here as defense-in-depth; the frontend router is the primary
// rejection point.
const SENTINELS = new Set(["asap", "now"]);

// ─── Validation ───────────────────────────────────────────────────────────────

export type PickupTimeResult =
  | { ok: true;  value: string | null }
  | { ok: false; error: string };

/**
 * Validates a raw pickup_time value from a checkout request body.
 *
 * - null / undefined / "" → ASAP (ok, value: null)
 * - "asap" / "now"        → 422 (sentinel rejection)
 * - valid ISO string      → normalised UTC string, seconds precision
 * - invalid               → 422 with descriptive error
 */
export function validatePickupTime(raw: unknown): PickupTimeResult {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }

  if (typeof raw !== "string") {
    return { ok: false, error: "pickup_time must be an ISO 8601 string or null." };
  }

  if (SENTINELS.has(raw.trim().toLowerCase())) {
    return {
      ok: false,
      error:
        'pickup_time must be an ISO 8601 timestamp. ' +
        'For ASAP orders, omit the field entirely — do not send "asap" or "now".',
    };
  }

  let parsed: Date;
  try {
    parsed = new Date(raw);
  } catch {
    return { ok: false, error: "pickup_time is not a valid date." };
  }

  if (!Number.isFinite(parsed.getTime())) {
    return { ok: false, error: "pickup_time is not a valid date." };
  }

  const diff = parsed.getTime() - Date.now();

  if (diff < -TOLERANCE_MS) {
    return { ok: false, error: "Pickup time cannot be in the past." };
  }

  if (diff > MAX_FUTURE_MS) {
    return {
      ok: false,
      error: "Pickup time cannot be more than 24 hours in the future.",
    };
  }

  // Normalise to UTC, seconds precision (strips sub-second noise).
  const normalised = new Date(Math.round(parsed.getTime() / 1000) * 1000).toISOString();
  return { ok: true, value: normalised };
}

// ─── Metadata helper ──────────────────────────────────────────────────────────

/**
 * Returns a spread-safe object for Stripe metadata.
 *
 * - Scheduled → { pickup_time: "2026-04-25T18:30:00.000Z" }
 * - ASAP      → {} (key absent — never null)
 *
 * Usage:
 *   const metadata = { ...otherFields, ...pickupTimeToMetadata(pickupTime) };
 */
export function pickupTimeToMetadata(
  value: string | null,
): Record<string, string> {
  return value ? { pickup_time: value } : {};
}