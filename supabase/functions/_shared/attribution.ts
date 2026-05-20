// supabase/functions/_shared/attribution.ts
// =============================================================================
// ATTRIBUTION — server-side validation, sanitization, and Stripe metadata I/O
// =============================================================================
//
// Shared by create-checkout, create-checkout-guest, and the webhook.
//
// Data flow:
//   Client → checkout request body (attribution: { utm_source, ... })
//   → sanitizeAttribution() strips bad input
//   → attributionToMetadata() writes flat keys to Stripe session metadata
//   → attributionFromMetadata() reads them back in the webhook
//   → stored in orders.metadata.attribution JSONB
//
// Security:
//   - All values are string-only, length-capped, control-char stripped.
//   - No PII. UTM params are campaign identifiers, not user data.
//   - Unknown keys are silently dropped.
//   - Invalid objects return null (never throw).
//
// Stripe metadata limits:
//   - Key: max 40 chars (our keys are ≤ 23 chars with attr_ prefix)
//   - Value: max 500 chars (we cap at 256/512)
//   - Max 50 keys per object (attribution uses ≤ 8 keys)
// =============================================================================

const MAX_UTM_LEN = 256;
const MAX_URL_LEN = 512;
const MAX_ISO_LEN = 64;

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

const TIMESTAMP_KEYS = ["first_seen_at", "last_seen_at"] as const;

// ─── Public type ──────────────────────────────────────────────────────────────

export interface AttributionData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  landing_page?: string;
  first_seen_at?: string;
  last_seen_at?: string;
}

// ─── Sanitization helpers ─────────────────────────────────────────────────────

function cleanString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  // Strip control characters (C0 + DEL), limit length
  const cleaned = trimmed.replace(/[\x00-\x1f\x7f]/g, "").slice(0, maxLen);
  return cleaned.length > 0 ? cleaned : undefined;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validates and sanitizes an attribution object from a checkout request body.
 *
 * Returns null when:
 *   - Input is not a plain object
 *   - No meaningful fields survive sanitization
 *
 * Unknown keys are silently dropped. No errors are thrown.
 */
export function sanitizeAttribution(raw: unknown): AttributionData | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const result: AttributionData = {};
  let hasMeaningfulField = false;

  // UTM params
  for (const key of UTM_KEYS) {
    const val = cleanString(record[key], MAX_UTM_LEN);
    if (val !== undefined) {
      result[key] = val;
      hasMeaningfulField = true;
    }
  }

  // Landing page
  const landingPage = cleanString(record["landing_page"], MAX_URL_LEN);
  if (landingPage !== undefined) {
    result.landing_page = landingPage;
    hasMeaningfulField = true;
  }

  // Timestamps (informational, not critical)
  for (const key of TIMESTAMP_KEYS) {
    const val = cleanString(record[key], MAX_ISO_LEN);
    if (val !== undefined) {
      result[key] = val;
    }
  }

  return hasMeaningfulField ? result : null;
}

/**
 * Converts a sanitized attribution object to flat Stripe metadata keys.
 *
 * Keys are prefixed with `attr_` to namespace them in the metadata object.
 * Values are capped at 500 chars (Stripe metadata value limit).
 *
 * Example output:
 *   { attr_utm_source: "google", attr_utm_medium: "cpc", attr_landing_page: "/menu" }
 */
export function attributionToMetadata(
  attr: AttributionData,
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const key of UTM_KEYS) {
    const val = attr[key];
    if (typeof val === "string" && val.length > 0) {
      out[`attr_${key}`] = val.slice(0, 500);
    }
  }

  if (attr.landing_page) {
    out["attr_landing_page"] = attr.landing_page.slice(0, 500);
  }

  for (const key of TIMESTAMP_KEYS) {
    const val = attr[key];
    if (typeof val === "string" && val.length > 0) {
      out[`attr_${key}`] = val.slice(0, 500);
    }
  }

  return out;
}

/**
 * Reconstructs an attribution object from Stripe session metadata.
 *
 * Reads `attr_*` prefixed keys written by attributionToMetadata().
 * Returns null when no attribution keys are present.
 *
 * Used by the webhook to extract attribution for orders.metadata.
 */
export function attributionFromMetadata(
  meta: Record<string, string> | null | undefined,
): AttributionData | null {
  if (!meta) return null;

  const result: AttributionData = {};
  let hasMeaningfulField = false;

  for (const key of UTM_KEYS) {
    const val = meta[`attr_${key}`];
    if (typeof val === "string" && val.trim().length > 0) {
      result[key] = val.trim();
      hasMeaningfulField = true;
    }
  }

  const landingPage = meta["attr_landing_page"];
  if (typeof landingPage === "string" && landingPage.trim().length > 0) {
    result.landing_page = landingPage.trim();
    hasMeaningfulField = true;
  }

  for (const key of TIMESTAMP_KEYS) {
    const val = meta[`attr_${key}`];
    if (typeof val === "string" && val.trim().length > 0) {
      result[key] = val.trim();
    }
  }

  return hasMeaningfulField ? result : null;
}