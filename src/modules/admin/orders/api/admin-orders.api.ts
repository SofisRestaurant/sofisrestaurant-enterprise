// src/modules/admin/orders/api/admin-orders.api.ts
// =============================================================================
// All Supabase calls for the admin orders feature.
// No UI logic, no React, no state. Fetch and mutate only.
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';

import type { AdminOrder } from '../types/admin-orders.types';
import { mapOrderRow } from '../utils/admin-orders.mapper';

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Fetches the 500 most recent orders from the DB, mapped to AdminOrder[].
 * Throws on Supabase error. Callers are responsible for catching.
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
 * Throws on Supabase error. Callers handle optimistic rollback.
 *
 * Important:
 * SMS should not be triggered directly from this frontend API file.
 * The professional/secure approach is:
 *   browser -> authenticated status-update Edge Function/RPC
 *   server -> updates order status
 *   server -> sends ready SMS if status changed to "ready"
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