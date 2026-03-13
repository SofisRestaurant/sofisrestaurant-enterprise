import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/supabaseClient';
import type { Database } from '@/types/supabase';

import type {
  AdminOrder,
  AdminOrderStatus,
  OrderAdminFlags,
  OrderStatus,
  RawOrder,
} from '../types/index';
import type { ApiResult } from './order-payments.api';

import { buildFlags, computeEvidenceCompleteness, mapRawOrder } from '../mappers/orders.admin.mappers';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  ORDER_SELECT,
  type EvidenceLookupRow,
  type RiskLookupRow,
  fail,
  fetchOrderById,
  isHighRiskLevel,
  isOpenOrderStatus,
  isSupportedAdminOrderStatus,
  nonEmptyString,
  normalizeAdminOrderStatus,
  ok,
  validateUuidLike,
} from './orders.shared';

export type OrderRow = Database['public']['Tables']['orders']['Row'];

export interface AdminMetrics {
  totalRevenue: number;
  totalOrders: number;
  todayRevenue: number;
  todayOrders: number;
  averageOrderValue: number;
  openOrders: number;
}

export interface FetchAdminOrderRowsParams {
  limit?: number;
}

export interface OrderListParams {
  page?: number;
  pageSize?: number;
  status?: OrderStatus | 'all';
  disputedOnly?: boolean;
  refundedOnly?: boolean;
  highRiskOnly?: boolean;
  proofMissingOnly?: boolean;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface OrderListResult {
  orders: Array<AdminOrder & { flags: OrderAdminFlags }>;
  totalCount: number;
  page: number;
  totalPages: number;
}

export interface UpdateOrderStatusResult {
  order: AdminOrder;
}

export interface AssignOrderToStaffResult {
  orderId: string;
  staffId: string;
  assignedAt: Date;
}

interface AdminMetricsRow {
  amount_total: number | null;
  created_at: string | null;
  status: string | null;
}

async function fetchRiskLookupMap(
  client: SupabaseClient,
  orderIds: readonly string[],
): Promise<ApiResult<Map<string, string | null>>> {
  if (orderIds.length === 0) {
    return ok(new Map<string, string | null>());
  }

  const { data, error } = await client
    .from('order_payment_details')
    .select('order_id, risk_level')
    .in('order_id', orderIds)
    .returns<RiskLookupRow[]>();

  if (error !== null) {
    return fail(error);
  }

  const riskMap = new Map<string, string | null>();

  for (const row of data ?? []) {
    const orderId = nonEmptyString(row.order_id);

    if (orderId !== null) {
      riskMap.set(orderId, nonEmptyString(row.risk_level));
    }
  }

  return ok(riskMap);
}

async function fetchEvidenceLookupMap(
  client: SupabaseClient,
  orderIds: readonly string[],
): Promise<ApiResult<Map<string, number>>> {
  if (orderIds.length === 0) {
    return ok(new Map<string, number>());
  }

  const { data, error } = await client
    .from('order_fulfillment_evidence')
    .select(
      [
        'order_id',
        'evidence_status',
        'handoff_type',
        'recipient_name',
        'picked_up_by_name',
        'pickup_pin_verified_at',
        'out_for_delivery_at',
        'delivered_at',
        'delivery_photo_url',
        'signature_url',
        'gps_lat',
        'gps_lng',
      ].join(', '),
    )
    .in('order_id', orderIds)
    .returns<EvidenceLookupRow[]>();

  if (error !== null) {
    return fail(error);
  }

  const scoreMap = new Map<string, number>();

  for (const row of data ?? []) {
    const orderId = nonEmptyString(row.order_id);

    if (orderId !== null) {
      scoreMap.set(orderId, computeEvidenceCompleteness(row));
    }
  }

  return ok(scoreMap);
}

async function resolveCandidateOrderIds(
  client: SupabaseClient,
  params: OrderListParams,
): Promise<ApiResult<Set<string> | null>> {
  const activeRiskFilter = params.highRiskOnly === true;
  const activeProofFilter = params.proofMissingOnly === true;

  if (!activeRiskFilter && !activeProofFilter) {
    return ok<Set<string> | null>(null);
  }

  let candidateIds: Set<string> | null = null;

  if (activeRiskFilter) {
    const { data, error } = await client
      .from('order_payment_details')
      .select('order_id, risk_level')
      .returns<RiskLookupRow[]>();

    if (error !== null) {
      return fail(error);
    }

    const riskIds = new Set<string>();

    for (const row of data ?? []) {
      const orderId = nonEmptyString(row.order_id);

      if (orderId !== null && isHighRiskLevel(row.risk_level)) {
        riskIds.add(orderId);
      }
    }

    candidateIds = riskIds;
  }

  if (activeProofFilter) {
    const { data, error } = await client
      .from('order_fulfillment_evidence')
      .select(
        [
          'order_id',
          'evidence_status',
          'handoff_type',
          'recipient_name',
          'picked_up_by_name',
          'pickup_pin_verified_at',
          'out_for_delivery_at',
          'delivered_at',
          'delivery_photo_url',
          'signature_url',
          'gps_lat',
          'gps_lng',
        ].join(', '),
      )
      .returns<EvidenceLookupRow[]>();

    if (error !== null) {
      return fail(error);
    }

    const proofIds = new Set<string>();

    for (const row of data ?? []) {
      const orderId = nonEmptyString(row.order_id);

      if (orderId !== null && computeEvidenceCompleteness(row) < 60) {
        proofIds.add(orderId);
      }
    }

    candidateIds =
      candidateIds === null
        ? proofIds
        : new Set(Array.from(candidateIds).filter((value) => proofIds.has(value)));
  }

  return ok(candidateIds ?? new Set<string>());
}

export async function fetchAdminMetrics(): Promise<AdminMetrics> {
  const { data, error } = await supabase
    .from('orders')
    .select('amount_total, created_at, status')
    .returns<AdminMetricsRow[]>();

  if (error !== null) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const totalOrders = rows.length;
  const totalRevenue = rows.reduce((sum, row) => sum + (row.amount_total ?? 0), 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let todayOrders = 0;
  let todayRevenue = 0;
  let openOrders = 0;

  for (const row of rows) {
    const createdAt = row.created_at === null ? null : new Date(row.created_at);
    const status = normalizeAdminOrderStatus(row.status);

    if (
      createdAt !== null &&
      !Number.isNaN(createdAt.getTime()) &&
      createdAt.getTime() >= today.getTime()
    ) {
      todayOrders += 1;
      todayRevenue += row.amount_total ?? 0;
    }

    if (isOpenOrderStatus(status)) {
      openOrders += 1;
    }
  }

  return {
    totalRevenue,
    totalOrders,
    todayRevenue,
    todayOrders,
    averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
    openOrders,
  };
}

export async function fetchAdminOrderRows(
  params: FetchAdminOrderRowsParams = {},
): Promise<OrderRow[]> {
  const limit = params.limit ?? 100;

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<OrderRow[]>();

  if (error !== null) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function updateOrderStatusRow(
  orderId: string,
  status: OrderStatus,
): Promise<OrderRow> {
  const { data, error } = await supabase
    .from('orders')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select('*')
    .maybeSingle<OrderRow>();

  if (error !== null) {
    throw new Error(error.message);
  }

  if (data === null) {
    throw new Error('Order not found');
  }

  return data;
}

export async function fetchAdminOrders(
  client: SupabaseClient,
  params: OrderListParams = {},
): Promise<ApiResult<OrderListResult>> {
  try {
    const page = params.page && params.page > 0 ? Math.floor(params.page) : DEFAULT_PAGE;
    const pageSize =
      params.pageSize && params.pageSize > 0 ? Math.floor(params.pageSize) : DEFAULT_PAGE_SIZE;

    const candidateIdsResult = await resolveCandidateOrderIds(client, params);

    if (candidateIdsResult.error !== null) {
      return fail(candidateIdsResult.error);
    }

    const candidateIds = candidateIdsResult.data;

    if (candidateIds !== null && candidateIds.size === 0) {
      return ok({
        orders: [],
        totalCount: 0,
        page,
        totalPages: 0,
      });
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = client
      .from('orders')
      .select(ORDER_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (params.status !== undefined && params.status !== 'all') {
      query = query.eq('status', String(params.status));
    }

    if (params.disputedOnly === true) {
      query = query.not('dispute_status', 'in', '("none","won","lost","charge_refunded")');
    }

    if (params.refundedOnly === true) {
      query = query.in('payment_status', ['refunded', 'partially_refunded']);
    }

    if (params.dateFrom !== undefined && params.dateFrom.length > 0) {
      query = query.gte('created_at', params.dateFrom);
    }

    if (params.dateTo !== undefined && params.dateTo.length > 0) {
      query = query.lte('created_at', params.dateTo);
    }

    const search = nonEmptyString(params.search);

    if (search !== null) {
      query = query.or(
        [
          `id.ilike.${search}%`,
          `stripe_payment_intent_id.ilike.${search}%`,
          `stripe_checkout_session_id.ilike.${search}%`,
          `stripe_charge_id.ilike.${search}%`,
        ].join(','),
      );
    }

    if (candidateIds !== null) {
      query = query.in('id', Array.from(candidateIds));
    }

    const { data, error, count } = await query.returns<RawOrder[]>();

    if (error !== null) {
      return fail(error);
    }

    const rawOrders = data ?? [];
    const orderIds = rawOrders
      .map((row) => nonEmptyString(row.id))
      .filter((value): value is string => value !== null);

    const [riskLookupResult, evidenceLookupResult] = await Promise.all([
      fetchRiskLookupMap(client, orderIds),
      fetchEvidenceLookupMap(client, orderIds),
    ]);

    if (riskLookupResult.error !== null) {
      return fail(riskLookupResult.error);
    }

    if (evidenceLookupResult.error !== null) {
      return fail(evidenceLookupResult.error);
    }

    const riskMap = riskLookupResult.data;
    const evidenceMap = evidenceLookupResult.data;

    const orders = rawOrders
      .map((rawOrder) => {
        const order = mapRawOrder(rawOrder);
        const riskLevel = riskMap.get(order.id) ?? null;
        const evidenceScore =
          evidenceMap.has(order.id) ? (evidenceMap.get(order.id) ?? null) : null;
        const flags = buildFlags(order, riskLevel, evidenceScore);

        order.isHighRisk = flags.isHighRisk;
        order.hasProofMissing = flags.isProofMissing;

        return {
          ...order,
          flags,
        };
      })
      .filter((row) => !params.highRiskOnly || row.flags.isHighRisk)
      .filter((row) => !params.proofMissingOnly || row.flags.isProofMissing);

    const totalCount = count ?? orders.length;
    const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);

    return ok({
      orders,
      totalCount,
      page,
      totalPages,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function updateOrderStatus(
  client: SupabaseClient,
  orderId: string,
  status: AdminOrderStatus | OrderStatus,
): Promise<ApiResult<UpdateOrderStatusResult>> {
  try {
    const orderIdValidation = validateUuidLike(orderId, 'orderId');

    if ('error' in orderIdValidation) {
      return orderIdValidation;
    }

    const normalizedStatus = normalizeAdminOrderStatus(status);

    if (!isSupportedAdminOrderStatus(normalizedStatus)) {
      return fail({
        message: 'status must be a supported admin order status',
        code: 'VALIDATION_ERROR',
      });
    }

    const nowIso = new Date().toISOString();

    const { error } = await client
      .from('orders')
      .update({
        status: normalizedStatus,
        updated_at: nowIso,
      })
      .eq('id', orderIdValidation.value);

    if (error !== null) {
      return fail(error);
    }

    const refreshedOrderResult = await fetchOrderById(client, orderIdValidation.value);

    if (refreshedOrderResult.error !== null) {
      return fail(refreshedOrderResult.error);
    }

    return ok({
      order: mapRawOrder(refreshedOrderResult.data),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function assignOrderToStaff(
  client: SupabaseClient,
  orderId: string,
  staffId: string,
): Promise<ApiResult<AssignOrderToStaffResult>> {
  try {
    const orderIdValidation = validateUuidLike(orderId, 'orderId');

    if ('error' in orderIdValidation) {
      return orderIdValidation;
    }

    const staffIdValidation = validateUuidLike(staffId, 'staffId');

    if ('error' in staffIdValidation) {
      return staffIdValidation;
    }

    const assignedAt = new Date();
    const assignedAtIso = assignedAt.toISOString();

    const { error } = await client
      .from('orders')
      .update({
        assigned_staff_id: staffIdValidation.value,
        updated_at: assignedAtIso,
      })
      .eq('id', orderIdValidation.value);

    if (error !== null) {
      return fail(error);
    }

    return ok({
      orderId: orderIdValidation.value,
      staffId: staffIdValidation.value,
      assignedAt,
    });
  } catch (error) {
    return fail(error);
  }
}