// src/security/auth/auth.constants.ts
// =============================================================================
// All client-side auth security constants — one place to tune behavior.
// =============================================================================

// ── Rate limiting ─────────────────────────────────────────────────────────────

/** Max failed login attempts before the first lockout tier kicks in */
export const AUTH_MAX_FAILURES_BEFORE_LOCK = 5;

/** Sliding window duration for attempt counting (15 minutes) */
export const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Progressive lockout durations by tier.
 * tier 1 = first lockout, tier 4 = session-permanent lockout.
 * Index 0 is unused — tiers are 1-based.
 */
export const AUTH_LOCKOUT_DURATIONS_MS: readonly number[] = [
  0,               // [0] unused
  30_000,          // [1] 30 seconds
  2 * 60_000,      // [2] 2 minutes
  10 * 60_000,     // [3] 10 minutes
  30 * 60_000,     // [4] 30 minutes (max — not "permanent" to avoid harming legit users)
] as const;

/** How many failures trigger each lockout tier */
export const AUTH_LOCKOUT_THRESHOLDS: readonly number[] = [
  0,   // [0] unused
  5,   // [1] 5 failures
  8,   // [2] 8 failures
  12,  // [3] 12 failures
  20,  // [4] 20 failures
] as const;

/** Show a "N attempts remaining" warning when this many failures remain before lock */
export const AUTH_WARN_AT_REMAINING_ATTEMPTS = 2;

// ── Storage keys (short to reduce fingerprinting surface in devtools) ─────────

/** sessionStorage key for rate limit state map */
export const AUTH_RATE_LIMIT_KEY = '__srl';

/** sessionStorage key for device fingerprint cache */
export const AUTH_FINGERPRINT_KEY = '__sfp';

// ── Redirect security ─────────────────────────────────────────────────────────

/**
 * Allowlist of internal paths that are safe post-login redirect targets.
 * Any `?redirect=` value not in this list is silently replaced with SAFE_REDIRECT_DEFAULT.
 * Paths are matched as prefixes — '/account' also allows '/account/orders'.
 */
export const AUTH_ALLOWED_REDIRECT_PREFIXES: readonly string[] = [
  '/account',
  '/menu',
  '/checkout',
  '/order-success',
  '/reservations',
  '/catering',
  '/about',
  '/reviews',
  '/gallery',
  '/contact',
] as const;

/** Fallback destination when redirect is absent or invalid */
export const AUTH_SAFE_REDIRECT_DEFAULT = '/account';

// ── UI / UX ───────────────────────────────────────────────────────────────────

/** Debounce delay before password strength is evaluated (ms) */
export const AUTH_PASSWORD_STRENGTH_DEBOUNCE_MS = 250;

/** Minimum password length required on signup */
export const AUTH_MIN_PASSWORD_LENGTH = 8;

/** How long "Copied!" confirmation shows (ms) */
export const AUTH_COPY_CONFIRM_DURATION_MS = 2000;

// ── Magic link / OTP ──────────────────────────────────────────────────────────

/** Seconds before magic link is considered expired (shown in UI countdown) */
export const AUTH_MAGIC_LINK_EXPIRY_S = 60 * 60; // 1 hour

/** Max magic link sends per session before warning */
export const AUTH_MAX_MAGIC_LINK_SENDS = 3;