// src/features/restaurant/hours.ts
// =============================================================================
// SOFI'S RESTAURANT HOURS — single frontend source of truth
// =============================================================================

export const SOFIS_TIME_ZONE = 'America/Phoenix';

const OPEN_MINUTES = 7 * 60;
const WEEKDAY_CLOSE_MINUTES = 20 * 60;
const SUNDAY_CLOSE_MINUTES = 14 * 60;

export type KitchenStatus = {
  isOpen: boolean;
  label: string;
  shortLabel: string;
  helper: string;
  checkoutLabel: string;
  addToCartLabel: string;
  closedMessage: string;
  closesAtLabel: string | null;
  opensAtLabel: string;
};

type ArizonaParts = {
  weekday: string;
  minutesNow: number;
};

function getArizonaParts(date: Date): ArizonaParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: SOFIS_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);

  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);

  return {
    weekday,
    minutesNow: hour * 60 + minute,
  };
}

export function getKitchenStatus(date = new Date("2026-05-19T21:30:00-07:00")): KitchenStatus {
  const { weekday, minutesNow } = getArizonaParts(date);

  const isSunday = weekday === 'Sun';
  const closeMinutes = isSunday ? SUNDAY_CLOSE_MINUTES : WEEKDAY_CLOSE_MINUTES;
  const closesAtLabel = isSunday ? '2 PM' : '8 PM';
  const opensAtLabel = '7 AM';

  const isOpen = minutesNow >= OPEN_MINUTES && minutesNow < closeMinutes;

  if (isOpen) {
    return {
      isOpen: true,
      label: 'Kitchen open',
      shortLabel: 'Open',
      helper: `Closes at ${closesAtLabel}`,
      checkoutLabel: 'Checkout',
      addToCartLabel: 'Add to cart',
      closedMessage: '',
      closesAtLabel,
      opensAtLabel,
    };
  }

  const beforeOpening = minutesNow < OPEN_MINUTES;

  return {
    isOpen: false,
    label: beforeOpening ? 'Opens 7 AM' : 'Closed now',
    shortLabel: 'Closed',
    helper: 'Kitchen opens at 7 AM',
    checkoutLabel: beforeOpening ? 'Ordering opens 7 AM' : 'Kitchen closed',
    addToCartLabel: beforeOpening ? 'Ordering opens 7 AM' : 'Kitchen closed',
    closedMessage:
      'Online ordering is currently closed. You can still view your cart and browse the menu.',
    closesAtLabel: null,
    opensAtLabel,
  };
}