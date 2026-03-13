import { supabase } from '@/lib/supabase/supabaseClient';

import type { KitchenOrderWithType, OrderType } from './kitchen.types';
import { PaymentStatus } from '@/domain/orders/order.types';

export function normalizeOrderType(value: unknown): OrderType {
  if (value === 'delivery') {
    return 'delivery';
  }

  if (value === 'dine_in') {
    return 'dine_in';
  }

  return 'pickup';
}

export function isPaidPaymentStatus(value: unknown): boolean {
  return value === PaymentStatus.PAID || value === 'paid';
}

export async function resolveStaffId(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export function sortOrdersByCreatedAtDesc(
  orders: readonly KitchenOrderWithType[],
): KitchenOrderWithType[] {
  return [...orders].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
}