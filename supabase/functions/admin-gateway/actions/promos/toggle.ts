// =============================================================================
// PATH: supabase/functions/admin-gateway/actions/promos/toggle.ts
// =============================================================================

import { createServiceClient } from './shared.ts';

export type TogglePromoPayload = {
  id: string;
  active: boolean;
};

export async function togglePromo(payload: TogglePromoPayload): Promise<{ ok: true }> {
  const svc = createServiceClient();

  const { error } = await svc
    .from('promotions')
    .update({ active: payload.active })
    .eq('id', payload.id);

  if (error) {
    throw Object.assign(new Error(error.message), { code: 'DB_PROMO_TOGGLE' });
  }

  return { ok: true };
}