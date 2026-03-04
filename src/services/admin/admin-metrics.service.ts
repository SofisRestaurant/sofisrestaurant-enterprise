// src/services/admin/admin-metrics.service.ts
// ============================================================================
// Enterprise-grade admin metrics aggregation (server-driven)
// ----------------------------------------------------------------------------
// Upgrade goals (senior-dev hardened):
// - Keep the entire public API + helper methods (nothing removed)
// - Prefer Edge Functions as source-of-truth (admin-metrics / admin-gateway)
// - Defensive parsing (payload drift-safe)
// - Timeouts, stable errors, and safe fallbacks
// - Legacy direct-table reads remain as fallback ONLY (temporary safe bridge)
// ----------------------------------------------------------------------------
// Notes:
// - This file intentionally avoids creating new Supabase clients (prevents multiple
//   GoTrueClient instances + "Cannot redefine property: supabase").
// - Any view/table not present in generated Database types must NOT be queried
//   from the browser. Those are routed through Edge Functions instead.
// ============================================================================

import { supabase } from '@/lib/supabase/supabaseClient'
import type {
  AdminDashboardMetrics,
  RevenueSummary,
  SecurityAlert,
  LoyaltyMetrics,
} from '@/domain/admin/admin.types'

// ─────────────────────────────────────────────────────────────
// Internal types / guards
// ─────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>

const isRecord = (v: unknown): v is UnknownRecord =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

function toStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function nowIso(): string {
  return new Date().toISOString()
}

class AdminMetricsServiceError extends Error {
  constructor(
    message: string,
    public code:
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'TIMEOUT'
      | 'NETWORK'
      | 'SERVER'
      | 'INVALID_RESPONSE'
      | 'FALLBACK_FAILED' = 'SERVER',
    public cause?: unknown,
  ) {
    super(message)
    this.name = 'AdminMetricsServiceError'
  }
}

function classifyInvokeError(msg: string):
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'SERVER'
  | 'INVALID_RESPONSE'
  | 'FALLBACK_FAILED' {
  const m = (msg || '').toLowerCase()

  if (m.includes('timeout')) return 'TIMEOUT'
  if (m.includes('unauthorized') || m.includes('jwt') || m.includes('401')) return 'UNAUTHORIZED'
  if (m.includes('forbidden') || m.includes('permission') || m.includes('insufficient') || m.includes('403'))
    return 'FORBIDDEN'
  if (m.includes('network') || m.includes('failed to fetch') || m.includes('fetch'))
    return 'NETWORK'
  if (m.includes('invalid') || m.includes('parse')) return 'INVALID_RESPONSE'
  return 'SERVER'
}

// Supabase invoke() body types (matches supabase-js FunctionInvokeOptions)
type InvokeBody =
  | string
  | Record<string, any>
  | File
  | Blob
  | ArrayBuffer
  | FormData
  | ReadableStream<Uint8Array>
  | undefined

function coerceInvokeBody(body: unknown): InvokeBody {
  // supabase-js typing does not allow null → omit body instead
  if (body === undefined || body === null) return undefined
  if (typeof body === 'string') return body

  // Allow plain JSON objects only (what you actually send)
  if (isRecord(body)) return body as Record<string, any>

  // If you ever need arrays, wrap: { items: [...] }
  return undefined
}

async function invokeWithTimeout<T>(
  fnName: string,
  body: unknown,
  timeoutMs = 12_000,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new AdminMetricsServiceError(`Function '${fnName}' timed out`, 'TIMEOUT'))
    }, timeoutMs)
  })

  const work = (async (): Promise<T> => {
    try {
      const payload = coerceInvokeBody(body)

      const { data, error } = await supabase.functions.invoke(fnName, {
        method: 'POST',
        ...(payload === undefined ? {} : { body: payload }),
      })

      if (error) {
        const msg = error.message || `Function '${fnName}' failed`
        throw new AdminMetricsServiceError(msg, classifyInvokeError(msg), error)
      }

      return data as T
    } catch (e) {
      if (e instanceof AdminMetricsServiceError) throw e
      const msg = e instanceof Error ? e.message : String(e)
      throw new AdminMetricsServiceError(msg || `Function '${fnName}' failed`, classifyInvokeError(msg), e)
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
  })()

  return Promise.race([work, timeout])
}

/**
 * The Edge Function `admin-metrics` returns sectioned payload:
 * {
 *   meta: {...},
 *   revenue: { data, error, duration_ms } OR revenue: [...],
 *   topItems: { data, error, ... } OR topItems: [...],
 *   loyalty: { data, ... } OR loyalty: {...},
 *   ...
 * }
 *
 * This helper normalizes both variants safely.
 */
function unwrapSection<T>(section: unknown): { data: T | null; error: string | null } {
  if (isRecord(section) && ('data' in section || 'error' in section)) {
    const data = (section as { data?: unknown }).data
    const error = (section as { error?: unknown }).error
    return {
      data: (data as T) ?? null,
      error: typeof error === 'string' ? error : null,
    }
  }

  // raw payload: treat undefined as null
  if (section === undefined) return { data: null, error: null }
  return { data: section as T, error: null }
}

// ─────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────

export class AdminMetricsService {
  /**
   * Get all dashboard metrics in one call (Edge Function: admin-metrics)
   * Server is source of truth.
   */
  static async fetchDashboard(): Promise<AdminDashboardMetrics> {
    try {
      // ✅ Primary path: single server call
      const payload = await invokeWithTimeout<unknown>('admin-metrics', {}, 12_000)

      // If payload isn't sectioned for any reason, fallback to legacy logic.
      if (!isRecord(payload)) {
        return await this.fetchDashboardLegacyFallback()
      }

      const rev = unwrapSection<unknown>(payload.revenue)
      const exec = unwrapSection<unknown>(payload.executive)
      const loyalty = unwrapSection<unknown>(payload.loyalty)
      const liability = unwrapSection<unknown>(payload.liability)
      const risk = unwrapSection<unknown>(payload.risk)
      const fraud = unwrapSection<unknown>(payload.fraud)
      const heatmap = unwrapSection<unknown>(payload.heatmap)
      const topItems = unwrapSection<unknown>(payload.topItems)

      // Build a stable output with defensive fallbacks.
      // If your function later returns revenue day/week, map them here.
      const todayRevenue = 0
      const weekRevenue = 0

      // executive snapshot is typically 30d totals; use it for month-like metrics.
      const execRow = isRecord(exec.data) ? (exec.data as UnknownRecord) : null
      const monthRevenueCents = execRow ? toNum(execRow.revenue_total_cents_30d, 0) : 0
      const monthOrders = execRow ? toNum(execRow.orders_count_30d, 0) : 0
      const avgOrderValueCents =
        execRow?.avg_order_value_cents != null
          ? toNum(execRow.avg_order_value_cents, 0)
          : monthOrders > 0
            ? Math.round(monthRevenueCents / monthOrders)
            : 0

      // loyalty + liability snapshot
      const loyaltyRow = isRecord(loyalty.data) ? (loyalty.data as UnknownRecord) : null
      const liabilityRow = isRecord(liability.data) ? (liability.data as UnknownRecord) : null
      const pointsIssued = loyaltyRow ? toNum(loyaltyRow.points_earned_30d, 0) : 0
      const pointsRedeemed = loyaltyRow ? toNum(loyaltyRow.points_redeemed_30d, 0) : 0
      const outstandingLiability = liabilityRow ? toNum(liabilityRow.points_outstanding, 0) : 0

      // risk + fraud snapshots
      const riskRow = isRecord(risk.data) ? (risk.data as UnknownRecord) : null
      const fraudRow = isRecord(fraud.data) ? (fraud.data as UnknownRecord) : null
      const failedPayments = riskRow ? toNum(riskRow.failed_payments, 0) : 0
      const fraudAlerts = fraudRow ? toNum(fraudRow.total_events_24h, 0) : 0
      const blockedIPs = 0 // add to function payload later if needed

      // Not included in your admin-metrics function payload (yet) -> safe defaults
      const pendingOrders = 0
      const lowStockItems = 0
      const outOfStockItems = 0
      const activeCampaigns = 0
      const abandonedCarts = 0
      const recoveryRate = 0

      // Return the core metrics object.
      // We do NOT use @ts-expect-error; we include extra fields via a typed merge.
      const base: AdminDashboardMetrics = {
        // Revenue
        todayRevenue,
        weekRevenue,
        monthRevenue: monthRevenueCents,
        avgOrderValue: avgOrderValueCents,

        // Orders
        todayOrders: 0,
        weekOrders: 0,
        pendingOrders,

        // Loyalty
        pointsIssued,
        pointsRedeemed,
        outstandingLiability,

        // Security
        failedPayments,
        fraudAlerts,
        blockedIPs,

        // Inventory
        lowStockItems,
        outOfStockItems,

        // Marketing
        activeCampaigns,
        abandonedCarts,
        recoveryRate,
      }

      const extras = {
        _sections: {
          revenue: rev,
          executive: exec,
          loyalty,
          liability,
          risk,
          fraud,
          heatmap,
          topItems,
        },
      }

      return Object.assign(base, extras) as AdminDashboardMetrics
    } catch (error) {
      // If the function path fails, fall back to legacy reads (temporary).
      console.error('Error fetching dashboard metrics (function):', error)
      return await this.fetchDashboardLegacyFallback(error)
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Legacy fallback (keeps old behavior to avoid breaking UI)
  // ─────────────────────────────────────────────────────────────

  private static async fetchDashboardLegacyFallback(cause?: unknown): Promise<AdminDashboardMetrics> {
    try {
      // Parallel queries for performance (legacy)
      const [
        revenueData,
        orderData,
        loyaltyData,
        securityData,
        inventoryData,
        marketingData,
      ] = await Promise.all([
        this.getRevenueMetrics(),
        this.getOrderMetrics(),
        this.getLoyaltyMetrics(),
        this.getSecurityMetrics(),
        this.getInventoryMetrics(),
        this.getMarketingMetrics(),
      ])

      const base: AdminDashboardMetrics = {
        // Revenue
        todayRevenue: revenueData.today,
        weekRevenue: revenueData.week,
        monthRevenue: revenueData.month,
        avgOrderValue: revenueData.avgOrderValue,

        // Orders
        todayOrders: orderData.today,
        weekOrders: orderData.week,
        pendingOrders: orderData.pending,

        // Loyalty
        pointsIssued: loyaltyData.issued,
        pointsRedeemed: loyaltyData.redeemed,
        outstandingLiability: loyaltyData.liability,

        // Security
        failedPayments: securityData.failedPayments,
        fraudAlerts: securityData.fraudAlerts,
        blockedIPs: securityData.blockedIPs,

        // Inventory
        lowStockItems: inventoryData.lowStock,
        outOfStockItems: inventoryData.outOfStock,

        // Marketing
        activeCampaigns: marketingData.active,
        abandonedCarts: marketingData.abandoned,
        recoveryRate: marketingData.recoveryRate,
      }

      const extras = {
        _fallback: {
          used: true,
          at: nowIso(),
          cause: cause ? String((cause as any)?.message ?? cause) : null,
        },
      }

      return Object.assign(base, extras) as AdminDashboardMetrics
    } catch (e) {
      console.error('Error fetching dashboard metrics (legacy fallback):', e)
      throw new AdminMetricsServiceError('Failed to load dashboard metrics', 'FALLBACK_FAILED', e)
    }
  }

  /**
   * Get revenue metrics from materialized view
   * (Upgraded: fail-open, never crashes UI)
   */
  private static async getRevenueMetrics() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)

    const monthAgo = new Date(today)
    monthAgo.setMonth(monthAgo.getMonth() - 1)

    const { data: todayData, error: todayErr } = await supabase
      .from('revenue_summary')
      .select('total_revenue, order_count')
      .gte('period_start', today.toISOString())
      .maybeSingle()

    const { data: weekData, error: weekErr } = await supabase
      .from('revenue_summary')
      .select('total_revenue')
      .gte('period_start', weekAgo.toISOString())
      .maybeSingle()

    const { data: monthData, error: monthErr } = await supabase
      .from('revenue_summary')
      .select('total_revenue')
      .gte('period_start', monthAgo.toISOString())
      .maybeSingle()

    if (todayErr) console.warn('[admin-metrics] revenue today error:', todayErr.message)
    if (weekErr) console.warn('[admin-metrics] revenue week error:', weekErr.message)
    if (monthErr) console.warn('[admin-metrics] revenue month error:', monthErr.message)

    const totalToday = toNum((todayData as any)?.total_revenue, 0)
    const orderCount = toNum((todayData as any)?.order_count, 0)

    return {
      today: totalToday,
      week: toNum((weekData as any)?.total_revenue, 0),
      month: toNum((monthData as any)?.total_revenue, 0),
      avgOrderValue: orderCount > 0 ? totalToday / orderCount : 0,
    }
  }

  /**
   * Get order counts and status
   */
  private static async getOrderMetrics() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const weekAgo = new Date(today)
    weekAgo.setDate(weekAgo.getDate() - 7)

    const [todayResult, weekResult, pendingResult] = await Promise.all([
      supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
      supabase.from('orders').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()),
      supabase.from('orders').select('*', { count: 'exact', head: true }).in('status', ['pending', 'confirmed', 'preparing']),
    ])

    return {
      today: todayResult.count || 0,
      week: weekResult.count || 0,
      pending: pendingResult.count || 0,
    }
  }

  /**
   * Get loyalty metrics from ledger
   */
  private static async getLoyaltyMetrics(): Promise<LoyaltyMetrics> {
    const { data: ledgerData, error } = await supabase
      .from('loyalty_ledger')
      .select('entry_type, amount')
      .in('entry_type', ['earned', 'redeemed'])

    if (error) {
      console.warn('[admin-metrics] loyalty_ledger error:', error.message)
      return { issued: 0, redeemed: 0, liability: 0 }
    }

    const issued =
      ledgerData
        ?.filter((e: any) => e.entry_type === 'earned')
        .reduce((sum: number, e: any) => sum + toNum(e.amount, 0), 0) || 0

    const redeemed =
      ledgerData
        ?.filter((e: any) => e.entry_type === 'redeemed')
        .reduce((sum: number, e: any) => sum + Math.abs(toNum(e.amount, 0)), 0) || 0

    return {
      issued,
      redeemed,
      liability: issued - redeemed,
    }
  }

  /**
   * Get security and fraud metrics
   */
  private static async getSecurityMetrics() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [failedPayments, fraudAlerts, blockedIPs] = await Promise.all([
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('payment_status', 'failed').gte('created_at', since24h),
      supabase.from('fraud_logs').select('*', { count: 'exact', head: true }).gte('created_at', since24h),
      supabase.from('ip_blocks').select('*', { count: 'exact', head: true }).gt('blocked_until', new Date().toISOString()),
    ])

    return {
      failedPayments: failedPayments.count || 0,
      fraudAlerts: fraudAlerts.count || 0,
      blockedIPs: blockedIPs.count || 0,
    }
  }

  /**
   * Get inventory status
   */
  private static async getInventoryMetrics() {
    const { data: items, error } = await supabase
      .from('menu_items')
      .select('inventory_count, low_stock_threshold, available')

    if (error) {
      console.warn('[admin-metrics] menu_items inventory error:', error.message)
      return { lowStock: 0, outOfStock: 0 }
    }

    const lowStock =
      items?.filter((i: any) => {
        const inv = toNum(i.inventory_count, 0)
        const thr = toNum(i.low_stock_threshold, 0)
        return inv > 0 && thr > 0 && inv <= thr
      }).length || 0

    const outOfStock = items?.filter((i: any) => i.available === false).length || 0

    return { lowStock, outOfStock }
  }

  /**
   * Get marketing metrics
   *
   * IMPORTANT:
   * - If admin_abandoned_cart_metrics is NOT in generated Database types,
   *   querying it from the browser will fail TS compile.
   * - Therefore we first try Edge (admin-gateway). If not available, we fail-open to zeros.
   */
  private static async getMarketingMetrics() {
    // Preferred: server-driven gateway action
    try {
      const data = await invokeWithTimeout<unknown>('admin-gateway', { action: 'marketing_metrics' }, 12_000)
      if (isRecord(data)) {
        return {
          active: toNum((data as any).activeCampaigns ?? (data as any).active, 0),
          abandoned: toNum((data as any).abandonedCarts ?? (data as any).abandoned, 0),
          recoveryRate: toNum((data as any).recoveryRate ?? (data as any).recovery_rate, 0),
        }
      }
    } catch (e) {
      console.warn('[admin-metrics] marketing_metrics function fallback:', (e as any)?.message ?? e)
    }

    // Fallback: keep method, but do NOT query unknown views from frontend
    return { active: 0, abandoned: 0, recoveryRate: 0 }
  }

  /**
   * Get detailed revenue summary for a period
   */
  static async getRevenueSummary(period: 'day' | 'week' | 'month'): Promise<RevenueSummary> {
    // Preferred: server-driven gateway action
    try {
      const data = await invokeWithTimeout<unknown>('admin-gateway', { action: 'revenue_summary', period }, 12_000)
      if (isRecord(data)) {
        return {
          period,
          totalRevenue: toNum((data as any).totalRevenue, 0),
          orderCount: toNum((data as any).orderCount, 0),
          avgOrderValue: toNum((data as any).avgOrderValue, 0),
          taxCollected: toNum((data as any).taxCollected, 0),
          grossProfit: toNum((data as any).grossProfit, 0),
          netProfit: toNum((data as any).netProfit, 0),
        }
      }
      // if payload isn't what we expect, fall through to legacy
    } catch (e) {
      console.warn('[admin-metrics] revenue_summary function fallback:', (e as any)?.message ?? e)
    }

    // Legacy behavior (kept)
    const now = new Date()
    const startDate = new Date()

    switch (period) {
      case 'day':
        startDate.setHours(0, 0, 0, 0)
        break
      case 'week':
        startDate.setDate(now.getDate() - 7)
        break
      case 'month':
        startDate.setMonth(now.getMonth() - 1)
        break
    }

    const { data: orders, error } = await supabase
      .from('orders')
      .select('amount_subtotal, amount_tax, amount_total')
      .gte('created_at', startDate.toISOString())
      .eq('payment_status', 'paid')

    if (error) {
      console.warn('[admin-metrics] getRevenueSummary legacy error:', error.message)
      return {
        period,
        totalRevenue: 0,
        orderCount: 0,
        avgOrderValue: 0,
        taxCollected: 0,
        grossProfit: 0,
        netProfit: 0,
      }
    }

    const totalRevenue = orders?.reduce((sum: number, o: any) => sum + toNum(o.amount_total, 0), 0) || 0
    const taxCollected = orders?.reduce((sum: number, o: any) => sum + toNum(o.amount_tax, 0), 0) || 0
    const orderCount = orders?.length || 0

    return {
      period,
      totalRevenue,
      orderCount,
      avgOrderValue: orderCount > 0 ? totalRevenue / orderCount : 0,
      taxCollected,
      grossProfit: totalRevenue * 0.65, // legacy estimate
      netProfit: totalRevenue * 0.25, // legacy estimate
    }
  }

  /**
   * Get recent security alerts
   */
  static async getSecurityAlerts(limit = 10): Promise<SecurityAlert[]> {
    // Preferred: server-driven gateway action
    try {
      const data = await invokeWithTimeout<unknown>('admin-gateway', { action: 'security_alerts', limit }, 12_000)
      const raw = isRecord(data) && Array.isArray((data as any).alerts) ? (data as any).alerts : data

      if (Array.isArray(raw)) {
        return raw
          .filter(isRecord)
          .map((event) => ({
            id: toStr(event.id),
            type: (toStr(event.type ?? event.event_type) as SecurityAlert['type']),
            severity: (toStr(event.severity) as SecurityAlert['severity']),
            message: toStr(event.message ?? event.description, 'Security event detected'),
            metadata: (isRecord(event.metadata) ? event.metadata : {}) as Record<string, unknown>,
            createdAt: toStr(event.createdAt ?? event.created_at),
          }))
          .filter((x) => x.id.length > 0)
      }
    } catch (e) {
      console.warn('[admin-metrics] security_alerts function fallback:', (e as any)?.message ?? e)
    }

    // Legacy behavior (kept)
    const { data, error } = await supabase
      .from('security_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.warn('[admin-metrics] getSecurityAlerts legacy error:', error.message)
      return []
    }

    return (
      data?.map((event: any) => ({
        id: event.id,
        type: event.event_type as SecurityAlert['type'],
        severity: event.severity as SecurityAlert['severity'],
        message: event.description || 'Security event detected',
        metadata: event.metadata || {},
        createdAt: event.created_at,
      })) || []
    )
  }
}

export const adminMetricsService = AdminMetricsService