// src/hooks/useDashboard.mappers.ts
// =============================================================================
// Dashboard mappers — convert admin-gateway responses -> LiveMetrics
// Production goals:
// - Correct TS narrowing on GatewayResponse unions
// - Zero unsafe `.data` access (fixes TS2339/never)
// - Stable defaults + forward-compatible mapping
// =============================================================================

import type { LiveMetrics } from './useDashboard.types';
import { DEFAULT_METRICS } from './useDashboard.types';

import type {
  GatewayResponse,
  GatewayErr,
  ExecutiveSnapshot,
  AdminLayoutSnapshot,
} from '@/features/admin/api/adminGateway.types';

import { isGatewayErr } from '@/features/admin/api/adminGateway.types';

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function asNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function debugGatewayFailure(err: GatewayErr, scope: string) {
  console.warn(`[${scope}]`, {
    code: err.error.code,
    message: err.error.message,
    requestId: err.meta.requestId,
    requestedBy: err.meta.requestedBy,
    ts: err.meta.ts,
    details: err.error.details,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// snapshot appliers (pure)
// ─────────────────────────────────────────────────────────────────────────────

function applyLayoutSnapshot(
  out: LiveMetrics,
  snap: Partial<AdminLayoutSnapshot> | null,
): LiveMetrics {
  if (!snap) return out;

  const next: LiveMetrics = {
    ...out,
    todayRevenueCents: asNum(snap.today_revenue_cents, out.todayRevenueCents),
    todayOrders: asNum(snap.today_orders, out.todayOrders),
    pendingOrders: asNum(snap.pending_orders, out.pendingOrders),
    unreadNotifs: asNum(snap.unread_notifications, out.unreadNotifs),
    fraudEvents: asNum(snap.fraud_events_7d, out.fraudEvents),
    abandonedCarts: asNum(snap.abandoned_carts, out.abandonedCarts),
  };

  // Optional: only set if LiveMetrics actually has it
  if (isRecord(next) && 'pendingCarts' in next) {
    (next as any).pendingCarts = asNum(snap.pending_carts, (next as any).pendingCarts ?? 0);
  }

  return next;
}

function applyExecutiveSnapshot(
  out: LiveMetrics,
  snap: Partial<ExecutiveSnapshot> | null,
): LiveMetrics {
  if (!snap) return out;

  const net30d = asNum(snap.net_revenue_30d_cents, 0);
  const grossProfit30d = asNum(snap.total_gross_profit_cents, 0);

  // Only attach extra KPI fields if LiveMetrics supports them (future-proof)
  const next = out as any;

  if (next && typeof next === 'object') {
    if ('netRevenue30dCents' in next) next.netRevenue30dCents = net30d;
    if ('grossProfit30dCents' in next) next.grossProfit30dCents = grossProfit30d;
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// public mappers (only exports in this file)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ✅ admin-gateway "metrics" -> LiveMetrics
 * Executive snapshot is 30d KPIs, not “today tiles”.
 */
export function mapGatewayMetricsToLiveMetrics(
  res: GatewayResponse<ExecutiveSnapshot | null>,
): LiveMetrics {
  if (isGatewayErr(res)) {
    debugGatewayFailure(res, 'admin-gateway:metrics');
    return { ...DEFAULT_METRICS };
  }

  const snap = (res.data ?? null) as Partial<ExecutiveSnapshot> | null;
  return applyExecutiveSnapshot({ ...DEFAULT_METRICS }, snap);
}

/**
 * ✅ admin-gateway "layout" -> LiveMetrics
 * This powers the AdminLayout tiles.
 */
export function mapGatewayLayoutToLiveMetrics(
  res: GatewayResponse<AdminLayoutSnapshot | null>,
): LiveMetrics {
  if (isGatewayErr(res)) {
    debugGatewayFailure(res, 'admin-gateway:layout');
    return { ...DEFAULT_METRICS };
  }

  const snap = (res.data ?? null) as Partial<AdminLayoutSnapshot> | null;
  return applyLayoutSnapshot({ ...DEFAULT_METRICS }, snap);
}

/**
 * Merge both gateway results:
 * - layout = “today tiles”
 * - metrics = 30d KPI extras (optional)
 */
export function mergeGatewaySnapshots(
  layoutRes: GatewayResponse<AdminLayoutSnapshot | null> | null,
  metricsRes: GatewayResponse<ExecutiveSnapshot | null> | null,
): LiveMetrics {
  let out: LiveMetrics = { ...DEFAULT_METRICS };

  if (layoutRes) {
    if (isGatewayErr(layoutRes)) debugGatewayFailure(layoutRes, 'admin-gateway:layout');
    else
      out = applyLayoutSnapshot(
        out,
        (layoutRes.data ?? null) as Partial<AdminLayoutSnapshot> | null,
      );
  }

  if (metricsRes) {
    if (isGatewayErr(metricsRes)) debugGatewayFailure(metricsRes, 'admin-gateway:metrics');
    else
      out = applyExecutiveSnapshot(
        out,
        (metricsRes.data ?? null) as Partial<ExecutiveSnapshot> | null,
      );
  }

  return out;
}
