// =============================================================================
// PATH: supabase/functions/admin-gateway/actions/promos/remove.ts
// =============================================================================

import { createServiceClient } from './shared.ts';

export type RemovePromoPayload = {
  id: string;
};

export async function removePromo(payload: RemovePromoPayload): Promise<{ ok: true }> {
  const svc = createServiceClient();

  const { error } = await svc
    .from('promotions')
    .delete()
    .eq('id', payload.id);

  if (error) {
    throw Object.assign(new Error(error.message), { code: 'DB_PROMO_REMOVE' });
  }

  return { ok: true };
}