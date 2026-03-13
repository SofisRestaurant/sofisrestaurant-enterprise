// =============================================================================
// src/modules/orders/types/order-payment.types.ts
//
// Types mirroring the order_payment_details table and related payment
// fields on the orders table from:
//   20260308000001_add_order_payment_columns.sql
//   20260308000002_create_order_payment_details.sql
// =============================================================================

// ---------------------------------------------------------------------------
// 1. Enums (mirror SQL enums exactly)
// ---------------------------------------------------------------------------

export type PaymentStatus =
  | 'pending'
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'succeeded'
  | 'canceled'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

export type PaymentMethodType =
  | 'card'
  | 'apple_pay'
  | 'google_pay'
  | 'link'
  | 'affirm'
  | 'afterpay_clearpay'
  | 'klarna'
  | 'us_bank_account'
  | 'cashapp'
  | 'unknown';

export type CardFunding    = 'credit' | 'debit' | 'prepaid' | 'unknown';
export type CvcCheck       = 'pass' | 'fail' | 'unavailable' | 'unchecked' | 'unknown';
export type AvsCheck       = 'pass' | 'fail' | 'unavailable' | 'unchecked' | 'unknown';
export type RiskLevel      = 'normal' | 'elevated' | 'highest' | 'not_assessed' | 'unknown';
export type ThreeDsResult  =
  | 'authenticated'
  | 'attempted'
  | 'failed'
  | 'not_supported'
  | 'processing_error'
  | 'exempted'
  | 'unknown';

export type DisputeStatus =
  | 'none'
  | 'warning_needs_response'
  | 'warning_under_review'
  | 'warning_closed'
  | 'needs_response'
  | 'under_review'
  | 'charge_refunded'
  | 'won'
  | 'lost';

export type EvidenceStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'past_due'
  | 'won'
  | 'lost';

// ---------------------------------------------------------------------------
// 2. Raw Supabase row shapes (snake_case, nullable)
// ---------------------------------------------------------------------------

export interface RawOrderPaymentFields {
  // Stripe IDs
  stripe_payment_intent_id:   string | null;
  stripe_checkout_session_id: string | null;
  stripe_charge_id:           string | null;
  stripe_customer_id:         string | null;

  // Status
  payment_status:       string | null;
  payment_method_type:  string | null;
  currency:             string | null;

  // Money
  subtotal_cents:         number | null;
  tax_cents:              number | null;
  tip_cents:              number | null;
  discount_cents:         number | null;
  delivery_fee_cents:     number | null;
  service_fee_cents:      number | null;
  total_cents:            number | null;
  amount_received_cents:  number | null;
  refunded_amount_cents:  number | null;
  net_amount_cents:       number | null;

  // Dispute
  dispute_status:       string | null;
  disputed_at:          string | null;
  dispute_due_by:       string | null;
  dispute_reason:       string | null;
  dispute_amount_cents: number | null;

  // Lifecycle
  charge_captured_at:  string | null;
  payment_failed_at:   string | null;
  refunded_at:         string | null;
  last_payment_error:  string | null;
}

export interface RawOrderPaymentDetail {
  id:                         string | null;
  order_id:                   string | null;
  payment_intent_id:          string | null;
  charge_id:                  string | null;
  payment_method_id:          string | null;
  balance_transaction_id:     string | null;

  // Customer identity
  customer_email:             string | null;
  customer_phone:             string | null;
  billing_name:               string | null;
  billing_address_line1:      string | null;
  billing_address_line2:      string | null;
  billing_city:               string | null;
  billing_state:              string | null;
  billing_postal_code:        string | null;
  billing_country:            string | null;

  // Card
  card_brand:                 string | null;
  card_last4:                 string | null;
  card_exp_month:             number | null;
  card_exp_year:              number | null;
  card_fingerprint:           string | null;
  card_country:               string | null;
  card_network:               string | null;
  funding:                    string | null;
  wallet_type:                string | null;

  // Verification
  cvc_check:                  string | null;
  postal_check:               string | null;
  avs_line1_check:            string | null;
  three_d_secure_result:      string | null;
  three_d_secure_version:     string | null;

  // Risk
  risk_level:                 string | null;
  risk_score:                 number | null;
  radar_rule_id:              string | null;
  radar_outcome:              string | null;

  // Network / device
  ip_address:                 string | null;
  ip_country:                 string | null;
  user_agent:                 string | null;
  device_fingerprint:         string | null;
  session_id:                 string | null;

  // Fees
  stripe_fee_cents:           number | null;
  stripe_fee_tax_cents:       number | null;

  // Dispute snapshot
  dispute_id:                 string | null;
  dispute_reason:             string | null;
  dispute_amount_cents:       number | null;
  dispute_due_by:             string | null;
  dispute_evidence_status:    string | null;
  dispute_network_reason_code: string | null;
  dispute_opened_at:          string | null;
  dispute_closed_at:          string | null;
  dispute_outcome:            string | null;

  // Refunds
  refund_ids:                 string[] | null;
  last_refund_reason:         string | null;
  last_refund_at:             string | null;

  // Snapshots
  raw_charge_snapshot:        Record<string, unknown> | null;
  raw_dispute_snapshot:       Record<string, unknown> | null;

  created_at:                 string | null;
  updated_at:                 string | null;
}

// ---------------------------------------------------------------------------
// 3. UI-safe mapped models
// ---------------------------------------------------------------------------

export interface OrderPaymentSummary {
  // Money (cents)
  subtotalCents:        number;
  taxCents:             number;
  tipCents:             number;
  discountCents:        number;
  deliveryFeeCents:     number;
  serviceFeeCents:      number;
  totalCents:           number;
  amountReceivedCents:  number;
  refundedAmountCents:  number;
  netAmountCents:       number;

  // Formatted strings
  totalFormatted:           string;
  refundedAmountFormatted:  string;
  netAmountFormatted:       string;
  subtotalFormatted:        string;

  // Status
  paymentStatus:      PaymentStatus;
  paymentMethodType:  PaymentMethodType;
  currency:           string;
  isFullyRefunded:    boolean;
  isPartialRefund:    boolean;
  hasFailure:         boolean;

  // Stripe IDs
  stripePaymentIntentId:   string;
  stripeCheckoutSessionId: string;
  stripeChargeId:          string;
  stripeCustomerId:        string;

  // Dispute
  disputeStatus:       DisputeStatus;
  isDisputed:          boolean;
  disputeAmountCents:  number;
  disputeDueBy:        Date | null;
  disputeReason:       string;

  // Timestamps
  chargeCapturedAt:    Date | null;
  paymentFailedAt:     Date | null;
  refundedAt:          Date | null;
  lastPaymentError:    string;
}

export interface OrderPaymentDetail {
  id:                   string;
  orderId:              string;

  // Stripe refs
  paymentIntentId:          string;
  chargeId:                 string;
  paymentMethodId:          string;
  balanceTransactionId:     string;

  // Customer
  customerEmail:            string;
  customerPhone:            string;
  billingName:              string;
  billingAddressLine1:      string;
  billingAddressLine2:      string;
  billingCity:              string;
  billingState:             string;
  billingPostalCode:        string;
  billingCountry:           string;

  // Card
  cardBrand:                string;
  cardLast4:                string;
  cardExpMonth:             number;
  cardExpYear:              number;
  cardFingerprint:          string;
  cardCountry:              string;
  cardNetwork:              string;
  funding:                  CardFunding;
  walletType:               string;

  // Verification
  cvcCheck:                 CvcCheck;
  postalCheck:              AvsCheck;
  avsLine1Check:            AvsCheck;
  threeDSecureResult:       ThreeDsResult;
  threeDSecureVersion:      string;

  // Risk
  riskLevel:                RiskLevel;
  riskScore:                number | null;
  radarRuleId:              string;
  radarOutcome:             string;

  // Network
  ipAddress:                string;
  ipCountry:                string;
  userAgent:                string;
  deviceFingerprint:        string;
  sessionId:                string;

  // Fees
  stripeFeeCents:           number;
  stripeFeeFormatted:       string;

  // Dispute
  disputeId:                string;
  disputeReason:            string;
  disputeAmountCents:       number;
  disputeAmountFormatted:   string;
  disputeDueBy:             Date | null;
  disputeEvidenceStatus:    EvidenceStatus;
  disputeNetworkReasonCode: string;
  disputeOpenedAt:          Date | null;
  disputeClosedAt:          Date | null;
  disputeOutcome:           string;

  // Refunds
  refundIds:                string[];
  lastRefundReason:         string;
  lastRefundAt:             Date | null;

  createdAt:                Date;
  updatedAt:                Date;
}

// ---------------------------------------------------------------------------
// 4. Risk display helpers
// ---------------------------------------------------------------------------

export interface RiskSignalRow {
  label:     string;
  value:     string;
  status:    'pass' | 'fail' | 'warn' | 'info' | 'unknown';
  tooltip?:  string;
}

export function buildRiskSignals(detail: OrderPaymentDetail): RiskSignalRow[] {
  const checkStatus = (v: CvcCheck | AvsCheck): RiskSignalRow['status'] => {
    if (v === 'pass')        return 'pass';
    if (v === 'fail')        return 'fail';
    if (v === 'unavailable') return 'warn';
    return 'unknown';
  };

  const signals: RiskSignalRow[] = [
    {
      label:   'CVC check',
      value:   detail.cvcCheck,
      status:  checkStatus(detail.cvcCheck),
      tooltip: 'Card verification code match result from issuer.',
    },
    {
      label:   'Postal code',
      value:   detail.postalCheck,
      status:  checkStatus(detail.postalCheck),
      tooltip: 'Billing postal code AVS check result.',
    },
    {
      label:   'Address line 1',
      value:   detail.avsLine1Check,
      status:  checkStatus(detail.avsLine1Check),
      tooltip: 'Billing address line 1 AVS check result.',
    },
    {
      label:   '3D Secure',
      value:   detail.threeDSecureResult,
      status:
        detail.threeDSecureResult === 'authenticated' ? 'pass'
        : detail.threeDSecureResult === 'failed'       ? 'fail'
        : detail.threeDSecureResult === 'attempted'    ? 'warn'
        : 'info',
      tooltip: `3DS ${detail.threeDSecureVersion || '2.x'} result.`,
    },
    {
      label:   'Radar risk level',
      value:   detail.riskLevel,
      status:
        detail.riskLevel === 'normal'       ? 'pass'
        : detail.riskLevel === 'elevated'   ? 'warn'
        : detail.riskLevel === 'highest'    ? 'fail'
        : 'unknown',
      tooltip: detail.riskScore != null
        ? `Radar score: ${detail.riskScore}/100`
        : 'Stripe Radar risk assessment.',
    },
  ];

  if (detail.radarRuleId) {
    signals.push({
      label:   'Radar rule',
      value:   detail.radarRuleId,
      status:  'warn',
      tooltip: detail.radarOutcome,
    });
  }

  return signals;
}