// src/security/auth/auth.lockout.ts
// =============================================================================
// Lockout state computation + UI messaging.
// Consumes auth.rateLimit state and produces UI-ready LockoutState objects.
//
// Fix: useLockoutState no longer calls setState directly inside useEffect.
//      refresh() is deferred via setTimeout(refresh, 0) to avoid React warning
//      "Cannot update a component while rendering a different component."
// =============================================================================

import { getRateLimitState, getLockoutRemainingMs } from './auth.rateLimit'
import {
  AUTH_WARN_AT_REMAINING_ATTEMPTS,
  AUTH_LOCKOUT_THRESHOLDS,
}                                                    from './auth.constants'
import { parseSupabaseAuthError }                    from './auth.types'
import type { LockoutState }                         from './auth.types'
import { LOCKOUT_NONE }                              from './auth.types'
import { useState, useEffect, useCallback }          from 'react'

// ── Core computation ──────────────────────────────────────────────────────────

export function getLockoutState(email: string): LockoutState {
  if (!email) return LOCKOUT_NONE

  const state       = getRateLimitState(email)
  const remainingMs = getLockoutRemainingMs(email)
  const isLocked    = remainingMs > 0

  if (isLocked) {
    return {
      isLocked:         true,
      remainingMs,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      lockTier:         state.lockTier,
      failureCount:     state.failures,
      message:          formatLockoutMessage(state.lockTier, Math.ceil(remainingMs / 1000)),
      canRetry:         false,
    }
  }

  return {
    isLocked:         false,
    remainingMs:      0,
    remainingSeconds: 0,
    lockTier:         state.lockTier,
    failureCount:     state.failures,
    message:          getWarningMessage(email),
    canRetry:         true,
  }
}

export function getWarningMessage(email: string): string {
  if (!email) return ''

  const state = getRateLimitState(email)
  if (state.lockedUntil) return ''

  const nextThreshold = AUTH_LOCKOUT_THRESHOLDS[state.lockTier + 1]
  if (!nextThreshold) return ''

  const remaining = nextThreshold - state.failures

  if (remaining <= AUTH_WARN_AT_REMAINING_ATTEMPTS && remaining > 0) {
    return remaining === 1
      ? 'One more incorrect attempt will temporarily lock this account.'
      : `${remaining} more incorrect attempts will temporarily lock this account.`
  }

  return ''
}

// ── Message formatting ────────────────────────────────────────────────────────

export function formatLockoutMessage(tier: number, remainingSeconds: number): string {
  const duration = formatDuration(remainingSeconds)

  switch (tier) {
    case 1:  return `Too many attempts. Please wait ${duration} before trying again.`
    case 2:  return `Account temporarily locked. Try again in ${duration}.`
    case 3:  return `Account locked due to repeated failures. Please wait ${duration}.`
    case 4:
    default: return `Account locked for ${duration} due to too many failed attempts. If this is your account, use "Forgot Password" to regain access.`
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`
  const hours = Math.ceil(minutes / 60)
  return `${hours} hour${hours !== 1 ? 's' : ''}`
}

// ── Server-side lockout detection ─────────────────────────────────────────────

export function interpretServerAuthError(errorMessage: string): {
  message:   string
  isLockout: boolean
  isInvalid: boolean
  isBanned:  boolean
} | null {
  const code = parseSupabaseAuthError(errorMessage)
  if (!code) return null

  switch (code) {
    case 'over_request_rate_limit':
    case 'too_many_requests':
      return { message: 'Too many login attempts. Please wait a few minutes before trying again.', isLockout: true,  isInvalid: false, isBanned: false }
    case 'over_email_send_rate_limit':
      return { message: 'Too many emails sent. Please check your inbox or wait a few minutes.',   isLockout: true,  isInvalid: false, isBanned: false }
    case 'invalid_credentials':
      return { message: 'Incorrect email or password.',                                            isLockout: false, isInvalid: true,  isBanned: false }
    case 'email_not_confirmed':
      return { message: 'Please verify your email address before signing in. Check your inbox.',  isLockout: false, isInvalid: false, isBanned: false }
    case 'user_banned':
      return { message: 'This account has been suspended. Please contact support.',               isLockout: false, isInvalid: false, isBanned: true  }
    case 'weak_password':
      return { message: 'Password does not meet requirements. Please choose a stronger password.', isLockout: false, isInvalid: true,  isBanned: false }
    default:
      return null
  }
}

// ── React hook ────────────────────────────────────────────────────────────────

/**
 * Subscribe to lockout state for an email.
 * Auto-ticks every second while locked.
 *
 * Fix: setState is deferred via setTimeout(refresh, 0) so React never
 *      complains about state updates during render of another component.
 */
export function useLockoutState(email: string): LockoutState {
  const [state, setState] = useState<LockoutState>(() =>
    email ? getLockoutState(email) : LOCKOUT_NONE,
  )

  const refresh = useCallback(() => {
    setState(email ? getLockoutState(email) : LOCKOUT_NONE)
  }, [email])

  useEffect(() => {
    // Defer the initial setState to avoid calling setState during render
    const init = setTimeout(refresh, 0)
    return () => clearTimeout(init)
  }, [refresh])

  useEffect(() => {
    if (!state.isLocked) return
    // Tick every second while locked so countdown stays live
    const interval = setInterval(refresh, 1000)
    return () => clearInterval(interval)
  }, [state.isLocked, refresh])

  return state
}