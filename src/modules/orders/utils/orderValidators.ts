import type { Tables } from '@/types/supabase';

type OrderRow = Tables<'orders'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === 'boolean';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Type guard for a Supabase order row.
 * Ensures the object matches required fields for your app and RLS.
 */
export function isOrderRow(value: unknown): value is OrderRow {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    typeof value.user_id === 'string' && // RLS key field
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    typeof value.currency === 'string' &&
    typeof value.order_type === 'string' &&
    typeof value.payment_status === 'string' &&
    typeof value.status === 'string' &&
    typeof value.stripe_session_id === 'string' &&
    isFiniteNumber(value.amount_shipping) &&
    isFiniteNumber(value.amount_subtotal) &&
    isFiniteNumber(value.amount_tax) &&
    isFiniteNumber(value.amount_total) &&
    isNullableString(value.assigned_to) &&
    isNullableString(value.customer_email) &&
    isNullableString(value.customer_name) &&
    isNullableString(value.customer_phone) &&
    isNullableString(value.customer_uid) &&
    isNullableString(value.notes) &&
    isNullableString(value.shipping_name) &&
    isNullableString(value.shipping_phone) &&
    isNullableString(value.stripe_payment_intent_id) &&
    isNullableBoolean(value.is_deleted ?? null)
  );
}