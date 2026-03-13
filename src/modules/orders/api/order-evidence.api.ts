import { supabase } from '@/lib/supabase/supabaseClient';

const MAX_NAME_LEN = 200;
const MAX_NOTES_LEN = 1_000;
const MAX_URL_LEN = 2_048;

export type HandoffType = 'pickup' | 'delivery' | 'dine_in';
export type EvidenceStatus = 'pending' | 'partial' | 'complete';

export interface PickupEvidenceInput {
  orderId: string;
  staffId: string;
  recipientName?: string;
  pickedUpByName?: string;
  handoffNotes?: string;
  pinVerified?: boolean;
}

export interface DeliveryEvidenceInput {
  orderId: string;
  staffId: string;
  recipientName?: string;
  handoffNotes?: string;
  deliveryPhotoUrl?: string;
  signatureUrl?: string;
  gpsLat?: number;
  gpsLng?: number;
  leftAtDoor?: boolean;
}

export interface DineInEvidenceInput {
  orderId: string;
  staffId: string;
  handoffNotes?: string;
}

export type FulfillmentEvidenceInput =
  | ({ type: 'pickup' } & PickupEvidenceInput)
  | ({ type: 'delivery' } & DeliveryEvidenceInput)
  | ({ type: 'dine_in' } & DineInEvidenceInput);

export type EvidenceResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string; field?: string };

interface FunctionSuccessResponse {
  ok: true;
  code: 'evidence_written' | 'out_for_delivery_marked';
  orderId: string;
}

interface FunctionErrorResponse {
  ok: false;
  code:
    | 'origin_forbidden'
    | 'method_not_allowed'
    | 'unsupported_media_type'
    | 'empty_body'
    | 'payload_too_large'
    | 'invalid_json'
    | 'invalid_request'
    | 'unauthorized'
    | 'forbidden'
    | 'staff_mismatch'
    | 'order_not_found'
    | 'profile_not_found'
    | 'evidence_write_failed'
    | 'server_misconfigured'
    | 'internal_error';
  message: string;
  field?: string;
}

type InvokeFunctionPayload = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

function sanitizeOptionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed.slice(0, maxLength);
}

function sanitizeHttpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || !trimmed.startsWith('https://')) {
    return undefined;
  }

  return trimmed.slice(0, MAX_URL_LEN);
}

function sanitizeFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizeBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function mapFunctionError(message: string, field?: string): EvidenceResult {
  return field ? { ok: false, error: message, field } : { ok: false, error: message };
}

function isFunctionSuccessResponse(value: unknown): value is FunctionSuccessResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.ok === true &&
    typeof value.orderId === 'string' &&
    (value.code === 'evidence_written' || value.code === 'out_for_delivery_marked')
  );
}

function isFunctionErrorResponse(value: unknown): value is FunctionErrorResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.ok === false &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    (value.field === undefined || typeof value.field === 'string')
  );
}

function getInvokeErrorMessage(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const message = value.message;
  return typeof message === 'string' && message.trim().length > 0 ? message : null;
}

function validateBaseInput(input: { orderId: string; staffId: string }): EvidenceResult | null {
  if (!isUuid(input.orderId)) {
    return { ok: false, error: 'orderId must be a valid UUID.', field: 'orderId' };
  }

  if (!isUuid(input.staffId)) {
    return { ok: false, error: 'staffId must be a valid UUID.', field: 'staffId' };
  }

  return null;
}

function validatePickupInput(input: PickupEvidenceInput): EvidenceResult | null {
  return validateBaseInput(input);
}

function validateDeliveryInput(input: DeliveryEvidenceInput): EvidenceResult | null {
  const baseError = validateBaseInput(input);
  if (baseError !== null) {
    return baseError;
  }

  if (
    input.gpsLat !== undefined &&
    (!Number.isFinite(input.gpsLat) || input.gpsLat < -90 || input.gpsLat > 90)
  ) {
    return { ok: false, error: 'gpsLat must be between -90 and 90.', field: 'gpsLat' };
  }

  if (
    input.gpsLng !== undefined &&
    (!Number.isFinite(input.gpsLng) || input.gpsLng < -180 || input.gpsLng > 180)
  ) {
    return { ok: false, error: 'gpsLng must be between -180 and 180.', field: 'gpsLng' };
  }

  if ((input.gpsLat === undefined) !== (input.gpsLng === undefined)) {
    return {
      ok: false,
      error: 'gpsLat and gpsLng must both be provided together.',
      field: 'gps',
    };
  }

  if (
    input.deliveryPhotoUrl !== undefined &&
    sanitizeHttpsUrl(input.deliveryPhotoUrl) === undefined
  ) {
    return {
      ok: false,
      error: 'deliveryPhotoUrl must be an https:// URL.',
      field: 'deliveryPhotoUrl',
    };
  }

  if (input.signatureUrl !== undefined && sanitizeHttpsUrl(input.signatureUrl) === undefined) {
    return {
      ok: false,
      error: 'signatureUrl must be an https:// URL.',
      field: 'signatureUrl',
    };
  }

  return null;
}

function validateDineInInput(input: DineInEvidenceInput): EvidenceResult | null {
  return validateBaseInput(input);
}

function buildFunctionPayload(input: FulfillmentEvidenceInput): InvokeFunctionPayload {
  if (input.type === 'pickup') {
    return {
      type: 'pickup',
      orderId: input.orderId.trim(),
      staffId: input.staffId.trim(),
      recipientName: sanitizeOptionalText(input.recipientName, MAX_NAME_LEN),
      pickedUpByName: sanitizeOptionalText(input.pickedUpByName, MAX_NAME_LEN),
      handoffNotes: sanitizeOptionalText(input.handoffNotes, MAX_NOTES_LEN),
      pinVerified: input.pinVerified === true,
    };
  }

  if (input.type === 'delivery') {
    return {
      type: 'delivery',
      orderId: input.orderId.trim(),
      staffId: input.staffId.trim(),
      recipientName: sanitizeOptionalText(input.recipientName, MAX_NAME_LEN),
      handoffNotes: sanitizeOptionalText(input.handoffNotes, MAX_NOTES_LEN),
      deliveryPhotoUrl: sanitizeHttpsUrl(input.deliveryPhotoUrl),
      signatureUrl: sanitizeHttpsUrl(input.signatureUrl),
      gpsLat: sanitizeFiniteNumber(input.gpsLat),
      gpsLng: sanitizeFiniteNumber(input.gpsLng),
      leftAtDoor: sanitizeBoolean(input.leftAtDoor),
    };
  }

  return {
    type: 'dine_in',
    orderId: input.orderId.trim(),
    staffId: input.staffId.trim(),
    handoffNotes: sanitizeOptionalText(input.handoffNotes, MAX_NOTES_LEN),
  };
}

async function invokeWriteFulfillmentEvidence(
  body: InvokeFunctionPayload,
): Promise<EvidenceResult> {
  const rawResult: unknown = await supabase.functions.invoke('write-fulfillment-evidence', {
    body,
  });

  if (!isRecord(rawResult)) {
    return { ok: false, error: 'Unexpected response from write-fulfillment-evidence.' };
  }

  const invokeError = 'error' in rawResult ? rawResult.error : undefined;
  const invokeData = 'data' in rawResult ? rawResult.data : undefined;

  const invokeErrorMessage = getInvokeErrorMessage(invokeError);
  if (invokeErrorMessage !== null) {
    return { ok: false, error: invokeErrorMessage };
  }

  if (isFunctionSuccessResponse(invokeData)) {
    return { ok: true, orderId: invokeData.orderId };
  }

  if (isFunctionErrorResponse(invokeData)) {
    return mapFunctionError(invokeData.message, invokeData.field);
  }

  return { ok: false, error: 'Unexpected response from write-fulfillment-evidence.' };
}

export async function writeFulfillmentEvidence(
  input: FulfillmentEvidenceInput,
): Promise<EvidenceResult> {
  if (input.type === 'pickup') {
    const validationError = validatePickupInput(input);
    if (validationError !== null) {
      return validationError;
    }
  } else if (input.type === 'delivery') {
    const validationError = validateDeliveryInput(input);
    if (validationError !== null) {
      return validationError;
    }
  } else {
    const validationError = validateDineInInput(input);
    if (validationError !== null) {
      return validationError;
    }
  }

  return invokeWriteFulfillmentEvidence(buildFunctionPayload(input));
}

export async function markOutForDelivery(
  orderId: string,
  staffId: string,
): Promise<EvidenceResult> {
  if (!isUuid(orderId)) {
    return { ok: false, error: 'orderId must be a valid UUID.', field: 'orderId' };
  }

  if (!isUuid(staffId)) {
    return { ok: false, error: 'staffId must be a valid UUID.', field: 'staffId' };
  }

  return invokeWriteFulfillmentEvidence({
    action: 'mark_out_for_delivery',
    orderId: orderId.trim(),
    staffId: staffId.trim(),
  });
}