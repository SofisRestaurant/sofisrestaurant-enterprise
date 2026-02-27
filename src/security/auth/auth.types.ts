// src/security/auth/auth.types.ts
// =============================================================================
// AUTH SECURITY — Shared types
// =============================================================================
// All exports are NAMED. No default export.
// This file is consumed by auth.rateLimit.ts, auth.lockout.ts, auth.constants.ts
// and re-exported via index.ts.
// =============================================================================

// ── Rate limit state ──────────────────────────────────────────────────────────

export interface RateLimitState {
  /** Hashed email key (8 hex chars) — never raw email */
  emailHash:   string
  /** Total attempts in current window (success + failure) */
  attempts:    number
  /** Failed attempts in current window */
  failures:    number
  /** Window start timestamp (ms) */
  windowStart: number
  /** Lockout expiry timestamp (ms), null if not locked */
  lockedUntil: number | null
  /** Current escalation tier (0 = not locked, 1-4 = progressive) */
  lockTier:    number
}

// ── Lockout UI state ──────────────────────────────────────────────────────────

export interface LockoutState {
  isLocked:        boolean
  remainingMs:     number
  remainingSeconds: number
  lockTier:        number
  failureCount:    number
  /** User-facing message string. Empty if no message needed. */
  message:         string
  canRetry:        boolean
}

/** Sentinel value for "no lockout" — avoids null checks at callsites */
export const LOCKOUT_NONE: LockoutState = {
  isLocked:        false,
  remainingMs:     0,
  remainingSeconds: 0,
  lockTier:        0,
  failureCount:    0,
  message:         '',
  canRetry:        true,
}

// ── Attempt record (for audit logging) ───────────────────────────────────────

export interface AuthAttemptRecord {
  email:     string
  success:   boolean
  timestamp: number
  ip?:       string
  userAgent?: string
}

// ── Security events ───────────────────────────────────────────────────────────

export type AuthSecurityEventType =
  | 'login_success'
  | 'login_failure'
  | 'lockout_triggered'
  | 'lockout_expired'
  | 'password_reset_requested'
  | 'signup_success'
  | 'signup_failure'
  | 'session_validated'
  | 'session_invalid'
  | 'risk_elevated'
  | 'device_trusted'
  | 'device_untrusted'

export interface AuthSecurityEvent {
  type:      AuthSecurityEventType
  email?:    string
  timestamp: number
  metadata?: Record<string, unknown>
}

// ── Supabase error code parsing ───────────────────────────────────────────────

/** Known Supabase auth error codes that the UI handles explicitly */
export type SupabaseAuthErrorCode =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'over_request_rate_limit'
  | 'too_many_requests'
  | 'over_email_send_rate_limit'
  | 'user_banned'
  | 'weak_password'
  | 'email_exists'
  | 'phone_exists'
  | 'provider_disabled'
  | 'session_not_found'
  | 'refresh_token_not_found'

/**
 * Attempt to extract a known SupabaseAuthErrorCode from a raw error message.
 * Returns null if the message doesn't match any known pattern.
 *
 * Supabase returns errors in several formats:
 *   • "Invalid login credentials"
 *   • "Email not confirmed"
 *   • "over_request_rate_limit"
 *   • JSON body: {"code":"over_request_rate_limit","message":"..."}
 */
export function parseSupabaseAuthError(message: string): SupabaseAuthErrorCode | null {
  if (!message) return null

  const lower = message.toLowerCase()

  // JSON-embedded code
  try {
    const parsed = JSON.parse(message) as { code?: string }
    if (parsed?.code) return parsed.code as SupabaseAuthErrorCode
  } catch { /* not JSON */ }

  if (lower.includes('invalid login') || lower.includes('invalid_credentials'))
    return 'invalid_credentials'
  if (lower.includes('email not confirmed') || lower.includes('email_not_confirmed'))
    return 'email_not_confirmed'
  if (lower.includes('over_request_rate_limit') || lower.includes('rate limit'))
    return 'over_request_rate_limit'
  if (lower.includes('too_many_requests') || lower.includes('too many'))
    return 'too_many_requests'
  if (lower.includes('over_email_send_rate_limit'))
    return 'over_email_send_rate_limit'
  if (lower.includes('user_banned') || lower.includes('banned'))
    return 'user_banned'
  if (lower.includes('weak_password') || lower.includes('password'))
    return 'weak_password'
  if (lower.includes('email_exists') || lower.includes('already registered'))
    return 'email_exists'

  return null
}