// src/types/order.ts
export interface OrderItem {
  id: string
  menuItemId: string
  name: string
  price: number
  quantity: number
}

export interface Order {
  id: string
  userId?: string
  items: OrderItem[]
  subtotal: number
  tax: number
  total: number
  status: OrderStatus
  paymentIntentId?: string
  createdAt: string
  updatedAt: string
  customerEmail?: string
  customerName?: string
  deliveryAddress?: string
  notes?: string
}

export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  PREPARING = 'preparing',
  READY = 'ready',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}