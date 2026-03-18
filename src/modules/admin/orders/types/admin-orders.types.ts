// =============================================================================
// PATH: src/modules/admin/orders/admin-orders.types.ts
// =============================================================================

export interface CartItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
  menuItemId: string;
  modifiers?: { id: string }[];
}

// Optional: define type for raw backend item
export interface RawItem {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface AdminOrder {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  orderType: string | null;
  status: string;
  paymentStatus: string;
  amountSubtotalCents: number;
  amountTaxCents: number;
  amountTotalCents: number;
  createdAt: string;
  notes: string | null;
  stripePaymentIntentId: string | null;
  cartItems: CartItem[];
}

export type PriorityLevel = 'normal' | 'high' | 'urgent';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';