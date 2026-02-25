// src/types/stripe.ts
export interface StripeCheckoutSession {
  id: string
  url: string
}

export interface StripeMetadata {
  orderId?: string
  userId?: string
  items?: string
}