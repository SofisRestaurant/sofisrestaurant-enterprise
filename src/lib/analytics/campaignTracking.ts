// src/lib/analytics/campaignTracking.ts
// =============================================================================
// CAMPAIGN ATTRIBUTION TRACKING — paid-ad attribution for Sofi's Restaurant
// =============================================================================
//
// Captures UTM parameters and landing page on first visit, persists in
// sessionStorage for the duration of the browsing session. Updates last_seen_at
// and UTM values when a visitor arrives with new UTM params (e.g. clicks a
// second ad in the same session).
//
// Usage:
//   initCampaignTracking()      — call once in AppBoot
//   getAttribution()            — full attribution object (or null)
//   getAttributionForCheckout() — flat record safe for JSON request bodies
//   getAttributionFlat()        — prefixed flat record for analytics events
//
// Storage:
//   sessionStorage only — never localStorage. Attribution is session-scoped:
//   a new tab or window starts fresh, matching standard analytics behavior.
//
// Privacy:
//   No PII is captured. UTM params are marketing campaign identifiers only.
//   Landing page is the URL path + search (no hash, no origin).
// =============================================================================

const STORAGE_KEY = 'sofis.attribution.v1';

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

type UtmKey = (typeof UTM_KEYS)[number];

const MAX_UTM_LEN = 256;
const MAX_URL_LEN = 512;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  landing_page: string;
  first_seen_at: string;
  last_seen_at: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}

function readStorage(): Attribution | null {
  if (!isBrowser()) return null;

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

    const record = parsed as Record<string, unknown>;

    // Validate required fields
    if (typeof record.landing_page !== 'string') return null;
    if (typeof record.first_seen_at !== 'string') return null;
    if (typeof record.last_seen_at !== 'string') return null;

    return parsed as Attribution;
  } catch {
    return null;
  }
}

function writeStorage(attr: Attribution): void {
  if (!isBrowser()) return;

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attr));
  } catch {
    // sessionStorage unavailable (private browsing, quota) — silent fail
  }
}

function cleanUtmValue(value: string | null): string | undefined {
  if (!value) return undefined;

  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  // Strip control characters, limit length
  const cleaned = trimmed.replace(/[\x00-\x1f\x7f]/g, '').slice(0, MAX_UTM_LEN);
  return cleaned.length > 0 ? cleaned : undefined;
}

function buildLandingPage(): string {
  if (!isBrowser()) return '/';

  const path = window.location.pathname || '/';
  const search = window.location.search || '';
  return (path + search).slice(0, MAX_URL_LEN);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize campaign tracking. Call once during app boot.
 *
 * On first visit: captures UTM params + landing page + timestamps.
 * On subsequent visits with new UTM params: updates UTMs + last_seen_at.
 * On subsequent visits without UTM params: no-op (preserves original attribution).
 */
export function initCampaignTracking(): void {
  if (!isBrowser()) return;

  const params = new URLSearchParams(window.location.search);
  const hasUtm = UTM_KEYS.some((key) => params.has(key));
  const existing = readStorage();
  const now = new Date().toISOString();

  if (existing) {
    if (hasUtm) {
      // Visitor arrived with new UTM params — update attribution
      const updated: Attribution = { ...existing, last_seen_at: now };

      for (const key of UTM_KEYS) {
        const val = cleanUtmValue(params.get(key));
        if (val !== undefined) {
          updated[key] = val;
        }
      }

      writeStorage(updated);
    }
    // No UTM params and existing attribution — keep original
    return;
  }

  // First visit — capture everything
  const attr: Attribution = {
    landing_page: buildLandingPage(),
    first_seen_at: now,
    last_seen_at: now,
  };

  for (const key of UTM_KEYS) {
    const val = cleanUtmValue(params.get(key));
    if (val !== undefined) {
      attr[key] = val;
    }
  }

  writeStorage(attr);
}

/**
 * Returns the current session's attribution data, or null if none captured.
 */
export function getAttribution(): Attribution | null {
  return readStorage();
}

/**
 * Returns attribution as a flat record suitable for checkout request bodies.
 * Keys match the Attribution interface (utm_source, landing_page, etc.).
 * Returns null if no attribution data exists.
 */
export function getAttributionForCheckout(): Record<string, string> | null {
  const attr = getAttribution();
  if (!attr) return null;

  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(attr)) {
    if (typeof value === 'string' && value.length > 0) {
      out[key] = value;
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Returns attribution as a flat record with `attr_` prefix for analytics events.
 * Returns null if no attribution data exists.
 */
export function getAttributionFlat(): Record<string, string> | null {
  const attr = getAttribution();
  if (!attr) return null;

  const out: Record<string, string> = {};
  let hasUtm = false;

  for (const [key, value] of Object.entries(attr)) {
    if (typeof value === 'string' && value.length > 0) {
      out[`attr_${key}`] = value;
      if ((UTM_KEYS as readonly string[]).includes(key)) {
        hasUtm = true;
      }
    }
  }

  // Only return if there's at least one UTM param or a landing page
  return hasUtm || out.attr_landing_page ? out : null;
}