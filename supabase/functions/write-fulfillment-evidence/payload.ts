import { MAX_NAME_LEN, MAX_NOTES_LEN, MAX_URL_LEN } from './constants.ts';
import { isFiniteNumber, isNonEmptyString, isRecord, isUuid } from './guards.ts';
import type {
  DeliveryPayload,
  DineInPayload,
  ErrorResponseBody,
  MarkOutForDeliveryPayload,
  PickupPayload,
  RequestPayload,
} from './types.ts';

export function truncate(value: string, maxLength: number): string {
  return value.slice(0, maxLength);
}

export function sanitizeOptionalText(value: unknown, maxLength: number): string | undefined {
  if (!isNonEmptyString(value)) return undefined;
  return truncate(value.trim(), maxLength);
}

export function sanitizeHttpsUrl(value: unknown): string | undefined {
  if (!isNonEmptyString(value)) return undefined;
  const trimmed = value.trim();
  if (!trimmed.startsWith('https://')) return undefined;
  return truncate(trimmed, MAX_URL_LEN);
}

export function sanitizeGps(value: unknown, min: number, max: number): number | undefined {
  if (!isFiniteNumber(value)) return undefined;
  if (value < min || value > max) return undefined;
  return value;
}

export function validateBasePayload(payload: Record<string, unknown>): ErrorResponseBody | null {
  if (!isUuid(payload.orderId)) {
    return { ok: false, code: 'invalid_request', message: 'orderId must be a valid UUID.', field: 'orderId' };
  }

  if (payload.staffId !== undefined && !isUuid(payload.staffId)) {
    return { ok: false, code: 'invalid_request', message: 'staffId must be a valid UUID when provided.', field: 'staffId' };
  }

  return null;
}

export function validateWritePayload(payload: Record<string, unknown>): ErrorResponseBody | null {
  const baseError = validateBasePayload(payload);
  if (baseError !== null) return baseError;

  if (payload.type !== 'pickup' && payload.type !== 'delivery' && payload.type !== 'dine_in') {
    return { ok: false, code: 'invalid_request', message: 'type must be one of pickup, delivery, or dine_in.', field: 'type' };
  }

  if (
    payload.type === 'delivery' &&
    ((payload.gpsLat !== undefined && !isFiniteNumber(payload.gpsLat)) ||
      (payload.gpsLng !== undefined && !isFiniteNumber(payload.gpsLng)))
  ) {
    return { ok: false, code: 'invalid_request', message: 'gpsLat and gpsLng must be finite numbers when provided.', field: 'gps' };
  }

  if (
    payload.type === 'delivery' &&
    payload.leftAtDoor !== undefined &&
    typeof payload.leftAtDoor !== 'boolean'
  ) {
    return { ok: false, code: 'invalid_request', message: 'leftAtDoor must be a boolean when provided.', field: 'leftAtDoor' };
  }

  if (
    payload.type === 'delivery' &&
    payload.deliveryPhotoUrl !== undefined &&
    sanitizeHttpsUrl(payload.deliveryPhotoUrl) === undefined &&
    isNonEmptyString(payload.deliveryPhotoUrl)
  ) {
    return { ok: false, code: 'invalid_request', message: 'deliveryPhotoUrl must be an https:// URL.', field: 'deliveryPhotoUrl' };
  }

  if (
    payload.type === 'delivery' &&
    payload.signatureUrl !== undefined &&
    sanitizeHttpsUrl(payload.signatureUrl) === undefined &&
    isNonEmptyString(payload.signatureUrl)
  ) {
    return { ok: false, code: 'invalid_request', message: 'signatureUrl must be an https:// URL.', field: 'signatureUrl' };
  }

  return null;
}

export function validateMarkOutForDeliveryPayload(payload: Record<string, unknown>): ErrorResponseBody | null {
  const baseError = validateBasePayload(payload);
  if (baseError !== null) return baseError;

  if (payload.action !== 'mark_out_for_delivery') {
    return { ok: false, code: 'invalid_request', message: 'action must be mark_out_for_delivery.', field: 'action' };
  }

  return null;
}

export function parsePayload(value: unknown): RequestPayload | ErrorResponseBody {
  if (!isRecord(value)) {
    return { ok: false, code: 'invalid_request', message: 'Request body must be a JSON object.' };
  }

  if (value.action === 'mark_out_for_delivery') {
    const validationError = validateMarkOutForDeliveryPayload(value);
    if (validationError !== null) return validationError;

    const payload: MarkOutForDeliveryPayload = {
      action: 'mark_out_for_delivery',
      orderId: String(value.orderId).trim(),
      ...(typeof value.staffId === 'string' ? { staffId: value.staffId.trim() } : {}),
    };

    return payload;
  }

  const validationError = validateWritePayload(value);
  if (validationError !== null) return validationError;

  if (value.type === 'pickup') {
    const payload: PickupPayload = {
      type: 'pickup',
      orderId: String(value.orderId).trim(),
      ...(typeof value.staffId === 'string' ? { staffId: value.staffId.trim() } : {}),
      ...(sanitizeOptionalText(value.recipientName, MAX_NAME_LEN) !== undefined
        ? { recipientName: sanitizeOptionalText(value.recipientName, MAX_NAME_LEN) } : {}),
      ...(sanitizeOptionalText(value.pickedUpByName, MAX_NAME_LEN) !== undefined
        ? { pickedUpByName: sanitizeOptionalText(value.pickedUpByName, MAX_NAME_LEN) } : {}),
      ...(sanitizeOptionalText(value.handoffNotes, MAX_NOTES_LEN) !== undefined
        ? { handoffNotes: sanitizeOptionalText(value.handoffNotes, MAX_NOTES_LEN) } : {}),
      ...(typeof value.pinVerified === 'boolean' ? { pinVerified: value.pinVerified } : {}),
    };
    return payload;
  }

  if (value.type === 'delivery') {
    const payload: DeliveryPayload = {
      type: 'delivery',
      orderId: String(value.orderId).trim(),
      ...(typeof value.staffId === 'string' ? { staffId: value.staffId.trim() } : {}),
      ...(sanitizeOptionalText(value.recipientName, MAX_NAME_LEN) !== undefined
        ? { recipientName: sanitizeOptionalText(value.recipientName, MAX_NAME_LEN) } : {}),
      ...(sanitizeOptionalText(value.handoffNotes, MAX_NOTES_LEN) !== undefined
        ? { handoffNotes: sanitizeOptionalText(value.handoffNotes, MAX_NOTES_LEN) } : {}),
      ...(sanitizeHttpsUrl(value.deliveryPhotoUrl) !== undefined
        ? { deliveryPhotoUrl: sanitizeHttpsUrl(value.deliveryPhotoUrl) } : {}),
      ...(sanitizeHttpsUrl(value.signatureUrl) !== undefined
        ? { signatureUrl: sanitizeHttpsUrl(value.signatureUrl) } : {}),
      ...(sanitizeGps(value.gpsLat, -90, 90) !== undefined
        ? { gpsLat: sanitizeGps(value.gpsLat, -90, 90) } : {}),
      ...(sanitizeGps(value.gpsLng, -180, 180) !== undefined
        ? { gpsLng: sanitizeGps(value.gpsLng, -180, 180) } : {}),
      ...(typeof value.leftAtDoor === 'boolean' ? { leftAtDoor: value.leftAtDoor } : {}),
    };
    return payload;
  }

  const payload: DineInPayload = {
    type: 'dine_in',
    orderId: String(value.orderId).trim(),
    ...(typeof value.staffId === 'string' ? { staffId: value.staffId.trim() } : {}),
    ...(sanitizeOptionalText(value.handoffNotes, MAX_NOTES_LEN) !== undefined
      ? { handoffNotes: sanitizeOptionalText(value.handoffNotes, MAX_NOTES_LEN) } : {}),
  };

  return payload;
}