// =============================================================================
// PATH: src/modules/orders/components/kitchen/kitchen.types.ts
// =============================================================================

import type { KitchenOrder } from '@/domain/orders/order.types';
import type { Database } from '@/types/supabase';
import type { OrderStatus } from '@/domain/orders/order.types';

export type OrderRow = Database['public']['Tables']['orders']['Row'];
export type OrderType = 'pickup' | 'delivery' | 'dine_in';
export type UnknownRecord = Record<string, unknown>;

export interface KitchenOrderWithType extends KitchenOrder {
  order_type?: string;
}

export interface HandoffContext {
  orderId: string;
  orderType: OrderType;
  nextStatus: OrderStatus;
  staffId: string;
}

export interface DisplayModifierSelection {
  id: string;
  name: string;
  priceAdjustment: number;
  count: number;
}

export interface DisplayModifier {
  key: string;
  id: string | null;
  label: string;
  selections: DisplayModifierSelection[];
}

// ── Component prop types ──────────────────────────────────────────────────────

export interface KitchenColumnProps {
  title: string;
  color: string;
  orders: KitchenOrderWithType[];
  onAction?: (id: string) => void;
  actionLabel?: string;
  actionColor?: string;
  getTimeSince: (timestamp: string) => string;
}

export interface KitchenOrderCardProps {
  order: KitchenOrderWithType;
  onAction?: (id: string) => void;
  actionLabel?: string;
  actionColor?: string;
  getTimeSince: (timestamp: string) => string;
}

export interface KitchenOrderItemListProps {
  items: KitchenOrderWithType['cart_items'];
  orderId: string;
}

export interface KitchenHandoffModalProps {
  context: HandoffContext;
  onConfirm: (
    ctx: HandoffContext,
    recipientName: string,
    handoffNotes: string,
    pinVerified: boolean,
  ) => Promise<void>;
  onCancel: () => void;
}

export interface EvidenceStrengthBarProps {
  orderType: OrderType;
  hasRecipient: boolean;
  hasPinVerified: boolean;
  hasNotes: boolean;
}