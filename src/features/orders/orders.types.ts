import type { Database } from '@/types/supabase';
import type { Order, OrderCartItem, OrderType, PaymentStatus } from '@/domain/orders/order.types';

export type OrderRow = Database['public']['Tables']['orders']['Row'];
export type OrderInsert = Database['public']['Tables']['orders']['Insert'];
export type OrderUpdate = Database['public']['Tables']['orders']['Update'];

export type OrdersFilterTab =
  | 'all'
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export const ORDERS_FILTER_TABS: readonly OrdersFilterTab[] = [
  'all',
  'pending',
  'preparing',
  'ready',
  'delivered',
  'cancelled',
];

export interface OrdersPageResult {
  rows: Order[];
  count: number;
}

export interface AdminOrdersMetrics {
  totalRevenue: number;
  totalOrders: number;
  todayRevenue: number;
  todayOrders: number;
  averageOrderValue: number;
  openOrders: number;
}

export function isOrdersFilterTab(value: string): value is OrdersFilterTab {
  return ORDERS_FILTER_TABS.some((tab) => tab === value);
}

export function matchesOrderFilter(
  order: Pick<OrderRow, 'status'>,
  filter: OrdersFilterTab,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'pending':
      return order.status === 'confirmed';
    case 'preparing':
      return order.status === 'preparing';
    case 'ready':
      return order.status === 'ready';
    case 'delivered':
      return order.status === 'delivered';
    case 'cancelled':
      return order.status === 'cancelled';
  }
}

export function matchesOrderSearch(
  order: Pick<OrderRow, 'order_number' | 'customer_name' | 'customer_email' | 'customer_phone'>,
  rawSearch: string,
): boolean {
  const query = rawSearch.trim().toLowerCase();

  if (query.length === 0) {
    return true;
  }

  const orderNumber = order.order_number !== null ? String(order.order_number) : '';
  const customerName = order.customer_name?.toLowerCase() ?? '';
  const customerEmail = order.customer_email?.toLowerCase() ?? '';
  const customerPhone = order.customer_phone?.toLowerCase() ?? '';

  return (
    orderNumber.includes(query) ||
    customerName.includes(query) ||
    customerEmail.includes(query) ||
    customerPhone.includes(query)
  );
}

export type { Order, OrderCartItem, OrderType, PaymentStatus };