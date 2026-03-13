// src/modules/orders/api/orders.customer.api.ts
// ============================================================================
// Customer orders API
// ----------------------------------------------------------------------------
// Customer-facing order history / self-service reads only.
// Safe to import through the public barrel at:
//   '@/modules/orders/api/orders.api'
// ============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';
import type { Database } from '@/types/supabase';

export type OrderRow = Database['public']['Tables']['orders']['Row'];

export interface FetchOrdersByCustomerParams {
  customerUid: string;
  page?: number;
  pageSize?: number;
  includeUnpaid?: boolean;
}

export interface FetchOrdersByCustomerResult {
  rows: OrderRow[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

function normalizeCustomerUid(value: string): string {
  return value.trim();
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Fetch paginated orders for a single customer UID.
 *
 * Notes:
 * - Uses the generated Database order row shape directly.
 * - Server-side pagination via range() + count.
 * - Defaults to paid/refunded/disputed-style customer-visible history unless
 *   includeUnpaid is explicitly enabled.
 */
export async function fetchOrdersByCustomer(
  params: FetchOrdersByCustomerParams,
): Promise<FetchOrdersByCustomerResult> {
  const customerUid = normalizeCustomerUid(params.customerUid);
  const page = Math.max(0, Math.floor(params.page ?? 0));
  const pageSize = Math.max(1, Math.floor(params.pageSize ?? 10));
  const includeUnpaid = params.includeUnpaid === true;

  if (customerUid.length === 0) {
    throw new Error('customerUid is required');
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;

  const baseQuery = supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .eq('customer_uid', customerUid)
    .order('created_at', { ascending: false })
    .range(from, to);

  const result = includeUnpaid
    ? await baseQuery.returns<OrderRow[]>()
    : await baseQuery
        .in('payment_status', ['paid', 'refunded', 'partially_refunded', 'disputed'])
        .returns<OrderRow[]>();

  if (result.error !== null) {
    throw new Error(getErrorMessage(result.error, 'Failed to fetch customer orders'));
  }

  const count = result.count ?? 0;
  const totalPages = count === 0 ? 0 : Math.ceil(count / pageSize);

  return {
    rows: result.data ?? [],
    count,
    page,
    pageSize,
    totalPages,
    hasNextPage: page + 1 < totalPages,
    hasPreviousPage: page > 0,
  };
}