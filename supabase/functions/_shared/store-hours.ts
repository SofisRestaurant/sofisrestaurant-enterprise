// supabase/functions/_shared/store-hours.ts
// =============================================================================
// SOFI'S RESTAURANT STORE HOURS — backend source of truth for checkout guards
// =============================================================================
//
// Ordering hours:
//   America/Phoenix
//   Monday–Saturday: 7:00 AM–8:00 PM
//   Sunday:          7:00 AM–2:00 PM
//
// This file intentionally has no Stripe, Supabase, or secret dependencies.
// =============================================================================

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

export function getStoreHoursStatus(date = new Date("2026-05-19T21:30:00-07:00")): StoreHoursStatus {
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