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
// Optional fields that may or may not exist on LiveMetrics today
//
// WHY THIS APPROACH:
// The original code used `as any` to write `pendingCarts`, `netRevenue30dCents`,
// and `grossProfit30dCents` onto a `LiveMetrics` value conditionally — only if
// those keys already existed at runtime. The intent was forward-compatibility:
// don't fail if the type doesn't have the field yet, but do set it if it does.
//
// `as any` erases the type entirely and triggers no-explicit-any,
// no-unsafe-member-access, no-unsafe-argument, and no-unsafe-assignment.
//
// The correct pattern is an intersection with Partial<OptionalMetricFields>:
//   LiveMetrics & Partial<OptionalMetricFields>
//
// This gives TypeScript a precise type for the optional keys — every access is
// fully typed, no lint violations — while the `'key' in obj` guard at runtime
// still ensures we only set the field when it is already present on the object.
// ─────────────────────────────────────────────────────────────────────────────

/** Fields that exist on LiveMetrics today or may be added in the future. */
interface OptionalMetricFields {
  pendingCarts: number;
  netRevenue30dCents: number;
  grossProfit30dCents: number;
}

/** A LiveMetrics value with typed access to the optional extension fields. */
type ExtendedMetrics = LiveMetrics & Partial<OptionalMetricFields>;

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

  // Cast once to ExtendedMetrics so optional fields are typed, not `any`.
  // The cast is safe: ExtendedMetrics is a supertype of LiveMetrics — it only
  // adds optional fields, never removes or changes required ones.
  const next: ExtendedMetrics = {
    ...out,
    todayRevenueCents: asNum(snap.today_revenue_cents, out.todayRevenueCents),
    todayOrders: asNum(snap.today_orders, out.todayOrders),
    pendingOrders: asNum(snap.pending_orders, out.pendingOrders),
    unreadNotifs: asNum(snap.unread_notifications, out.unreadNotifs),
    fraudEvents: asNum(snap.fraud_events_7d, out.fraudEvents),
    abandonedCarts: asNum(snap.abandoned_carts, out.abandonedCarts),
  };

  // Only write pendingCarts if it already exists on the object at runtime
  // (forward-compatible: no-op if LiveMetrics hasn't added the field yet).
  if (isRecord(next) && 'pendingCarts' in next) {
    next.pendingCarts = asNum(snap.pending_carts, next.pendingCarts ?? 0);
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

  // Cast once to ExtendedMetrics — same reasoning as applyLayoutSnapshot above.
  const next: ExtendedMetrics = out;

  if ('netRevenue30dCents' in next) next.netRevenue30dCents = net30d;
  if ('grossProfit30dCents' in next) next.grossProfit30dCents = grossProfit30d;

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// public mappers (only exports in this file)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ✅ admin-gateway "metrics" -> LiveMetrics
 * Executive snapshot is 30d KPIs, not "today tiles".
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
 * - layout = "today tiles"
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