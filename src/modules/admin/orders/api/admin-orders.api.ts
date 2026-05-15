// src/modules/admin/orders/api/admin-orders.api.ts
// =============================================================================
// All Supabase calls for the admin orders feature.
// No UI logic, no React, no state. Fetch and mutate only.
// =============================================================================

import { supabase }       from '@/lib/supabase/supabaseClient';
import { invokeEdge }     from '@/lib/supabase/invoke';

import type { AdminOrder } from '../types/admin-orders.types';
import { mapOrderRow }    from '../utils/admin-orders.mapper';

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Fetches the 500 most recent orders, mapped to AdminOrder[].
 * Throws on error. Callers are responsible for catching.
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
 * Updates order status via the secure server-owned Edge Function.
 *
 * The Edge Function:
 *   1. Validates the caller's JWT
 *   2. Confirms admin/staff role
 *   3. Calls update_order_status_secure with the user-context client
 *      so auth.uid() resolves to the staff member (required by staff_action_logs)
 *   4. If new_status === "ready", triggers SMS internally
 *
 * invokeEdge passes the body directly as the second argument —
 * not wrapped in { body: ... }. See src/lib/supabase/invoke.ts.
 */
export async function updateOrderStatus(
  orderId:   string,
  newStatus: string,
): Promise<void> {
  type UpdateResult = { ok: boolean; error?: string };

  const result = await invokeEdge<UpdateResult>(
    'admin-update-order-status',
    { order_id: orderId, new_status: newStatus },
  );

  if (!result.ok) throw new Error(result.error ?? 'Status update failed');
}