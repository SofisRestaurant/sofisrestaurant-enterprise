// =============================================================================
// src/modules/orders/types/order-dispute.types.ts
//
// Types mirroring order_dispute_events and the admin_dispute_timeline view
// from: 20260308000004_create_order_dispute_events.sql
// =============================================================================

// ---------------------------------------------------------------------------
// 1. Enums
// ---------------------------------------------------------------------------

export type DisputeEventSource =
  | 'stripe_webhook'
  | 'admin_action'
  | 'system'
  | 'customer_action';

export type DisputeEventType =
  // Stripe
  | 'dispute_created'
  | 'dispute_updated'
  | 'dispute_funds_withdrawn'
  | 'dispute_funds_reinstated'
  | 'dispute_closed'
  | 'evidence_submitted'
  // Admin
  | 'admin_note_added'
  | 'admin_evidence_uploaded'
  | 'admin_escalated'
  | 'admin_accepted'
  | 'admin_reopened'
  // System
  | 'due_date_reminder'
  | 'auto_flagged_high_risk'
  | 'evidence_completeness_checked';

export type DisputeUrgency = 'overdue' | 'critical' | 'warning' | 'normal' | 'closed';

// ---------------------------------------------------------------------------
// 2. Raw row shape (from admin_dispute_timeline view)
// ---------------------------------------------------------------------------

export interface RawDisputeEvent {
  id:                      string | null;
  order_id:                string | null;
  dispute_id:              string | null;
  event_type:              string | null;
  event_source:            string | null;
  previous_status:         string | null;
  new_status:              string | null;
  previous_amount_cents:   number | null;
  new_amount_cents:        number | null;
  actor_name:              string | null;
  actor_role:              string | null;
  note:                    string | null;
  evidence_urls:           string[] | null;
  evidence_labels:         string[] | null;
  metadata:                Record<string, unknown> | null;
  occurred_at:             string | null;
  // Joined from orders
  stripe_payment_intent_id: string | null;
  total_cents:             number | null;
  dispute_due_by:          string | null;
  dispute_status:          string | null;
}

// ---------------------------------------------------------------------------
// 3. UI-safe mapped models
// ---------------------------------------------------------------------------

export interface DisputeEvent {
  id:               string;
  orderId:          string;
  disputeId:        string;
  eventType:        DisputeEventType;
  eventSource:      DisputeEventSource;
  previousStatus:   string;
  newStatus:        string;
  previousAmountCents: number;
  newAmountCents:   number;
  actorName:        string;
  actorRole:        string;
  note:             string;
  evidenceUrls:     string[];
  evidenceLabels:   string[];
  metadata:         Record<string, unknown>;
  occurredAt:       Date;
  occurredAtLabel:  string;

  // Denormalized from joined order
  stripePaymentIntentId: string;
  orderTotalCents:  number;
  disputeDueBy:     Date | null;
  disputeStatus:    string;
}

export interface OrderDisputeSummary {
  disputeId:              string;
  disputeStatus:          string;
  disputeReason:          string;
  disputeAmountCents:     number;
  disputeAmountFormatted: string;
  disputeDueBy:           Date | null;
  disputeDueDaysLeft:     number | null;
  disputeUrgency:         DisputeUrgency;
  evidenceStatus:         string;
  networkReasonCode:      string;
  openedAt:               Date | null;
  closedAt:               Date | null;
  outcome:                string;
  refundIds:              string[];
  lastRefundReason:       string;
  lastRefundAt:           Date | null;
  events:                 DisputeEvent[];
}

// ---------------------------------------------------------------------------
// 4. Timeline item (unified across payment + fulfillment + dispute sources)
// ---------------------------------------------------------------------------

export type TimelineEventKind =
  | 'order_created'
  | 'payment_captured'
  | 'payment_failed'
  | 'refund_issued'
  | 'order_fulfilled'
  | 'pickup_verified'
  | 'delivery_completed'
  | 'dispute_created'
  | 'dispute_updated'
  | 'dispute_closed'
  | 'evidence_submitted'
  | 'admin_note'
  | 'system_flag';

export type TimelineEventSeverity = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface TimelineEvent {
  id:          string;
  kind:        TimelineEventKind;
  severity:    TimelineEventSeverity;
  title:       string;
  description: string;
  actor:       string;
  occurredAt:  Date;
  label:       string;       // formatted timestamp
  metadata?:   Record<string, unknown>;
  evidenceUrls?: string[];
  evidenceLabels?: string[];
}