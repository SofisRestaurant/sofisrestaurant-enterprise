// =============================================================================
// PATH: supabase/functions/admin-gateway/actions/promos/shared.ts
// =============================================================================
// Types, parsing helpers, and validation logic shared across the individual
// promo action modules (list, create, update, toggle, remove).
// =============================================================================

import { createServiceClient } from '../../../_shared/supabase.ts';

export { createServiceClient };

export type PromoType = 'percent' | 'fixed' | 'amount' | 'bogo' | 'free_item';

export type PromoRow = {
  id: string;
  code: string;
  active: boolean;
  type: PromoType;
  value: number;
  starts_at: string | null;
  ends_at: string | null;
  expires_at: string | null;
  min_order_cents: number | null;
  max_uses: number | null;
  current_uses: number | null;
  per_user_limit: number | null;
  channel: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PromotionInsert = {
  code: string;
  active: boolean;
  type: PromoType;
  value: number;
  starts_at?: string | null;
  ends_at?: string | null;
  expires_at?: string | null;
  min_order_cents?: number;
  max_uses?: number | null;
  current_uses?: number;
  per_user_limit?: number;
  channel?: string | null;
};

export type PromotionUpdate = Partial<PromotionInsert>;

// ---------------------------------------------------------------------------
// Primitive guards
// ---------------------------------------------------------------------------

type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function asNullableDateString(value: unknown): string | null {
  if (value === null) return null;

  const raw = asString(value);
  if (!raw) return null;

  const ms = new Date(raw).getTime();
  if (!Number.isFinite(ms)) {
    throw Object.assign(new Error('Invalid promo date'), { code: 'PROMO_INVALID_DATE' });
  }

  return raw;
}

export function toNullableNonNegativeInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const n = asNumber(value);
  if (n === null) return undefined;

  return Math.max(0, Math.trunc(n));
}

export function toOptionalNonNegativeInt(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;

  const n = asNumber(value);
  if (n === null) return undefined;

  return Math.max(0, Math.trunc(n));
}

// ---------------------------------------------------------------------------
// Domain validation
// ---------------------------------------------------------------------------

export function normalizePromoCode(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizePromoType(value: string): PromoType {
  if (
    value === 'percent' ||
    value === 'fixed' ||
    value === 'amount' ||
    value === 'bogo' ||
    value === 'free_item'
  ) {
    return value;
  }

  throw Object.assign(new Error('Invalid promo type'), { code: 'PROMO_INVALID_TYPE' });
}

export function validatePromoValue(type: PromoType, value: number): number {
  if (!Number.isFinite(value)) {
    throw Object.assign(new Error('Invalid promo value'), { code: 'PROMO_INVALID_VALUE' });
  }

  if (type === 'percent') {
    if (value <= 0 || value > 100) {
      throw Object.assign(new Error('Percent promos must be between 1 and 100'), {
        code: 'PROMO_INVALID_VALUE',
      });
    }
    return value;
  }

  if (value < 0) {
    throw Object.assign(new Error('Promo value must be non-negative'), {
      code: 'PROMO_INVALID_VALUE',
    });
  }

  return value;
}

export function ensureDateWindow(
  startsAt: string | null,
  endsAt: string | null,
  expiresAt: string | null,
): void {
  const startMs = startsAt ? new Date(startsAt).getTime() : null;
  const endMs = endsAt ? new Date(endsAt).getTime() : null;
  const expiryMs = expiresAt ? new Date(expiresAt).getTime() : null;

  if (startMs !== null && endMs !== null && startMs > endMs) {
    throw Object.assign(new Error('starts_at must be before ends_at'), {
      code: 'PROMO_INVALID_DATE_WINDOW',
    });
  }

  if (startMs !== null && expiryMs !== null && startMs > expiryMs) {
    throw Object.assign(new Error('starts_at must be before expires_at'), {
      code: 'PROMO_INVALID_DATE_WINDOW',
    });
  }
}

// ---------------------------------------------------------------------------
// Row parser
// ---------------------------------------------------------------------------

export const PROMO_SELECT_COLS =
  'id,code,type,value,active,starts_at,ends_at,expires_at,min_order_cents,max_uses,current_uses,per_user_limit,channel,created_at,updated_at';

export function parsePromoRow(value: unknown): PromoRow | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const code = asString(value.code);
  const active = asBoolean(value.active);
  const typeRaw = asString(value.type);
  const promoValue = asNumber(value.value);

  if (!id || !code || active === null || !typeRaw || promoValue === null) {
    return null;
  }

  let type: PromoType;
  try {
    type = normalizePromoType(typeRaw);
  } catch {
    return null;
  }

  const minOrder = toNullableNonNegativeInt(value.min_order_cents);
  const maxUses = toNullableNonNegativeInt(value.max_uses);
  const currentUses = toNullableNonNegativeInt(value.current_uses);
  const perUserLimit = toNullableNonNegativeInt(value.per_user_limit);

  return {
    id,
    code,
    active,
    type,
    value: promoValue,
    starts_at: asString(value.starts_at),
    ends_at: asString(value.ends_at),
    expires_at: asString(value.expires_at),
    min_order_cents: minOrder ?? null,
    max_uses: maxUses ?? null,
    current_uses: currentUses ?? null,
    per_user_limit: perUserLimit ?? null,
    channel: asString(value.channel),
    created_at: asString(value.created_at),
    updated_at: asString(value.updated_at),
  };
}