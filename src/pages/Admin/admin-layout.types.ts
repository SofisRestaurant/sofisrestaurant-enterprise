// =============================================================================
// src/pages/Admin/admin-layout.types.ts
// =============================================================================
// All types owned by the AdminLayout shell.
// Import from here — never re-declare in hooks or components.
// =============================================================================

// ── Snapshot ──────────────────────────────────────────────────────────────────

/**
 * Exact shape returned by admin_layout_snapshot via the admin-gateway.
 *
 * DB side: the view must JOIN admin_profit_snapshot so total_gross_profit_cents
 * is available in a single round-trip.
 *
 *   create or replace view public.admin_layout_snapshot as
 *   select
 *     r.today_revenue_cents,
 *     r.today_orders,
 *     r.pending_orders,
 *     r.unread_notifications,
 *     r.fraud_events_7d,
 *     r.abandoned_carts,
 *     r.pending_carts,
 *     coalesce(p.total_gross_profit_cents, 0) as total_gross_profit_cents,
 *     now() as generated_at
 *   from admin_realtime_snapshot r
 *   cross join admin_profit_snapshot p;    -- singleton (singleton_id=true)
 */
export interface AdminLayoutSnapshot {
  /** Today's gross revenue in cents */
  today_revenue_cents: number;
  /** Number of orders placed today */
  today_orders: number;
  /** Orders currently in PENDING state */
  pending_orders: number;
  /** Unread admin notifications */
  unread_notifications: number;
  /** Fraud events detected in the last 7 days */
  fraud_events_7d: number;
  /** Carts abandoned (no checkout attempt) */
  abandoned_carts: number;
  /** Carts still in progress (not yet abandoned) */
  pending_carts: number;
  /**
   * Lifetime gross profit in cents.
   * Sourced from admin_profit_snapshot (singleton table).
   * Schema: create table public.admin_profit_snapshot (
   *   singleton_id boolean primary key default true,
   *   total_gross_profit_cents bigint not null default 0,
   *   updated_at timestamptz not null default now(),
   *   constraint admin_profit_snapshot_singleton check (singleton_id = true)
   * );
   */
  total_gross_profit_cents: number;
  /** ISO timestamp when the snapshot row was generated */
  generated_at: string;
}

// ── Gateway envelope ──────────────────────────────────────────────────────────

/** Matches GatewayEnvelope<T> from admin-gateway/index.ts */
export interface GatewayEnvelope<T> {
  data: T;
  meta: { requestedBy: string; requestId: string; ts: number };
}

export type LayoutMetricsPayload = GatewayEnvelope<AdminLayoutSnapshot>;

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Three-state auth machine for AdminLayout.
 *
 *   checking  → initial; verifyAdminAccess() in flight
 *   authorized → is_admin() passed; layout renders
 *   denied    → auth failed or session expired; redirect fired
 */
export type AuthStatus = 'checking' | 'authorized' | 'denied';

// ── Metrics ───────────────────────────────────────────────────────────────────

/**
 * Fetch lifecycle phase.
 *
 *   idle        → data present, no fetch in flight
 *   loading     → first load; skeleton rendered (no prior data)
 *   refreshing  → background poll or manual refresh (existing data visible)
 *   error       → last fetch failed; error banner shown (non-fatal)
 */
export type FetchPhase = 'idle' | 'loading' | 'refreshing' | 'error';

export interface MetricsState {
  snapshot: AdminLayoutSnapshot | null;
  phase: FetchPhase;
  errorMsg: string | null;
  lastRefreshedAt: Date | null;
}

/** Module-level cache entry — survives re-renders, lost on hard reload */
export interface MetricsCache {
  snapshot: AdminLayoutSnapshot;
  ts: number;
}