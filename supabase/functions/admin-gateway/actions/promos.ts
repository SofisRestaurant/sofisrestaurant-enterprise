// PATH: supabase/functions/admin-gateway/actions/promos.ts

import { createServiceClient } from '../../_shared/supabase.ts';

type PromoRow = {
  id: string;
  code: string;
  active: boolean;
  type: string;
  value: number;
  created_at: string | null;
};

export type PromoListResult = PromoRow[];

export type TogglePromoPayload = {
  id: string;
  active: boolean;
};

export async function listPromos(): Promise<PromoListResult> {
  const svc = createServiceClient();

  const { data, error } = await svc
    .from('promotions')
    .select('id,code,type,value,active,created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    throw Object.assign(new Error(error.message), { code: 'DB_PROMOS_LIST' });
  }

  return (data ?? []) as PromoRow[];
}

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
