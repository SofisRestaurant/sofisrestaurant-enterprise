// src/security/auth/auth.rateLimit.ts
// =============================================================================
// Client-side auth rate limiting — tracks login attempts per email address
// with progressive lockout tiers.
//
// Design:
//   • Uses sessionStorage (cleared on tab close — doesn't persist cross-session)
//   • Email is stored as an 8-char hash prefix — never the raw address
//   • State is per-email, not global — prevents one user's failures from
//     blocking another on a shared device
//   • This is a UI-layer defence. Server-side lockout (account_lockouts table)
//     is the authoritative source. This layer prevents unnecessary server calls.
//   • Distinct from src/security/rateLimit.ts (which is general API rate limiting)
// =============================================================================

import {
  AUTH_RATE_LIMIT_KEY,
  AUTH_RATE_WINDOW_MS,
  AUTH_MAX_FAILURES_BEFORE_LOCK,
  AUTH_LOCKOUT_DURATIONS_MS,
  AUTH_LOCKOUT_THRESHOLDS,
} from './auth.constants';

import type { RateLimitState } from './auth.types';

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Produce an 8-char identifier from an email — not reversible, not full hash */
function emailKey(email: string): string {
  // Simple djb2-style hash — good enough for storage key, not for security
  let hash = 5381;
  for (let i = 0; i < email.length; i++) {
    hash = ((hash << 5) + hash) ^ email.toLowerCase().charCodeAt(i);
    hash = hash >>> 0; // keep unsigned
  }
  return hash.toString(16).padStart(8, '0');
}

/** Load the full rate-limit map from sessionStorage */
function loadMap(): Record<string, RateLimitState> {
  try {
    const raw = sessionStorage.getItem(AUTH_RATE_LIMIT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, RateLimitState>) : {};
  } catch {
    return {};
  }
}

/** Persist the full rate-limit map to sessionStorage */
function saveMap(map: Record<string, RateLimitState>): void {
  try {
    sessionStorage.setItem(AUTH_RATE_LIMIT_KEY, JSON.stringify(map));
  } catch {
    // Storage full or private browsing — degrade gracefully
  }
}

/** Get or create a blank state entry for an email key */
function getOrCreate(map: Record<string, RateLimitState>, key: string): RateLimitState {
  const now = Date.now();
  const existing = map[key];

  // If existing state's window has expired, reset it (but keep lockTier for escalation)
  if (existing && now - existing.windowStart > AUTH_RATE_WINDOW_MS && !existing.lockedUntil) {
    return {
      emailHash:   key,
      attempts:    0,
      failures:    0,
      windowStart: now,
      lockedUntil: null,
      lockTier:    existing.lockTier, // tier persists within session
    };
  }

  return existing ?? {
    emailHash:   key,
    attempts:    0,
    failures:    0,
    windowStart: now,
    lockedUntil: null,
    lockTier:    0,
  };
}

/** Determine the next lock tier given current failure count */
function nextLockTier(currentTier: number, failures: number): number {
  for (let tier = AUTH_LOCKOUT_THRESHOLDS.length - 1; tier >= 1; tier--) {
    if (failures >= AUTH_LOCKOUT_THRESHOLDS[tier]) {
      return Math.max(tier, currentTier); // never downgrade tier within a session
    }
  }
  return currentTier;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record a login attempt outcome.
 * Call this after every login attempt — success or failure.
 * Returns the updated state so callers don't need a second getRateLimitState() call.
 */
export function trackAttempt(email: string, success: boolean): RateLimitState {
  const key = emailKey(email);
  const map = loadMap();
  const state = getOrCreate(map, key);
  const now = Date.now();

  state.attempts++;

  if (success) {
    // Success: clear failure count and any active lockout
    state.failures    = 0;
    state.lockedUntil = null;
    state.lockTier    = 0;
    state.windowStart = now;
  } else {
    state.failures++;

    const tier = nextLockTier(state.lockTier, state.failures);

    if (tier > state.lockTier || (tier > 0 && state.failures >= AUTH_MAX_FAILURES_BEFORE_LOCK)) {
      // Apply lockout
      const duration = AUTH_LOCKOUT_DURATIONS_MS[tier] ?? AUTH_LOCKOUT_DURATIONS_MS[4];
      state.lockTier    = tier;
      state.lockedUntil = now + duration;
    }
  }

  map[key] = state;
  saveMap(map);
  return state;
}

/**
 * Get the current rate-limit state for an email address.
 * Returns a fresh blank state if no history exists.
 * Automatically clears expired lockouts.
 */
export function getRateLimitState(email: string): RateLimitState {
  const key = emailKey(email);
  const map = loadMap();
  const state = getOrCreate(map, key);
  const now = Date.now();

  // Clear expired lockout
  if (state.lockedUntil && now >= state.lockedUntil) {
    state.lockedUntil = null;
    map[key] = state;
    saveMap(map);
  }

  return state;
}

/**
 * Check if an email is currently rate-limited without modifying state.
 * Returns ms remaining in lockout, or 0 if not locked.
 */
export function getLockoutRemainingMs(email: string): number {
  const state = getRateLimitState(email);
  if (!state.lockedUntil) return 0;
  return Math.max(state.lockedUntil - Date.now(), 0);
}

/**
 * Clear rate-limit state for an email (call on successful login or explicit reset).
 */
export function clearRateLimitState(email: string): void {
  const key = emailKey(email);
  const map = loadMap();
  delete map[key];
  saveMap(map);
}

/**
 * Clear all rate-limit state (call on logout or session end).
 */
export function clearAllRateLimitState(): void {
  try {
    sessionStorage.removeItem(AUTH_RATE_LIMIT_KEY);
  } catch { /* ignore */ }
}

/**
 * Returns how many failed attempts remain before the next lockout tier.
 * Returns null if already locked.
 */
export function getAttemptsRemaining(email: string): number | null {
  const state = getRateLimitState(email);
  if (state.lockedUntil && Date.now() < state.lockedUntil) return null;

  const nextTierThreshold = AUTH_LOCKOUT_THRESHOLDS[state.lockTier + 1]
    ?? AUTH_LOCKOUT_THRESHOLDS[AUTH_LOCKOUT_THRESHOLDS.length - 1];

  return Math.max(nextTierThreshold - state.failures, 0);
}