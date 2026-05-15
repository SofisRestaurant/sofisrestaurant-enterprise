// src/modules/orders/utils/sms-trigger.ts
// =============================================================================
// Fire-and-forget helper for the order-ready SMS notification.
//
// Calls notify-ready-sms (authenticated Edge Function wrapper) via the
// Supabase JS client so the caller's JWT is forwarded automatically.
// Never throws — SMS failures are console.warn only and must never roll back
// or delay a status update.
//
// Duplicate-send safety: send-sms checks sms_log before dispatching, so
// multiple calls for the same order+event are safe and will return
// { ok: true, skipped: true, reason: "already_sent" }.
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';

const NOTIFY_FUNCTION  = 'notify-ready-sms' as const;
const READY_SMS_EVENT  = 'ready'             as const;

/**
 * Trigger the order-ready SMS for the given order ID.
 *
 * Returns immediately. The actual Edge Function call runs in a detached
 * microtask and its result is discarded after logging.
 *
 * @param orderId - The UUID of the order that just became ready.
 */
export function triggerReadySms(orderId: string): void {
  void supabase.functions
    .invoke(NOTIFY_FUNCTION, {
      body: { order_id: orderId, event: READY_SMS_EVENT },
    })
    .then(({ error }) => {
      if (error) {
        // Non-blocking: log the prefix only — never log the full phone.
        console.warn('[SMS] notify-ready-sms failed', {
          order_id_prefix: orderId.slice(0, 8),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
}