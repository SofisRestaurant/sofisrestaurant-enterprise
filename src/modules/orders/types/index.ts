// =============================================================================
// src/modules/orders/types/index.ts
//
// CENTRAL TYPE BARREL — SofisRestaurantV2 · Orders Module (2026)
// =============================================================================
//
// Single authoritative re-export point for every order-related type, interface,
// union, enum, payload, panel model, and shared contract used anywhere in the
// project.
//
// SOURCE FILES (all relative to src/modules/orders/types/):
//   order-payment.types.ts   — Stripe payment, card, risk, dispute, evidence
//   order-evidence.types.ts  — Fulfillment evidence, handoff, GPS, checklist
//   order-dispute.types.ts   — Dispute events, timeline, urgency
//
// DOMAIN FILES (re-exported with explicit aliases to resolve collisions):
//   @/domain/orders/order.types        — Core kitchen/admin Order domain
//   @/domain/orders/order-events.types — Full event-sourcing type system
//
// COLLISION RESOLUTION POLICY
// ───────────────────────────
// Several names are defined in more than one source file with incompatible
// shapes. Each conflict is resolved once here; consuming files must import
// from this barrel, not directly from source files, to get the right type.
//
//  Name                    Winner               Loser (aliased / excluded)
//  ──────────────────────  ───────────────────  ──────────────────────────
//  Order (admin module)    RawOrder/Order       src/types/order.ts StorefrontOrder
//  OrderStatus             domain/order.types   src/types/order.ts (StorefrontOrderStatus)
//  PaymentStatus (enum)    domain/order.types   order-payment.types (union — PaymentStatusValue)
//  EvidenceStatus          order-payment.types  order-evidence.types (FulfillmentEvidenceStatus)
//  OrderEvent              order-events.types   order.types (LegacyOrderEvent)
//  OrderEventData          order-events.types   order.types (simple Record alias)
//  OrderTimeline           order-events.types   order.types (LegacyOrderTimeline)
//  OrderPerformanceMetrics order-events.types   order.types (LegacyOrderPerformanceMetrics)
//  RecordEventRequest      order-events.types   order.types (LegacyRecordEventRequest)
//
// CIRCULAR IMPORT SAFETY
// ──────────────────────
// This barrel imports only from leaf type files (no API files, no hooks, no
// components). API files (orders.api, order-payments.api, etc.) import FROM
// this barrel — never the other way around. No cycles are possible.
//
// HOW TO ADD NEW TYPES
// ────────────────────
// 1. Define the type in the appropriate *.types.ts file.
// 2. Add a re-export here, grouped by source file.
// 3. If the name collides with an existing export, apply an alias and document
//    it in the collision table above.
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// 1. PAYMENT TYPES
//    Source: ./order-payment.types.ts
//
//    Includes all Stripe-facing enums, raw DB row shapes, UI-safe mapped
//    models, risk signals, and the buildRiskSignals helper used by panels.
//
//    COLLISION: PaymentStatus here is a *string union* (the full Stripe set).
//    The domain order.types.ts defines a *PaymentStatus enum* with only three
//    values (paid / failed / refunded). The enum is re-exported below as
//    DomainPaymentStatus. The union is the canonical PaymentStatus for this
//    module because it aligns with the admin gateway and Stripe webhook values.
//
//    COLLISION: EvidenceStatus here is the dispute-evidence lifecycle union
//    ('not_started' | 'in_progress' | 'submitted' | 'past_due' | 'won' | 'lost').
//    The order-evidence.types.ts defines FulfillmentEvidenceStatus for the
//    fulfilment row. Both are exported under their own names; no alias needed.
// ─────────────────────────────────────────────────────────────────────────────

export type {
  // Enums / unions
  PaymentStatus,
  PaymentMethodType,
  CardFunding,
  CvcCheck,
  AvsCheck,
  RiskLevel,
  ThreeDsResult,
  DisputeStatus,
  EvidenceStatus,             // dispute-evidence lifecycle (not_started → lost)

  // Raw Supabase row shapes (needed by orders.api.ts mappers)
  RawOrderPaymentFields,
  RawOrderPaymentDetail,

  // UI-safe mapped models
  OrderPaymentSummary,
  OrderPaymentDetail,

  // Risk panel
  RiskSignalRow,
} from './order-payment.types';

export {
  // Helper used by useOrderDetails and OrderPaymentPanel
  buildRiskSignals,
} from './order-payment.types';

// ─────────────────────────────────────────────────────────────────────────────
// 2. EVIDENCE TYPES
//    Source: ./order-evidence.types.ts
//
//    Mirrors the order_fulfillment_evidence table. Includes fulfillment-type
//    enums, raw DB shape, the full UI-safe mapped model, checklist item, and
//    the buildEvidenceChecklist pure function used by OrderEvidencePanel and
//    useOrderDetails.
//
//    FulfillmentEvidenceStatus is the *fulfillment row* status
//    ('pending' | 'partial' | 'complete' | 'flagged' | 'disputed' | 'archived').
//    This is distinct from EvidenceStatus (dispute evidence lifecycle) above.
// ─────────────────────────────────────────────────────────────────────────────

export type {
  // Enums / unions
  FulfillmentType,
  FulfillmentEvidenceStatus,
  HandoffMethod,

  // Raw DB shape
  RawOrderFulfillmentEvidence,

  // UI-safe mapped model (consumed by OrderEvidencePanel, useOrderDetails)
  OrderFulfillmentEvidence,

  // Checklist model (consumed by OrderEvidencePanel, useOrderDetails)
  EvidenceCheckItem,
} from './order-evidence.types';

export {
  // Helper function (consumed by OrderEvidencePanel, useOrderDetails)
  buildEvidenceChecklist,
} from './order-evidence.types';

// ─────────────────────────────────────────────────────────────────────────────
// 3. DISPUTE TYPES
//    Source: ./order-dispute.types.ts
//
//    Mirrors order_dispute_events and the admin_dispute_timeline view.
//    Also owns the unified TimelineEvent type (used by orders.api.ts timeline
//    builder and the drawer timeline panel).
//
//    DisputeUrgency: 'overdue' | 'critical' | 'warning' | 'normal' | 'closed'
//    Do NOT confuse with OrderAdminFlags.disputeUrgency which is a subset
//    ('normal' | 'closed' | null) — that type is defined inline in order.types.
// ─────────────────────────────────────────────────────────────────────────────

export type {
  // Enums / unions
  DisputeEventSource,
  DisputeEventType,
  DisputeUrgency,

  // Raw DB shape (consumed by orders.api.ts dispute mapper)
  RawDisputeEvent,

  // UI-safe mapped models
  DisputeEvent,
  OrderDisputeSummary,

  // Unified timeline (consumed by orders.api.ts buildTimeline, drawer panel)
  TimelineEventKind,
  TimelineEventSeverity,
  TimelineEvent,
} from './order-dispute.types';

// ─────────────────────────────────────────────────────────────────────────────
// 4. CORE DOMAIN ORDER TYPES
//    Source: @/domain/orders/order.types
//
//    Canonical kitchen/admin Order domain. This is the Order that flows through
//    the admin panel, the kitchen display, and the orders module API layer.
//
//    COLLISION — Order:
//      @/domain/orders/order.types  → full admin/kitchen Order (this barrel)
//      @/types/order.ts             → simple storefront Order (re-exported
//                                     below as StorefrontOrder — never as Order)
//
//    COLLISION — OrderStatus:
//      @/domain/orders/order.types  → enum with CONFIRMED/PREPARING/READY/…
//      @/types/order.ts             → enum with PENDING/PAID/PREPARING/…
//      The domain enum wins as OrderStatus. The storefront enum is re-exported
//      as StorefrontOrderStatus.
//
//    COLLISION — PaymentStatus (enum vs union):
//      @/domain/orders/order.types  → enum PaymentStatus { PAID/FAILED/REFUNDED }
//      ./order-payment.types.ts     → union PaymentStatus (full Stripe set, §1)
//      The union from §1 is the canonical PaymentStatus for this module.
//      The enum is re-exported here as DomainPaymentStatus so existing
//      callers that switch on PaymentStatus.PAID still compile.
//
//    COLLISION — OrderEvent / OrderTimeline / OrderPerformanceMetrics /
//                RecordEventRequest / OrderEventData:
//      @/domain/orders/order.types has lightweight versions of all four.
//      @/domain/orders/order-events.types has the full production versions.
//      The order-events.types versions win (see §5).
//      The domain/order.types versions are re-exported with Legacy* prefixes
//      so any existing caller can migrate without a hard break.
// ─────────────────────────────────────────────────────────────────────────────

export type {
  // Cart / item types (no collision)
  OrderCartItem,
  CartItemModifier,
  AddToCartPayload,
  ShippingAddress,

  // Core domain models (no collision)
  Order,
  KitchenOrder,

  // DB row shapes (consumed by orders.types.ts, mappers in domain/index)
  // These are the Supabase Database table row shapes re-exported from
  // orders.types.ts which sources them from @/types/supabase.
} from '@/domain/orders/order.types';

export {
  // OrderStatus enum — canonical for this module
  OrderStatus,
  ORDER_STATUS_VALUES,
  ORDER_STATUS_LABELS,
  KITCHEN_STATUSES,

  // PaymentStatus enum — aliased to avoid shadowing the Stripe union (§1)
  PaymentStatus as DomainPaymentStatus,
  PAYMENT_STATUS_VALUES,

  // OrderType enum
  OrderType,
  ORDER_TYPE_VALUES,

  // Type guards
  isOrderType,
  isOrderStatus,
  isPaymentStatus,

  // Status transition helper
  getNextOrderStatus,
} from '@/domain/orders/order.types';

// Legacy aliases — domain/order.types versions of names that lost collisions.
// Kept for backward compatibility; prefer the winning export names above.
export type {
  OrderEvent        as LegacyOrderEvent,
  OrderTimeline     as LegacyOrderTimeline,
  OrderPerformanceMetrics as LegacyOrderPerformanceMetrics,
  RecordEventRequest      as LegacyRecordEventRequest,
  OrderEventData          as LegacyOrderEventData,
} from '@/domain/orders/order.types';

// ─────────────────────────────────────────────────────────────────────────────
// 5. EVENT-SOURCING TYPES
//    Source: @/domain/orders/order-events.types
//
//    Full production event type system: typed JSONB payloads, analytics,
//    performance metrics, real-time subscription config, query filters,
//    event builder helpers, type guards, and category helpers.
//
//    These are the WINNING exports for the five collision names. Any file
//    that previously imported OrderEvent from order.types should now get
//    the richer version from here automatically via this barrel.
// ─────────────────────────────────────────────────────────────────────────────

export {
  // The event-type registry object
  ORDER_EVENT_TYPES,
} from '@/domain/orders/order-events.types';

export type {
  // Core event type
  OrderEventType,

  // Typed JSONB payload shapes
  OrderCreatedEventData,
  StatusChangeEventData,
  AssignmentEventData,
  PaymentEventData,
  IssueEventData,
  DelayEventData,
  ItemsModifiedEventData,
  NoteEventData,
  KitchenWorkflowEventData,
  CustomerNotificationEventData,

  // Winner: full union (replaces simple Record alias in order.types)
  OrderEventData,

  // Winner: production event (replaces lightweight order.types version)
  OrderEvent,

  // Winner: aggregated timeline (replaces flat view version in order.types)
  OrderTimeline,

  // Winner: full metrics with timing fields (replaces order.types version)
  OrderPerformanceMetrics,

  // Winner: typed record request (replaces order.types version)
  RecordEventRequest,

  // Analytics
  EventStats,
  StaffPerformance,
  KitchenPerformance,
  HourlyPerformance,
  ItemPerformance,

  // Real-time / query
  OrderEventSubscription,
  OrderEventsFilter,
  PerformanceFilter,

  // Event builder helper type
  EventBuilder,
} from '@/domain/orders/order-events.types';

export {
  // Validation helpers
  isValidEventType,
  getAllEventTypes,
  getEventTypesByCategory,

  // Type guards for event data
  isOrderEvent,
  isStatusChangeEvent,
  isAssignmentEvent,
  isPaymentEvent,
  isIssueEvent,
  isDelayEvent,
  isNoteEvent,
} from '@/domain/orders/order-events.types';

// ─────────────────────────────────────────────────────────────────────────────
// 6. MODULE-LEVEL ORDER TYPES
//    Source: @/modules/orders/types/orders.types  (note: orders, plural)
//
//    Supabase DB row types (OrderRow / OrderInsert / OrderUpdate), page-level
//    filter and result shapes, admin metrics, and filter utility functions.
//
//    This file re-exports Order / OrderCartItem / OrderType / PaymentStatus
//    from @/domain/orders/order.types. Those four names are already exported
//    above (§4), so we must NOT re-export them again from orders.types —
//    doing so would cause a "duplicate identifier" TS error at the barrel.
//    We import only the non-duplicated exports from that file.
// ─────────────────────────────────────────────────────────────────────────────

export type {
  // Supabase table row shapes
  OrderRow,
  OrderInsert,
  OrderUpdate,

  // Page-level UI contracts
  OrdersFilterTab,
  OrdersPageResult,
  AdminOrdersMetrics,
} from '@/modules/orders/types/orders.types';

export {
  // Filter tab constants and helpers
  ORDERS_FILTER_TABS,
  isOrdersFilterTab,
  matchesOrderFilter,
  matchesOrderSearch,
} from '@/modules/orders/types/orders.types';

// ─────────────────────────────────────────────────────────────────────────────
// 7. ADMIN MODULE CONTRACTS
//    Source: orders.api.ts (inline interface exports only — no runtime code)
//
//    orders.api.ts exports two plain interfaces that consuming components
//    (AdminOrdersPage, order drawer hooks) depend on. Because they reference
//    types already defined above, there is zero circular-import risk.
//
//    RawOrder and OrderWithDetail are module-internal shapes required by
//    mapRawOrder() and fetchFullOrderDetail(). They must live here so
//    orders.api.ts can import them FROM this barrel without creating a cycle.
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// 8. ADMIN ORDER DOMAIN TYPES
//    Defined inline here — these types are consumed by orders.api.ts and
//    useOrderDetails but live in no source *.types.ts file of their own.
//    Defining them here (rather than in orders.api.ts) keeps the barrel as
//    the single source of truth and avoids importing from an API file.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raw Supabase row shape for the orders table as returned by admin queries.
 * snake_case throughout; all fields nullable to reflect DB reality.
 * Consumed by mapRawOrder() in orders.api.ts.
 */
export interface RawOrder {
  id:                         string | null;
  user_id:                    string | null;
  status:                     string | null;
  fulfillment_type:           string | null;
  created_at:                 string | null;
  updated_at:                 string | null;

  // Stripe IDs
  stripe_payment_intent_id:   string | null;
  stripe_checkout_session_id: string | null;
  stripe_charge_id:           string | null;
  stripe_customer_id:         string | null;

  // Payment fields
  payment_status:             string | null;
  payment_method_type:        string | null;
  currency:                   string | null;

  // Money (cents)
  subtotal_cents:             number | null;
  tax_cents:                  number | null;
  tip_cents:                  number | null;
  discount_cents:             number | null;
  delivery_fee_cents:         number | null;
  service_fee_cents:          number | null;
  total_cents:                number | null;
  amount_received_cents:      number | null;
  refunded_amount_cents:      number | null;
  net_amount_cents:           number | null;

  // Dispute
  dispute_status:             string | null;
  disputed_at:                string | null;
  dispute_due_by:             string | null;
  dispute_reason:             string | null;
  dispute_amount_cents:       number | null;

  // Lifecycle timestamps
  charge_captured_at:         string | null;
  payment_failed_at:          string | null;
  refunded_at:                string | null;
  last_payment_error:         string | null;
}

/**
 * Admin-facing Order model returned by mapRawOrder().
 * camelCase throughout; all required fields are non-null.
 * Consumed throughout the admin orders module.
 */
export interface AdminOrder {
  id:               string;
  userId:           string;
  status:           AdminOrderStatus;
  fulfillmentType:  string;
  createdAt:        Date;
  updatedAt:        Date;
  totalCents:       number;
  totalFormatted:   string;
  currency:         string;
  paymentStatus:    string;
  disputeStatus:    import('./order-payment.types').DisputeStatus;
  isDisputed:       boolean;
  isRefunded:       boolean;
  isHighRisk:       boolean;
  hasProofMissing:  boolean;
  refundedAmountCents: number;
}

/**
 * String-literal union for order status values used in the admin module.
 * Distinct from the domain OrderStatus enum (which uses enum syntax) so that
 * API response strings can be narrowed without an enum import.
 */
export type AdminOrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

/**
 * Admin flag overlay applied to every order in list and detail views.
 * Controls badge rendering, row highlighting, and tab auto-selection.
 */
export interface OrderAdminFlags {
  isDisputed:      boolean;
  isRefunded:      boolean;
  isPartialRefund: boolean;
  isHighRisk:      boolean;
  isProofMissing:  boolean;
  isPaymentFailed: boolean;
  hasOpenDispute:  boolean;
  /** null when order is not disputed */
  disputeUrgency:  'normal' | 'closed' | null;
}

/**
 * Alias kept for the consuming import in orders.api.ts:
 *   import type { OrderWithDetail } from '../types/index';
 * FullOrderDetail (§7) is the canonical shape; this alias preserves the name
 * used internally in orders.api.ts without a separate export.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 9. STOREFRONT TYPES  (aliased — not primary exports)
//    Source: @/types/order.ts
//
//    The storefront uses a simpler Order shape (OrderItem[], subtotal, tax,
//    total). It is re-exported here with a Storefront* prefix so that any
//    component accidentally importing from this barrel still gets a named type
//    rather than a compile error, while the admin Order (§4) remains canonical.
// ─────────────────────────────────────────────────────────────────────────────

export type {
  Order    as StorefrontOrder,
  OrderItem as StorefrontOrderItem,
} from '@/types/order';

export {
  OrderStatus as StorefrontOrderStatus,
} from '@/types/order';

// ─────────────────────────────────────────────────────────────────────────────
// 10. DRAWER / HOOK CONTRACTS
//     Source: ../hooks/useOrderDetails (DrawerTab only — no runtime import)
//
//     DrawerTab is a pure string-literal type used by AdminOrdersPage and the
//     order detail drawer to type the active panel. It lives in useOrderDetails
//     but must be importable from this barrel so page components don't import
//     from a hook file directly.
// ─────────────────────────────────────────────────────────────────────────────

export type { DrawerTab } from '../hooks/useOrderDetails';