// =============================================================================
// src/pages/Admin/admin-layout.utils.ts
// =============================================================================
// Pure utilities for the AdminLayout shell.
// No React, no hooks, no component state.
//
// Goals:
//   1. Provide strongly typed polling/cache constants
//   2. Keep cache semantics deterministic and StrictMode-safe
//   3. Validate unknown gateway payloads at runtime
//   4. Expose safe formatting helpers for layout-only rendering
//   5. Centralize retry/auth error detection for hooks
//   6. Support both "fresh cache only" and "inspect raw cache meta" workflows
//
// Notes:
//   - This file is intentionally side-effect light.
//   - Cache is module-scoped on purpose so it survives re-renders/remounts.
//   - Hooks should prefer readCache() for normal usage and readCacheEntry()
//     only when they explicitly need timestamp metadata.
// =============================================================================

import type { AdminLayoutSnapshot, MetricsCache } from './admin-layout.types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Polling interval in milliseconds. */
export const POLL_MS = 30_000;

/**
 * Fresh-cache TTL in milliseconds.
 * Must remain shorter than POLL_MS so the next scheduled poll can still fetch.
 */
export const CACHE_TTL_MS = 25_000;

/** Countdown seconds displayed in the refresh control. */
export const COUNTDOWN_S = Math.floor(POLL_MS / 1_000);

/** Maximum retry attempts for transient network/server failures. */
export const RETRY_MAX = 3;

/** Base delay for exponential backoff: 1000 → 2000 → 4000 ms. */
export const RETRY_BASE_MS = 1_000;

/** Hard ceiling for retry delay. */
export const RETRY_MAX_DELAY_MS = 8_000;

// ─────────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────────
//
// Intentionally module-scoped, not React state.
// This gives the admin shell:
//   - no re-render churn from cache writes
//   - resilience against StrictMode double-mount
//   - fresh reset on hard reload, which is desirable for admin data

export let _cache: MetricsCache | null = null;

/** Returns current epoch milliseconds. Extracted for testability. */
export function nowMs(): number {
  return Date.now();
}

/** Compute cache age in milliseconds. Returns Infinity when cache is empty. */
export function getCacheAgeMs(entry: MetricsCache | null = _cache): number {
  if (!entry) return Number.POSITIVE_INFINITY;
  return Math.max(0, nowMs() - entry.ts);
}

/** Returns true when the cache entry exists and is still inside TTL. */
export function isCacheFresh(entry: MetricsCache | null = _cache): boolean {
  return getCacheAgeMs(entry) < CACHE_TTL_MS;
}

/** Bust the module-level cache. Call before forced refresh or sign-out. */
export function bustCache(): void {
  _cache = null;
}

/** Replace cache with a fresh snapshot. */
export function writeCache(snapshot: AdminLayoutSnapshot): MetricsCache {
  const entry: MetricsCache = {
    snapshot,
    ts: nowMs(),
  };
  _cache = entry;
  return entry;
}

/**
 * Returns the raw cache entry, even if stale.
 * Useful when a hook needs timestamp metadata or wants custom freshness logic.
 */
export function readCacheEntry(): MetricsCache | null {
  return _cache;
}

/**
 * Read only fresh snapshot data from cache.
 * Returns null if cache is empty or stale.
 */
export function readCache(): AdminLayoutSnapshot | null {
  if (!isCacheFresh(_cache)) return null;
  return _cache?.snapshot ?? null;
}

/**
 * Read the freshest available snapshot, even if stale.
 * Use sparingly for graceful fallback UIs.
 */
export function readStaleCache(): AdminLayoutSnapshot | null {
  return _cache?.snapshot ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime validation
// ─────────────────────────────────────────────────────────────────────────────
//
// Never trust gateway response shapes blindly.
// These helpers coerce safely and fail closed on structural mismatch.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asInt(value: unknown, fallback = 0): number {
  return Math.trunc(asFiniteNumber(value, fallback));
}

function asNonNegativeInt(value: unknown, fallback = 0): number {
  return Math.max(0, asInt(value, fallback));
}

function asISOString(value: unknown, fallback = new Date().toISOString()): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

/**
 * Parse and validate an unknown gateway payload into AdminLayoutSnapshot.
 * Throws only when top-level payload shape is fundamentally invalid.
 */
export function parseSnapshot(raw: unknown): AdminLayoutSnapshot {
  if (!isRecord(raw)) {
    throw new Error('admin_layout_snapshot: unexpected response shape');
  }

  return {
    today_revenue_cents: asNonNegativeInt(raw['today_revenue_cents']),
    today_orders: asNonNegativeInt(raw['today_orders']),
    pending_orders: asNonNegativeInt(raw['pending_orders']),
    unread_notifications: asNonNegativeInt(raw['unread_notifications']),
    fraud_events_7d: asNonNegativeInt(raw['fraud_events_7d']),
    abandoned_carts: asNonNegativeInt(raw['abandoned_carts']),
    pending_carts: asNonNegativeInt(raw['pending_carts']),
    total_gross_profit_cents: asNonNegativeInt(raw['total_gross_profit_cents']),
    generated_at: asISOString(raw['generated_at']),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────
//
// Display-only helpers. Never use output for calculations.

export const fmt$ = (cents: number): string =>
  (asFiniteNumber(cents, 0) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

export const fmtCount = (value: number): string =>
  Number.isFinite(value) ? String(Math.trunc(value)) : '—';

export function fmtTime(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Error / retry helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Safe unknown → normalized lowercase message extraction. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (isRecord(error)) {
    const message = error['message'];
    const code = error['code'];
    const errorField = error['error'];

    if (typeof message === 'string' && message.trim()) return message;
    if (typeof code === 'string' && code.trim()) return code;
    if (typeof errorField === 'string' && errorField.trim()) return errorField;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function isAuthError(error: unknown): boolean {
  const msg = getErrorMessage(error).toLowerCase();

  return (
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('invalid jwt') ||
    msg.includes('jwt expired') ||
    msg.includes('not authenticated') ||
    msg.includes('auth session missing') ||
    msg.includes('401') ||
    msg.includes('403')
  );
}

export function isRetryableError(error: unknown): boolean {
  if (isAuthError(error)) return false;

  const msg = getErrorMessage(error).toLowerCase();

  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('temporar') ||
    msg.includes('failed to fetch') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('500') ||
    msg.includes('rate limit') ||
    msg.includes('429')
  );
}

export function getRetryDelayMs(attemptIndex: number): number {
  const safeAttempt = Math.max(0, Math.trunc(attemptIndex));
  const delay = RETRY_BASE_MS * Math.pow(2, safeAttempt);
  return Math.min(delay, RETRY_MAX_DELAY_MS);
}

export async function sleep(ms: number): Promise<void> {
  const safeMs = Math.max(0, Math.trunc(ms));
  await new Promise<void>((resolve) => {
    setTimeout(resolve, safeMs);
  });
}

/**
 * Retry an async operation with exponential backoff.
 *
 * Behaviour:
 *   - Auth errors rethrow immediately.
 *   - Non-retryable errors rethrow immediately.
 *   - Retryable failures back off exponentially until maxAttempts is exhausted.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = RETRY_MAX,
): Promise<T> {
  const safeAttempts = Math.max(1, Math.trunc(maxAttempts));
  let lastError: unknown = new Error('Unknown retry failure');

  for (let attempt = 0; attempt < safeAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (isAuthError(error)) {
        throw error;
      }

      if (!isRetryableError(error)) {
        throw error;
      }

      const isLastAttempt = attempt >= safeAttempts - 1;
      if (!isLastAttempt) {
        await sleep(getRetryDelayMs(attempt));
      }
    }
  }

  throw lastError;
}