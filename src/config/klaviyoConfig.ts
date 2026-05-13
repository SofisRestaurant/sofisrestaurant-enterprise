// src/config/klaviyoConfig.ts
// ─── Klaviyo Configuration (2026 Professional Version) ─────────────────────────
//
// Public key  → safe to expose in the browser (identifies your account).
//
// API revision → pinned for stability; update intentionally after reviewing changelog.
// Latest stable as of 2026: 2026-01-15
// ─────────────────────────────────────────────────────────────────────────────

// ── Public (frontend-safe) ────────────────────────────────────────────────────

/** Klaviyo public site key (pk_) — safe for client code */

// Public key — safe for frontend
export const KLAVIYO_PUBLIC_KEY = import.meta.env.VITE_KLAVIYO_PUBLIC_KEY ?? '';

// Default list ID for newsletter / marketing opt-ins
export const KLAVIYO_LIST_ID = import.meta.env.VITE_KLAVIYO_LIST_ID ?? '';

// Optional app name / source tracking for events
export const KLAVIYO_APP_NAME = import.meta.env.VITE_APP_NAME ?? "Sofi's Restaurant";

// ── API Config (used in Edge Functions / server routes) ───────────────────────

/** Base URL for all Klaviyo REST API calls */
export const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api' as const;

/** Pinned REST API revision; update only intentionally after reviewing changelog */
export const KLAVIYO_API_REVISION = '2026-01-15' as const;

// ── Development Guards ────────────────────────────────────────────────────────

if (import.meta.env.DEV) {
  if (!KLAVIYO_PUBLIC_KEY) {
    console.warn(
      '[klaviyo] VITE_KLAVIYO_PUBLIC_KEY is not set. Add it to your .env.local file.'
    );
  }
  if (!KLAVIYO_LIST_ID) {
    console.warn(
      '[klaviyo] VITE_KLAVIYO_LIST_ID is not set. Add it to your .env.local file.'
    );
  }
}