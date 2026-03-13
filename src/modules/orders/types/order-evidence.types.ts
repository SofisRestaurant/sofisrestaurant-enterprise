// =============================================================================
// src/modules/orders/types/order-evidence.types.ts
//
// Types mirroring the order_fulfillment_evidence table from:
//   20260308000003_create_order_fulfillment_evidence.sql
// =============================================================================

// ---------------------------------------------------------------------------
// 1. Enums
// ---------------------------------------------------------------------------

export type FulfillmentType =
  | 'pickup'
  | 'curbside'
  | 'delivery'
  | 'dine_in'
  | 'drive_through'
  | 'ship';

export type FulfillmentEvidenceStatus =
  | 'pending'
  | 'partial'
  | 'complete'
  | 'flagged'
  | 'disputed'
  | 'archived';

export type HandoffMethod =
  | 'pin_verified'
  | 'signature'
  | 'photo'
  | 'staff_confirmed'
  | 'driver_confirmed'
  | 'contactless'
  | 'none';

// ---------------------------------------------------------------------------
// 2. Raw Supabase shape
// ---------------------------------------------------------------------------

export interface RawOrderFulfillmentEvidence {
  id:                        string | null;
  order_id:                  string | null;
  fulfillment_type:          string | null;

  // Pickup
  pickup_pin:                string | null;
  pickup_pin_verified_at:    string | null;
  picked_up_by_name:         string | null;
  picked_up_by_id_verified:  boolean | null;
  staff_verified_by:         string | null;
  staff_verified_at:         string | null;
  pickup_station:            string | null;
  pickup_notes:              string | null;

  // Delivery
  delivery_address_snapshot: Record<string, unknown> | null;
  driver_id:                 string | null;
  driver_name:               string | null;
  driver_phone:              string | null;
  vehicle_description:       string | null;
  dispatched_at:             string | null;
  out_for_delivery_at:       string | null;
  arrived_at_door_at:        string | null;
  delivered_at:              string | null;
  delivery_photo_url:        string | null;
  delivery_photo_taken_at:   string | null;
  delivery_photo_lat:        number | null;
  delivery_photo_lng:        number | null;
  left_at_door:              boolean | null;
  safe_place_description:    string | null;

  // Signature
  signature_url:             string | null;
  signature_captured_at:     string | null;
  signature_ip:              string | null;

  // Handoff
  handoff_method:            string | null;
  handoff_code:              string | null;
  handoff_code_verified_at:  string | null;
  handoff_notes:             string | null;
  recipient_name:            string | null;
  recipient_verified:        boolean | null;

  // GPS
  gps_lat:                   number | null;
  gps_lng:                   number | null;
  gps_accuracy_meters:       number | null;
  gps_recorded_at:           string | null;
  geofence_check_passed:     boolean | null;

  // Scoring
  evidence_completeness_score: number | null;
  evidence_status:           string | null;
  flagged_reason:            string | null;
  flagged_at:                string | null;
  flagged_by:                string | null;

  raw_driver_payload:        Record<string, unknown> | null;
  created_at:                string | null;
  updated_at:                string | null;
}

// ---------------------------------------------------------------------------
// 3. UI-safe mapped model
// ---------------------------------------------------------------------------

export interface OrderFulfillmentEvidence {
  id:                 string;
  orderId:            string;
  fulfillmentType:    FulfillmentType;

  // Pickup
  pickupPin:              string;
  pickupPinVerifiedAt:    Date | null;
  pickedUpByName:         string;
  pickedUpByIdVerified:   boolean;
  staffVerifiedBy:        string;
  staffVerifiedAt:        Date | null;
  pickupStation:          string;
  pickupNotes:            string;

  // Delivery
  deliveryAddressSnapshot: Record<string, unknown> | null;
  driverName:             string;
  driverPhone:            string;
  vehicleDescription:     string;
  dispatchedAt:           Date | null;
  outForDeliveryAt:       Date | null;
  arrivedAtDoorAt:        Date | null;
  deliveredAt:            Date | null;
  deliveryPhotoUrl:       string;
  deliveryPhotoTakenAt:   Date | null;
  deliveryPhotoLat:       number | null;
  deliveryPhotoLng:       number | null;
  leftAtDoor:             boolean;
  safePlaceDescription:   string;

  // Signature
  signatureUrl:           string;
  signatureCapturedAt:    Date | null;
  signatureIp:            string;

  // Handoff
  handoffMethod:          HandoffMethod;
  handoffCode:            string;
  handoffCodeVerifiedAt:  Date | null;
  handoffNotes:           string;
  recipientName:          string;
  recipientVerified:      boolean;

  // GPS
  gpsLat:                 number | null;
  gpsLng:                 number | null;
  gpsAccuracyMeters:      number | null;
  gpsRecordedAt:          Date | null;
  geofenceCheckPassed:    boolean | null;

  // Completeness
  evidenceCompletenessScore: number;    // 0–100
  evidenceStatus:         FulfillmentEvidenceStatus;
  flaggedReason:          string;
  flaggedAt:              Date | null;
  isFlagged:              boolean;

  createdAt:              Date;
  updatedAt:              Date;
}

// ---------------------------------------------------------------------------
// 4. Evidence checklist (used by OrderEvidencePanel)
// ---------------------------------------------------------------------------

export interface EvidenceCheckItem {
  key:      string;
  label:    string;
  status:   'complete' | 'missing' | 'warning' | 'n_a';
  value?:   string;
  url?:     string;
  timestamp?: Date | null;
}

export function buildEvidenceChecklist(
  ev: OrderFulfillmentEvidence,
): EvidenceCheckItem[] {
  const isDelivery = ev.fulfillmentType === 'delivery' || ev.fulfillmentType === 'ship';
  const isPickup   = !isDelivery;

  const items: EvidenceCheckItem[] = [];

  if (isPickup) {
    items.push(
      {
        key:       'pin',
        label:     'Pickup PIN',
        status:    ev.pickupPin ? 'complete' : 'missing',
        value:     ev.pickupPin ? '••••' : undefined,
      },
      {
        key:       'pin_verified',
        label:     'PIN verified',
        status:    ev.pickupPinVerifiedAt ? 'complete' : ev.pickupPin ? 'missing' : 'n_a',
        timestamp: ev.pickupPinVerifiedAt,
      },
      {
        key:       'picked_up_by',
        label:     'Picked up by',
        status:    ev.pickedUpByName ? 'complete' : 'missing',
        value:     ev.pickedUpByName || undefined,
      },
      {
        key:       'staff_verified',
        label:     'Staff sign-off',
        status:    ev.staffVerifiedAt ? 'complete' : 'warning',
        timestamp: ev.staffVerifiedAt,
      },
      {
        key:       'handoff',
        label:     'Handoff method',
        status:    ev.handoffMethod !== 'none' ? 'complete' : 'warning',
        value:     ev.handoffMethod.replace(/_/g, ' '),
      },
    );
  }

  if (isDelivery) {
    items.push(
      {
        key:       'dispatched',
        label:     'Dispatched',
        status:    ev.dispatchedAt ? 'complete' : 'missing',
        timestamp: ev.dispatchedAt,
      },
      {
        key:       'out_for_delivery',
        label:     'Out for delivery',
        status:    ev.outForDeliveryAt ? 'complete' : 'missing',
        timestamp: ev.outForDeliveryAt,
      },
      {
        key:       'delivered',
        label:     'Delivered',
        status:    ev.deliveredAt ? 'complete' : 'missing',
        timestamp: ev.deliveredAt,
      },
      {
        key:       'delivery_photo',
        label:     'Delivery photo',
        status:    ev.deliveryPhotoUrl ? 'complete' : 'warning',
        url:       ev.deliveryPhotoUrl || undefined,
        timestamp: ev.deliveryPhotoTakenAt,
      },
      {
        key:       'signature',
        label:     'Signature',
        status:    ev.signatureUrl ? 'complete' : 'warning',
        url:       ev.signatureUrl || undefined,
        timestamp: ev.signatureCapturedAt,
      },
      {
        key:       'gps',
        label:     'GPS location',
        status:    ev.gpsLat != null ? 'complete' : 'warning',
        value:     ev.gpsLat != null
          ? `${ev.gpsLat.toFixed(5)}, ${ev.gpsLng?.toFixed(5)}`
          : undefined,
      },
      {
        key:       'geofence',
        label:     'Geofence passed',
        status:
          ev.geofenceCheckPassed === true ? 'complete'
          : ev.geofenceCheckPassed === false ? 'warning'
          : 'missing',
      },
    );
  }

  return items;
}