import { supabase } from '@/lib/supabase/supabaseClient';
import type {
  AdminDashboardMetrics,
  RevenueSummary,
  SecurityAlert,
  LoyaltyMetrics,
} from '@/domain/admin/admin.types';

// ─────────────────────────────────────────────────────────────
// Internal types / guards
// ─────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

interface SectionEnvelope {
  data?: unknown;
  error?: unknown;
}

interface RevenueSummaryRow {
  total_revenue: number | null;
  order_count?: number | null;
}

interface LoyaltyLedgerRow {
  entry_type: string | null;
  amount: number | null;
}

interface MenuInventoryRow {
  inventory_count: number | null;
  low_stock_threshold: number | null;
  available: boolean | null;
}

interface OrderRevenueRow {
  amount_subtotal: number | null;
  amount_tax: number | null;
  amount_total: number | null;
}

interface SecurityEventRow {
  id: string;
  event_type: string | null;
  severity: string | null;
  description: string | null;
  metadata: UnknownRecord | null;
  created_at: string | null;
}

interface FunctionInvokeShape {
  data: unknown;
  error: unknown;
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

function asRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

function asSectionEnvelope(value: unknown): SectionEnvelope | null {
  return isRecord(value) ? value : null;
}

function asFunctionInvokeShape(value: unknown): FunctionInvokeShape | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!('data' in value) || !('error' in value)) {
    return null;
  }

  return {
    data: value.data,
    error: value.error,
  };
}

function toNum(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getRecordNumber(record: UnknownRecord | null, key: string, fallback = 0): number {
  return record === null ? fallback : toNum(record[key], fallback);
}

class AdminMetricsServiceError extends Error {
  public readonly code:
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'TIMEOUT'
    | 'NETWORK'
    | 'SERVER'
    | 'INVALID_RESPONSE'
    | 'FALLBACK_FAILED';

  public readonly cause?: unknown;

  constructor(
    message: string,
    code:
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'TIMEOUT'
      | 'NETWORK'
      | 'SERVER'
      | 'INVALID_RESPONSE'
      | 'FALLBACK_FAILED' = 'SERVER',
    cause?: unknown,
  ) {
    super(message);
    this.name = 'AdminMetricsServiceError';
    this.code = code;
    this.cause = cause;
  }
}

function classifyInvokeError(
  message: string,
):
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'SERVER'
  | 'INVALID_RESPONSE'
  | 'FALLBACK_FAILED' {
  const normalized = message.toLowerCase();

  if (normalized.includes('timeout')) {
    return 'TIMEOUT';
  }

  if (
    normalized.includes('unauthorized') ||
    normalized.includes('jwt') ||
    normalized.includes('401')
  ) {
    return 'UNAUTHORIZED';
  }

  if (
    normalized.includes('forbidden') ||
    normalized.includes('permission') ||
    normalized.includes('insufficient') ||
    normalized.includes('403')
  ) {
    return 'FORBIDDEN';
  }

  if (
    normalized.includes('network') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('fetch')
  ) {
    return 'NETWORK';
  }

  if (normalized.includes('invalid') || normalized.includes('parse')) {
    return 'INVALID_RESPONSE';
  }

  return 'SERVER';
}

function getInvokeErrorMessage(error: unknown, fnName: string): string {
  const fallback = `Function '${fnName}' failed`;

  if (isRecord(error) && typeof error.message === 'string' && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

async function invokeWithTimeout<T>(
  fnName: string,
  body: UnknownRecord = {},
  timeoutMs = 12_000,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new AdminMetricsServiceError(`Function '${fnName}' timed out`, 'TIMEOUT'));
    }, timeoutMs);
  });

  const workPromise = (async (): Promise<T> => {
    try {
      const rawResult: unknown = await supabase.functions.invoke(fnName, {
        method: 'POST',
        body,
      });

      const invokeResult = asFunctionInvokeShape(rawResult);

      if (invokeResult === null) {
        throw new AdminMetricsServiceError(
          `Function '${fnName}' returned an invalid response envelope`,
          'INVALID_RESPONSE',
        );
      }

      const { data, error } = invokeResult;

      if (error !== null) {
        const message = getInvokeErrorMessage(error, fnName);
        throw new AdminMetricsServiceError(message, classifyInvokeError(message), error);
      }

      return data as T;
    } catch (error: unknown) {
      if (error instanceof AdminMetricsServiceError) {
        throw error;
      }

      const message = getErrorMessage(error, `Function '${fnName}' failed`);
      throw new AdminMetricsServiceError(message, classifyInvokeError(message), error);
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  })();

  return Promise.race([workPromise, timeoutPromise]);
}

function unwrapSection(section: unknown): { data: unknown; error: string | null } {
  const envelope = asSectionEnvelope(section);

  if (envelope !== null && ('data' in envelope || 'error' in envelope)) {
    return {
      data: envelope.data ?? null,
      error: isString(envelope.error) ? envelope.error : null,
    };
  }

  if (section === undefined) {
    return { data: null, error: null };
  }

  return { data: section, error: null };
}

function toSecurityAlertType(value: unknown): SecurityAlert['type'] {
  return toStr(value, 'system') as SecurityAlert['type'];
}

function toSecurityAlertSeverity(value: unknown): SecurityAlert['severity'] {
  return toStr(value, 'low') as SecurityAlert['severity'];
}

function toSecurityAlert(record: UnknownRecord): SecurityAlert | null {
  const id = toStr(record.id);

  if (id.length === 0) {
    return null;
  }

  return {
    id,
    type: toSecurityAlertType(record.type ?? record.event_type),
    severity: toSecurityAlertSeverity(record.severity),
    message: toStr(record.message ?? record.description, 'Security event detected'),
    metadata: asRecord(record.metadata) ?? {},
    createdAt: toStr(record.createdAt ?? record.created_at),
  };
}

export class AdminMetricsService {
  static async fetchDashboard(): Promise<AdminDashboardMetrics> {
    try {
      const payload = await invokeWithTimeout<unknown>('admin-metrics', {}, 12_000);

      if (!isRecord(payload)) {
        return this.fetchDashboardLegacyFallback();
      }

      const executiveSection = unwrapSection(payload.executive);
      const loyaltySection = unwrapSection(payload.loyalty);
      const liabilitySection = unwrapSection(payload.liability);
      const riskSection = unwrapSection(payload.risk);
      const fraudSection = unwrapSection(payload.fraud);

      const executiveRow = asRecord(executiveSection.data);
      const loyaltyRow = asRecord(loyaltySection.data);
      const liabilityRow = asRecord(liabilitySection.data);
      const riskRow = asRecord(riskSection.data);
      const fraudRow = asRecord(fraudSection.data);

      const monthRevenue = getRecordNumber(executiveRow, 'revenue_total_cents_30d', 0);
      const monthOrders = getRecordNumber(executiveRow, 'orders_count_30d', 0);
      const avgOrderValue = getRecordNumber(
        executiveRow,
        'avg_order_value_cents',
        monthOrders > 0 ? monthRevenue / monthOrders : 0,
      );

      const pointsIssued = getRecordNumber(loyaltyRow, 'points_earned_30d', 0);
      const pointsRedeemed = getRecordNumber(loyaltyRow, 'points_redeemed_30d', 0);
      const outstandingLiability = getRecordNumber(liabilityRow, 'points_outstanding', 0);
      const failedPayments = getRecordNumber(riskRow, 'failed_payments', 0);
      const fraudAlerts = getRecordNumber(fraudRow, 'total_events_24h', 0);

      return {
        todayRevenue: 0,
        weekRevenue: 0,
        monthRevenue,
        avgOrderValue,
        todayOrders: 0,
        weekOrders: 0,
        pendingOrders: 0,
        pointsIssued,
        pointsRedeemed,
        outstandingLiability,
        failedPayments,
        fraudAlerts,
        blockedIPs: 0,
        lowStockItems: 0,
        outOfStockItems: 0,
        activeCampaigns: 0,
        abandonedCarts: 0,
        recoveryRate: 0,
      };
    } catch (error: unknown) {
      console.error('Error fetching dashboard metrics (function):', error);
      return this.fetchDashboardLegacyFallback(error);
    }
  }

  private static async fetchDashboardLegacyFallback(
    cause?: unknown,
  ): Promise<AdminDashboardMetrics> {
    try {
      const [revenueData, orderData, loyaltyData, securityData, inventoryData, marketingData] =
        await Promise.all([
          this.getRevenueMetrics(),
          this.getOrderMetrics(),
          this.getLoyaltyMetrics(),
          this.getSecurityMetrics(),
          this.getInventoryMetrics(),
          this.getMarketingMetrics(),
        ]);

      return {
        todayRevenue: revenueData.today,
        weekRevenue: revenueData.week,
        monthRevenue: revenueData.month,
        avgOrderValue: revenueData.avgOrderValue,
        todayOrders: orderData.today,
        weekOrders: orderData.week,
        pendingOrders: orderData.pending,
        pointsIssued: loyaltyData.issued,
        pointsRedeemed: loyaltyData.redeemed,
        outstandingLiability: loyaltyData.liability,
        failedPayments: securityData.failedPayments,
        fraudAlerts: securityData.fraudAlerts,
        blockedIPs: securityData.blockedIPs,
        lowStockItems: inventoryData.lowStock,
        outOfStockItems: inventoryData.outOfStock,
        activeCampaigns: marketingData.active,
        abandonedCarts: marketingData.abandoned,
        recoveryRate: marketingData.recoveryRate,
      };
    } catch (error: unknown) {
      throw new AdminMetricsServiceError(
        getErrorMessage(cause ?? error, 'Failed to load dashboard metrics'),
        'FALLBACK_FAILED',
        error,
      );
    }
  }

  private static async getRevenueMetrics(): Promise<{
    today: number;
    week: number;
    month: number;
    avgOrderValue: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const { data: todayData, error: todayErr } = await supabase
      .from('revenue_summary')
      .select('total_revenue, order_count')
      .gte('period_start', today.toISOString())
      .maybeSingle<RevenueSummaryRow>();

    const { data: weekData, error: weekErr } = await supabase
      .from('revenue_summary')
      .select('total_revenue')
      .gte('period_start', weekAgo.toISOString())
      .maybeSingle<RevenueSummaryRow>();

    const { data: monthData, error: monthErr } = await supabase
      .from('revenue_summary')
      .select('total_revenue')
      .gte('period_start', monthAgo.toISOString())
      .maybeSingle<RevenueSummaryRow>();

    if (todayErr !== null) {
      console.warn('[admin-metrics] revenue today error:', todayErr.message);
    }

    if (weekErr !== null) {
      console.warn('[admin-metrics] revenue week error:', weekErr.message);
    }

    if (monthErr !== null) {
      console.warn('[admin-metrics] revenue month error:', monthErr.message);
    }

    const totalToday = toNum(todayData?.total_revenue, 0);
    const orderCount = toNum(todayData?.order_count, 0);

    return {
      today: totalToday,
      week: toNum(weekData?.total_revenue, 0),
      month: toNum(monthData?.total_revenue, 0),
      avgOrderValue: orderCount > 0 ? totalToday / orderCount : 0,
    };
  }

  private static async getOrderMetrics(): Promise<{
    today: number;
    week: number;
    pending: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [todayResult, weekResult, pendingResult] = await Promise.all([
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString()),
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString()),
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'confirmed', 'preparing']),
    ]);

    return {
      today: todayResult.count ?? 0,
      week: weekResult.count ?? 0,
      pending: pendingResult.count ?? 0,
    };
  }

  private static async getLoyaltyMetrics(): Promise<LoyaltyMetrics> {
    const { data, error } = await supabase
      .from('loyalty_ledger')
      .select('entry_type, amount')
      .in('entry_type', ['earned', 'redeemed'])
      .returns<LoyaltyLedgerRow[]>();

    if (error !== null) {
      console.warn('[admin-metrics] loyalty_ledger error:', error.message);
      return { issued: 0, redeemed: 0, liability: 0 };
    }

    const ledger = data ?? [];

    const issued = ledger
      .filter((entry) => entry.entry_type === 'earned')
      .reduce((sum, entry) => sum + toNum(entry.amount, 0), 0);

    const redeemed = ledger
      .filter((entry) => entry.entry_type === 'redeemed')
      .reduce((sum, entry) => sum + Math.abs(toNum(entry.amount, 0)), 0);

    return {
      issued,
      redeemed,
      liability: issued - redeemed,
    };
  }

  private static async getSecurityMetrics(): Promise<{
    failedPayments: number;
    fraudAlerts: number;
    blockedIPs: number;
  }> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [failedPayments, fraudAlerts, blockedIPs] = await Promise.all([
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('payment_status', 'failed')
        .gte('created_at', since24h),
      supabase
        .from('fraud_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', since24h),
      supabase
        .from('ip_blocks')
        .select('*', { count: 'exact', head: true })
        .gt('blocked_until', new Date().toISOString()),
    ]);

    return {
      failedPayments: failedPayments.count ?? 0,
      fraudAlerts: fraudAlerts.count ?? 0,
      blockedIPs: blockedIPs.count ?? 0,
    };
  }

  private static async getInventoryMetrics(): Promise<{
    lowStock: number;
    outOfStock: number;
  }> {
    const { data, error } = await supabase
      .from('menu_items')
      .select('inventory_count, low_stock_threshold, available')
      .returns<MenuInventoryRow[]>();

    if (error !== null) {
      console.warn('[admin-metrics] menu_items inventory error:', error.message);
      return { lowStock: 0, outOfStock: 0 };
    }

    const items = data ?? [];

    const lowStock = items.filter((item) => {
      const inventoryCount = toNum(item.inventory_count, 0);
      const lowStockThreshold = toNum(item.low_stock_threshold, 0);

      return inventoryCount > 0 && lowStockThreshold > 0 && inventoryCount <= lowStockThreshold;
    }).length;

    const outOfStock = items.filter((item) => item.available === false).length;

    return { lowStock, outOfStock };
  }

  private static async getMarketingMetrics(): Promise<{
    active: number;
    abandoned: number;
    recoveryRate: number;
  }> {
    try {
      const data = await invokeWithTimeout<unknown>(
        'admin-gateway',
        { action: 'marketing_metrics' },
        12_000,
      );

      const record = asRecord(data);

      if (record !== null) {
        return {
          active: toNum(record.activeCampaigns ?? record.active, 0),
          abandoned: toNum(record.abandonedCarts ?? record.abandoned, 0),
          recoveryRate: toNum(record.recoveryRate ?? record.recovery_rate, 0),
        };
      }
    } catch (error: unknown) {
      console.warn(
        '[admin-metrics] marketing_metrics function fallback:',
        getErrorMessage(error, 'Unknown error'),
      );
    }

    return { active: 0, abandoned: 0, recoveryRate: 0 };
  }

  static async getRevenueSummary(period: 'day' | 'week' | 'month'): Promise<RevenueSummary> {
    try {
      const data = await invokeWithTimeout<unknown>(
        'admin-gateway',
        { action: 'revenue_summary', period },
        12_000,
      );

      const record = asRecord(data);

      if (record !== null) {
        return {
          period,
          totalRevenue: toNum(record.totalRevenue, 0),
          orderCount: toNum(record.orderCount, 0),
          avgOrderValue: toNum(record.avgOrderValue, 0),
          taxCollected: toNum(record.taxCollected, 0),
          grossProfit: toNum(record.grossProfit, 0),
          netProfit: toNum(record.netProfit, 0),
        };
      }
    } catch (error: unknown) {
      console.warn(
        '[admin-metrics] revenue_summary function fallback:',
        getErrorMessage(error, 'Unknown error'),
      );
    }

    const now = new Date();
    const startDate = new Date();

    switch (period) {
      case 'day':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
    }

    const { data, error } = await supabase
      .from('orders')
      .select('amount_subtotal, amount_tax, amount_total')
      .gte('created_at', startDate.toISOString())
      .eq('payment_status', 'paid')
      .returns<OrderRevenueRow[]>();

    if (error !== null) {
      console.warn('[admin-metrics] getRevenueSummary legacy error:', error.message);

      return {
        period,
        totalRevenue: 0,
        orderCount: 0,
        avgOrderValue: 0,
        taxCollected: 0,
        grossProfit: 0,
        netProfit: 0,
      };
    }

    const orders = data ?? [];
    const totalRevenue = orders.reduce((sum, order) => sum + toNum(order.amount_total, 0), 0);
    const taxCollected = orders.reduce((sum, order) => sum + toNum(order.amount_tax, 0), 0);
    const orderCount = orders.length;

    return {
      period,
      totalRevenue,
      orderCount,
      avgOrderValue: orderCount > 0 ? totalRevenue / orderCount : 0,
      taxCollected,
      grossProfit: totalRevenue * 0.65,
      netProfit: totalRevenue * 0.25,
    };
  }

  static async getSecurityAlerts(limit = 10): Promise<SecurityAlert[]> {
    try {
      const data = await invokeWithTimeout<unknown>(
        'admin-gateway',
        { action: 'security_alerts', limit },
        12_000,
      );

      const record = asRecord(data);
      const rawAlerts = record !== null && Array.isArray(record.alerts) ? record.alerts : data;

      if (Array.isArray(rawAlerts)) {
        return rawAlerts
          .filter(isRecord)
          .map(toSecurityAlert)
          .filter((alert): alert is SecurityAlert => alert !== null);
      }
    } catch (error: unknown) {
      console.warn(
        '[admin-metrics] security_alerts function fallback:',
        getErrorMessage(error, 'Unknown error'),
      );
    }

    const { data, error } = await supabase
      .from('security_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
      .returns<SecurityEventRow[]>();

    if (error !== null) {
      console.warn('[admin-metrics] getSecurityAlerts legacy error:', error.message);
      return [];
    }

    return (data ?? [])
      .map((event) =>
        toSecurityAlert({
          id: event.id,
          event_type: event.event_type,
          severity: event.severity,
          description: event.description,
          metadata: event.metadata,
          created_at: event.created_at,
        }),
      )
      .filter((alert): alert is SecurityAlert => alert !== null);
  }
}

export const adminMetricsService = AdminMetricsService;