import type { AdminPromo } from '@/modules/admin/types/admin-common.types';

import type { PromoEditFormState } from './promoManager.form';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function safeMeta(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

/**
 * Converts an ISO date string into a datetime-local input value.
 * Output format: YYYY-MM-DDTHH:mm
 */
function isoToDatetimeLocal(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    return '';
  }

  const pad = (n: number): string => String(n).padStart(2, '0');

  return [
    d.getFullYear(),
    '-',
    pad(d.getMonth() + 1),
    '-',
    pad(d.getDate()),
    'T',
    pad(d.getHours()),
    ':',
    pad(d.getMinutes()),
  ].join('');
}

function readMetaString(meta: UnknownRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(meta[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function readMetaNumber(meta: UnknownRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = asNumber(meta[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function readMetaBoolean(meta: UnknownRecord, ...keys: string[]): boolean | null {
  for (const key of keys) {
    const value = asBoolean(meta[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

export function promoToEditForm(promo: AdminPromo): PromoEditFormState {
  const meta = safeMeta(promo.metadata);

  const type =
    asString(promo.discountType) ??
    readMetaString(meta, 'type', 'discount_type') ??
    'percent';

  const value =
    asNumber(promo.discountValue) ??
    readMetaNumber(meta, 'value', 'discount_value') ??
    0;

  const active =
    promo.status === 'active'
      ? true
      : promo.status === 'inactive'
        ? false
        : (readMetaBoolean(meta, 'active') ?? false);

  const startsAt =
    promo.startsAt ??
    readMetaString(meta, 'starts_at', 'startsAt');

  const endsAt =
    promo.endsAt ??
    readMetaString(meta, 'ends_at', 'endsAt', 'expires_at', 'expiresAt');

  const expiresAt =
    readMetaString(meta, 'expires_at', 'expiresAt') ??
    promo.endsAt ??
    readMetaString(meta, 'ends_at', 'endsAt');

  const minOrderCents =
    readMetaNumber(meta, 'min_order_cents', 'minOrderCents', 'minimum_order_cents') ?? 0;

  const maxUses =
    readMetaNumber(meta, 'max_uses', 'maxUses', 'max_redemptions');

  const perUserLimit =
    readMetaNumber(meta, 'per_user_limit', 'perUserLimit', 'max_uses_per_user') ?? 0;

  const channel =
    readMetaString(meta, 'channel') ?? 'all';

  return {
    code: promo.code,
    type:
      type === 'percent' ||
      type === 'fixed' ||
      type === 'amount' ||
      type === 'bogo' ||
      type === 'free_item'
        ? type
        : 'percent',
    value: String(value),
    active,
    startsAt: isoToDatetimeLocal(startsAt),
    endsAt: isoToDatetimeLocal(endsAt),
    expiresAt: isoToDatetimeLocal(expiresAt),
    minOrderCents: String(Math.max(0, Math.trunc(minOrderCents))),
    maxUses: maxUses !== null ? String(Math.max(0, Math.trunc(maxUses))) : '',
    perUserLimit: String(Math.max(0, Math.trunc(perUserLimit))),
    channel,
  };
}