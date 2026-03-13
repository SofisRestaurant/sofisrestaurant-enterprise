import type { EnrichedPromo, PromoLifecycle, BadgeTone } from './promoManager.types';
import { safeDate } from './promoManager.guards';

function toUsd(value: number, fractionDigits: number): string {
  return Math.max(0, value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function formatMoney(cents: number): string {
  return toUsd(Math.max(0, cents) / 100, 2);
}

export function formatCompactMoney(cents: number): string {
  return toUsd(Math.max(0, cents) / 100, 0);
}

export function formatDate(value: Date | string | null | undefined): string {
  const d = value instanceof Date ? value : safeDate(value);
  if (!d) return '—';

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(value: Date | string | null | undefined): string {
  const d = value instanceof Date ? value : safeDate(value);
  if (!d) return '—';

  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatUsagePercent(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return 'Unlimited';
  }

  if (value === 0) {
    return '0%';
  }

  if (value > 0 && value < 1) {
    return `${value.toFixed(1)}%`;
  }

  if (value >= 100) {
    return '100%';
  }

  return `${Math.round(value)}%`;
}

export function discountLabel(promo: EnrichedPromo): string {
  const type = promo.discountTypeSafe;
  const value = promo.discountValueSafe;

  if (value === null) return '—';

  if (type === 'percent') {
    return `${value}%`;
  }

  if (type === 'fixed' || type === 'amount') {
    return formatMoney(value > 100 ? value : value * 100);
  }

  if (type === 'bogo' || type === 'free_item') {
    return type.replace('_', ' ').toUpperCase();
  }

  return String(value);
}

export function lifecycleTone(lifecycle: PromoLifecycle): BadgeTone {
  switch (lifecycle) {
    case 'live':
      return 'success';
    case 'scheduled':
      return 'info';
    case 'expired':
      return 'neutral';
    case 'inactive':
      return 'neutral';
    case 'draft':
      return 'warning';
  }
}

export function lifecycleLabel(lifecycle: PromoLifecycle): string {
  switch (lifecycle) {
    case 'live':
      return 'Live';
    case 'scheduled':
      return 'Scheduled';
    case 'expired':
      return 'Expired';
    case 'inactive':
      return 'Inactive';
    case 'draft':
      return 'Draft';
  }
}

export function discountTypeTone(type: string | null): BadgeTone {
  switch (type) {
    case 'percent':
      return 'info';
    case 'fixed':
    case 'amount':
      return 'success';
    case 'bogo':
    case 'free_item':
      return 'warning';
    default:
      return 'neutral';
  }
}