import type {
  AdminOrder,
  DisputeEvent,
  OrderAdminFlags,
  RawOrder,
  TimelineEvent,
  TimelineEventKind,
  TimelineEventSeverity,
} from '../types/index';

import {
  CLOSED_DISPUTE_STATUSES,
  type EvidenceLookupRow,
  type EvidenceReadRow,
  type FulfillmentEvidenceModel,
  OPEN_DISPUTE_STATUSES,
  type PaymentDetailModel,
  type PaymentDetailReadRow,
  type PaymentSummaryModel,
  PROOF_MISSING_THRESHOLD,
  type RawDisputeEventRow,
  formatMoney,
  formatTimestamp,
  isFailedPaymentStatus,
  isHighRiskLevel,
  isRecord,
  isRefundedPaymentStatus,
  nonEmptyString,
  nonEmptyStringOrDefault,
  normalizeAdminOrderStatus,
  normalizeDisputeEventSource,
  normalizeDisputeEventType,
  normalizeDisputeStatus,
  normalizeTimelineKind,
  normalizeTimelineSeverity,
  nullableNumber,
  numberOrZero,
  parseDate,
} from '../api/orders.shared';

function normalizeEvidenceStatusLabel(value: unknown): string {
  switch (typeof value === 'string' ? value.trim().toLowerCase() : '') {
    case 'partial':
      return 'partial';
    case 'complete':
      return 'complete';
    case 'flagged':
      return 'flagged';
    case 'disputed':
      return 'disputed';
    case 'archived':
      return 'archived';
    default:
      return 'pending';
  }
}

function normalizeHandoffType(value: unknown): string {
  switch (typeof value === 'string' ? value.trim().toLowerCase() : '') {
    case 'pickup':
      return 'pickup';
    case 'delivery':
      return 'delivery';
    case 'dine_in':
      return 'dine_in';
    default:
      return 'pickup';
  }
}

export function mapRawOrder(raw: RawOrder): AdminOrder {
  const totalCents = numberOrZero(raw.total_cents);
  const currency = nonEmptyStringOrDefault(raw.currency, 'usd');
  const paymentStatus = nonEmptyStringOrDefault(raw.payment_status, 'pending');
  const disputeStatus = normalizeDisputeStatus(raw.dispute_status);
  const refundedAmountCents = numberOrZero(raw.refunded_amount_cents);

  return {
    id: nonEmptyStringOrDefault(raw.id, ''),
    userId: nonEmptyStringOrDefault(raw.user_id, ''),
    status: normalizeAdminOrderStatus(raw.status),
    fulfillmentType: nonEmptyStringOrDefault(raw.fulfillment_type, ''),
    createdAt: parseDate(raw.created_at) ?? new Date(0),
    updatedAt: parseDate(raw.updated_at) ?? new Date(0),
    totalCents,
    totalFormatted: formatMoney(totalCents, currency),
    currency,
    paymentStatus,
    disputeStatus,
    isDisputed: !CLOSED_DISPUTE_STATUSES.has(disputeStatus),
    isRefunded: isRefundedPaymentStatus(paymentStatus),
    isHighRisk: false,
    hasProofMissing: false,
    refundedAmountCents,
  };
}

export function buildFlags(
  order: AdminOrder,
  riskLevel: string | null,
  evidenceCompletenessScore: number | null,
): OrderAdminFlags {
  const hasOpenDispute = OPEN_DISPUTE_STATUSES.has(order.disputeStatus);
  const isHighRisk = isHighRiskLevel(riskLevel);
  const normalizedEvidenceScore =
    evidenceCompletenessScore === null
      ? null
      : Math.max(0, Math.min(100, Math.round(evidenceCompletenessScore)));
  const isProofMissing =
    normalizedEvidenceScore !== null && normalizedEvidenceScore < PROOF_MISSING_THRESHOLD;

  return {
    isDisputed: order.isDisputed,
    isRefunded: order.isRefunded,
    isPartialRefund: order.paymentStatus === 'partially_refunded',
    isHighRisk,
    isProofMissing,
    isPaymentFailed: isFailedPaymentStatus(order.paymentStatus),
    hasOpenDispute,
    disputeUrgency: order.isDisputed ? (hasOpenDispute ? 'normal' : 'closed') : null,
  };
}

export function mapPaymentSummary(raw: RawOrder): PaymentSummaryModel {
  const currency = nonEmptyStringOrDefault(raw.currency, 'usd');
  const subtotalCents = numberOrZero(raw.subtotal_cents);
  const taxCents = numberOrZero(raw.tax_cents);
  const tipCents = numberOrZero(raw.tip_cents);
  const discountCents = numberOrZero(raw.discount_cents);
  const deliveryFeeCents = numberOrZero(raw.delivery_fee_cents);
  const serviceFeeCents = numberOrZero(raw.service_fee_cents);
  const totalCents = numberOrZero(raw.total_cents);
  const amountReceivedCents = numberOrZero(raw.amount_received_cents);
  const refundedAmountCents = numberOrZero(raw.refunded_amount_cents);
  const netAmountCents = numberOrZero(raw.net_amount_cents);
  const disputeStatus = normalizeDisputeStatus(raw.dispute_status);
  const paymentStatus = nonEmptyStringOrDefault(raw.payment_status, 'pending');

  return {
    orderId: nonEmptyStringOrDefault(raw.id, ''),
    stripePaymentIntentId: nonEmptyString(raw.stripe_payment_intent_id),
    stripeCheckoutSessionId: nonEmptyString(raw.stripe_checkout_session_id),
    stripeChargeId: nonEmptyString(raw.stripe_charge_id),
    stripeCustomerId: nonEmptyString(raw.stripe_customer_id),
    paymentStatus,
    paymentMethodType: nonEmptyString(raw.payment_method_type),
    currency,
    subtotalCents,
    taxCents,
    tipCents,
    discountCents,
    deliveryFeeCents,
    serviceFeeCents,
    totalCents,
    amountReceivedCents,
    refundedAmountCents,
    netAmountCents,
    subtotalFormatted: formatMoney(subtotalCents, currency),
    taxFormatted: formatMoney(taxCents, currency),
    tipFormatted: formatMoney(tipCents, currency),
    discountFormatted: formatMoney(discountCents, currency),
    deliveryFeeFormatted: formatMoney(deliveryFeeCents, currency),
    serviceFeeFormatted: formatMoney(serviceFeeCents, currency),
    totalFormatted: formatMoney(totalCents, currency),
    amountReceivedFormatted: formatMoney(amountReceivedCents, currency),
    refundedAmountFormatted: formatMoney(refundedAmountCents, currency),
    netAmountFormatted: formatMoney(netAmountCents, currency),
    disputeStatus,
    disputedAt: parseDate(raw.disputed_at),
    disputeDueBy: parseDate(raw.dispute_due_by),
    disputeReason: nonEmptyString(raw.dispute_reason),
    disputeAmountCents: numberOrZero(raw.dispute_amount_cents),
    disputeAmountFormatted: formatMoney(numberOrZero(raw.dispute_amount_cents), currency),
    chargeCapturedAt: parseDate(raw.charge_captured_at),
    paymentFailedAt: parseDate(raw.payment_failed_at),
    refundedAt: parseDate(raw.refunded_at),
    lastPaymentError: nonEmptyString(raw.last_payment_error),
    isCaptured: parseDate(raw.charge_captured_at) !== null,
    isRefunded: isRefundedPaymentStatus(paymentStatus),
    isDisputed: !CLOSED_DISPUTE_STATUSES.has(disputeStatus),
  };
}

export function computeEvidenceCompleteness(raw: EvidenceLookupRow): number {
  const handoffType = normalizeHandoffType(raw.handoff_type);

  if (handoffType === 'pickup') {
    const checklist = [
      nonEmptyString(raw.recipient_name) !== null ||
        nonEmptyString(raw.picked_up_by_name) !== null,
      parseDate(raw.pickup_pin_verified_at) !== null,
    ];

    return Math.round((checklist.filter(Boolean).length / checklist.length) * 100);
  }

  if (handoffType === 'delivery') {
    const checklist = [
      parseDate(raw.out_for_delivery_at) !== null,
      parseDate(raw.delivered_at) !== null,
      nonEmptyString(raw.delivery_photo_url) !== null ||
        nonEmptyString(raw.signature_url) !== null,
      nullableNumber(raw.gps_lat) !== null && nullableNumber(raw.gps_lng) !== null,
    ];

    return Math.round((checklist.filter(Boolean).length / checklist.length) * 100);
  }

  return parseDate(raw.delivered_at) !== null ? 100 : 0;
}

export function mapFulfillmentEvidence(raw: EvidenceReadRow): FulfillmentEvidenceModel {
  const pickupPinVerifiedAt = parseDate(raw.pickup_pin_verified_at);
  const outForDeliveryAt = parseDate(raw.out_for_delivery_at);
  const deliveredAt = parseDate(raw.delivered_at);
  const deliveryPhotoUrl = nonEmptyString(raw.delivery_photo_url);
  const signatureUrl = nonEmptyString(raw.signature_url);
  const gpsLat = nullableNumber(raw.gps_lat);
  const gpsLng = nullableNumber(raw.gps_lng);

  return {
    orderId: nonEmptyStringOrDefault(raw.order_id, ''),
    evidenceStatus: normalizeEvidenceStatusLabel(raw.evidence_status),
    handoffType: normalizeHandoffType(raw.handoff_type),
    recipientName: nonEmptyString(raw.recipient_name),
    pickedUpByName: nonEmptyString(raw.picked_up_by_name),
    handoffNotes: nonEmptyString(raw.handoff_notes),
    staffVerifiedBy: nonEmptyString(raw.staff_verified_by),
    pickupPinVerifiedAt,
    outForDeliveryAt,
    deliveredAt,
    deliveryPhotoUrl,
    signatureUrl,
    gpsLat,
    gpsLng,
    createdAt: parseDate(raw.created_at),
    updatedAt: parseDate(raw.updated_at),
    evidenceCompletenessScore: computeEvidenceCompleteness(raw),
    hasDeliveryPhoto: deliveryPhotoUrl !== null,
    hasSignature: signatureUrl !== null,
    hasGps: gpsLat !== null && gpsLng !== null,
    hasPickupVerification: pickupPinVerifiedAt !== null,
  };
}

export function mapPaymentDetail(
  rawOrder: RawOrder,
  rawDetail: PaymentDetailReadRow | null,
): PaymentDetailModel {
  const summary = mapPaymentSummary(rawOrder);

  return {
    ...summary,
    riskLevel: rawDetail?.risk_level ?? null,
    riskScore: nullableNumber(rawDetail?.risk_score),
    sellerMessage: nonEmptyString(rawDetail?.seller_message),
    outcomeType: nonEmptyString(rawDetail?.outcome_type),
    outcomeReason: nonEmptyString(rawDetail?.outcome_reason),
    receiptUrl: nonEmptyString(rawDetail?.receipt_url),
    receiptNumber: nonEmptyString(rawDetail?.receipt_number),
    paymentMethodId: nonEmptyString(rawDetail?.payment_method_id),
    cardBrand: nonEmptyString(rawDetail?.card_brand),
    cardLast4: nonEmptyString(rawDetail?.card_last4),
    cardExpMonth: nullableNumber(rawDetail?.card_exp_month),
    cardExpYear: nullableNumber(rawDetail?.card_exp_year),
    cardFunding: nonEmptyString(rawDetail?.card_funding),
    cardCountry: nonEmptyString(rawDetail?.card_country),
    cardFingerprint: nonEmptyString(rawDetail?.card_fingerprint),
    walletType: nonEmptyString(rawDetail?.wallet_type),
    network: nonEmptyString(rawDetail?.network),
    cvcCheck: nonEmptyString(rawDetail?.cvc_check),
    avsLine1Check: nonEmptyString(rawDetail?.avs_line1_check),
    avsZipCheck: nonEmptyString(rawDetail?.avs_zip_check),
    threeDsResult: nonEmptyString(rawDetail?.three_ds_result),
    evidenceStatus: nonEmptyString(rawDetail?.evidence_status),
    disputeId: nonEmptyString(rawDetail?.dispute_id),
  };
}

export function mapDisputeEvent(raw: RawDisputeEventRow): DisputeEvent {
  const relation = raw.orders ?? null;
  const occurredAt = parseDate(raw.occurred_at) ?? new Date(0);
  const joinedTotalCents = relation === null ? 0 : numberOrZero(relation.total_cents);
  const joinedDisputeStatus =
    relation === null
      ? normalizeDisputeStatus(raw.dispute_status)
      : normalizeDisputeStatus(relation.dispute_status);
  const joinedDisputeDueBy =
    relation === null ? parseDate(raw.dispute_due_by) : parseDate(relation.dispute_due_by);
  const joinedPaymentIntentId =
    relation === null
      ? nonEmptyString(raw.stripe_payment_intent_id)
      : nonEmptyString(relation.stripe_payment_intent_id);

  return {
    id: nonEmptyStringOrDefault(raw.id, ''),
    orderId: nonEmptyStringOrDefault(raw.order_id, ''),
    disputeId: nonEmptyStringOrDefault(raw.dispute_id, ''),
    eventType: normalizeDisputeEventType(raw.event_type),
    eventSource: normalizeDisputeEventSource(raw.event_source),
    previousStatus: nonEmptyString(raw.previous_status) ?? '',
    newStatus: nonEmptyString(raw.new_status) ?? '',
    previousAmountCents: numberOrZero(raw.previous_amount_cents),
    newAmountCents: numberOrZero(raw.new_amount_cents),
    actorName: nonEmptyString(raw.actor_name) ?? '',
    actorRole: nonEmptyString(raw.actor_role) ?? '',
    note: nonEmptyString(raw.note) ?? '',
    evidenceUrls: Array.isArray(raw.evidence_urls)
      ? raw.evidence_urls.filter((value): value is string => typeof value === 'string')
      : [],
    evidenceLabels: Array.isArray(raw.evidence_labels)
      ? raw.evidence_labels.filter((value): value is string => typeof value === 'string')
      : [],
    metadata: isRecord(raw.metadata) ? raw.metadata : {},
    occurredAt,
    occurredAtLabel: formatTimestamp(occurredAt),
    stripePaymentIntentId: joinedPaymentIntentId ?? '',
    orderTotalCents: joinedTotalCents,
    disputeDueBy: joinedDisputeDueBy,
    disputeStatus: joinedDisputeStatus,
  };
}

export function makeTimelineEvent(
  kind: TimelineEventKind,
  severity: TimelineEventSeverity,
  title: string,
  description: string,
  occurredAt: Date,
  actor: string,
  metadata?: Record<string, unknown>,
  evidenceUrls?: string[],
  evidenceLabels?: string[],
): TimelineEvent {
  return {
    id: `${kind}-${occurredAt.getTime()}-${actor}`,
    kind,
    severity,
    title,
    description,
    actor,
    occurredAt,
    label: formatTimestamp(occurredAt),
    metadata,
    evidenceUrls,
    evidenceLabels,
  };
}

export function buildTimeline(
  order: AdminOrder,
  paymentSummary: PaymentSummaryModel | null,
  evidence: FulfillmentEvidenceModel | null,
  disputeEvents: readonly DisputeEvent[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push(
    makeTimelineEvent(
      'order_created',
      'info',
      'Order placed',
      `Order #${order.id.slice(0, 8)} created`,
      order.createdAt,
      'Customer',
    ),
  );

  if (paymentSummary !== null && paymentSummary.chargeCapturedAt !== null) {
    events.push(
      makeTimelineEvent(
        'payment_captured',
        'success',
        'Payment captured',
        `${paymentSummary.totalFormatted} captured`,
        paymentSummary.chargeCapturedAt,
        'Stripe',
      ),
    );
  }

  if (
    paymentSummary !== null &&
    paymentSummary.paymentFailedAt !== null &&
    isFailedPaymentStatus(order.paymentStatus)
  ) {
    events.push(
      makeTimelineEvent(
        'payment_failed',
        'error',
        'Payment failed',
        paymentSummary.lastPaymentError ?? 'Payment failed',
        paymentSummary.paymentFailedAt,
        'Stripe',
      ),
    );
  }

  if (paymentSummary !== null && paymentSummary.refundedAt !== null && order.isRefunded) {
    events.push(
      makeTimelineEvent(
        'refund_issued',
        'warning',
        'Refund issued',
        `${paymentSummary.refundedAmountFormatted} refunded`,
        paymentSummary.refundedAt,
        'Admin',
      ),
    );
  }

  if (evidence !== null && evidence.outForDeliveryAt !== null) {
    events.push(
      makeTimelineEvent(
        'order_fulfilled',
        'info',
        'Out for delivery',
        'Driver dispatched',
        evidence.outForDeliveryAt,
        'Driver',
      ),
    );
  }

  if (evidence !== null && evidence.deliveredAt !== null) {
    const deliveredTitle = evidence.handoffType === 'pickup' ? 'Pickup completed' : 'Delivered';
    const deliveredDescription =
      evidence.handoffType === 'pickup'
        ? 'Order handed off at the counter'
        : 'Order delivered to recipient';

    events.push(
      makeTimelineEvent(
        evidence.handoffType === 'pickup' ? 'pickup_verified' : 'delivery_completed',
        'success',
        deliveredTitle,
        deliveredDescription,
        evidence.deliveredAt,
        evidence.handoffType === 'pickup' ? 'Staff' : 'Driver',
      ),
    );
  }

  if (evidence !== null && evidence.pickupPinVerifiedAt !== null) {
    events.push(
      makeTimelineEvent(
        'pickup_verified',
        'success',
        'Pickup verified',
        'PIN verified at handoff',
        evidence.pickupPinVerifiedAt,
        'Staff',
      ),
    );
  }

  for (const disputeEvent of disputeEvents) {
    const eventType = disputeEvent.eventType;
    const mappedKind = normalizeTimelineKind(eventType);
    const mappedSeverity =
      eventType === 'dispute_created'
        ? normalizeTimelineSeverity('error')
        : eventType === 'dispute_closed'
          ? normalizeTimelineSeverity(disputeEvent.newStatus === 'won' ? 'success' : 'warning')
          : eventType === 'dispute_updated'
            ? normalizeTimelineSeverity('warning')
            : normalizeTimelineSeverity('info');

    const title = eventType
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

    const description =
      disputeEvent.note.length > 0
        ? disputeEvent.note
        : disputeEvent.newStatus.length > 0
          ? `Status → ${disputeEvent.newStatus}`
          : 'Dispute updated';

    events.push(
      makeTimelineEvent(
        mappedKind,
        mappedSeverity,
        title,
        description,
        disputeEvent.occurredAt,
        disputeEvent.actorName || disputeEvent.actorRole || 'System',
        disputeEvent.metadata,
        disputeEvent.evidenceUrls,
        disputeEvent.evidenceLabels,
      ),
    );
  }

  return [...events].sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
}