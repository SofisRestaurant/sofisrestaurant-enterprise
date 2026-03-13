// =============================================================================
// src/modules/orders/api/order-payments.api.ts
//
// Supabase calls for order_payment_details table.
// All functions return ApiResult<T> — discriminated union, never throws.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  RawOrderPaymentFields,
  RawOrderPaymentDetail,
  OrderPaymentSummary,
  OrderPaymentDetail,
  DisputeStatus,
  PaymentStatus,
  PaymentMethodType,
  CardFunding,
  CvcCheck,
  AvsCheck,
  RiskLevel,
  ThreeDsResult,
  EvidenceStatus,
} from '../types/order-payment.types';

// ---------------------------------------------------------------------------
// Shared result type
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: {
    message: string;
    code?: string;
    details?: string;
  };
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;

function ok<T>(data: T): ApiResult<T> {
  return { data, error: null };
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toErrorString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : 'Invalid Date';
  }

  if (value instanceof Error) {
    return value.message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return 'Unknown error';
  }
}

function fail(err: unknown): ApiResult<never> {
  if (isRecord(err)) {
    const message =
      'message' in err ? toErrorString(err.message) : 'Unknown error';
    const code =
      'code' in err && err.code !== undefined ? toErrorString(err.code) : 'UNKNOWN';
    const details =
      'details' in err && err.details !== undefined
        ? toErrorString(err.details)
        : undefined;

    return {
      data: null,
      error: {
        message,
        code,
        details,
      },
    };
  }

  return {
    data: null,
    error: {
      message: toErrorString(err),
      code: 'UNKNOWN',
    },
  };
}

// ---------------------------------------------------------------------------
// Formatters (keep API layer self-contained for money display)
// ---------------------------------------------------------------------------

function fmt(cents: number, currency = 'usd'): string {
  const normalizedCurrency = safeCurrencyCode(currency);

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${normalizedCurrency} ${(cents / 100).toFixed(2)}`;
  }
}

function safeN(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return 0;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  }

  return 0;
}

function safeS(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : '';
  }

  return '';
}

function safeD(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const iso = trimmed.includes('T') ? trimmed : `${trimmed}T00:00:00.000Z`;
  const parsed = new Date(iso);

  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function safeCurrencyCode(value: unknown): string {
  if (typeof value !== 'string') {
    return 'USD';
  }

  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : 'USD';
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      out.push(entry);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

export function mapPaymentSummary(raw: RawOrderPaymentFields): OrderPaymentSummary {
  const totalCents = safeN(raw.total_cents);
  const refundedAmountCents = safeN(raw.refunded_amount_cents);
  const currency = safeS(raw.currency) || 'usd';
  const paymentStatus = (safeS(raw.payment_status) as PaymentStatus) || 'pending';
  const disputeStatus = (safeS(raw.dispute_status) as DisputeStatus) || 'none';

  return {
    subtotalCents: safeN(raw.subtotal_cents),
    taxCents: safeN(raw.tax_cents),
    tipCents: safeN(raw.tip_cents),
    discountCents: safeN(raw.discount_cents),
    deliveryFeeCents: safeN(raw.delivery_fee_cents),
    serviceFeeCents: safeN(raw.service_fee_cents),
    totalCents,
    amountReceivedCents: safeN(raw.amount_received_cents),
    refundedAmountCents,
    netAmountCents: safeN(raw.net_amount_cents) || (totalCents - refundedAmountCents),

    totalFormatted: fmt(totalCents, currency),
    refundedAmountFormatted: fmt(refundedAmountCents, currency),
    netAmountFormatted: fmt(totalCents - refundedAmountCents, currency),
    subtotalFormatted: fmt(safeN(raw.subtotal_cents), currency),

    paymentStatus,
    paymentMethodType: (safeS(raw.payment_method_type) as PaymentMethodType) || 'unknown',
    currency,
    isFullyRefunded: paymentStatus === 'refunded',
    isPartialRefund: paymentStatus === 'partially_refunded',
    hasFailure: paymentStatus === 'failed',

    stripePaymentIntentId: safeS(raw.stripe_payment_intent_id),
    stripeCheckoutSessionId: safeS(raw.stripe_checkout_session_id),
    stripeChargeId: safeS(raw.stripe_charge_id),
    stripeCustomerId: safeS(raw.stripe_customer_id),

    disputeStatus,
    isDisputed: !['none', 'won', 'lost', 'charge_refunded'].includes(disputeStatus),
    disputeAmountCents: safeN(raw.dispute_amount_cents),
    disputeDueBy: safeD(raw.dispute_due_by),
    disputeReason: safeS(raw.dispute_reason),

    chargeCapturedAt: safeD(raw.charge_captured_at),
    paymentFailedAt: safeD(raw.payment_failed_at),
    refundedAt: safeD(raw.refunded_at),
    lastPaymentError: safeS(raw.last_payment_error),
  };
}

export function mapPaymentDetail(
  raw: RawOrderPaymentDetail,
  currency = 'usd',
): OrderPaymentDetail {
  const stripeFeeCents = safeN(raw.stripe_fee_cents);
  const disputeAmountCents = safeN(raw.dispute_amount_cents);

  return {
    id: safeS(raw.id),
    orderId: safeS(raw.order_id),

    paymentIntentId: safeS(raw.payment_intent_id),
    chargeId: safeS(raw.charge_id),
    paymentMethodId: safeS(raw.payment_method_id),
    balanceTransactionId: safeS(raw.balance_transaction_id),

    customerEmail: safeS(raw.customer_email),
    customerPhone: safeS(raw.customer_phone),
    billingName: safeS(raw.billing_name),
    billingAddressLine1: safeS(raw.billing_address_line1),
    billingAddressLine2: safeS(raw.billing_address_line2),
    billingCity: safeS(raw.billing_city),
    billingState: safeS(raw.billing_state),
    billingPostalCode: safeS(raw.billing_postal_code),
    billingCountry: safeS(raw.billing_country),

    cardBrand: safeS(raw.card_brand),
    cardLast4: safeS(raw.card_last4),
    cardExpMonth: safeN(raw.card_exp_month),
    cardExpYear: safeN(raw.card_exp_year),
    cardFingerprint: safeS(raw.card_fingerprint),
    cardCountry: safeS(raw.card_country),
    cardNetwork: safeS(raw.card_network),
    funding: (safeS(raw.funding) as CardFunding) || 'unknown',
    walletType: safeS(raw.wallet_type),

    cvcCheck: (safeS(raw.cvc_check) as CvcCheck) || 'unknown',
    postalCheck: (safeS(raw.postal_check) as AvsCheck) || 'unknown',
    avsLine1Check: (safeS(raw.avs_line1_check) as AvsCheck) || 'unknown',
    threeDSecureResult: (safeS(raw.three_d_secure_result) as ThreeDsResult) || 'unknown',
    threeDSecureVersion: safeS(raw.three_d_secure_version),

    riskLevel: (safeS(raw.risk_level) as RiskLevel) || 'not_assessed',
    riskScore: typeof raw.risk_score === 'number' ? raw.risk_score : null,
    radarRuleId: safeS(raw.radar_rule_id),
    radarOutcome: safeS(raw.radar_outcome),

    ipAddress: safeS(raw.ip_address),
    ipCountry: safeS(raw.ip_country),
    userAgent: safeS(raw.user_agent),
    deviceFingerprint: safeS(raw.device_fingerprint),
    sessionId: safeS(raw.session_id),

    stripeFeeCents,
    stripeFeeFormatted: fmt(stripeFeeCents, currency),

    disputeId: safeS(raw.dispute_id),
    disputeReason: safeS(raw.dispute_reason),
    disputeAmountCents,
    disputeAmountFormatted: fmt(disputeAmountCents, currency),
    disputeDueBy: safeD(raw.dispute_due_by),
    disputeEvidenceStatus:
      (safeS(raw.dispute_evidence_status) as EvidenceStatus) || 'not_started',
    disputeNetworkReasonCode: safeS(raw.dispute_network_reason_code),
    disputeOpenedAt: safeD(raw.dispute_opened_at),
    disputeClosedAt: safeD(raw.dispute_closed_at),
    disputeOutcome: safeS(raw.dispute_outcome),

    refundIds: safeStringArray(raw.refund_ids),
    lastRefundReason: safeS(raw.last_refund_reason),
    lastRefundAt: safeD(raw.last_refund_at),

    createdAt: safeD(raw.created_at) ?? new Date(),
    updatedAt: safeD(raw.updated_at) ?? new Date(),
  };
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Fetch payment detail record for one order.
 */
export async function fetchOrderPaymentDetail(
  supabase: SupabaseClient,
  orderId: string,
): Promise<ApiResult<OrderPaymentDetail | null>> {
  try {
    const { data, error } = await supabase
      .from('order_payment_details')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle<RawOrderPaymentDetail>();

    if (error) {
      return fail(error);
    }

    if (!data) {
      return ok(null);
    }

    const { data: orderRow } = await supabase
      .from('orders')
      .select('currency')
      .eq('id', orderId)
      .maybeSingle<{ currency: string }>();

    return ok(mapPaymentDetail(data, orderRow?.currency ?? 'usd'));
  } catch (err) {
    return fail(err);
  }
}

/**
 * Fetch payment summary fields directly from the orders table.
 */
export async function fetchOrderPaymentSummary(
  supabase: SupabaseClient,
  orderId: string,
): Promise<ApiResult<OrderPaymentSummary | null>> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        stripe_payment_intent_id,
        stripe_checkout_session_id,
        stripe_charge_id,
        stripe_customer_id,
        payment_status,
        payment_method_type,
        currency,
        subtotal_cents,
        tax_cents,
        tip_cents,
        discount_cents,
        delivery_fee_cents,
        service_fee_cents,
        total_cents,
        amount_received_cents,
        refunded_amount_cents,
        net_amount_cents,
        dispute_status,
        disputed_at,
        dispute_due_by,
        dispute_reason,
        dispute_amount_cents,
        charge_captured_at,
        payment_failed_at,
        refunded_at,
        last_payment_error
      `)
      .eq('id', orderId)
      .maybeSingle<RawOrderPaymentFields>();

    if (error) {
      return fail(error);
    }

    if (!data) {
      return ok(null);
    }

    return ok(mapPaymentSummary(data));
  } catch (err) {
    return fail(err);
  }
}