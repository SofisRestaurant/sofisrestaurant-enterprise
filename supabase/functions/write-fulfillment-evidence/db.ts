import { SupabaseClient } from "@supabase/supabase-js";
import type { ExistingEvidenceRow, JsonValue, OrderExistsRow } from './types.ts';

const EVIDENCE_COLUMNS = [
  'order_id',
  'fulfillment_type',
  'pickup_pin_verified_at',
  'picked_up_by_name',
  'picked_up_by_id_verified',
  'staff_verified_by',
  'staff_verified_at',
  'pickup_notes',
  'driver_id',
  'out_for_delivery_at',
  'delivered_at',
  'delivery_photo_url',
  'delivery_photo_taken_at',
  'delivery_photo_lat',
  'delivery_photo_lng',
  'signature_url',
  'signature_captured_at',
  'handoff_method',
  'handoff_notes',
  'recipient_name',
  'recipient_verified',
  'gps_lat',
  'gps_lng',
  'gps_recorded_at',
  'evidence_status',
  'handoff_type',
  'left_at_door',
].join(',');

export async function getOrderExists(
  serviceClient: SupabaseClient,
  orderId: string,
): Promise<{ data: OrderExistsRow | null; error: Error | null }> {
  const result = await serviceClient
    .from('orders')
    .select('id')
    .eq('id', orderId)
    .maybeSingle<OrderExistsRow>();

  return { data: result.data, error: result.error };
}

export async function getExistingEvidence(
  serviceClient: SupabaseClient,
  orderId: string,
): Promise<{ data: ExistingEvidenceRow | null; error: Error | null }> {
  const result = await serviceClient
    .from('order_fulfillment_evidence')
    .select(EVIDENCE_COLUMNS)
    .eq('order_id', orderId)
    .maybeSingle<ExistingEvidenceRow>();

  return { data: result.data, error: result.error };
}

export async function upsertEvidenceRow(
  serviceClient: SupabaseClient,
  row: Record<string, JsonValue>,
): Promise<{ data: { order_id: string } | null; error: Error | null }> {
  const result = await serviceClient
    .from('order_fulfillment_evidence')
    .upsert(row, { onConflict: 'order_id', ignoreDuplicates: false })
    .select('order_id')
    .single<{ order_id: string }>();

  return { data: result.data, error: result.error };
}