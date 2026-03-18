// =============================================================================
// PATH: src/modules/admin/orders/admin-orders.api.ts
// =============================================================================
// All Supabase calls for the admin orders feature.
// No UI logic, no React, no state — fetch and mutate only.
// =============================================================================
// =============================================================================
// PATH: src/modules/admin/orders/api/admin-orders.api.ts
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';

// ✅ Types
import type { AdminOrder } from '../types/admin-orders.types';

// ✅ Utils / Mappers
import { mapOrderRow } from '../utils/admin-orders.mapper';

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Fetches the 500 most recent orders from the DB, mapped to AdminOrder[].
 * Throws on Supabase error — callers are responsible for catching.
 */
export async function fetchAdminOrders(): Promise<AdminOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw error;

  return (data ?? []).map(mapOrderRow);
}

// ─── Mutation ─────────────────────────────────────────────────────────────────

/**
 * Advances an order to the given status via the hardened RPC.
 * Throws on Supabase error — callers handle optimistic rollback.
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: string,
): Promise<void> {
  const { error } = await supabase.rpc('update_order_status_secure', {
    order_id: orderId,
    new_status: newStatus,
  });

  if (error) throw error;
}