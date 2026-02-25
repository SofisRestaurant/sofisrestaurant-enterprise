// src/domain/orders/order-events.types.ts
// ============================================================================
// ORDER EVENTS — TYPE DEFINITIONS (PRODUCTION 2026)
// ============================================================================
// Complete type system for event sourcing in orders
// ✅ Database constraint compatible
// ✅ Type-safe event data
// ✅ Analytics ready
// ============================================================================

// ============================================================================
// EVENT TYPES (matches database constraint)
// ============================================================================

/**
 * Standardized event types for order lifecycle tracking
 * These should match your database constraint on the event_type column
 */
export const ORDER_EVENT_TYPES = {
  // Order lifecycle
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_CONFIRMED: 'ORDER_CONFIRMED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  ORDER_REFUNDED: 'ORDER_REFUNDED',
  
  // Status changes
  STATUS_CHANGED: 'STATUS_CHANGED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_DISPUTED: 'PAYMENT_DISPUTED',
  PAYMENT_DISPUTE_WON: 'PAYMENT_DISPUTE_WON',
  PAYMENT_DISPUTE_LOST: 'PAYMENT_DISPUTE_LOST',
  
  
  // Kitchen workflow
  COOK_ASSIGNED: 'COOK_ASSIGNED',
  COOK_UNASSIGNED: 'COOK_UNASSIGNED',
  PREPARING_STARTED: 'PREPARING_STARTED',
  PREPARING_COMPLETED: 'PREPARING_COMPLETED',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  
  // Fulfillment
  PICKED_UP: 'PICKED_UP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'COMPLETED',
  
  // Issues
  ISSUE_REPORTED: 'ISSUE_REPORTED',
  ISSUE_RESOLVED: 'ISSUE_RESOLVED',
  CUSTOMER_NOTIFIED: 'CUSTOMER_NOTIFIED',
  
  // Modifications
  ITEMS_MODIFIED: 'ITEMS_MODIFIED',
  SPECIAL_REQUEST_ADDED: 'SPECIAL_REQUEST_ADDED',
  NOTE_ADDED: 'NOTE_ADDED',
  
  // Delays
  DELAY_REPORTED: 'DELAY_REPORTED',
  ETA_UPDATED: 'ETA_UPDATED',
} as const

/**
 * Type-safe union of all event type strings
 */
export type OrderEventType = typeof ORDER_EVENT_TYPES[keyof typeof ORDER_EVENT_TYPES]

// ============================================================================
// EVENT DATA TYPES (typed JSONB payloads)
// ============================================================================

/**
 * Event data for order creation
 */
export interface OrderCreatedEventData {
  total: number
  currency: string
  payment_status: string
  order_type: string
  customer_email?: string
  customer_name?: string
}

/**
 * Event data for status changes
 */
export interface StatusChangeEventData {
  previous_status?: string
  new_status: string
  triggered_by?: string
  reason?: string
  metadata?: Record<string, unknown>
}

/**
 * Event data for staff assignment
 */
export interface AssignmentEventData {
  assigned_to: string
  previous_assigned_to?: string
  assigned_by?: string
  assigned_at?: string
}

/**
 * Event data for payment events
 */
export interface PaymentEventData {
  amount: number
  currency: string
  payment_method?: string
  stripe_payment_intent_id?: string
  stripe_session_id?: string
  error_message?: string
  error_code?: string
}

/**
 * Event data for issue reporting
 */
export interface IssueEventData {
  issue_type: 'quality' | 'missing_items' | 'delay' | 'wrong_order' | 'other'
  description: string
  severity?: 'low' | 'medium' | 'high' | 'critical'
  resolution?: string
  resolved_by?: string
  resolved_at?: string
}

/**
 * Event data for order delays
 */
export interface DelayEventData {
  estimated_delay_minutes: number
  reason: string
  new_eta?: string
  customer_notified?: boolean
}

/**
 * Event data for item modifications
 */
export interface ItemsModifiedEventData {
  added_items?: Array<{
    id: string
    name: string
    quantity: number
    price?: number
  }>
  removed_items?: Array<{
    id: string
    name: string
    quantity: number
    reason?: string
  }>
  modified_by: string
  modification_reason?: string
}

/**
 * Event data for notes/comments
 */
export interface NoteEventData {
  note: string
  note_type?: 'kitchen' | 'customer' | 'delivery' | 'admin' | 'internal'
  added_by?: string
  visibility?: 'public' | 'internal'
}

/**
 * Event data for kitchen workflow
 */
export interface KitchenWorkflowEventData {
  station?: string
  staff_name?: string
  start_time?: string
  end_time?: string
  duration_minutes?: number
  notes?: string
}

/**
 * Event data for customer notifications
 */
export interface CustomerNotificationEventData {
  notification_type: 'sms' | 'email' | 'push'
  message: string
  sent_at: string
  delivered?: boolean
  error?: string
}

/**
 * Union type for all specific event data types
 * Also allows generic Record<string, unknown> for flexibility
 */
export type OrderEventData =
  | OrderCreatedEventData
  | StatusChangeEventData
  | AssignmentEventData
  | PaymentEventData
  | IssueEventData
  | DelayEventData
  | ItemsModifiedEventData
  | NoteEventData
  | KitchenWorkflowEventData
  | CustomerNotificationEventData
  | Record<string, unknown>

// ============================================================================
// MAIN EVENT TYPE
// ============================================================================

/**
 * Order event as stored in database
 * Matches your order_events table schema
 */
export interface OrderEvent {
  id: string
  order_id: string
  user_id: string | null
  event_type: string // Uses string for DB compatibility
  event_data: OrderEventData | null
  created_at: string
}

// ============================================================================
// EVENT RECORDING REQUEST
// ============================================================================

/**
 * Request payload for recording a new event
 */
export interface RecordEventRequest {
  order_id: string
  event_type: OrderEventType
  event_data?: OrderEventData
  user_id?: string | null
}

// ============================================================================
// ORDER TIMELINE (events grouped by order)
// ============================================================================

/**
 * Complete timeline view of an order with all events
 */
export interface OrderTimeline {
  order_id: string
  order_number: string
  current_status: string
  total: number
  customer_uid: string | null
  events: OrderEvent[]
}

// ============================================================================
// PERFORMANCE METRICS (calculated from events)
// ============================================================================

/**
 * Performance metrics calculated from event timestamps
 */
export interface OrderPerformanceMetrics {
  order_id: string
  order_number: string | null
  status: string
  
  // Timing metrics (in minutes)
  minutes_to_assign?: number | null
  minutes_to_start?: number | null
  minutes_to_ready?: number | null
  minutes_prep_time?: number | null
  total_time_minutes?: number | null
  
  // Timestamps
  created_at: string
  updated_at: string
  
  // Quality metrics
  on_time?: boolean
  late_by_minutes?: number | null
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

/**
 * Statistics for a specific event type
 */
export interface EventStats {
  event_type: string
  count: number
  avg_time_to_event_minutes: number | null
  min_time_minutes?: number | null
  max_time_minutes?: number | null
  date?: string
}

/**
 * Staff performance metrics
 */
export interface StaffPerformance {
  staff_id?: string
  staff_name: string
  orders_assigned: number
  orders_completed: number
  avg_prep_time_minutes: number
  orders_on_time: number
  orders_late: number
  on_time_percentage: number
  total_revenue?: number
}

/**
 * Kitchen performance metrics by date
 */
export interface KitchenPerformance {
  date: string
  total_orders: number
  completed_orders: number
  cancelled_orders: number
  avg_prep_time_minutes: number
  avg_time_to_ready_minutes: number
  orders_under_15_min: number
  orders_15_to_30_min: number
  orders_over_30_min: number
  peak_hour?: string
  total_revenue?: number
}

/**
 * Hourly performance breakdown
 */
export interface HourlyPerformance {
  hour: number
  order_count: number
  avg_prep_time_minutes: number
  revenue: number
}

/**
 * Menu item performance from order events
 */
export interface ItemPerformance {
  item_id: string
  item_name: string
  order_count: number
  total_quantity: number
  avg_prep_time_minutes: number | null
  revenue: number
}

// ============================================================================
// REAL-TIME EVENT SUBSCRIPTION
// ============================================================================

/**
 * Configuration for real-time event subscriptions
 */
export interface OrderEventSubscription {
  order_id?: string
  event_types?: OrderEventType[]
  callback: (event: OrderEvent) => void
  onError?: (error: Error) => void
}

// ============================================================================
// QUERY FILTERS
// ============================================================================

/**
 * Filters for querying order events
 */
export interface OrderEventsFilter {
  order_id?: string
  event_types?: OrderEventType[]
  user_id?: string
  start_date?: string
  end_date?: string
  limit?: number
  offset?: number
  order_by?: 'created_at' | 'event_type'
  order_direction?: 'asc' | 'desc'
}

/**
 * Filters for performance queries
 */
export interface PerformanceFilter {
  start_date: string
  end_date: string
  staff_id?: string
  order_status?: string
  limit?: number
}

// ============================================================================
// EVENT BUILDER HELPERS
// ============================================================================

/**
 * Helper type for creating type-safe event requests
 */
export type EventBuilder<T extends OrderEventType> = {
  event_type: T
  event_data: Extract<
    OrderEventData,
    T extends 'ORDER_CREATED' ? OrderCreatedEventData
    : T extends 'STATUS_CHANGED' ? StatusChangeEventData
    : T extends 'COOK_ASSIGNED' ? AssignmentEventData
    : T extends 'PAYMENT_RECEIVED' | 'PAYMENT_FAILED' ? PaymentEventData
    : T extends 'ISSUE_REPORTED' | 'ISSUE_RESOLVED' ? IssueEventData
    : T extends 'DELAY_REPORTED' ? DelayEventData
    : T extends 'ITEMS_MODIFIED' ? ItemsModifiedEventData
    : T extends 'NOTE_ADDED' ? NoteEventData
    : T extends 'PREPARING_STARTED' | 'PREPARING_COMPLETED' ? KitchenWorkflowEventData
    : T extends 'CUSTOMER_NOTIFIED' ? CustomerNotificationEventData
    : Record<string, unknown>
  >
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Check if a string is a valid event type
 */
export function isValidEventType(type: string): type is OrderEventType {
  return Object.values(ORDER_EVENT_TYPES).includes(type as OrderEventType)
}

/**
 * Get all event types as array
 */
export function getAllEventTypes(): OrderEventType[] {
  return Object.values(ORDER_EVENT_TYPES)
}

/**
 * Get event types by category
 */
export function getEventTypesByCategory(category: 'lifecycle' | 'kitchen' | 'fulfillment' | 'issues' | 'modifications'): OrderEventType[] {
  const categories = {
    lifecycle: [
      ORDER_EVENT_TYPES.ORDER_CREATED,
      ORDER_EVENT_TYPES.ORDER_CONFIRMED,
      ORDER_EVENT_TYPES.ORDER_CANCELLED,
      ORDER_EVENT_TYPES.ORDER_REFUNDED,
      ORDER_EVENT_TYPES.STATUS_CHANGED,
      ORDER_EVENT_TYPES.PAYMENT_RECEIVED,
      ORDER_EVENT_TYPES.PAYMENT_FAILED,
    ],
    kitchen: [
      ORDER_EVENT_TYPES.COOK_ASSIGNED,
      ORDER_EVENT_TYPES.COOK_UNASSIGNED,
      ORDER_EVENT_TYPES.PREPARING_STARTED,
      ORDER_EVENT_TYPES.PREPARING_COMPLETED,
      ORDER_EVENT_TYPES.READY_FOR_PICKUP,
    ],
    fulfillment: [
      ORDER_EVENT_TYPES.PICKED_UP,
      ORDER_EVENT_TYPES.OUT_FOR_DELIVERY,
      ORDER_EVENT_TYPES.DELIVERED,
      ORDER_EVENT_TYPES.COMPLETED,
    ],
    issues: [
      ORDER_EVENT_TYPES.ISSUE_REPORTED,
      ORDER_EVENT_TYPES.ISSUE_RESOLVED,
      ORDER_EVENT_TYPES.CUSTOMER_NOTIFIED,
      ORDER_EVENT_TYPES.DELAY_REPORTED,
      ORDER_EVENT_TYPES.ETA_UPDATED,
    ],
    modifications: [
      ORDER_EVENT_TYPES.ITEMS_MODIFIED,
      ORDER_EVENT_TYPES.SPECIAL_REQUEST_ADDED,
      ORDER_EVENT_TYPES.NOTE_ADDED,
    ],
  }
  
  return categories[category]
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for OrderEvent
 */
export function isOrderEvent(obj: unknown): obj is OrderEvent {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'order_id' in obj &&
    'event_type' in obj
  )
}

/**
 * Type guard for specific event data types
 */
export function isStatusChangeEvent(data: OrderEventData): data is StatusChangeEventData {
  return 'new_status' in data
}

export function isAssignmentEvent(data: OrderEventData): data is AssignmentEventData {
  return 'assigned_to' in data
}

export function isPaymentEvent(data: OrderEventData): data is PaymentEventData {
  return 'amount' in data && 'currency' in data
}

export function isIssueEvent(data: OrderEventData): data is IssueEventData {
  return 'issue_type' in data && 'description' in data
}

export function isDelayEvent(data: OrderEventData): data is DelayEventData {
  return 'estimated_delay_minutes' in data
}

export function isNoteEvent(data: OrderEventData): data is NoteEventData {
  return 'note' in data
}