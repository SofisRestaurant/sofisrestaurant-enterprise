// src/domain/checkout/checkout.types.ts
export interface CheckoutItem {
  menuItemId: string
  name: string
  price: number
  quantity: number
  specialInstructions?: string
  customizations?: string
}

export interface Address {
  street: string
  city: string
  state: string
  zipCode: string
  apartment?: string
}

export interface PaymentMethod {
  type: 'card' | 'cash' | 'digital_wallet'
  cardLast4?: string
  cardBrand?: string
}

export interface CheckoutData {
  items: CheckoutItem[]
  customerName: string
  customerEmail: string
  customerPhone: string
  deliveryAddress: Address
  paymentMethod: PaymentMethod
  specialInstructions?: string
  scheduledTime?: Date
  subtotal: number
  tax: number
  deliveryFee: number
  total: number
}