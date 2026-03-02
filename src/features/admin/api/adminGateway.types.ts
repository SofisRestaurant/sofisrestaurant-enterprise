// src/features/admin/api/adminGateway.types.ts
// =============================================================================
// Admin Gateway Types — front-end contract for Edge Function "admin-gateway"
// Production goals:
// - Strongly typed Ok/Err envelopes
// - Discriminated unions + type guards
// - ResponseMap per action (single source of truth)
// =============================================================================

export type OrdersListPayload = {
  page?: number
}

export type AdminAction = 'metrics' | 'orders:list' | 'layout'

export type GatewayMeta = {
  requestedBy: string
  requestId: string
  ts: number
}

export type GatewayError = {
  code: string
  message: string
  details?: unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// Envelopes (Ok / Err)
// ─────────────────────────────────────────────────────────────────────────────

export type GatewayOk<T> = Readonly<{
  data: Readonly<T>
  meta: Readonly<GatewayMeta>
}>

export type GatewayErr = Readonly<{
  error: Readonly<GatewayError>
  meta: Readonly<GatewayMeta>
}>

export type GatewayResponse<T> = GatewayOk<T> | GatewayErr

export function isGatewayErr<T>(v: GatewayResponse<T>): v is GatewayErr {
  return typeof v === 'object' && v !== null && 'error' in v
}

export function isGatewayOk<T>(v: GatewayResponse<T>): v is GatewayOk<T> {
  return typeof v === 'object' && v !== null && 'data' in v
}

// Optional helper (safe unwrap)
export function unwrapGateway<T>(v: GatewayResponse<T>): T {
  if (isGatewayErr(v)) {
    const e = v.error
    throw new Error(`${e.code}: ${e.message}`)
  }
  return v.data as T
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot payloads (DB views)
// ─────────────────────────────────────────────────────────────────────────────

export type ExecutiveSnapshot = {
  net_revenue_30d_cents: number
  total_gross_profit_cents: number
  generated_at: string
}

export type AdminLayoutSnapshot = {
  today_revenue_cents: number
  today_orders: number
  pending_orders: number
  unread_notifications: number
  fraud_events_7d: number
  abandoned_carts: number
  pending_carts: number
  generated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Request contract
// ─────────────────────────────────────────────────────────────────────────────

export type GatewayRequest =
  | { action: 'metrics'; payload?: undefined }
  | { action: 'layout'; payload?: undefined }
  | { action: 'orders:list'; payload?: OrdersListPayload }

// ─────────────────────────────────────────────────────────────────────────────
// Response map (per action)
// ─────────────────────────────────────────────────────────────────────────────

export type AdminGatewayResponseMap = {
  metrics: GatewayResponse<ExecutiveSnapshot | null>
  layout: GatewayResponse<AdminLayoutSnapshot | null>
  'orders:list': GatewayResponse<unknown[]>
}