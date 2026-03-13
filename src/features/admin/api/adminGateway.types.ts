// =============================================================================
// Admin Gateway Types (2026 Enterprise Contract)
// src/features/admin/api/adminGateway.types.ts
//
// Single source of truth for all admin-gateway communication.
//
// Goals
// - Prevent invalid gateway requests
// - Enforce action/payload contracts at compile time
// - Normalize Ok/Error envelopes
// - Provide safe unwrap utilities
// - Ensure frontend & edge function stay in sync
// =============================================================================

/* -------------------------------------------------------------------------- */
/* Meta + Error                                                               */
/* -------------------------------------------------------------------------- */

export type GatewayMeta = Readonly<{
  requestedBy: string;
  requestId: string;
  ts: number;
}>;

export type GatewayError = Readonly<{
  code: string;
  message: string;
  details?: unknown;
}>;

/* -------------------------------------------------------------------------- */
/* Envelopes                                                                  */
/* -------------------------------------------------------------------------- */

export type GatewayOk<T> = Readonly<{
  data: Readonly<T>;
  meta: GatewayMeta;
}>;

export type GatewayErr = Readonly<{
  error: GatewayError;
  meta: GatewayMeta;
}>;

export type GatewayResponse<T> = GatewayOk<T> | GatewayErr;

/* -------------------------------------------------------------------------- */
/* Type Guards                                                                */
/* -------------------------------------------------------------------------- */

export function isGatewayErr<T>(v: GatewayResponse<T>): v is GatewayErr {
  return typeof v === 'object' && v !== null && 'error' in v;
}

export function isGatewayOk<T>(v: GatewayResponse<T>): v is GatewayOk<T> {
  return typeof v === 'object' && v !== null && 'data' in v;
}

/* -------------------------------------------------------------------------- */
/* Safe Unwrap                                                                */
/* -------------------------------------------------------------------------- */

export function unwrapGateway<T>(v: GatewayResponse<T>): T {
  if (isGatewayErr(v)) {
    const e = v.error;
    throw new Error(`${e.code}: ${e.message}`);
  }

  return v.data as T;
}

/* -------------------------------------------------------------------------- */
/* Core Payload Types                                                         */
/* -------------------------------------------------------------------------- */

export type OrdersListPayload = {
  page?: number;
};

export type MenuFullPayload = {
  page?: number;
  pageSize?: number;
};

/* -------------------------------------------------------------------------- */
/* Campaign Types                                                             */
/* -------------------------------------------------------------------------- */

export type CampaignTogglePayload = {
  id: string;
  active: boolean;
};

export type CampaignCreatePayload = {
  campaign_name: string;
  placement: string;
  menu_item_id?: string | null;
  badge?: string | null;
  hero_title?: string | null;
  hero_subtitle?: string | null;
  cta_label?: string | null;
  deep_link?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  active?: boolean;
  is_featured?: boolean;
  eligible_for_rotation?: boolean;
  priority?: number;
  weight?: number;
};

export type CampaignUpdatePayload = {
  id: string;
} & Partial<CampaignCreatePayload>;

export type CampaignPinFeaturedPayload = {
  id: string;
  placement: string;
};

/* -------------------------------------------------------------------------- */
/* Promo Payload Types                                                        */
/* -------------------------------------------------------------------------- */

export type PromoTogglePayload = {
  id: string;
  active: boolean;
};

export type PromoCreatePayload = {
  code: string;
  type: 'percent' | 'fixed' | 'amount' | 'bogo' | 'free_item';
  value: number;
  active?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  expires_at?: string | null;
  min_order_cents?: number;
  max_uses?: number | null;
  per_user_limit?: number;
  channel?: string | null;
};

/* -------------------------------------------------------------------------- */
/* Snapshot / Result Types                                                    */
/* -------------------------------------------------------------------------- */

export type ExecutiveSnapshot = {
  net_revenue_30d_cents: number;
  total_gross_profit_cents: number;
  generated_at: string;
};

export type AdminLayoutSnapshot = {
  today_revenue_cents: number;
  today_orders: number;
  pending_orders: number;
  unread_notifications: number;
  fraud_events_7d: number;
  abandoned_carts: number;
  pending_carts: number;
  generated_at: string;
};

export type PromoGatewayRow = {
  id: string;
  code: string;
  active: boolean;
  type: string;
  value: number;
  starts_at: string | null;
  ends_at: string | null;
  expires_at: string | null;
  min_order_cents: number | null;
  max_uses: number | null;
  current_uses: number | null;
  per_user_limit: number | null;
  channel: string | null;
  created_at: string | null;
  updated_at?: string | null;
};

export type CampaignRotationResult = {
  rotatedCount: number;
  requestId: string;
  asOf: string;
};

/* -------------------------------------------------------------------------- */
/* Gateway Action Map                                                         */
/* -------------------------------------------------------------------------- */

export type AdminGatewayActionMap = {
  /* ───────── Core Admin Metrics ───────── */

  metrics: {
    payload: undefined;
    response: ExecutiveSnapshot | null;
  };

  layout: {
    payload: undefined;
    response: AdminLayoutSnapshot | null;
  };

  'orders:list': {
    payload: OrdersListPayload | undefined;
    response: unknown[];
  };

  /* ───────── Menu Management ───────── */

  'menu:full': {
    payload: MenuFullPayload | undefined;
    response: unknown[];
  };

  /* ───────── Campaign Management ───────── */

  'campaigns:list': {
    payload: undefined;
    response: unknown[];
  };

  'campaigns:create': {
    payload: CampaignCreatePayload;
    response: unknown;
  };

  'campaigns:update': {
    payload: CampaignUpdatePayload;
    response: unknown;
  };

  'campaigns:toggle': {
    payload: CampaignTogglePayload;
    response: unknown;
  };

  'campaigns:pin-featured': {
    payload: CampaignPinFeaturedPayload;
    response: unknown;
  };

  'campaigns:run-rotation': {
    payload: undefined;
    response: CampaignRotationResult ;
  };

  /* ───────── Promo Management ───────── */

  'promos:list': {
    payload: undefined;
    response: PromoGatewayRow[];
  };

  'promos:toggle': {
    payload: PromoTogglePayload;
    response: { ok: true } ;
  };

  'promos:create': {
    payload: PromoCreatePayload;
    response: PromoGatewayRow;
  };
};

/* -------------------------------------------------------------------------- */
/* Derived Action Types                                                       */
/* -------------------------------------------------------------------------- */

export type AdminAction = keyof AdminGatewayActionMap;

export type GatewayRequest<A extends AdminAction = AdminAction> =
  GatewayPayload<A> extends undefined
    ? { action: A }
    : { action: A; payload: GatewayPayload<A> };

export type AdminGatewayResponseMap = {
  [K in AdminAction]: GatewayResponse<AdminGatewayActionMap[K]['response']>;
};

/* -------------------------------------------------------------------------- */
/* Utility Types                                                              */
/* -------------------------------------------------------------------------- */

export type GatewayPayload<A extends AdminAction> = AdminGatewayActionMap[A]['payload'];

export type GatewayResult<A extends AdminAction> = AdminGatewayActionMap[A]['response'];

/* -------------------------------------------------------------------------- */
/* Runtime Guards (defensive safety)                                          */
/* -------------------------------------------------------------------------- */

export function isGatewayResponse(v: unknown): v is GatewayResponse<unknown> {
  if (typeof v !== 'object' || v === null) {
    return false;
  }

  const record = v as Record<string, unknown>;
  return 'data' in record || 'error' in record;
}