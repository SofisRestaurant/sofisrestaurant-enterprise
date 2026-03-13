// =============================================================================
// PATH: supabase/functions/admin-gateway/actions/promos/create.ts
// =============================================================================

import {
  createServiceClient,
  parsePromoRow,
  normalizePromoCode,
  normalizePromoType,
  validatePromoValue,
  asNullableDateString,
  asString,
  ensureDateWindow,
  toOptionalNonNegativeInt,
  toNullableNonNegativeInt,
  PROMO_SELECT_COLS,
} from './shared.ts';
import type { PromoRow, PromoType, PromotionInsert } from './shared.ts';

export type CreatePromoPayload = {
  code: string;
  type: PromoType;
  value: number;
  active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  expires_at?: string | null;
  min_order_cents?: number | null;
  max_uses?: number | null;
  per_user_limit?: number | null;
  channel?: string | null;
};

function buildCreatePatch(payload: CreatePromoPayload): PromotionInsert {
  const code = normalizePromoCode(payload.code);
  if (!code) {
    throw Object.assign(new Error('Promo code is required'), { code: 'PROMO_CODE_REQUIRED' });
  }

  const type = normalizePromoType(payload.type);
  const value = validatePromoValue(type, payload.value);

  const starts_at = asNullableDateString(payload.starts_at);
  const ends_at = asNullableDateString(payload.ends_at);
  const expires_at = asNullableDateString(payload.expires_at ?? payload.ends_at ?? null);

  ensureDateWindow(starts_at, ends_at, expires_at);

  return {
    code,
    active: payload.active ?? false,
    type,
    value,
    starts_at,
    ends_at,
    expires_at,
    min_order_cents: toOptionalNonNegativeInt(payload.min_order_cents),
    max_uses: toNullableNonNegativeInt(payload.max_uses),
    per_user_limit: toOptionalNonNegativeInt(payload.per_user_limit),
    channel: asString(payload.channel) ?? undefined,
  };
}

export async function createPromo(payload: CreatePromoPayload): Promise<PromoRow> {
  const svc = createServiceClient();
  const insertPatch = buildCreatePatch(payload);

  const { data, error } = await svc
    .from('promotions')
    .insert({
      ...insertPatch,
      current_uses: 0,
    })
    .select(PROMO_SELECT_COLS)
    .single();

  if (error) {
    throw Object.assign(new Error(error.message), { code: 'DB_PROMO_CREATE' });
  }

  const parsed = parsePromoRow(data);
  if (parsed === null) {
    throw Object.assign(new Error('Created promo could not be parsed'), {
      code: 'PROMO_CREATE_PARSE_FAILED',
    });
  }

  return parsed;
}