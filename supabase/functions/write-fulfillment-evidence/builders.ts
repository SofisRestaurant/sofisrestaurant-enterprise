import { MAX_NAME_LEN, MAX_NOTES_LEN } from './constants.ts';
import { mergeBoolean, mergeNumber, mergeString } from './merge.ts';
import { sanitizeHttpsUrl, sanitizeGps, sanitizeOptionalText } from './payload.ts';
import type {
  EvidenceStatus,
  ExistingEvidenceRow,
  HandoffMethod,
  JsonValue,
  WritePayload,
} from './types.ts';

export function chooseEvidenceStatus(payload: WritePayload): EvidenceStatus {
  if (payload.type === 'dine_in') return 'complete';

  if (payload.type === 'pickup') {
    const hasRecipient =
      sanitizeOptionalText(payload.recipientName, MAX_NAME_LEN) !== undefined ||
      sanitizeOptionalText(payload.pickedUpByName, MAX_NAME_LEN) !== undefined;
    return hasRecipient || payload.pinVerified === true ? 'complete' : 'partial';
  }

  const hasRecipient = sanitizeOptionalText(payload.recipientName, MAX_NAME_LEN) !== undefined;
  const hasPhoto = sanitizeHttpsUrl(payload.deliveryPhotoUrl) !== undefined;
  const hasSignature = sanitizeHttpsUrl(payload.signatureUrl) !== undefined;

  return hasRecipient || hasPhoto || hasSignature ? 'complete' : 'partial';
}

export function chooseHandoffMethod(payload: WritePayload): HandoffMethod {
  if (payload.type === 'pickup') {
    return payload.pinVerified === true ? 'pin_verified' : 'staff_confirmed';
  }

  if (payload.type === 'delivery') {
    if (sanitizeHttpsUrl(payload.signatureUrl) !== undefined) return 'signature';
    if (sanitizeHttpsUrl(payload.deliveryPhotoUrl) !== undefined) return 'photo';
    return 'driver_confirmed';
  }

  return 'staff_confirmed';
}

export function buildWriteUpsertRow(
  payload: WritePayload,
  authUserId: string,
  existing: ExistingEvidenceRow | null,
  now: string,
): Record<string, JsonValue> {
  const handoffNotes = sanitizeOptionalText(payload.handoffNotes, MAX_NOTES_LEN) ?? null;

  const recipientName =
    payload.type === 'pickup'
      ? mergeString(
          sanitizeOptionalText(payload.recipientName, MAX_NAME_LEN) ??
            sanitizeOptionalText(payload.pickedUpByName, MAX_NAME_LEN) ??
            null,
          existing?.recipient_name,
        )
      : payload.type === 'delivery'
        ? mergeString(sanitizeOptionalText(payload.recipientName, MAX_NAME_LEN) ?? null, existing?.recipient_name)
        : existing?.recipient_name ?? null;

  const pickedUpByName =
    payload.type === 'pickup'
      ? mergeString(
          sanitizeOptionalText(payload.pickedUpByName, MAX_NAME_LEN) ??
            sanitizeOptionalText(payload.recipientName, MAX_NAME_LEN) ??
            null,
          existing?.picked_up_by_name,
        )
      : existing?.picked_up_by_name ?? null;

  const deliveryPhotoUrl =
    payload.type === 'delivery'
      ? mergeString(sanitizeHttpsUrl(payload.deliveryPhotoUrl) ?? null, existing?.delivery_photo_url)
      : existing?.delivery_photo_url ?? null;

  const signatureUrl =
    payload.type === 'delivery'
      ? mergeString(sanitizeHttpsUrl(payload.signatureUrl) ?? null, existing?.signature_url)
      : existing?.signature_url ?? null;

  const gpsLat =
    payload.type === 'delivery'
      ? mergeNumber(sanitizeGps(payload.gpsLat, -90, 90) ?? null, existing?.gps_lat)
      : mergeNumber(null, existing?.gps_lat);

  const gpsLng =
    payload.type === 'delivery'
      ? mergeNumber(sanitizeGps(payload.gpsLng, -180, 180) ?? null, existing?.gps_lng)
      : mergeNumber(null, existing?.gps_lng);

  const hasGpsNow = payload.type === 'delivery' && gpsLat !== null && gpsLng !== null;
  const hasPhotoNow = payload.type === 'delivery' && deliveryPhotoUrl !== null;
  const hasSignatureNow = payload.type === 'delivery' && signatureUrl !== null;

  return {
    order_id: payload.orderId,
    fulfillment_type: payload.type,
    handoff_type: payload.type,
    handoff_method: chooseHandoffMethod(payload),
    evidence_status: chooseEvidenceStatus(payload),
    recipient_name: recipientName,
    recipient_verified:
      payload.type === 'pickup'
        ? mergeBoolean(recipientName !== null || payload.pinVerified === true, existing?.recipient_verified, false)
        : payload.type === 'delivery'
          ? mergeBoolean(recipientName !== null, existing?.recipient_verified, false)
          : mergeBoolean(true, existing?.recipient_verified, true),
    staff_verified_by: authUserId,
    staff_verified_at: now,
    handoff_notes: mergeString(handoffNotes, existing?.handoff_notes),
    updated_at: now,
    picked_up_by_name: pickedUpByName,
    picked_up_by_id_verified:
      payload.type === 'pickup'
        ? mergeBoolean(payload.pinVerified === true, existing?.picked_up_by_id_verified, false)
        : mergeBoolean(undefined, existing?.picked_up_by_id_verified, false),
    pickup_pin_verified_at:
      payload.type === 'pickup'
        ? mergeString(payload.pinVerified === true ? now : null, existing?.pickup_pin_verified_at)
        : existing?.pickup_pin_verified_at ?? null,
    pickup_notes:
      payload.type === 'pickup'
        ? mergeString(handoffNotes, existing?.pickup_notes)
        : existing?.pickup_notes ?? null,
    driver_id: payload.type === 'delivery' ? authUserId : existing?.driver_id ?? null,
    out_for_delivery_at:
      payload.type === 'delivery'
        ? mergeString(now, existing?.out_for_delivery_at)
        : existing?.out_for_delivery_at ?? null,
    delivered_at: mergeString(now, existing?.delivered_at),
    delivery_photo_url: deliveryPhotoUrl,
    delivery_photo_taken_at:
      hasPhotoNow
        ? mergeString(now, existing?.delivery_photo_taken_at)
        : existing?.delivery_photo_taken_at ?? null,
    delivery_photo_lat:
      hasPhotoNow && gpsLat !== null ? gpsLat : mergeNumber(null, existing?.delivery_photo_lat),
    delivery_photo_lng:
      hasPhotoNow && gpsLng !== null ? gpsLng : mergeNumber(null, existing?.delivery_photo_lng),
    signature_url: signatureUrl,
    signature_captured_at:
      hasSignatureNow
        ? mergeString(now, existing?.signature_captured_at)
        : existing?.signature_captured_at ?? null,
    gps_lat: gpsLat,
    gps_lng: gpsLng,
    gps_recorded_at: hasGpsNow ? mergeString(now, existing?.gps_recorded_at) : existing?.gps_recorded_at ?? null,
    left_at_door:
      payload.type === 'delivery'
        ? mergeBoolean(payload.leftAtDoor === true, existing?.left_at_door, false)
        : mergeBoolean(undefined, existing?.left_at_door, false),
  };
}

export function buildMarkOutForDeliveryUpsertRow(
  orderId: string,
  authUserId: string,
  existing: ExistingEvidenceRow | null,
  now: string,
): Record<string, JsonValue> {
  return {
    order_id: orderId,
    fulfillment_type: 'delivery',
    handoff_type: 'delivery',
    handoff_method: existing?.handoff_method ?? 'driver_confirmed',
    evidence_status: existing?.evidence_status === 'complete' ? 'complete' : 'partial',
    staff_verified_by: authUserId,
    staff_verified_at: now,
    updated_at: now,
    driver_id: authUserId,
    out_for_delivery_at: mergeString(now, existing?.out_for_delivery_at),
    recipient_name: existing?.recipient_name ?? null,
    recipient_verified: existing?.recipient_verified ?? false,
    picked_up_by_name: existing?.picked_up_by_name ?? null,
    picked_up_by_id_verified: existing?.picked_up_by_id_verified ?? false,
    handoff_notes: existing?.handoff_notes ?? null,
    pickup_notes: existing?.pickup_notes ?? null,
    pickup_pin_verified_at: existing?.pickup_pin_verified_at ?? null,
    delivered_at: existing?.delivered_at ?? null,
    delivery_photo_url: existing?.delivery_photo_url ?? null,
    delivery_photo_taken_at: existing?.delivery_photo_taken_at ?? null,
    delivery_photo_lat: mergeNumber(null, existing?.delivery_photo_lat),
    delivery_photo_lng: mergeNumber(null, existing?.delivery_photo_lng),
    signature_url: existing?.signature_url ?? null,
    signature_captured_at: existing?.signature_captured_at ?? null,
    gps_lat: mergeNumber(null, existing?.gps_lat),
    gps_lng: mergeNumber(null, existing?.gps_lng),
    gps_recorded_at: existing?.gps_recorded_at ?? null,
    left_at_door: existing?.left_at_door ?? false,
  };
}