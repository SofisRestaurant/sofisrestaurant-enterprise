import Stripe from "stripe";
import type { Json } from "../_shared/database.types.ts";
import type { OrderType } from "../_shared/pricing.ts";
import {
  DB_ORD_CANCELED,
  DB_ORD_CONFIRMED,
  DB_PMT_CANCELED,
  DB_PMT_DISPUTED,
  DB_PMT_FAILED,
  DB_PMT_PAID,
  DB_PMT_PARTIAL_REFUND,
  DB_PMT_REFUNDED,
  MAX_AWARD_AMOUNT_CENTS,
} from "./env.ts";
import type {
  ChargeEventPayload,
  ChargeRefundPayload,
  CheckoutSessionEventRef,
  DisputeEventPayload,
  DisputeEvidenceSummary,
  OrderLocated,
  PaymentIntentEventPayload,
  PaymentIntentLastError,
} from "./types.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyJsonObject(
  value: unknown,
): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length > 0;
}

export function toJson(value: unknown): Json {
  if (value === null) {
    return null;
  }

  if (
    typeof value === "string" || typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toJson(entry));
  }

  if (isRecord(value)) {
    const output: Record<string, Json> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = toJson(entry);
    }
    return output;
  }

  return null;
}

export function pickMeta(
  metadata: Stripe.Metadata | null | undefined,
  ...keys: string[]
): string | null {
  if (metadata === null || metadata === undefined) {
    return null;
  }

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
}

export function parseCents(raw: string | null | undefined): number {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return 0;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function normCurrency(value: unknown): string {
  if (typeof value !== "string") {
    return "usd";
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : "usd";
}

export function normalizeOrderType(raw: string | null | undefined): OrderType {
  if (raw === "pickup" || raw === "delivery" || raw === "dine_in") {
    return raw;
  }

  return "pickup";
}

export function clampCents(value: unknown): number {
  const normalized = typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : 0;
  return Math.min(MAX_AWARD_AMOUNT_CENTS, Math.max(0, normalized));
}

export function normalizeStripePaid(session: Stripe.Checkout.Session): boolean {
  return session.payment_status === "paid" || session.status === "complete";
}

export function shouldRepairToPaid(order: OrderLocated): boolean {
  const paymentStatus = order.payment_status.trim().toLowerCase();
  const orderStatus = order.status.trim().toLowerCase();

  if (paymentStatus === DB_PMT_PAID) {
    return false;
  }

  if (
    paymentStatus === DB_PMT_REFUNDED || paymentStatus === DB_PMT_PARTIAL_REFUND
  ) {
    return false;
  }

  return (
    paymentStatus === DB_PMT_FAILED ||
    paymentStatus === DB_PMT_CANCELED ||
    paymentStatus === DB_PMT_DISPUTED ||
    paymentStatus === "chargeback" ||
    paymentStatus === "payment_reversed" ||
    orderStatus === DB_ORD_CANCELED ||
    orderStatus !== DB_ORD_CONFIRMED
  );
}

export function shouldAllowFailureTransition(order: OrderLocated): boolean {
  const paymentStatus = order.payment_status.trim().toLowerCase();

  return (
    paymentStatus !== DB_PMT_PAID &&
    paymentStatus !== DB_PMT_REFUNDED &&
    paymentStatus !== DB_PMT_PARTIAL_REFUND
  );
}

export function snapshotNumber(snapshot: unknown, key: string): number {
  if (!isRecord(snapshot)) {
    return 0;
  }

  const value = snapshot[key];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : 0;
}

export function snapshotString(snapshot: unknown, key: string): string | null {
  if (!isRecord(snapshot)) {
    return null;
  }

  const value = snapshot[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function snapshotStringArray(snapshot: unknown, key: string): string[] {
  if (!isRecord(snapshot)) {
    return [];
  }

  const value = snapshot[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = record[key];
  return isRecord(value) ? value : null;
}

function readArray(
  record: Record<string, unknown>,
  key: string,
): unknown[] | null {
  const value = record[key];
  return Array.isArray(value) ? value : null;
}

function readExpandableId(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (isRecord(value)) {
    const nestedId = readString(value, "id");
    return nestedId;
  }

  return null;
}

function readLastPaymentError(
  record: Record<string, unknown>,
): PaymentIntentLastError | null {
  const errorRecord = readRecord(record, "last_payment_error");
  if (errorRecord === null) {
    return null;
  }

  return {
    code: readString(errorRecord, "code"),
    declineCode: readString(errorRecord, "decline_code"),
    message: readString(errorRecord, "message"),
    type: readString(errorRecord, "type"),
  };
}

export function parseCheckoutSessionEventRef(
  event: Stripe.Event,
): CheckoutSessionEventRef | null {
  const object = event.data.object;
  if (!isRecord(object)) {
    return null;
  }

  const id = readString(object, "id");
  return id === null ? null : { id };
}

export function parsePaymentIntentEventPayload(
  event: Stripe.Event,
): PaymentIntentEventPayload | null {
  const object = event.data.object;
  if (!isRecord(object)) {
    return null;
  }

  const id = readString(object, "id");
  if (id === null) {
    return null;
  }

  return {
    id,
    amountReceived: readNumber(object, "amount_received") ?? 0,
    currency: readString(object, "currency"),
    latestChargeId: readExpandableId(object, "latest_charge"),
    cancellationReason: readString(object, "cancellation_reason"),
    lastPaymentError: readLastPaymentError(object),
  };
}

function parseRefundPayload(value: unknown): ChargeRefundPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    id: readString(value, "id"),
    amount: readNumber(value, "amount") ?? 0,
    currency: readString(value, "currency"),
    reason: readString(value, "reason"),
    status: readString(value, "status"),
    created: readNumber(value, "created"),
  };
}

export function parseChargeEventPayload(
  event: Stripe.Event,
): ChargeEventPayload | null {
  const object = event.data.object;
  if (!isRecord(object)) {
    return null;
  }

  const id = readString(object, "id");
  if (id === null) {
    return null;
  }

  const refundsRecord = readRecord(object, "refunds");
  const refundItems = refundsRecord === null
    ? null
    : readArray(refundsRecord, "data");
  const refunds = refundItems === null
    ? []
    : refundItems.map(parseRefundPayload).filter((
      value,
    ): value is ChargeRefundPayload => value !== null);

  return {
    id,
    paymentIntentId: readExpandableId(object, "payment_intent"),
    amountRefunded: readNumber(object, "amount_refunded") ?? 0,
    amount: readNumber(object, "amount") ?? 0,
    currency: readString(object, "currency"),
    refunds,
  };
}

function parseDisputeEvidenceSummary(
  record: Record<string, unknown>,
): DisputeEvidenceSummary | null {
  const evidence = readRecord(record, "evidence");
  if (evidence === null) {
    return null;
  }

  return {
    hasCustomerSignature: readString(evidence, "customer_signature") !== null,
    hasReceipt: readString(evidence, "receipt") !== null,
    hasServiceDocumentation:
      readString(evidence, "service_documentation") !== null,
    hasShippingDocumentation:
      readString(evidence, "shipping_documentation") !== null,
    hasCustomerCommunication:
      readString(evidence, "customer_communication") !== null,
    uncategorizedText: readString(evidence, "uncategorized_text"),
  };
}

export function parseDisputeEventPayload(
  event: Stripe.Event,
): DisputeEventPayload | null {
  const object = event.data.object;
  if (!isRecord(object)) {
    return null;
  }

  const id = readString(object, "id");
  if (id === null) {
    return null;
  }

  const evidenceDetails = readRecord(object, "evidence_details");

  return {
    id,
    paymentIntentId: readExpandableId(object, "payment_intent"),
    chargeId: readExpandableId(object, "charge"),
    amount: readNumber(object, "amount") ?? 0,
    reason: readString(object, "reason"),
    status: readString(object, "status"),
    evidenceDueByUnix: evidenceDetails === null
      ? null
      : readNumber(evidenceDetails, "due_by"),
    networkReasonCode: readString(object, "network_reason_code"),
    evidenceSummary: parseDisputeEvidenceSummary(object),
  };
}

export function resolveLatestRefund(
  refunds: readonly ChargeRefundPayload[],
): ChargeRefundPayload | null {
  if (refunds.length === 0) {
    return null;
  }

  const sorted = [...refunds].sort((left, right) =>
    (right.created ?? 0) - (left.created ?? 0)
  );
  return sorted[0] ?? null;
}
