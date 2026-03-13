import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/supabase';

import type { FullOrderDetail } from '../api/orders.detail.api';
import { fetchFullOrderDetail } from '../api/orders.detail.api';
import type {
  EvidenceCheckItem,
  OrderDisputeSummary,
  OrderFulfillmentEvidence,
  OrderPaymentDetail,
  OrderPaymentSummary,
  RiskSignalRow,
} from '../types/index';
import { buildEvidenceChecklist } from '../types/order-evidence.types';
import { buildRiskSignals } from '../types/order-payment.types';
import type {
  FulfillmentEvidenceModel,
  PaymentDetailModel,
  PaymentSummaryModel,
} from '../api/orders.shared';

export type DrawerTab = 'payment' | 'evidence' | 'dispute' | 'timeline';

type AppSupabaseClient = SupabaseClient<Database>;

const MS_PER_DAY = 86_400_000;
const EPOCH_DATE = new Date(0);

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toNonEmptyString(value: unknown, fallback = ''): string {
  return hasNonEmptyString(value) ? value.trim() : fallback;
}

function normalizePaymentStatus(
  value: string | null | undefined,
): OrderPaymentSummary['paymentStatus'] {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'pending':
      return 'pending';
    case 'requires_payment_method':
      return 'requires_payment_method';
    case 'requires_confirmation':
      return 'requires_confirmation';
    case 'requires_action':
      return 'requires_action';
    case 'processing':
      return 'processing';
    case 'succeeded':
      return 'succeeded';
    case 'canceled':
      return 'canceled';
    case 'failed':
      return 'failed';
    case 'refunded':
      return 'refunded';
    case 'partially_refunded':
      return 'partially_refunded';
    default:
      return 'pending';
  }
}

function normalizePaymentMethodType(
  value: string | null | undefined,
): OrderPaymentSummary['paymentMethodType'] {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'card':
      return 'card';
    case 'apple_pay':
      return 'apple_pay';
    case 'google_pay':
      return 'google_pay';
    case 'link':
      return 'link';
    case 'affirm':
      return 'affirm';
    case 'afterpay_clearpay':
      return 'afterpay_clearpay';
    case 'klarna':
      return 'klarna';
    case 'us_bank_account':
      return 'us_bank_account';
    case 'cashapp':
      return 'cashapp';
    default:
      return 'unknown';
  }
}

function normalizeDisputeStatus(
  value: string | null | undefined,
): OrderPaymentSummary['disputeStatus'] {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'warning_needs_response':
      return 'warning_needs_response';
    case 'warning_under_review':
      return 'warning_under_review';
    case 'warning_closed':
      return 'warning_closed';
    case 'needs_response':
      return 'needs_response';
    case 'under_review':
      return 'under_review';
    case 'charge_refunded':
      return 'charge_refunded';
    case 'won':
      return 'won';
    case 'lost':
      return 'lost';
    default:
      return 'none';
  }
}

function normalizeEvidenceStatus(
  value: string | null | undefined,
): OrderPaymentDetail['disputeEvidenceStatus'] {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'in_progress':
      return 'in_progress';
    case 'submitted':
      return 'submitted';
    case 'past_due':
      return 'past_due';
    case 'won':
      return 'won';
    case 'lost':
      return 'lost';
    default:
      return 'not_started';
  }
}

function normalizeFulfillmentType(
  value: string | null | undefined,
): OrderFulfillmentEvidence['fulfillmentType'] {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'pickup':
      return 'pickup';
    case 'curbside':
      return 'curbside';
    case 'delivery':
      return 'delivery';
    case 'dine_in':
      return 'dine_in';
    case 'drive_through':
      return 'drive_through';
    case 'ship':
      return 'ship';
    default:
      return 'pickup';
  }
}

function normalizeFulfillmentEvidenceStatus(
  value: string | null | undefined,
): OrderFulfillmentEvidence['evidenceStatus'] {
  switch ((value ?? '').trim().toLowerCase()) {
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

function normalizeHandoffMethod(
  evidence: FulfillmentEvidenceModel,
): OrderFulfillmentEvidence['handoffMethod'] {
  if (evidence.hasPickupVerification) {
    return 'pin_verified';
  }

  if (hasNonEmptyString(evidence.signatureUrl)) {
    return 'signature';
  }

  if (evidence.hasDeliveryPhoto) {
    return 'photo';
  }

  if (hasNonEmptyString(evidence.staffVerifiedBy)) {
    return 'staff_confirmed';
  }

  return 'none';
}

function normalizeCardFunding(
  value: string | null | undefined,
): OrderPaymentDetail['funding'] {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'credit':
      return 'credit';
    case 'debit':
      return 'debit';
    case 'prepaid':
      return 'prepaid';
    default:
      return 'unknown';
  }
}

function normalizeCvcCheck(
  value: string | null | undefined,
): OrderPaymentDetail['cvcCheck'] {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'pass':
      return 'pass';
    case 'fail':
      return 'fail';
    case 'unavailable':
      return 'unavailable';
    case 'unchecked':
      return 'unchecked';
    default:
      return 'unknown';
  }
}

function normalizeAvsCheck(
  value: string | null | undefined,
): OrderPaymentDetail['postalCheck'] {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'pass':
      return 'pass';
    case 'fail':
      return 'fail';
    case 'unavailable':
      return 'unavailable';
    case 'unchecked':
      return 'unchecked';
    default:
      return 'unknown';
  }
}

function normalizeRiskLevel(
  value: string | null | undefined,
): OrderPaymentDetail['riskLevel'] {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'normal':
      return 'normal';
    case 'elevated':
      return 'elevated';
    case 'highest':
      return 'highest';
    case 'not_assessed':
      return 'not_assessed';
    default:
      return 'unknown';
  }
}

function normalizeThreeDsResult(
  value: string | null | undefined,
): OrderPaymentDetail['threeDSecureResult'] {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'authenticated':
      return 'authenticated';
    case 'attempted':
      return 'attempted';
    case 'failed':
      return 'failed';
    case 'not_supported':
      return 'not_supported';
    case 'processing_error':
      return 'processing_error';
    case 'exempted':
      return 'exempted';
    default:
      return 'unknown';
  }
}

function isFullyRefunded(summary: PaymentSummaryModel): boolean {
  return (
    normalizePaymentStatus(summary.paymentStatus) === 'refunded' ||
    (summary.totalCents > 0 && summary.refundedAmountCents >= summary.totalCents)
  );
}

function isPartialRefund(summary: PaymentSummaryModel): boolean {
  return (
    normalizePaymentStatus(summary.paymentStatus) === 'partially_refunded' ||
    (summary.refundedAmountCents > 0 &&
      summary.totalCents > 0 &&
      summary.refundedAmountCents < summary.totalCents)
  );
}

function hasFailure(summary: PaymentSummaryModel): boolean {
  const status = normalizePaymentStatus(summary.paymentStatus);
  return status === 'failed' || hasNonEmptyString(summary.lastPaymentError);
}

function toUiPaymentSummary(summary: PaymentSummaryModel): OrderPaymentSummary {
  return {
    subtotalCents: summary.subtotalCents,
    taxCents: summary.taxCents,
    tipCents: summary.tipCents,
    discountCents: summary.discountCents,
    deliveryFeeCents: summary.deliveryFeeCents,
    serviceFeeCents: summary.serviceFeeCents,
    totalCents: summary.totalCents,
    amountReceivedCents: summary.amountReceivedCents,
    refundedAmountCents: summary.refundedAmountCents,
    netAmountCents: summary.netAmountCents,
    totalFormatted: summary.totalFormatted,
    refundedAmountFormatted: summary.refundedAmountFormatted,
    netAmountFormatted: summary.netAmountFormatted,
    subtotalFormatted: summary.subtotalFormatted,
    paymentStatus: normalizePaymentStatus(summary.paymentStatus),
    paymentMethodType: normalizePaymentMethodType(summary.paymentMethodType),
    currency: summary.currency,
    isFullyRefunded: isFullyRefunded(summary),
    isPartialRefund: isPartialRefund(summary),
    hasFailure: hasFailure(summary),
    stripePaymentIntentId: summary.stripePaymentIntentId ?? '',
    stripeCheckoutSessionId: summary.stripeCheckoutSessionId ?? '',
    stripeChargeId: summary.stripeChargeId ?? '',
    stripeCustomerId: summary.stripeCustomerId ?? '',
    disputeStatus: normalizeDisputeStatus(summary.disputeStatus),
    isDisputed: summary.isDisputed,
    disputeAmountCents: summary.disputeAmountCents,
    disputeDueBy: summary.disputeDueBy,
    disputeReason: summary.disputeReason ?? '',
    chargeCapturedAt: summary.chargeCapturedAt,
    paymentFailedAt: summary.paymentFailedAt,
    refundedAt: summary.refundedAt,
    lastPaymentError: summary.lastPaymentError ?? '',
  };
}

function toUiPaymentDetail(detail: PaymentDetailModel): OrderPaymentDetail {
  const summary = toUiPaymentSummary(detail);

  return {
    id: `${detail.orderId}:payment-detail`,
    orderId: detail.orderId,
    paymentIntentId: toNonEmptyString(detail.stripePaymentIntentId, ''),
    chargeId: detail.stripeChargeId ?? '',
    paymentMethodId: detail.paymentMethodId ?? '',
    balanceTransactionId: '',
    customerEmail: '',
    customerPhone: '',
    billingName: '',
    billingAddressLine1: '',
    billingAddressLine2: '',
    billingCity: '',
    billingState: '',
    billingPostalCode: '',
    cardBrand: toNonEmptyString(detail.cardBrand),
    cardLast4: toNonEmptyString(detail.cardLast4),
    walletType: toNonEmptyString(detail.walletType),
    billingCountry: '',
    cardExpMonth: detail.cardExpMonth ?? 0,
    cardExpYear: detail.cardExpYear ?? 0,
    cardFingerprint: detail.cardFingerprint ?? '',
    cardCountry: detail.cardCountry ?? '',
    cardNetwork: detail.network ?? '',
    funding: normalizeCardFunding(detail.cardFunding),
    cvcCheck: normalizeCvcCheck(detail.cvcCheck),
    postalCheck: normalizeAvsCheck(detail.avsZipCheck),
    avsLine1Check: normalizeAvsCheck(detail.avsLine1Check),
    threeDSecureResult: normalizeThreeDsResult(detail.threeDsResult),
    threeDSecureVersion: '',
    riskLevel: normalizeRiskLevel(detail.riskLevel),
    riskScore: detail.riskScore,
    radarRuleId: '',
    radarOutcome: detail.outcomeReason ?? detail.outcomeType ?? '',
    ipAddress: '',
    ipCountry: '',
    userAgent: '',
    deviceFingerprint: '',
    sessionId: '',
    stripeFeeCents: 0,
    stripeFeeFormatted:
      summary.currency.length > 0
        ? new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: summary.currency.toUpperCase(),
          }).format(0)
        : '$0.00',
    disputeId: detail.disputeId ?? '',
    disputeReason: detail.disputeReason ?? '',
    disputeAmountCents: detail.disputeAmountCents,
    disputeAmountFormatted: detail.disputeAmountFormatted,
    disputeDueBy: detail.disputeDueBy,
    disputeEvidenceStatus: normalizeEvidenceStatus(detail.evidenceStatus),
    disputeNetworkReasonCode: '',
    disputeOpenedAt: detail.disputedAt,
    disputeClosedAt: null,
    disputeOutcome: '',
    refundIds: [],
    lastRefundReason: '',
    lastRefundAt: detail.refundedAt,
    createdAt: detail.chargeCapturedAt ?? detail.disputedAt ?? EPOCH_DATE,
    updatedAt: detail.refundedAt ?? detail.paymentFailedAt ?? detail.disputedAt ?? EPOCH_DATE,
  };
}

function toUiFulfillmentEvidence(
  evidence: FulfillmentEvidenceModel,
): OrderFulfillmentEvidence {
  const fulfillmentType = normalizeFulfillmentType(evidence.handoffType);

  return {
    id: `${evidence.orderId}:evidence`,
    orderId: evidence.orderId,
    fulfillmentType,
    pickupPin: '',
    pickupPinVerifiedAt: evidence.pickupPinVerifiedAt,
    pickedUpByName: evidence.pickedUpByName ?? '',
    pickedUpByIdVerified: false,
    staffVerifiedBy: evidence.staffVerifiedBy ?? '',
    staffVerifiedAt: evidence.pickupPinVerifiedAt,
    pickupStation: '',
    pickupNotes: '',
    deliveryAddressSnapshot: null,
    driverName: '',
    driverPhone: '',
    vehicleDescription: '',
    dispatchedAt: evidence.outForDeliveryAt,
    outForDeliveryAt: evidence.outForDeliveryAt,
    arrivedAtDoorAt: null,
    deliveredAt: evidence.deliveredAt,
    deliveryPhotoUrl: evidence.deliveryPhotoUrl ?? '',
    deliveryPhotoTakenAt: evidence.deliveredAt,
    deliveryPhotoLat: evidence.gpsLat,
    deliveryPhotoLng: evidence.gpsLng,
    leftAtDoor: false,
    safePlaceDescription: '',
    signatureUrl: evidence.signatureUrl ?? '',
    signatureCapturedAt: evidence.deliveredAt,
    signatureIp: '',
    handoffMethod: normalizeHandoffMethod(evidence),
    handoffCode: '',
    handoffCodeVerifiedAt: evidence.pickupPinVerifiedAt,
    handoffNotes: evidence.handoffNotes ?? '',
    recipientName: evidence.recipientName ?? '',
    recipientVerified: hasNonEmptyString(evidence.recipientName),
    gpsLat: evidence.gpsLat,
    gpsLng: evidence.gpsLng,
    gpsAccuracyMeters: null,
    gpsRecordedAt: evidence.deliveredAt ?? evidence.outForDeliveryAt,
    geofenceCheckPassed: evidence.hasGps ? true : null,
    evidenceCompletenessScore: evidence.evidenceCompletenessScore,
    evidenceStatus: normalizeFulfillmentEvidenceStatus(evidence.evidenceStatus),
    flaggedReason: '',
    flaggedAt: null,
    isFlagged: normalizeFulfillmentEvidenceStatus(evidence.evidenceStatus) === 'flagged',
    createdAt: evidence.createdAt ?? EPOCH_DATE,
    updatedAt: evidence.updatedAt ?? evidence.createdAt ?? EPOCH_DATE,
  };
}

function getPreferredTab(detail: FullOrderDetail): DrawerTab {
  if (detail.flags.hasOpenDispute) {
    return 'dispute';
  }

  if (detail.flags.isProofMissing) {
    return 'evidence';
  }

  return 'payment';
}

function isTabAvailable(tab: DrawerTab, availableTabs: readonly DrawerTab[]): boolean {
  return availableTabs.includes(tab);
}

export interface UseOrderDetailsReturn {
  order: FullOrderDetail['order'] | null;
  flags: FullOrderDetail['flags'] | null;
  paymentSummary: OrderPaymentSummary | null;
  paymentDetail: OrderPaymentDetail | null;
  evidence: OrderFulfillmentEvidence | null;
  disputeEvents: FullOrderDetail['disputeEvents'];
  timeline: FullOrderDetail['timeline'];

  evidenceChecklist: EvidenceCheckItem[];
  riskSignals: RiskSignalRow[];
  disputeSummary: OrderDisputeSummary | null;
  hasDispute: boolean;
  hasEvidence: boolean;
  hasPaymentDetail: boolean;

  activeTab: DrawerTab;
  setActiveTab: (tab: DrawerTab) => void;
  availableTabs: DrawerTab[];

  isLoading: boolean;
  error: string | null;

  refresh: () => Promise<void>;
  clear: () => void;
}

export function useOrderDetails(
  supabase: AppSupabaseClient,
  orderId: string | null,
): UseOrderDetailsReturn {
  const [detail, setDetail] = useState<FullOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DrawerTab>('payment');

  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<number>(0);

  const clear = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    requestIdRef.current += 1;
    setDetail(null);
    setError(null);
    setIsLoading(false);
    setActiveTab('payment');
  }, []);

  const load = useCallback(
    async (id: string, options?: { preserveActiveTab?: boolean }): Promise<void> => {
      const nextRequestId = requestIdRef.current + 1;
      requestIdRef.current = nextRequestId;

      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchFullOrderDetail(supabase, id);

        if (controller.signal.aborted || requestIdRef.current !== nextRequestId) {
          return;
        }

        if (result.error !== null) {
          setDetail(null);
          setError(result.error.message);
          setActiveTab('payment');
          return;
        }

        const nextDetail = result.data;
        setDetail(nextDetail);

        const nextAvailableTabs: DrawerTab[] = ['payment'];
        if (nextDetail.evidence !== null) {
          nextAvailableTabs.push('evidence');
        }
        if (
          nextDetail.disputeEvents.length > 0 ||
          hasNonEmptyString(nextDetail.paymentDetail?.disputeId ?? null)
        ) {
          nextAvailableTabs.push('dispute');
        }
        nextAvailableTabs.push('timeline');

        setActiveTab((currentTab) => {
          if (options?.preserveActiveTab === true && isTabAvailable(currentTab, nextAvailableTabs)) {
            return currentTab;
          }

          return getPreferredTab(nextDetail);
        });
      } catch (loadError: unknown) {
        if (controller.signal.aborted || requestIdRef.current !== nextRequestId) {
          return;
        }

        setDetail(null);
        setError(loadError instanceof Error ? loadError.message : 'Unable to load order details.');
        setActiveTab('payment');
      } finally {
        if (!controller.signal.aborted && requestIdRef.current === nextRequestId) {
          setIsLoading(false);
        }
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (!orderId) {
      clear();
      return;
    }

    void load(orderId);

    return () => {
      abortRef.current?.abort();
    };
  }, [clear, load, orderId]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!orderId) {
      clear();
      return;
    }

    await load(orderId, { preserveActiveTab: true });
  }, [clear, load, orderId]);

  const paymentSummary = useMemo<OrderPaymentSummary | null>(() => {
    return detail?.paymentSummary ? toUiPaymentSummary(detail.paymentSummary) : null;
  }, [detail?.paymentSummary]);

  const paymentDetail = useMemo<OrderPaymentDetail | null>(() => {
    return detail?.paymentDetail ? toUiPaymentDetail(detail.paymentDetail) : null;
  }, [detail?.paymentDetail]);

  const evidence = useMemo<OrderFulfillmentEvidence | null>(() => {
    return detail?.evidence ? toUiFulfillmentEvidence(detail.evidence) : null;
  }, [detail?.evidence]);

  const evidenceChecklist = useMemo<EvidenceCheckItem[]>(() => {
    if (evidence === null) {
      return [];
    }

    return buildEvidenceChecklist(evidence);
  }, [evidence]);

  const riskSignals = useMemo<RiskSignalRow[]>(() => {
    if (paymentDetail === null) {
      return [];
    }

    return buildRiskSignals(paymentDetail);
  }, [paymentDetail]);

  const disputeSummary = useMemo<OrderDisputeSummary | null>(() => {
    if (paymentDetail === null || paymentDetail.disputeId.trim().length === 0) {
      return null;
    }

    const dueBy = paymentDetail.disputeDueBy;
    const nowMs = Date.now();

    let dueDaysLeft: number | null = null;
    if (dueBy instanceof Date && Number.isFinite(dueBy.getTime())) {
      dueDaysLeft = Math.ceil((dueBy.getTime() - nowMs) / MS_PER_DAY);
    }

    const disputeUrgency: OrderDisputeSummary['disputeUrgency'] =
      dueDaysLeft === null
        ? 'normal'
        : dueDaysLeft < 0
          ? 'overdue'
          : dueDaysLeft <= 2
            ? 'critical'
            : dueDaysLeft <= 5
              ? 'warning'
              : 'normal';

    return {
      disputeId: paymentDetail.disputeId,
      disputeStatus: paymentSummary?.disputeStatus ?? 'none',
      disputeReason: paymentDetail.disputeReason,
      disputeAmountCents: paymentDetail.disputeAmountCents,
      disputeAmountFormatted: paymentDetail.disputeAmountFormatted,
      disputeDueBy: paymentDetail.disputeDueBy,
      disputeDueDaysLeft: dueDaysLeft,
      disputeUrgency,
      evidenceStatus: paymentDetail.disputeEvidenceStatus,
      networkReasonCode: paymentDetail.disputeNetworkReasonCode,
      openedAt: paymentDetail.disputeOpenedAt,
      closedAt: paymentDetail.disputeClosedAt,
      outcome: paymentDetail.disputeOutcome,
      refundIds: paymentDetail.refundIds,
      lastRefundReason: paymentDetail.lastRefundReason,
      lastRefundAt: paymentDetail.lastRefundAt,
      events: detail?.disputeEvents ?? [],
    };
  }, [detail?.disputeEvents, paymentDetail, paymentSummary]);

  const hasDispute = useMemo<boolean>(() => {
    return Boolean((detail?.disputeEvents.length ?? 0) > 0 || paymentDetail?.disputeId);
  }, [detail?.disputeEvents.length, paymentDetail?.disputeId]);

  const hasEvidence = useMemo<boolean>(() => evidence !== null, [evidence]);

  const hasPaymentDetail = useMemo<boolean>(() => paymentDetail !== null, [paymentDetail]);

  const availableTabs = useMemo<DrawerTab[]>(() => {
    const tabs: DrawerTab[] = ['payment'];

    if (hasEvidence) {
      tabs.push('evidence');
    }

    if (hasDispute) {
      tabs.push('dispute');
    }

    tabs.push('timeline');

    return tabs;
  }, [hasDispute, hasEvidence]);

  useEffect(() => {
    if (!isTabAvailable(activeTab, availableTabs)) {
      setActiveTab(availableTabs[0] ?? 'payment');
    }
  }, [activeTab, availableTabs]);

  return {
    order: detail?.order ?? null,
    flags: detail?.flags ?? null,
    paymentSummary,
    paymentDetail,
    evidence,
    disputeEvents: detail?.disputeEvents ?? [],
    timeline: detail?.timeline ?? [],

    evidenceChecklist,
    riskSignals,
    disputeSummary,
    hasDispute,
    hasEvidence,
    hasPaymentDetail,

    activeTab,
    setActiveTab,
    availableTabs,

    isLoading,
    error,

    refresh,
    clear,
  };
}

export default useOrderDetails;