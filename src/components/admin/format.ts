import { toFiniteNumber } from '@/lib/number';

export function formatInt(v: unknown, fallback = '0'): string {
  const n = toFiniteNumber(v, NaN);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n).toLocaleString();
}

export function formatMoneyFromCents(v: unknown, fallback = '$0.00'): string {
  const cents = toFiniteNumber(v, NaN);
  if (!Number.isFinite(cents)) return fallback;
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}
