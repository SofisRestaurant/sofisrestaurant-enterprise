// =============================================================================
// PATH: src/modules/orders/components/kitchen/kitchen.order-mappers.ts
// =============================================================================

import type { Order } from '@/domain/orders/order.types';
import type { KitchenOrderWithType } from './kitchen.types';

export function mapToKitchenOrder(order: Order, rawOrderType?: unknown): KitchenOrderWithType {
  return {
    id: order.id,
    created_at: order.created_at,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    amount_total: order.amount_total,
    status: order.status,
    cart_items: order.cart_items ?? [],
    assigned_to: order.assigned_to ?? null,
    order_type: typeof rawOrderType === 'string' ? rawOrderType : undefined,
  };
}