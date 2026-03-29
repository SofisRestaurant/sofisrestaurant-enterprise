// =============================================================================
// PATH: supabase/functions/admin-gateway/actions/promos/remove.ts
// =============================================================================

import { service } from '../../lib/service.ts';

export type RemovePromoPayload = {
  id: string;
};

export async function removePromo(payload: RemovePromoPayload): Promise<{ ok: true }> {
  if (!payload.id || typeof payload.id !== 'string' || !payload.id.trim()) {
    throw Object.assign(new Error('Promo id is required.'), { code: 'BAD_REQUEST' });
  }

  const { data: existing, error: lookupError } = await service
    .from('promotions')
    .select('id')
    .eq('id', payload.id)
    .maybeSingle();

  if (lookupError) {
    throw Object.assign(new Error(lookupError.message), { code: 'DB_PROMO_LOOKUP' });
  }

  if (!existing) {
    throw Object.assign(
      new Error(`Promo "${payload.id}" not found.`),
      { code: 'PROMO_NOT_FOUND' },
    );
  }

  const { error } = await service
    .from('promotions')
    .delete()
    .eq('id', payload.id);

  if (error) {
    throw Object.assign(new Error(error.message), { code: 'DB_PROMO_REMOVE' });
  }

  return { ok: true };
}