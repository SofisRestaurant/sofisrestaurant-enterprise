// ============================================================================
// SECURE CHECKOUT TYPES — SERVER AUTHORITATIVE (2026)
// ============================================================================

/* =========================================================
   CHECKOUT ITEM (CLIENT → SERVER)
========================================================= */

/**
 * Minimal cart snapshot.
 * Client never sends prices or totals.
 * Server recalculates everything.
 */
export interface CheckoutItem {
  item_id: string
  quantity: number

  modifiers: {
    group_id: string
    selections: string[]
  }[]

  special_instructions?: string
  pricing_hash: string
}

/* =========================================================
   CHECKOUT REQUEST
========================================================= */

/* =========================================================
   CHECKOUT REQUEST
========================================================= */

export interface CheckoutData {
  items: CheckoutItem[]

  customer: {
    email: string
    name?: string
    phone?: string
    address?: string
    customer_uid?: string | null
  }

  paymentMethodId?: string

  successUrl: string
  cancelUrl: string
}
/* =========================================================
   CHECKOUT RESPONSE
========================================================= */

export interface CheckoutSession {
  id: string
  url: string
  status: 'open' | 'complete' | 'expired'
}
