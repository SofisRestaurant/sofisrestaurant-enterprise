// supabase/functions/stripe-webhook/types.ts
// ============================================================================
// WEBHOOK TYPES
// ============================================================================
// NAMING NOTE for PreparedCartState:
//   PreparedCartState.orderType: OrderType
//   OrderType is defined in _shared/pricing.ts as 'pickup' | 'delivery' | 'dine_in'
//   So orderType here IS the fulfillment type — this naming is intentional and must
//   stay compatible with PricingSnapshot.orderType from pricing.ts.
//
//   createOrderFromSession maps it to the correct DB columns:
//     orders.order_type       ← 'food' (order category, what was sold)
//     orders.fulfillment_type ← orderType (how it is delivered)
// ============================================================================

import { createServiceClient } from "../_shared/supabase.ts";
import type { Database, Json } from "../_shared/database.types.ts";
import type { OrderType, parsePricingSnapshot } from "../_shared/pricing.ts";

export type Db        = Database;
export type DbClient  = ReturnType<typeof createServiceClient>;

// ── DB-derived insert types ───────────────────────────────────────────────────

export type OrderInsert            = Db["public"]["Tables"]["orders"]["Insert"];
export type FinancialTxInsert      = Db["public"]["Tables"]["financial_transactions"]["Insert"];
export type OrderEventInsert       = Db["public"]["Tables"]["order_events"]["Insert"];
export type AdminNotifInsert       = Db["public"]["Tables"]["admin_notifications"]["Insert"];
export type SecurityEventInsert    = Db["public"]["Tables"]["security_events"]["Insert"];
export type StripeEventInsert      = Db["public"]["Tables"]["stripe_events"]["Insert"];

// ── Pricing types ─────────────────────────────────────────────────────────────

export type PricingSnapshot = NonNullable<ReturnType<typeof parsePricingSnapshot>>;

// ── Pending cart ──────────────────────────────────────────────────────────────

export type PendingCartExtended =
  & Db["public"]["Tables"]["pending_carts"]["Row"]
  & {
    pricing_snapshot?: Json;
    pricing_hash?:     string | null;
    consumed_at?:      string | null;
    currency?:         string | null;
    stripe_session_id?: string | null;
  };

export type PendingCartUpdate =
  & Db["public"]["Tables"]["pending_carts"]["Update"]
  & {
    pricing_snapshot?: Json;
    pricing_hash?:     string | null;
    consumed_at?:      string | null;
    stripe_session_id?: string | null;
    expires_at?:       string | null;
  };

// ── PreparedCartState ─────────────────────────────────────────────────────────
// Output of prepareAuthoritativeCartState.
// orderType: OrderType = 'pickup' | 'delivery' | 'dine_in'
// This IS the fulfillment type — named 'orderType' to stay compatible with
// PricingSnapshot.orderType from _shared/pricing.ts.

export interface PreparedCartState {
  cart:        PendingCartExtended;
  snapshot:    PricingSnapshot;
  pricingHash: string;
  /** Fulfillment type: 'pickup' | 'delivery' | 'dine_in'. Named per pricing.ts contract. */
  orderType:   OrderType;
  currency:    string;
  consumedNow: boolean;
}

// ── Order located ─────────────────────────────────────────────────────────────

export interface OrderLocated {
  id:             string;
  amount_total:   number;
  payment_status: string;
  status:         string;
  customer_uid:   string | null;
}

// ── Misc ──────────────────────────────────────────────────────────────────────

export type RefundKind = "refund" | "partial_refund";

export type ClaimResult =
  | { kind: "claimed" }
  | { kind: "duplicate" }
  | { kind: "db_error"; code: string | null; message: string };

export type LogLevel = "info" | "warn" | "error";

// ── Event payload types ───────────────────────────────────────────────────────

export interface CheckoutSessionEventRef {
  id: string;
}

export interface PaymentIntentLastError {
  code:           string | null;
  declineCode:    string | null;
  message:        string | null;
  type:           string | null;
}

export interface PaymentIntentEventPayload {
  id:                  string;
  amountReceived:      number;
  currency:            string | null;
  latestChargeId:      string | null;
  cancellationReason:  string | null;
  lastPaymentError:    PaymentIntentLastError | null;
}

export interface ChargeRefundPayload {
  id:       string | null;
  amount:   number;
  currency: string | null;
  reason:   string | null;
  status:   string | null;
  created:  number | null;
}

export interface ChargeEventPayload {
  id:              string;
  paymentIntentId: string | null;
  amountRefunded:  number;
  amount:          number;
  currency:        string | null;
  refunds:         ChargeRefundPayload[];
}

export interface DisputeEvidenceSummary {
  hasCustomerSignature:      boolean;
  hasReceipt:                boolean;
  hasServiceDocumentation:   boolean;
  hasShippingDocumentation:  boolean;
  hasCustomerCommunication:  boolean;
  uncategorizedText:         string | null;
}

export interface DisputeEventPayload {
  id:                string;
  paymentIntentId:   string | null;
  chargeId:          string | null;
  amount:            number;
  reason:            string | null;
  status:            string | null;
  evidenceDueByUnix: number | null;
  networkReasonCode: string | null;
  evidenceSummary:   DisputeEvidenceSummary | null;
}