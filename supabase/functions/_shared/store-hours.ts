// supabase/functions/_shared/store-hours.ts
// =============================================================================
// SOFI'S RESTAURANT STORE HOURS — backend source of truth for checkout guards
// =============================================================================
//
// Ordering hours (hardcoded baseline):
//   America/Phoenix
//   Monday–Saturday: 7:00 AM–8:00 PM
//   Sunday:          7:00 AM–2:00 PM
//
// Emergency pause (DB-backed):
//   Reads public.restaurant_ordering_settings via the service-role client
//   passed in by the caller.
//
//   Priority:
//     1. If the DB read fails          → fail closed (ordering unavailable).
//     2. If online_ordering_enabled=false → paused, return pause_message.
//     3. If the settings row is missing → fall through to hardcoded hours.
//     4. If online_ordering_enabled=true  → fall through to hardcoded hours.
//
// This file has no Stripe or secret dependencies.
// The only Supabase coupling is the SvcClient type used for the db parameter.
// =============================================================================

import type { SvcClient } from './supabase.ts';

export const SOFIS_STORE_TIME_ZONE = "America/Phoenix";

const OPEN_MINUTES = 7 * 60;
const WEEKDAY_CLOSE_MINUTES = 20 * 60;
const SUNDAY_CLOSE_MINUTES = 14 * 60;

export type StoreHoursStatus = {
  isOpen: boolean;
  message: string;
};

type PhoenixDateParts = {
  weekday: string;
  minutesNow: number;
};

function getPhoenixDateParts(date: Date): PhoenixDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: SOFIS_STORE_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);

  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);

  return {
    weekday,
    minutesNow: hour * 60 + minute,
  };
}

// ─────────────────────────────────────────────────────────────
// Hardcoded hours (unchanged baseline logic)
// ─────────────────────────────────────────────────────────────

function checkHardcodedHours(date: Date): StoreHoursStatus {
  const { weekday, minutesNow } = getPhoenixDateParts(date);

  const isSunday = weekday === "Sun";
  const closeMinutes = isSunday ? SUNDAY_CLOSE_MINUTES : WEEKDAY_CLOSE_MINUTES;

  const isOpen = minutesNow >= OPEN_MINUTES && minutesNow < closeMinutes;

  if (isOpen) {
    return {
      isOpen: true,
      message: "Online ordering is open.",
    };
  }

  return {
    isOpen: false,
    message: "Online ordering is currently closed. Ordering opens at 7 AM.",
  };
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

/**
 * Check whether online ordering is currently available.
 *
 * 1. Reads the emergency pause switch from public.restaurant_ordering_settings.
 * 2. Falls back to hardcoded hours if the row is missing or enabled.
 * 3. Fails closed on any DB error.
 *
 * @param db  Service-role Supabase client (bypasses RLS).
 * @param date  Injectable for testing; defaults to now.
 */
export async function getStoreHoursStatus(
  db: SvcClient,
  date: Date = new Date(),
): Promise<StoreHoursStatus> {
  // ── Emergency pause switch (DB) ──────────────────────────────────────────
  try {
    // restaurant_ordering_settings may not yet be in the generated Database
    // types — cast to bypass the strict table-name check on .from().
    // deno-lint-ignore no-explicit-any
    const { data, error } = await (db as any)
      .from('restaurant_ordering_settings')
      .select('online_ordering_enabled, pause_message')
      .eq('id', 'default')
      .maybeSingle();

    if (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          source: 'store-hours',
          message: 'Failed to read restaurant_ordering_settings',
          error: error.message,
        }),
      );

      // Fail closed — cannot verify ordering status.
      return {
        isOpen: false,
        message:
          'Online ordering is temporarily unavailable. Please call the restaurant.',
      };
    }

    // Row exists and ordering is explicitly paused.
    if (data !== null && data.online_ordering_enabled === false) {
      const pauseMsg =
        typeof data.pause_message === 'string' && data.pause_message.trim()
          ? data.pause_message
          : 'Online ordering is currently paused.';

      return {
        isOpen: false,
        message: pauseMsg,
      };
    }

    // Row missing (data === null) or online_ordering_enabled === true
    // → fall through to hardcoded hours.
  } catch (err: unknown) {
    console.error(
      JSON.stringify({
        level: 'error',
        source: 'store-hours',
        message: 'Unexpected error reading restaurant_ordering_settings',
        error: err instanceof Error ? err.message : String(err),
      }),
    );

    // Fail closed.
    return {
      isOpen: false,
      message:
        'Online ordering is temporarily unavailable. Please call the restaurant.',
    };
  }

  // ── Hardcoded hours ──────────────────────────────────────────────────────
  return checkHardcodedHours(date);
}