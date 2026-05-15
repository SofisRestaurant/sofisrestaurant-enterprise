// src/modules/orders/utils/sms-trigger.ts
// =============================================================================
// DEPRECATED — no longer called.
//
// SMS triggering is now owned entirely by the admin-update-order-status
// Edge Function. When an order is marked ready, the Edge Function calls
// send-sms internally via INTERNAL_FUNCTION_KEY. The browser never touches
// the SMS path.
//
// All former call sites have been updated:
//   - src/modules/orders/api/orders.api.ts       → updateOrderStatus
//   - src/modules/orders/api/orders.admin.api.ts → updateOrderStatusRow
//   - src/modules/admin/orders/api/admin-orders.api.ts → updateOrderStatus
//
// This file is retained to avoid a hard build break if any import was missed.
// It can be deleted once confirmed no remaining imports exist.
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';

const NOTIFY_FUNCTION = 'notify-ready-sms' as const;
const READY_SMS_EVENT = 'ready'             as const;

/**
 * @deprecated Use admin-update-order-status Edge Function instead.
 * This function is a no-op stub retained for import safety only.
 */
export function triggerReadySms(orderId: string): void {
  // No-op: SMS is now triggered server-side by admin-update-order-status.
  // Kept as a stub so any missed import compiles without error.
  void orderId;
  void supabase;
  void NOTIFY_FUNCTION;
  void READY_SMS_EVENT;
}