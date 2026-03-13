import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/supabase';

import type { AdminOrder, DisputeEvent, OrderAdminFlags, RawOrder } from '../types/index';
import type { ApiResult } from './order-payments.api';

import {
  type EvidenceReadRow,
  ORDER_SELECT,
  type FulfillmentEvidenceModel,
  type PaymentDetailModel,
  type PaymentDetailReadRow,
  type RawDisputeEventRow,
  fail,
  isNoRowsError,
  ok,
} from './orders.shared';
import {
  buildFlags,
  buildTimeline,
  mapDisputeEvent,
  mapFulfillmentEvidence,
  mapPaymentDetail,
  mapPaymentSummary,
  mapRawOrder,
} from '../mappers/orders.admin.mappers';

type AppSupabaseClient = SupabaseClient<Database>;

const ORDER_FULFILLMENT_EVIDENCE_SELECT = [
  'order_id',
  'evidence_status',
  'handoff_type',
  'recipient_name',
  'handoff_notes',
  'staff_verified_by',
  'pickup_pin_verified_at',
  'picked_up_by_name',
  'out_for_delivery_at',
  'delivered_at',
  'delivery_photo_url',
  'signature_url',
  'gps_lat',
  'gps_lng',
  'created_at',
  'updated_at',
].join(', ');

const ORDER_DISPUTE_EVENTS_SELECT = [
  'id',
  'order_id',
  'dispute_id',
  'event_type',
  'event_source',
  'previous_status',
  'new_status',
  'previous_amount_cents',
  'new_amount_cents',
  'actor_name',
  'actor_role',
  'note',
  'evidence_urls',
  'evidence_labels',
  'metadata',
  'occurred_at',
  'stripe_payment_intent_id',
  'dispute_status',
  'dispute_due_by',
].join(', ');

export interface FullOrderDetail {
  order: AdminOrder;
  flags: OrderAdminFlags;
  paymentSummary: ReturnType<typeof mapPaymentSummary> | null;
  paymentDetail: PaymentDetailModel | null;
  evidence: FulfillmentEvidenceModel | null;
  disputeEvents: DisputeEvent[];
  timeline: ReturnType<typeof buildTimeline>;
}

export type FullOrderDetailResult = ApiResult<FullOrderDetail>;

function notFoundError(message: string): { message: string; code: string } {
  return {
    message,
    code: 'NOT_FOUND',
  };
}

async function fetchOrderPaymentDetail(
  client: AppSupabaseClient,
  orderId: string,
  rawOrder: RawOrder,
): Promise<ApiResult<PaymentDetailModel | null>> {
  const { data, error } = await client
    .from('order_payment_details')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle<PaymentDetailReadRow>();

  if (error !== null && !isNoRowsError(error)) {
    return fail(error);
  }

  if (data === null) {
    return ok(mapPaymentDetail(rawOrder, null));
  }

  return ok(mapPaymentDetail(rawOrder, data));
}

async function fetchOrderFulfillmentEvidence(
  client: AppSupabaseClient,
  orderId: string,
): Promise<ApiResult<FulfillmentEvidenceModel | null>> {
  const { data, error } = await client
    .from('order_fulfillment_evidence')
    .select(ORDER_FULFILLMENT_EVIDENCE_SELECT)
    .eq('order_id', orderId)
    .maybeSingle<EvidenceReadRow>();

  if (error !== null && !isNoRowsError(error)) {
    return fail(error);
  }

  if (data === null) {
    return ok(null);
  }

  return ok(mapFulfillmentEvidence(data));
}

async function fetchOrderDisputeEvents(
  client: AppSupabaseClient,
  orderId: string,
): Promise<ApiResult<DisputeEvent[]>> {
  const { data, error } = await client
    .from('order_dispute_events')
    .select(ORDER_DISPUTE_EVENTS_SELECT)
    .eq('order_id', orderId)
    .order('occurred_at', { ascending: true })
    .returns<RawDisputeEventRow[]>();

  if (error !== null) {
    return fail(error);
  }

  return ok((data ?? []).map(mapDisputeEvent));
}

async function fetchRawOrder(
  client: AppSupabaseClient,
  orderId: string,
): Promise<ApiResult<RawOrder>> {
  const { data, error } = await client
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .maybeSingle<RawOrder>();

  if (error !== null) {
    return fail(error);
  }

  if (data === null) {
    return fail(notFoundError('Order not found'));
  }

  return ok(data);
}

export async function fetchFullOrderDetail(
  client: AppSupabaseClient,
  orderId: string,
): Promise<FullOrderDetailResult> {
  try {
    const [rawOrderResult, disputeEventsResult] = await Promise.all([
      fetchRawOrder(client, orderId),
      fetchOrderDisputeEvents(client, orderId),
    ]);

    if (rawOrderResult.error !== null) {
      return fail(rawOrderResult.error);
    }

    if (disputeEventsResult.error !== null) {
      return fail(disputeEventsResult.error);
    }

    const rawOrder = rawOrderResult.data;
    const order = mapRawOrder(rawOrder);

    const [paymentDetailResult, evidenceResult] = await Promise.all([
      fetchOrderPaymentDetail(client, orderId, rawOrder),
      fetchOrderFulfillmentEvidence(client, orderId),
    ]);

    if (paymentDetailResult.error !== null) {
      return fail(paymentDetailResult.error);
    }

    if (evidenceResult.error !== null) {
      return fail(evidenceResult.error);
    }

    const paymentSummary = mapPaymentSummary(rawOrder);
    const paymentDetail = paymentDetailResult.data;
    const evidence = evidenceResult.data;
    const disputeEvents = disputeEventsResult.data;

    const riskLevel = paymentDetail?.riskLevel ?? null;
    const evidenceScore = evidence?.evidenceCompletenessScore ?? null;
    const flags = buildFlags(order, riskLevel, evidenceScore);

    order.isHighRisk = flags.isHighRisk;
    order.hasProofMissing = flags.isProofMissing;

    const timeline = buildTimeline(order, paymentSummary, evidence, disputeEvents);

    return ok({
      order,
      flags,
      paymentSummary,
      paymentDetail,
      evidence,
      disputeEvents,
      timeline,
    });
  } catch (error: unknown) {
    return fail(error);
  }
}

export default fetchFullOrderDetail;