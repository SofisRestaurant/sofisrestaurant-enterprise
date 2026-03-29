// supabase/functions/admin-metrics/index.ts
// ============================================================================
// ADMIN METRICS — Enterprise / Production Hardened (2026)
// ----------------------------------------------------------------------------
// Goals:
// - Fail-closed CORS (403 if origin not allowlisted)
// - Auth required (shared authenticateAdmin) with correct 401/403 mapping
// - Body size guard for POST (DoS hardening)
// - Query timeouts (per-query) + total function timeout
// - Safe logging (structured, no secrets)
// - Stable frontend contract even if view column names drift
// - No `any`, no unsafe casts
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '../_shared/supabase.ts';
import type { Database } from '../_shared/database.types.ts';
import { authenticateAdmin } from '../_shared/auth.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Env (fail-fast)
// ─────────────────────────────────────────────────────────────────────────────
function mustEnv(key: string): string {
  const value = Deno.env.get(key);
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value.trim();
}

mustEnv('SUPABASE_URL');
mustEnv('SUPABASE_SERVICE_ROLE_KEY');
mustEnv('SUPABASE_ANON_KEY');

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  MAX_BODY_BYTES: 10_000,
  QUERY_TIMEOUT_MS: 8_000,
  TOTAL_TIMEOUT_MS: 20_000,
} as const;

const ALLOWED_ORIGINS = [
  'https://sofislegacy.com',
  'https://www.sofislegacy.com',
  'https://sofisrestaurant-enterprise.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
] as const;

const ALLOWED_METHODS = 'GET, POST, OPTIONS';
const ALLOWED_HEADERS =
  'authorization, x-client-info, apikey, content-type, x-application-name, x-request-id, x-idempotency-key';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type TypedClient = SupabaseClient<Database>;

type QueryResult<T> = {
  data: T | null;
  error: string | null;
  duration_ms: number;
};

type UnknownRecord = Record<string, unknown>;

type RevenueContractRow = {
  day: string;
  total_revenue_cents: number;
  total_orders: number;
  avg_order_value_cents: number;
};

type TopItemContractRow = {
  item_name: string;
  qty_sold: number;
  revenue_impact_cents: number;
  orders_with_item: number;
};

type HeatmapContractRow = {
  hour_of_day: number;
  orders_count: number;
  revenue_cents: number;
};

type LoyaltyContract = {
  total_issued: number;
  total_redeemed: number;
  total_redemptions: number;
};

type LiabilityContract = {
  total_points_outstanding: number;
  accounts_count: number;
};

type RiskContract = {
  disputes: number;
  failed_payments: number;
  refunds: number;
  cancelled_orders: number;
};

type FraudContract = {
  total_events_30d: number;
  total_events_24h: number;
};

type ExecutiveContract = {
  avg_order_value_cents: number;
  total_orders: number;
  lifetime_revenue_cents: number;
  fraud_events_7d: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// CORS (fail-closed)
// ─────────────────────────────────────────────────────────────────────────────
function isAllowedOrigin(origin: string): origin is (typeof ALLOWED_ORIGINS)[number] {
  return (ALLOWED_ORIGINS as readonly string[]).includes(origin);
}

function getCors(req: Request): Record<string, string> | null {
  const origin = req.headers.get('origin') ?? '';
  if (!origin || !isAllowedOrigin(origin)) {
    return null;
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────────
function log(level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) {
  const entry = JSON.stringify({
    level,
    event,
    service: 'admin-metrics',
    timestamp: new Date().toISOString(),
    ...(data ?? {}),
  });

  if (level === 'error') {
    console.error(entry);
    return;
  }

  if (level === 'warn') {
    console.warn(entry);
    return;
  }

  console.log(entry);
}

function errMsg(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitive guards / parsers
// ─────────────────────────────────────────────────────────────────────────────
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}



function readStringFromKeys(record: UnknownRecord, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = readString(record[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function readNumberFromKeys(record: UnknownRecord, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = readNumber(record[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function clampNonNegativeInt(value: number | null, fallback = 0): number {
  if (value === null || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.trunc(value));
}

function normalizeIsoDayLabel(value: string | null, fallbackIndex: number): string {
  if (!value) {
    return `D${String(fallbackIndex + 1)}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 10);
  }

  return parsed.toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────────────────────
function jsonResponse(body: unknown, cors: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function jsonError(
  cors: Record<string, string>,
  message: string,
  status: number,
  extra?: unknown,
): Response {
  log(status >= 500 ? 'error' : 'warn', 'request_error', {
    status,
    message,
    extra: extra ?? null,
  });

  return jsonResponse({ error: message }, cors, status);
}

// ─────────────────────────────────────────────────────────────────────────────
// safeQuery (timeout + no-throw)
// ─────────────────────────────────────────────────────────────────────────────
function safeQuery<T>(
  name: string,
  queryFn: (svc: TypedClient) => PromiseLike<{ data: T | null; error: unknown }>,
  svc: TypedClient,
): Promise<QueryResult<T>> {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeoutRace = new Promise<QueryResult<T>>((resolve) => {
    timer = setTimeout(() => {
      const duration_ms = Date.now() - start;
      log('warn', 'query_timeout', { name, duration_ms });
      resolve({
        data: null,
        error: `Query '${name}' timed out after ${CONFIG.QUERY_TIMEOUT_MS}ms`,
        duration_ms,
      });
    }, CONFIG.QUERY_TIMEOUT_MS);
  });

  const work = (async (): Promise<QueryResult<T>> => {
    try {
      const { data, error } = await queryFn(svc);
      const duration_ms = Date.now() - start;

      if (error) {
        const message = errMsg(error);
        log('warn', 'query_error', { name, error: message, duration_ms });
        return { data: null, error: message, duration_ms };
      }

      log('info', 'query_ok', { name, duration_ms });
      return { data, error: null, duration_ms };
    } catch (error) {
      const duration_ms = Date.now() - start;
      const message = errMsg(error);
      log('error', 'query_exception', { name, error: message, duration_ms });
      return { data: null, error: message, duration_ms };
    }
  })();

  return Promise.race([work, timeoutRace]).finally(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalizers (view drift tolerant)
// ─────────────────────────────────────────────────────────────────────────────
function normalizeRevenueRows(rows: unknown): RevenueContractRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((entry, index): RevenueContractRow | null => {
      const record = asRecord(entry);
      if (record === null) {
        return null;
      }

      const totalRevenue =
        readNumberFromKeys(record, [
          'total_revenue_cents',
          'net_revenue_cents',
          'gross_revenue_cents',
          'revenue_cents',
        ]) ?? 0;

      const totalOrders =
        readNumberFromKeys(record, [
          'total_orders',
          'paid_orders_count',
          'orders_count',
          'orders',
        ]) ?? 0;

      const avgOrderValue =
        readNumberFromKeys(record, [
          'avg_order_value_cents',
          'average_order_value_cents',
          'aov_cents',
        ]) ?? (totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0);

      const day = normalizeIsoDayLabel(
        readStringFromKeys(record, ['day', 'date', 'bucket_day', 'period_start']),
        index,
      );

      return {
        day,
        total_revenue_cents: clampNonNegativeInt(totalRevenue),
        total_orders: clampNonNegativeInt(totalOrders),
        avg_order_value_cents: clampNonNegativeInt(avgOrderValue),
      };
    })
    .filter((row): row is RevenueContractRow => row !== null);
}

function normalizeTopItems(rows: unknown): TopItemContractRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((entry): TopItemContractRow | null => {
      const record = asRecord(entry);
      if (record === null) {
        return null;
      }

      const itemName = readStringFromKeys(record, ['item_name', 'name', 'menu_item_name']);
      if (itemName === null) {
        return null;
      }

      return {
        item_name: itemName,
        qty_sold: clampNonNegativeInt(
          readNumberFromKeys(record, ['qty_sold', 'quantity_sold', 'qty', 'count']),
        ),
        revenue_impact_cents: clampNonNegativeInt(
          readNumberFromKeys(record, ['revenue_impact_cents', 'revenue_cents', 'revenue']),
        ),
        orders_with_item: clampNonNegativeInt(
          readNumberFromKeys(record, ['orders_with_item', 'orders_count', 'order_count']),
        ),
      };
    })
    .filter((row): row is TopItemContractRow => row !== null);
}

function normalizeHeatmap(rows: unknown): HeatmapContractRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((entry): HeatmapContractRow | null => {
      const record = asRecord(entry);
      if (record === null) {
        return null;
      }

      const hour = readNumberFromKeys(record, ['hour_of_day', 'hour', 'bucket_hour']);
      if (hour === null) {
        return null;
      }

      return {
        hour_of_day: clampNonNegativeInt(hour),
        orders_count: clampNonNegativeInt(
          readNumberFromKeys(record, ['orders_count', 'order_count', 'orders']),
        ),
        revenue_cents: clampNonNegativeInt(
          readNumberFromKeys(record, ['revenue_cents', 'total_revenue_cents', 'revenue']),
        ),
      };
    })
    .filter((row): row is HeatmapContractRow => row !== null);
}

function normalizeLoyalty(row: unknown): LoyaltyContract | null {
  const record = asRecord(row);
  if (record === null) {
    return null;
  }

  return {
    total_issued: clampNonNegativeInt(
      readNumberFromKeys(record, [
        'total_issued',
        'points_issued',
        'points_earned_30d',
        'points_issued_30d',
      ]),
    ),
    total_redeemed: clampNonNegativeInt(
      readNumberFromKeys(record, [
        'total_redeemed',
        'points_redeemed',
        'points_redeemed_30d',
      ]),
    ),
    total_redemptions: clampNonNegativeInt(
      readNumberFromKeys(record, [
        'total_redemptions',
        'redemptions_count',
        'redemption_count',
        'active_users_30d',
      ]),
    ),
  };
}

function normalizeLiability(row: unknown): LiabilityContract | null {
  const record = asRecord(row);
  if (record === null) {
    return null;
  }

  return {
    total_points_outstanding: clampNonNegativeInt(
      readNumberFromKeys(record, [
        'total_points_outstanding',
        'points_outstanding',
        'outstanding_points',
        'points_liability',
      ]),
    ),
    accounts_count: clampNonNegativeInt(
      readNumberFromKeys(record, ['accounts_count', 'active_accounts', 'loyalty_accounts_count']),
    ),
  };
}

function normalizeRisk(row: unknown): RiskContract | null {
  const record = asRecord(row);
  if (record === null) {
    return null;
  }

  return {
    disputes: clampNonNegativeInt(
      readNumberFromKeys(record, ['disputes', 'dispute_count', 'charge_disputes']),
    ),
    failed_payments: clampNonNegativeInt(
      readNumberFromKeys(record, [
        'failed_payments',
        'failed_payment_count',
        'payment_failures',
      ]),
    ),
    refunds: clampNonNegativeInt(
      readNumberFromKeys(record, ['refunds', 'refunds_count', 'refund_count']),
    ),
    cancelled_orders: clampNonNegativeInt(
      readNumberFromKeys(record, [
        'cancelled_orders',
        'canceled_orders',
        'cancelled_count',
        'cancellations',
      ]),
    ),
  };
}

function normalizeFraud(row: unknown): FraudContract | null {
  const record = asRecord(row);
  if (record === null) {
    return null;
  }

  return {
    total_events_30d: clampNonNegativeInt(
      readNumberFromKeys(record, ['total_events_30d', 'events_30d', 'fraud_events_30d']),
    ),
    total_events_24h: clampNonNegativeInt(
      readNumberFromKeys(record, ['total_events_24h', 'events_24h', 'fraud_events_24h']),
    ),
  };
}

function normalizeExecutive(
  row: unknown,
  revenueRows: RevenueContractRow[],
  fraud: FraudContract | null,
): ExecutiveContract | null {
  const record = asRecord(row);

  const derivedRevenue30d = revenueRows.reduce((sum, item) => sum + item.total_revenue_cents, 0);
  const derivedOrders30d = revenueRows.reduce((sum, item) => sum + item.total_orders, 0);
  const derivedAov =
    derivedOrders30d > 0 ? Math.round(derivedRevenue30d / derivedOrders30d) : 0;

  const avgOrderValue = clampNonNegativeInt(
    record
      ? readNumberFromKeys(record, [
        'avg_order_value_cents',
        'average_order_value_cents',
        'aov_cents',
      ])
      : null,
    derivedAov,
  );

  const totalOrders = clampNonNegativeInt(
    record
      ? readNumberFromKeys(record, [
        'total_orders',
        'orders_count_30d',
        'orders_total',
        'paid_orders_count_30d',
      ])
      : null,
    derivedOrders30d,
  );

  const lifetimeRevenue = clampNonNegativeInt(
    record
      ? readNumberFromKeys(record, [
        'lifetime_revenue_cents',
        'revenue_total_cents_30d',
        'gross_revenue_cents_30d',
        'net_revenue_cents_30d',
      ])
      : null,
    derivedRevenue30d,
  );

  const fraudEvents7d = clampNonNegativeInt(
    record
      ? readNumberFromKeys(record, [
        'fraud_events_7d',
        'events_7d',
        'fraud_count_7d',
      ])
      : null,
    fraud?.total_events_24h ?? 0,
  );

  return {
    avg_order_value_cents: avgOrderValue,
    total_orders: totalOrders,
    lifetime_revenue_cents: lifetimeRevenue,
    fraud_events_7d: fraudEvents7d,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Raw queries
// ─────────────────────────────────────────────────────────────────────────────
function queryRevenue(svc: TypedClient) {
  return safeQuery<unknown[]>(
    'revenue',
    async (s) => {
      const response = await s
        .from('admin_revenue_summary')
        .select('*')
        .order('day', { ascending: true })
        .limit(30);

      return {
        data: (response.data ?? null) as unknown[] | null,
        error: response.error,
      };
    },
    svc,
  );
}

function queryTopItems(svc: TypedClient) {
  return safeQuery<unknown[]>(
    'topItems',
    async (s) => {
      const response = await s
        .from('admin_item_consumption')
        .select('*')
        .order('revenue_impact_cents', { ascending: false })
        .limit(10);

      return {
        data: (response.data ?? null) as unknown[] | null,
        error: response.error,
      };
    },
    svc,
  );
}

function queryHeatmap(svc: TypedClient) {
  return safeQuery<unknown[]>(
    'heatmap',
    async (s) => {
      const response = await s
        .from('admin_hourly_heatmap')
        .select('*')
        .order('hour_of_day', { ascending: true });

      return {
        data: (response.data ?? null) as unknown[] | null,
        error: response.error,
      };
    },
    svc,
  );
}

function queryLoyalty(svc: TypedClient) {
  return safeQuery<unknown>(
    'loyalty',
    async (s) => {
      const response = await s
        .from('admin_loyalty_summary')
        .select('*')
        .maybeSingle();

      return {
        data: response.data ?? null,
        error: response.error,
      };
    },
    svc,
  );
}

function queryLiability(svc: TypedClient) {
  return safeQuery<unknown>(
    'liability',
    async (s) => {
      const response = await s
        .from('admin_loyalty_liability')
        .select('*')
        .maybeSingle();

      return {
        data: response.data ?? null,
        error: response.error,
      };
    },
    svc,
  );
}

function queryRisk(svc: TypedClient) {
  return safeQuery<unknown>(
    'risk',
    async (s) => {
      const response = await s
        .from('admin_risk_snapshot')
        .select('*')
        .maybeSingle();

      return {
        data: response.data ?? null,
        error: response.error,
      };
    },
    svc,
  );
}

function queryFraud(svc: TypedClient) {
  return safeQuery<unknown>(
    'fraud',
    async (s) => {
      const response = await s
        .from('admin_fraud_snapshot')
        .select('*')
        .maybeSingle();

      return {
        data: response.data ?? null,
        error: response.error,
      };
    },
    svc,
  );
}

function queryExecutive(svc: TypedClient) {
  return safeQuery<unknown>(
    'executive',
    async (s) => {
      const response = await s
        .from('admin_executive_snapshot')
        .select('*')
        .maybeSingle();

      return {
        data: response.data ?? null,
        error: response.error,
      };
    },
    svc,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  const cors = getCors(req);
  if (cors === null) {
    return new Response('Origin not allowed', { status: 403 });
  }

  log('info', 'request_received', {
    requestId,
    method: req.method,
  });

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonError(cors, 'Method not allowed', 405);
  }

  if (req.method === 'POST') {
    const length = Number(req.headers.get('content-length') ?? '0');
    if (length && Number.isFinite(length) && length > CONFIG.MAX_BODY_BYTES) {
      return jsonError(cors, 'Payload too large', 413, {
        length,
        max: CONFIG.MAX_BODY_BYTES,
      });
    }
  }

  const auth = await authenticateAdmin(req);
  if (!auth.ok) {
    const status =
      auth.reason === 'not_admin'
        ? 403
        : auth.reason === 'missing_bearer' || auth.reason === 'empty_token'
          ? 401
          : 401;

    log('warn', 'auth_failed', {
      requestId,
      reason: auth.reason,
      status,
    });

    return jsonError(cors, auth.message, status);
  }

  const userId = auth.userId;
  const svc = createServiceClient();

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const totalTimeout = new Promise<Response>((resolve) => {
    timeoutId = setTimeout(() => {
      log('error', 'function_timeout', { requestId, userId });
      resolve(jsonResponse({ error: 'Request timed out' }, cors, 504));
    }, CONFIG.TOTAL_TIMEOUT_MS);
  });

  const work = (async (): Promise<Response> => {
    const [revenueRaw, topItemsRaw, loyaltyRaw, liabilityRaw, riskRaw, fraudRaw, heatmapRaw, executiveRaw] =
      await Promise.all([
        queryRevenue(svc),
        queryTopItems(svc),
        queryLoyalty(svc),
        queryLiability(svc),
        queryRisk(svc),
        queryFraud(svc),
        queryHeatmap(svc),
        queryExecutive(svc),
      ]);

    const revenueData = normalizeRevenueRows(revenueRaw.data);
    const topItemsData = normalizeTopItems(topItemsRaw.data);
    const heatmapData = normalizeHeatmap(heatmapRaw.data);
    const loyaltyData = normalizeLoyalty(loyaltyRaw.data);
    const liabilityData = normalizeLiability(liabilityRaw.data);
    const riskData = normalizeRisk(riskRaw.data);
    const fraudData = normalizeFraud(fraudRaw.data);
    const executiveData = normalizeExecutive(executiveRaw.data, revenueData, fraudData);

    const sections = {
      revenue: {
        data: revenueData,
        error: revenueRaw.error,
        duration_ms: revenueRaw.duration_ms,
      },
      topItems: {
        data: topItemsData,
        error: topItemsRaw.error,
        duration_ms: topItemsRaw.duration_ms,
      },
      loyalty: {
        data: loyaltyData,
        error: loyaltyRaw.error,
        duration_ms: loyaltyRaw.duration_ms,
      },
      liability: {
        data: liabilityData,
        error: liabilityRaw.error,
        duration_ms: liabilityRaw.duration_ms,
      },
      risk: {
        data: riskData,
        error: riskRaw.error,
        duration_ms: riskRaw.duration_ms,
      },
      fraud: {
        data: fraudData,
        error: fraudRaw.error,
        duration_ms: fraudRaw.duration_ms,
      },
      heatmap: {
        data: heatmapData,
        error: heatmapRaw.error,
        duration_ms: heatmapRaw.duration_ms,
      },
      executive: {
        data: executiveData,
        error: executiveRaw.error,
        duration_ms: executiveRaw.duration_ms,
      },
    };

    const errorCount = Object.values(sections).filter((section) => section.error !== null).length;
    const duration_ms = Date.now() - startTime;

    log('info', 'request_complete', {
      requestId,
      userId,
      duration_ms,
      errorCount,
      section_sizes: {
        revenue: sections.revenue.data.length,
        topItems: sections.topItems.data.length,
        heatmap: sections.heatmap.data.length,
      },
    });

    const status = errorCount === Object.keys(sections).length ? 500 : 200;

    return jsonResponse(
      {
        meta: {
          request_id: requestId,
          user_id: userId,
          duration_ms,
          error_count: errorCount,
          generated_at: new Date().toISOString(),
        },
        ...sections,
      },
      cors,
      status,
    );
  })();

  const response = await Promise.race([work, totalTimeout]);

  if (timeoutId !== null) {
    clearTimeout(timeoutId);
  }

  return response;
});