import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import type {
  AdminOrder,
  AdminOrderStatus,
  DisputeEventSource,
  DisputeStatus,
  RawDisputeEvent,
  RawOrder,
  TimelineEventKind,
  TimelineEventSeverity,
} from '../types/index';

import type { ApiResult } from './order-payments.api';

export interface PaymentSummaryModel {
  orderId: string;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
  stripeChargeId: string | null;
  stripeCustomerId: string | null;
  paymentStatus: string;
  paymentMethodType: string | null;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  totalCents: number;
  amountReceivedCents: number;
  refundedAmountCents: number;
  netAmountCents: number;
  subtotalFormatted: string;
  taxFormatted: string;
  tipFormatted: string;
  discountFormatted: string;
  deliveryFeeFormatted: string;
  serviceFeeFormatted: string;
  totalFormatted: string;
  amountReceivedFormatted: string;
  refundedAmountFormatted: string;
  netAmountFormatted: string;
  disputeStatus: DisputeStatus;
  disputedAt: Date | null;
  disputeDueBy: Date | null;
  disputeReason: string | null;
  disputeAmountCents: number;
  disputeAmountFormatted: string;
  chargeCapturedAt: Date | null;
  paymentFailedAt: Date | null;
  refundedAt: Date | null;
  lastPaymentError: string | null;
  isCaptured: boolean;
  isRefunded: boolean;
  isDisputed: boolean;
}

export interface PaymentDetailModel extends PaymentSummaryModel {
  riskLevel: string | null;
  riskScore: number | null;
  sellerMessage: string | null;
  outcomeType: string | null;
  outcomeReason: string | null;
  receiptUrl: string | null;
  receiptNumber: string | null;
  paymentMethodId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
  cardFunding: string | null;
  cardCountry: string | null;
  cardFingerprint: string | null;
  walletType: string | null;
  network: string | null;
  cvcCheck: string | null;
  avsLine1Check: string | null;
  avsZipCheck: string | null;
  threeDsResult: string | null;
  evidenceStatus: string | null;
  disputeId: string | null;
}

export interface FulfillmentEvidenceModel {
  orderId: string;
  evidenceStatus: string;
  handoffType: string;
  recipientName: string | null;
  pickedUpByName: string | null;
  handoffNotes: string | null;
  staffVerifiedBy: string | null;
  pickupPinVerifiedAt: Date | null;
  outForDeliveryAt: Date | null;
  deliveredAt: Date | null;
  deliveryPhotoUrl: string | null;
  signatureUrl: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  evidenceCompletenessScore: number;
  hasDeliveryPhoto: boolean;
  hasSignature: boolean;
  hasGps: boolean;
  hasPickupVerification: boolean;
}

export interface RiskLookupRow {
  order_id: string | null;
  risk_level: string | null;
}

export interface EvidenceLookupRow {
  order_id: string | null;
  evidence_status: string | null;
  handoff_type: string | null;
  recipient_name: string | null;
  picked_up_by_name: string | null;
  pickup_pin_verified_at: string | null;
  out_for_delivery_at: string | null;
  delivered_at: string | null;
  delivery_photo_url: string | null;
  signature_url: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
}

export interface EvidenceReadRow extends EvidenceLookupRow {
  handoff_notes: string | null;
  staff_verified_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PaymentDetailReadRow {
  order_id: string | null;
  payment_intent_id?: string | null;
  stripe_payment_intent_id?: string | null;
  payment_method_id?: string | null;
  payment_method_type?: string | null;
  card_brand?: string | null;
  card_last4?: string | null;
  card_exp_month?: number | null;
  card_exp_year?: number | null;
  card_funding?: string | null;
  card_country?: string | null;
  card_fingerprint?: string | null;
  wallet_type?: string | null;
  network?: string | null;
  cvc_check?: string | null;
  avs_line1_check?: string | null;
  avs_zip_check?: string | null;
  risk_level?: string | null;
  risk_score?: number | null;
  seller_message?: string | null;
  outcome_type?: string | null;
  outcome_reason?: string | null;
  receipt_url?: string | null;
  receipt_number?: string | null;
  three_ds_result?: string | null;
  evidence_status?: string | null;
  dispute_id?: string | null;
}

export interface RawDisputeEventRow extends RawDisputeEvent {
  orders?: {
    stripe_payment_intent_id?: string | null;
    total_cents?: number | null;
    dispute_due_by?: string | null;
    dispute_status?: string | null;
  } | null;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 50;
export const PROOF_MISSING_THRESHOLD = 60;

export const CLOSED_DISPUTE_STATUSES = new Set<string>([
  'none',
  'won',
  'lost',
  'charge_refunded',
]);

export const OPEN_DISPUTE_STATUSES = new Set<string>([
  'needs_response',
  'warning_needs_response',
  'under_review',
  'warning_under_review',
]);

export const ORDER_SELECT = [
  'id',
  'user_id',
  'status',
  'fulfillment_type',
  'created_at',
  'updated_at',
  'stripe_payment_intent_id',
  'stripe_checkout_session_id',
  'stripe_charge_id',
  'stripe_customer_id',
  'payment_status',
  'payment_method_type',
  'currency',
  'subtotal_cents',
  'tax_cents',
  'tip_cents',
  'discount_cents',
  'delivery_fee_cents',
  'service_fee_cents',
  'total_cents',
  'amount_received_cents',
  'refunded_amount_cents',
  'net_amount_cents',
  'dispute_status',
  'disputed_at',
  'dispute_due_by',
  'dispute_reason',
  'dispute_amount_cents',
  'charge_captured_at',
  'payment_failed_at',
  'refunded_at',
  'last_payment_error',
].join(', ');

export function ok<T>(data: T): ApiResult<T> {
  return { data, error: null };
}

export function fail<T = never>(error: unknown): ApiResult<T> {
  return { data: null, error: normalizeError(error) };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isPostgrestError(value: unknown): value is PostgrestError {
  return (
    isRecord(value) &&
    typeof value.message === 'string' &&
    'details' in value &&
    'hint' in value &&
    typeof value.code === 'string'
  );
}

export function normalizeError(error: unknown): { message: string; code: string } {
  if (isPostgrestError(error)) {
    return {
      message: error.message,
      code: nonEmptyStringOrDefault(error.code, 'POSTGREST_ERROR'),
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: 'ERROR',
    };
  }

  if (isRecord(error)) {
    return {
      message: nonEmptyStringOrDefault(error.message, 'Unknown error'),
      code: nonEmptyStringOrDefault(error.code, 'UNKNOWN'),
    };
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown error',
    code: 'UNKNOWN',
  };
}

export function normalizeToken(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function nonEmptyStringOrDefault(value: unknown, fallback: string): string {
  return nonEmptyString(value) ?? fallback;
}

export function numberOrZero(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return 0;
}

export function nullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function parseDate(value: unknown): Date | null {
  const input = nonEmptyString(value);

  if (input === null) {
    return null;
  }

  const candidate = input.includes('T') ? input : `${input}T00:00:00.000Z`;
  const parsed = new Date(candidate);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)}`;
  }
}

export function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function normalizeAdminOrderStatus(value: unknown): AdminOrderStatus {
  switch (normalizeToken(value)) {
    case 'confirmed':
      return 'confirmed';
    case 'preparing':
      return 'preparing';
    case 'ready':
      return 'ready';
    case 'shipped':
      return 'shipped';
    case 'delivered':
      return 'delivered';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'pending';
  }
}

export function isSupportedAdminOrderStatus(value: unknown): value is AdminOrderStatus {
  return normalizeAdminOrderStatus(value) === normalizeToken(value);
}

export function normalizeDisputeStatus(value: unknown): DisputeStatus {
  switch (normalizeToken(value)) {
    case 'needs_response':
      return 'needs_response';
    case 'warning_needs_response':
      return 'warning_needs_response';
    case 'under_review':
      return 'under_review';
    case 'warning_under_review':
      return 'warning_under_review';
    case 'won':
      return 'won';
    case 'lost':
      return 'lost';
    case 'charge_refunded':
      return 'charge_refunded';
    default:
      return 'none';
  }
}

export function isRefundedPaymentStatus(value: unknown): boolean {
  const token = normalizeToken(value);
  return token === 'refunded' || token === 'partially_refunded';
}

export function isFailedPaymentStatus(value: unknown): boolean {
  return normalizeToken(value) === 'failed';
}

export function isHighRiskLevel(value: unknown): boolean {
  const token = normalizeToken(value);
  return token === 'elevated' || token === 'highest';
}

export function normalizeTimelineKind(value: string): TimelineEventKind {
  switch (value) {
    case 'order_created':
      return 'order_created';
    case 'payment_captured':
      return 'payment_captured';
    case 'payment_failed':
      return 'payment_failed';
    case 'refund_issued':
      return 'refund_issued';
    case 'order_fulfilled':
      return 'order_fulfilled';
    case 'delivery_completed':
      return 'delivery_completed';
    case 'pickup_verified':
      return 'pickup_verified';
    case 'dispute_created':
      return 'dispute_created';
    case 'dispute_updated':
      return 'dispute_updated';
    case 'dispute_closed':
      return 'dispute_closed';
    case 'evidence_submitted':
      return 'evidence_submitted';
    default:
      return 'admin_note';
  }
}

export function normalizeTimelineSeverity(value: string): TimelineEventSeverity {
  switch (value) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
    case 'info':
      return 'info';
    default:
      return 'neutral';
  }
}

export function normalizeDisputeEventType(
  value: unknown,
): import('../types/index').DisputeEvent['eventType'] {
  switch (normalizeToken(value)) {
    case 'dispute_created':
      return 'dispute_created';
    case 'dispute_updated':
      return 'dispute_updated';
    case 'dispute_closed':
      return 'dispute_closed';
    case 'evidence_submitted':
      return 'evidence_submitted';
    default:
      return 'admin_note_added';
  }
}

export function normalizeDisputeEventSource(value: unknown): DisputeEventSource {
  switch (normalizeToken(value)) {
    case 'admin':
    case 'customer':
    case 'stripe':
    default:
      return 'system';
  }
}

export function isNoRowsError(error: PostgrestError | null): boolean {
  if (error === null) {
    return false;
  }

  return error.code === 'PGRST116';
}

export function uniqueStrings(values: readonly (string | null)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (value !== null && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
}

export function intersection(left: ReadonlySet<string>, right: ReadonlySet<string>): Set<string> {
  const result = new Set<string>();

  for (const value of left) {
    if (right.has(value)) {
      result.add(value);
    }
  }

  return result;
}

export function validateUuidLike(
  value: unknown,
  fieldName: string,
): { ok: true; value: string } | ApiResult<never> {
  const raw = nonEmptyString(value);

  if (raw === null) {
    return fail({ message: `${fieldName} is required`, code: 'VALIDATION_ERROR' });
  }

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(raw)) {
    return fail({ message: `${fieldName} must be a valid UUID`, code: 'VALIDATION_ERROR' });
  }

  return { ok: true, value: raw };
}

export async function fetchOrderById(
  client: SupabaseClient,
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
    return fail({ message: 'Order not found', code: 'NOT_FOUND' });
  }

  return ok(data);
}

export function isOpenOrderStatus(status: AdminOrderStatus): boolean {
  return status === 'confirmed' || status === 'preparing' || status === 'ready';
}

export function isMappedAdminOrder(order: AdminOrder): boolean {
  return order.id.trim().length > 0;
}