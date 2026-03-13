// =============================================================================
// PATH: supabase/functions/admin-gateway/lib/parsers/promos.ts
// =============================================================================
// Request parsers for all promo gateway actions.
// =============================================================================

import type { TogglePromoPayload, CreatePromoPayload } from '../../types.ts';

import {
  isRecord,
  safeStr,
  safeBool,
  safeNum,
  parseId,
  parseNullableTimestampField,
  parseOptionalNonNegativeIntField,
} from './shared.ts';

export function parseTogglePromoPayload(v: unknown): TogglePromoPayload | null {
  if (!isRecord(v)) return null;

  const id = parseId(v.id);
  const active = safeBool(v.active);
  if (!id || active === null) return null;

  return { id, active };
}

function parseCreatePromoType(value: unknown): CreatePromoPayload['type'] | null {
  return value === 'percent' ||
    value === 'fixed' ||
    value === 'amount' ||
    value === 'bogo' ||
    value === 'free_item'
    ? value
    : null;
}

export function parseCreatePromoPayload(v: unknown): CreatePromoPayload | null {
  if (!isRecord(v)) return null;

  const code = safeStr(v.code, 50);
  const type = parseCreatePromoType(v.type);
  const value = safeNum(v.value);
  const active = 'active' in v ? safeBool(v.active) : true;

  if (!code || !type || value === null || active === null) {
    return null;
  }

  const starts_at = parseNullableTimestampField(v, 'starts_at');
  const ends_at = parseNullableTimestampField(v, 'ends_at');
  const expires_at = parseNullableTimestampField(v, 'expires_at');
  const min_order_cents = parseOptionalNonNegativeIntField(v, 'min_order_cents');
  const max_uses = parseOptionalNonNegativeIntField(v, 'max_uses');
  const per_user_limit = parseOptionalNonNegativeIntField(v, 'per_user_limit');
  const channel =
    'channel' in v
      ? v.channel === null
        ? null
        : safeStr(v.channel, 120) ?? null
      : undefined;

  const payload: CreatePromoPayload = {
    code,
    type,
    value,
    active,
  };

  if (starts_at !== undefined) {
    payload.starts_at = starts_at;
  }

  if (ends_at !== undefined) {
    payload.ends_at = ends_at;
  }

  if (expires_at !== undefined) {
    payload.expires_at = expires_at;
  }

  if (min_order_cents !== undefined && min_order_cents !== null) {
    payload.min_order_cents = min_order_cents;
  }

  if (max_uses !== undefined) {
    payload.max_uses = max_uses;
  }

  if (per_user_limit !== undefined && per_user_limit !== null) {
    payload.per_user_limit = per_user_limit;
  }

  if (channel !== undefined) {
    payload.channel = channel;
  }

  return payload;
}