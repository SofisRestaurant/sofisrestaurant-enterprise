// src/features/checkout/checkout.types.ts
// ============================================================================
// CHECKOUT TYPES — PRODUCTION GRADE 2026
// ============================================================================

/* =========================================================
   CART ITEM
========================================================= */

/**
 * Individual item in checkout cart.
 * All prices are in CENTS (USD) to avoid floating point issues.
 */
export interface CheckoutItem {
  /** Unique cart item ID (client-generated) */
  id: string
  menuItemId: string
  name: string
  price: number
  quantity: number
  customizations?: string
  specialInstructions?: string
}

/* =========================================================
   CHECKOUT REQUEST
========================================================= */

/**
 * Complete checkout payload sent from frontend → Edge Function
 */
export interface CheckoutData {
  /* ------------------------
     Cart
  ------------------------- */

  /** Items to purchase */
  items: CheckoutItem[]

  /** Total amount in CENTS */
  total: number

  /* ------------------------
     Customer Info
  ------------------------- */

  /** Customer email (required) */
  email: string

  /** Full name (optional) */
  name?: string

  /** Phone number (optional) */
  phone?: string

  /** Delivery/billing address (optional) */
  address?: string

  /** User ID from auth system */
  customer_uid?: string | null

  /* ------------------------
     Payment
  ------------------------- */

  /** Saved Stripe payment method ID (optional) */
  paymentMethodId?: string

  /* ------------------------
     Redirects (REQUIRED)
  ------------------------- */

  /** Where to send user after successful payment */
  successUrl: string

  /** Where to send user if they cancel */
  cancelUrl: string
}

/* =========================================================
   CHECKOUT RESPONSE
========================================================= */

/**
 * Stripe checkout session details returned from Edge Function
 */
export interface CheckoutSession {
  /** Stripe session ID (e.g., "cs_test_...") */
  id: string

  /** Stripe-hosted checkout URL */
  url: string

  /** Session status */
  status: 'open' | 'complete' | 'expired'

  /** Total amount in cents (optional) */
  amount?: number

  /** Currency code (optional) */
  currency?: string

  /** Expiration timestamp (optional) */
  expiresAt?: string
}

/* =========================================================
   ERROR TYPES
========================================================= */

/**
 * Checkout-specific error with additional context
 */
export interface CheckoutError {
  /** Human-readable error message */
  message: string

  /** Error code for programmatic handling */
  code?: 
    | 'VALIDATION_ERROR'
    | 'NETWORK_ERROR'
    | 'AUTH_ERROR'
    | 'RATE_LIMIT'
    | 'SERVER_ERROR'
    | 'TIMEOUT'
    | 'INVALID_RESPONSE'

  /** Field that caused validation error (if applicable) */
  field?: string

  /** Whether error is retryable */
  retryable?: boolean

  /** Milliseconds to wait before retry */
  retryAfter?: number

  /** Raw error details for debugging */
  details?: unknown
}

/* =========================================================
   WEBHOOK TYPES (for order storage)
========================================================= */

/**
 * Order record stored after successful payment
 */
export interface Order {
  id: string
  created_at: string

  /* Stripe references */
  stripe_session_id: string
  stripe_payment_intent_id: string | null

  /* Customer */
  customer_uid: string | null
  customer_email: string | null
  customer_name: string | null
  customer_phone: string | null

  /* Amounts (in cents) */
  amount_subtotal: number
  amount_tax: number
  amount_shipping: number
  amount_total: number
  currency: string

  /* Order details */
  order_type: 'pickup' | 'delivery' | 'dine_in'
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded'
  status: 'new' | 'preparing' | 'ready' | 'completed' | 'cancelled'

  /* Cart items (JSON) */
  cart_items: CheckoutItem[]

  /* Metadata */
  metadata?: Record<string, unknown>
}

/* =========================================================
   STRIPE WEBHOOK EVENT TYPES
========================================================= */

export type StripeWebhookEvent =
  | 'checkout.session.completed'
  | 'checkout.session.expired'
  | 'payment_intent.succeeded'
  | 'payment_intent.failed'
  | 'charge.refunded'

/* =========================================================
   ANALYTICS EVENTS
========================================================= */

export interface CheckoutAnalyticsEvent {
  event: 
    | 'checkout_started'
    | 'checkout_session_created'
    | 'checkout_session_failed'
    | 'checkout_completed'
    | 'checkout_abandoned'

  properties: {
    session_id?: string
    customer_uid?: string
    items_count?: number
    total_cents?: number
    duration_ms?: number
    error?: string
  }
}

/* =========================================================
   RUNTIME VALIDATION SCHEMAS (optional - for zod/yup)
========================================================= */

/**
 * Example Zod schema (if using runtime validation)
 * 
 * import { z } from 'zod'
 * 
 * export const CheckoutItemSchema = z.object({
 *   id: z.string().min(1).max(100),
 *   menuItemId: z.string().uuid(),
 *   name: z.string().min(1).max(200),
 *   price: z.number().int().min(0),
 *   quantity: z.number().int().min(1).max(100),
 *   customizations: z.string().max(500).optional(),
 *   specialInstructions: z.string().max(500).optional(),
 * })
 * 
 * export const CheckoutDataSchema = z.object({
 *   items: z.array(CheckoutItemSchema).min(1).max(100),
 *   total: z.number().int().min(50),
 *   email: z.string().email(),
 *   name: z.string().max(100).optional(),
 *   phone: z.string().max(20).optional(),
 *   address: z.string().max(500).optional(),
 *   customer_uid: z.string().uuid().optional(),
 *   successUrl: z.string().url(),
 *   cancelUrl: z.string().url(),
 * })
 */