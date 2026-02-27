// src/security/auth/index.ts
// =============================================================================
// Barrel export for the auth security layer.
// Import from '@/security/auth' — not individual files.
//
// Only exports the public API. Internal helpers stay in their files.
// =============================================================================

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  AuthAttemptRecord,
  RateLimitState,
  LockoutState,
  AuthSecurityEvent,
  AuthSecurityEventType,
  SupabaseAuthErrorCode,
} from './auth.types';

export {
  LOCKOUT_NONE,
  parseSupabaseAuthError,
} from './auth.types';

// ── Constants ─────────────────────────────────────────────────────────────────
export {
  AUTH_MAX_FAILURES_BEFORE_LOCK,
  AUTH_RATE_WINDOW_MS,
  AUTH_LOCKOUT_DURATIONS_MS,
  AUTH_LOCKOUT_THRESHOLDS,
  AUTH_WARN_AT_REMAINING_ATTEMPTS,
  AUTH_RATE_LIMIT_KEY,
  AUTH_FINGERPRINT_KEY,
  AUTH_ALLOWED_REDIRECT_PREFIXES,
  AUTH_SAFE_REDIRECT_DEFAULT,
  AUTH_PASSWORD_STRENGTH_DEBOUNCE_MS,
  AUTH_MIN_PASSWORD_LENGTH,
  AUTH_COPY_CONFIRM_DURATION_MS,
  AUTH_MAGIC_LINK_EXPIRY_S,
  AUTH_MAX_MAGIC_LINK_SENDS,
} from './auth.constants';

// ── Rate limiting ─────────────────────────────────────────────────────────────
export {
  trackAttempt,
  getRateLimitState,
  getLockoutRemainingMs,
  clearRateLimitState,
  clearAllRateLimitState,
  getAttemptsRemaining,
} from './auth.rateLimit';

// ── Lockout ───────────────────────────────────────────────────────────────────
export {
  getLockoutState,
  getWarningMessage,
  formatLockoutMessage,
  interpretServerAuthError,
  useLockoutState,
} from './auth.lockout';

// ── Device fingerprint ────────────────────────────────────────────────────────
export {
  getDeviceFingerprint,
  getDeviceLabel,
  getUserAgentHash,
} from './auth.deviceFingerprint';

// ── Risk engine ───────────────────────────────────────────────────────────────
export {
  evaluateRisk,
  validateSession,
  clearRiskCache,
} from './auth.riskEngine';

// ── Audit logger ──────────────────────────────────────────────────────────────
