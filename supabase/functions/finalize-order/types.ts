// =============================================================================
// supabase/functions/finalize-order/types.ts
// =============================================================================

import type { Database, Json } from '../_shared/database.types.ts';

export type JsonRecord = Record<string, unknown>;
export type Db = Database;
export type DbClient = ReturnType<typeof import('../_shared/supabase.ts').createServiceClient>;

export type OrderEventInsert = Db['public']['Tables']['order_events']['Insert'];

export type PendingCartUpdate = Db['public']['Tables']['pending_carts']['Update'] & {
  pricing_snapshot?: Json;
  pricing_hash?: string | null;
  stripe_session_id?: string | null;
  consumed_at?: string | null;
};

export type OrderInsert = Db['public']['Tables']['orders']['Insert'] & {
  order_type?: string | null;
  metadata?: Json;
};

export type OrderItemInsert = {
  order_id: string;
  line_index: number;
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  modifiers: Json;
  notes: string | null;
  pricing_hash: string | null;
};

export type PendingCartRecord = {
  id: string;
  userId: string;
  items: Json;
  promoId: string | null;
  creditId: string | null;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  pricingHash: string | null;
  pricingSnapshotRaw: unknown;
  consumedAt: string | null;
  stripeSessionId: string | null;
};

export type ExistingOrderRow = {
  id: string;
  amount_total: number;
  payment_status: string | null;
  status: string | null;
};

export type FinalizeSuccessBody = {
  ok: true;
  requestId: string;
  order_id: string;
  already_finalized: boolean;
  payment_status: string | null;
  status: string | null;
  session_id: string;
};