// supabase/functions/stripe-webhook/kitchen-notify.ts
// ============================================================================
// KITCHEN NOTIFICATION
// ============================================================================
// Fires after a new order is confirmed. Writes an ORDER_CONFIRMED_KITCHEN
// event to order_events, which the KitchenScreen subscribes to via
// Supabase Realtime — this is what makes new orders appear instantly.
//
// USAGE in checkout-session-completed.ts:
//
//   if (wasNewOrder) {
//     sideEffects.push(
//       notifyKitchen({ db, orderId, userId, fulfillmentType, amountTotal, requestId }),
//       // ... existing side effects
//     );
//   }
//
// NON-THROWING: if this fails the order still exists and payment succeeded.
// Kitchen can always refresh. Never let this cause a 503 retry.
// ============================================================================

import { log, prefix } from "./logging.ts";
import { emitOrderEvent } from "./side-effects.ts";
import { toJson } from "./utils.ts";
import type { DbClient } from "./types.ts";

export interface KitchenNotifyInput {
  db:              DbClient;
  orderId:         string;
  userId:          string | null;
  /** fulfillment type from orders.fulfillment_type: 'pickup' | 'delivery' | 'dine_in' */
  fulfillmentType: string;
  amountTotal:     number;  // cents
  requestId:       string;
}

export async function notifyKitchen(input: KitchenNotifyInput): Promise<void> {
  const { db, orderId, userId, fulfillmentType, amountTotal, requestId } = input;

  try {
    await emitOrderEvent(
      db,
      orderId,
      userId,
      "ORDER_CONFIRMED_KITCHEN",
      toJson({
        fulfillment_type: fulfillmentType,
        amount_total:     amountTotal,
        source:           "stripe-webhook",
        request_id:       requestId,
      }),
      requestId,
    );

    log("info", "kitchen_notify_sent", {
      requestId,
      orderId:         prefix(orderId),
      fulfillmentType,
      amountTotal,
    });
  } catch (err) {
    // Non-fatal — log and continue. Never propagate.
    log("warn", "kitchen_notify_failed", {
      requestId,
      orderId:  prefix(orderId),
      error:    err instanceof Error ? err.message : String(err),
    });
  }
}