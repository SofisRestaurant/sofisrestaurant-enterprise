export type EvidenceStatus = 'pending' | 'partial' | 'complete';

export type HandoffMethod =
  | 'pin_verified'
  | 'signature'
  | 'photo'
  | 'staff_confirmed'
  | 'driver_confirmed'
  | 'contactless'
  | 'none';

export type Role = 'admin' | 'staff' | 'customer';

export type SuccessCode = 'evidence_written' | 'out_for_delivery_marked';

export type ErrorCode =
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

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ErrorResponseBody {
  ok: false;
  code: ErrorCode;
  message: string;
  field?: string;
}

export interface SuccessResponseBody {
  ok: true;
  code: SuccessCode;
  orderId: string;
}

export type ResponseBody = ErrorResponseBody | SuccessResponseBody;

export interface ProfileRoleRow {
  role: string | null;
}

export interface ExistingEvidenceRow {
  order_id: string;
  fulfillment_type: string;
  pickup_pin_verified_at: string | null;
  picked_up_by_name: string | null;
  picked_up_by_id_verified: boolean;
  staff_verified_by: string | null;
  staff_verified_at: string | null;
  pickup_notes: string | null;
  driver_id: string | null;
  out_for_delivery_at: string | null;
  delivered_at: string | null;
  delivery_photo_url: string | null;
  delivery_photo_taken_at: string | null;
  delivery_photo_lat: string | number | null;
  delivery_photo_lng: string | number | null;
  signature_url: string | null;
  signature_captured_at: string | null;
  handoff_method: string;
  handoff_notes: string | null;
  recipient_name: string | null;
  recipient_verified: boolean;
  gps_lat: string | number | null;
  gps_lng: string | number | null;
  gps_recorded_at: string | null;
  evidence_status: string;
  handoff_type: string | null;
  left_at_door: boolean;
}

export interface OrderExistsRow {
  id: string;
}

export interface BasePayload {
  orderId: string;
  staffId?: string;
}

export interface PickupPayload extends BasePayload {
  type: 'pickup';
  recipientName?: string;
  pickedUpByName?: string;
  handoffNotes?: string;
  pinVerified?: boolean;
}

export interface DeliveryPayload extends BasePayload {
  type: 'delivery';
  recipientName?: string;
  handoffNotes?: string;
  deliveryPhotoUrl?: string;
  signatureUrl?: string;
  gpsLat?: number;
  gpsLng?: number;
  leftAtDoor?: boolean;
}

export interface DineInPayload extends BasePayload {
  type: 'dine_in';
  handoffNotes?: string;
}

export type WritePayload = PickupPayload | DeliveryPayload | DineInPayload;

export interface MarkOutForDeliveryPayload extends BasePayload {
  action: 'mark_out_for_delivery';
}

export type RequestPayload = WritePayload | MarkOutForDeliveryPayload;