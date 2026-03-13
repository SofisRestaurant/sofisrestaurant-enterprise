// =============================================================================
// PATH: supabase/functions/admin-gateway/actions/promos/update.ts
// =============================================================================

import {
  createServiceClient,
  parsePromoRow,
  normalizePromoCode,
  normalizePromoType,
  validatePromoValue,
  asNullableDateString,
  asString,
  asBoolean,
  ensureDateWindow,
  toOptionalNonNegativeInt,
  toNullableNonNegativeInt,
  PROMO_SELECT_COLS,
} from './shared.ts';
import type { PromoRow, PromoType, PromotionUpdate } from './shared.ts';

export type UpdatePromoPayload = {
  id: string;
  code?: string;
  type?: PromoType;
  value?: number;
  active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  expires_at?: string | null;
  min_order_cents?: number | null;
  max_uses?: number | null;
  per_user_limit?: number | null;
  channel?: string | null;
};

function buildUpdatePatch(payload: UpdatePromoPayload): PromotionUpdate {
  const patch: PromotionUpdate = {};

  if (typeof payload.code === 'string') {
    const normalized = normalizePromoCode(payload.code);
    if (!normalized) {
      throw Object.assign(new Error('Promo code is required'), { code: 'PROMO_CODE_REQUIRED' });
    }
    patch.code = normalized;
  }

  if (typeof payload.type === 'string') {
    patch.type = normalizePromoType(payload.type);
  }

  if (typeof payload.value === 'number') {
    const resolvedType = patch.type ?? payload.type ?? null;
    patch.value = resolvedType
      ? validatePromoValue(normalizePromoType(resolvedType), payload.value)
      : payload.value;
  }

  if ('active' in payload) {
    const active = asBoolean(payload.active);
    if (active === null) {
      throw Object.assign(new Error('Invalid active flag'), {
        code: 'PROMO_INVALID_ACTIVE',
      });
    }
    patch.active = active;
  }

  if ('starts_at' in payload) {
    patch.starts_at = asNullableDateString(payload.starts_at);
  }

  if ('ends_at' in payload) {
    patch.ends_at = asNullableDateString(payload.ends_at);
  }

  if ('expires_at' in payload) {
    patch.expires_at = asNullableDateString(payload.expires_at);
  }

  if ('min_order_cents' in payload) {
    patch.min_order_cents = toOptionalNonNegativeInt(payload.min_order_cents);
  }

  if ('max_uses' in payload) {
    patch.max_uses = toNullableNonNegativeInt(payload.max_uses);
  }

  if ('per_user_limit' in payload) {
    patch.per_user_limit = toOptionalNonNegativeInt(payload.per_user_limit);
  }

  if ('channel' in payload) {
    patch.channel = asString(payload.channel) ?? undefined;
  }

  const startsAt =
    'starts_at' in patch ? (typeof patch.starts_at === 'string' ? patch.starts_at : null) : null;
  const endsAt =
    'ends_at' in patch ? (typeof patch.ends_at === 'string' ? patch.ends_at : null) : null;
  const expiresAt =
    'expires_at' in patch
      ? (typeof patch.expires_at === 'string' ? patch.expires_at : null)
      : null;

  ensureDateWindow(startsAt, endsAt, expiresAt);

  return patch;
}

export async function updatePromo(payload: UpdatePromoPayload): Promise<PromoRow> {
  const svc = createServiceClient();
  const patch = buildUpdatePatch(payload);

  if (Object.keys(patch).length === 0) {
    throw Object.assign(new Error('No promo changes provided'), {
      code: 'PROMO_UPDATE_EMPTY',
    });
  }

  const { data, error } = await svc
    .from('promotions')
    .update(patch)
    .eq('id', payload.id)
    .select(PROMO_SELECT_COLS)
    .single();

  if (error) {
    throw Object.assign(new Error(error.message), { code: 'DB_PROMO_UPDATE' });
  }

  const parsed = parsePromoRow(data);
  if (parsed === null) {
    throw Object.assign(new Error('Updated promo could not be parsed'), {
      code: 'PROMO_UPDATE_PARSE_FAILED',
    });
  }

  return parsed;
}