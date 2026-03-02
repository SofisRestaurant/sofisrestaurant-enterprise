// supabase/functions/admin-metrics/index.ts
// ============================================================================
// ADMIN METRICS — Production Hardened
// - Uses shared Supabase clients (no direct createClient import here)
// - Auth: verifies user JWT + checks admin via RPC is_admin(uid)
// - Strict CORS
// - Query timeouts + total function timeout
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient, createAnonClient } from '../_shared/supabase.ts'
import type { Database } from '../_shared/database.types.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Env (typed, safe)
// ─────────────────────────────────────────────────────────────────────────────

function mustEnv(key: string): string {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`Missing required env var: ${key}`)
  return v
}

// Ensure these exist (helps early fail in deploy)
mustEnv('SUPABASE_URL')
mustEnv('SUPABASE_SERVICE_ROLE_KEY')
mustEnv('SUPABASE_ANON_KEY')

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const QUERY_TIMEOUT_MS = 8_000
const TOTAL_TIMEOUT_MS = 20_000

const ALLOWED_ORIGINS = [
  'https://sofislegacy.com',
  'https://www.sofislegacy.com',
  'https://sofisrestaurant.netlify.app',
  'http://localhost:3000',
  'http://localhost:5173',
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type TypedClient = SupabaseClient<Database>

type QueryResult<T> = {
  data: T | null
  error: string | null
  duration_ms: number
}

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────

function isAllowedOrigin(origin: string): origin is (typeof ALLOWED_ORIGINS)[number] {
  return (ALLOWED_ORIGINS as readonly string[]).includes(origin)
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Logger
// ─────────────────────────────────────────────────────────────────────────────

function log(level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) {
  const entry = JSON.stringify({
    level,
    event,
    service: 'admin-metrics',
    timestamp: new Date().toISOString(),
    ...(data ?? {}),
  })
  if (level === 'error') console.error(entry)
  else if (level === 'warn') console.warn(entry)
  else console.log(entry)
}

function errMsg(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// safeQuery (timeout + never throws)
// ─────────────────────────────────────────────────────────────────────────────

function safeQuery<T>(
  name: string,
  queryFn: (svc: TypedClient) => PromiseLike<{ data: T | null; error: unknown }>,
  svc: TypedClient,
): Promise<QueryResult<T>> {
  const start = Date.now()

  const timeoutRace = new Promise<QueryResult<T>>((resolve) =>
    setTimeout(() => {
      const duration_ms = Date.now() - start
      log('warn', 'query_timeout', { name, duration_ms })
      resolve({
        data: null,
        error: `Query '${name}' timed out after ${QUERY_TIMEOUT_MS}ms`,
        duration_ms,
      })
    }, QUERY_TIMEOUT_MS),
  )

  const work = (async (): Promise<QueryResult<T>> => {
    try {
      const { data, error } = await queryFn(svc)
      const duration_ms = Date.now() - start

      if (error) {
        const msg = errMsg(error)
        log('warn', 'query_error', { name, error: msg, duration_ms })
        return { data: null, error: msg, duration_ms }
      }

      if (data === null) log('warn', 'query_null_result', { name, duration_ms })
      else log('info', 'query_ok', { name, duration_ms })

      return { data, error: null, duration_ms }
    } catch (e) {
      const duration_ms = Date.now() - start
      const msg = errMsg(e)
      log('error', 'query_exception', { name, error: msg, duration_ms })
      return { data: null, error: msg, duration_ms }
    }
  })()

  return Promise.race([work, timeoutRace])
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth (JWT → userId) + Admin check via RPC
// ─────────────────────────────────────────────────────────────────────────────

async function authenticateAdmin(
  req: Request,
): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  const rawAuth = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!rawAuth?.startsWith('Bearer ')) return { ok: false, reason: 'Missing Authorization header' }

  const token = rawAuth.slice('Bearer '.length).trim()
  if (!token) return { ok: false, reason: 'Empty token' }

  // 1) Identify caller (RLS enforced)
  const anon = createAnonClient(token)
  const { data: userRes, error: userErr } = await anon.auth.getUser()
  if (userErr || !userRes?.user) return { ok: false, reason: 'Invalid or expired token' }
  const userId = userRes.user.id

  // 2) Verify admin (service role)
  const svc = createServiceClient()
  const { data: isAdmin, error: adminErr } = await svc.rpc('is_admin', { uid: userId })
  if (adminErr) return { ok: false, reason: 'Admin check failed' }
  if (!isAdmin) return { ok: false, reason: 'Insufficient permissions' }

  return { ok: true, userId }
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries (typed, stable)
// ─────────────────────────────────────────────────────────────────────────────

type RevenueRow = Database['public']['Views']['admin_revenue_summary']['Row']
type ItemConsumptionRow = Database['public']['Views']['admin_item_consumption']['Row']
type HeatmapRow = Database['public']['Views']['admin_hourly_heatmap']['Row']
type LoyaltySummaryRow = Database['public']['Views']['admin_loyalty_summary']['Row']
type LoyaltyLiabilityRow = Database['public']['Views']['admin_loyalty_liability']['Row']
type RiskSnapshotRow = Database['public']['Views']['admin_risk_snapshot']['Row']
type FraudSnapshotRow = Database['public']['Views']['admin_fraud_snapshot']['Row']
type ExecutiveSnapshotRow = Database['public']['Views']['admin_executive_snapshot']['Row']

function queryRevenue(svc: TypedClient) {
  return safeQuery<RevenueRow[]>(
    'revenue',
    (s) =>
      s
        .from('admin_revenue_summary')
        .select(
          'day, gross_revenue_cents, net_revenue_cents, paid_orders_count, refunded_cents, refunds_count',
        )
        .order('day', { ascending: true })
        .limit(30),
    svc,
  )
}

function queryTopItems(svc: TypedClient) {
  // IMPORTANT: your view columns are item_name, qty_sold, revenue_impact_cents, orders_with_item
  return safeQuery<ItemConsumptionRow[]>(
    'topItems',
    (s) =>
      s
        .from('admin_item_consumption')
        .select('item_name, qty_sold, revenue_impact_cents, orders_with_item')
        .order('revenue_impact_cents', { ascending: false })
        .limit(10),
    svc,
  )
}

function queryHeatmap(svc: TypedClient) {
  return safeQuery<HeatmapRow[]>(
    'heatmap',
    (s) =>
      s
        .from('admin_hourly_heatmap')
        .select('hour_of_day, orders_count, revenue_cents')
        .order('hour_of_day', { ascending: true }),
    svc,
  )
}

function queryLoyalty(svc: TypedClient) {
  return safeQuery<LoyaltySummaryRow>(
    'loyalty',
    (s) =>
      s
        .from('admin_loyalty_summary')
        .select('points_earned_30d, points_redeemed_30d, active_users_30d')
        .maybeSingle(),
    svc,
  )
}

function queryLiability(svc: TypedClient) {
  return safeQuery<LoyaltyLiabilityRow>(
    'liability',
    (s) => s.from('admin_loyalty_liability').select('points_outstanding, accounts_count').maybeSingle(),
    svc,
  )
}

function queryRisk(svc: TypedClient) {
  return safeQuery<RiskSnapshotRow>(
    'risk',
    (s) => s.from('admin_risk_snapshot').select('disputes, failed_payments, refunds, cancelled_orders').maybeSingle(),
    svc,
  )
}

function queryFraud(svc: TypedClient) {
  return safeQuery<FraudSnapshotRow>(
    'fraud',
    (s) => s.from('admin_fraud_snapshot').select('total_events_30d, total_events_24h').maybeSingle(),
    svc,
  )
}

function queryExecutive(svc: TypedClient) {
  return safeQuery<ExecutiveSnapshotRow>(
    'executive',
    (s) =>
      s
        .from('admin_executive_snapshot')
        .select('revenue_total_cents_30d, revenue_subtotal_cents_30d, tax_total_cents_30d, avg_order_value_cents, orders_count_30d')
        .maybeSingle(),
    svc,
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Response helper
// ─────────────────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, cors: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID()
  const startTime = Date.now()
  const cors = corsHeaders(req.headers.get('origin'))

  log('info', 'request_received', { requestId, method: req.method })

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'GET' && req.method !== 'POST')
    return jsonResponse({ error: 'Method not allowed' }, cors, 405)

  const auth = await authenticateAdmin(req)
  if (!auth.ok) {
    log('warn', 'auth_failed', { requestId, reason: auth.reason })
    return jsonResponse({ error: 'Unauthorized' }, cors, 401)
  }

  // Service client for admin reads
  const svc = createServiceClient() as TypedClient

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const totalTimeout = new Promise<Response>((resolve) => {
    timeoutId = setTimeout(() => {
      log('error', 'function_timeout', { requestId })
      resolve(jsonResponse({ error: 'Request timed out' }, cors, 504))
    }, TOTAL_TIMEOUT_MS)
  })

  const work = (async (): Promise<Response> => {
    const [revenue, topItems, loyalty, liability, risk, fraud, heatmap, executive] = await Promise.all([
      queryRevenue(svc),
      queryTopItems(svc),
      queryLoyalty(svc),
      queryLiability(svc),
      queryRisk(svc),
      queryFraud(svc),
      queryHeatmap(svc),
      queryExecutive(svc),
    ])

    const sections = { revenue, topItems, loyalty, liability, risk, fraud, heatmap, executive }
    const errorCount = Object.values(sections).filter((s) => s.error !== null).length
    const duration_ms = Date.now() - startTime

    log('info', 'request_complete', {
      requestId,
      userId: auth.userId,
      duration_ms,
      errorCount,
    })

    const status = errorCount === 8 ? 500 : errorCount > 0 ? 207 : 200

    return jsonResponse(
      {
        meta: {
          request_id: requestId,
          duration_ms,
          error_count: errorCount,
          generated_at: new Date().toISOString(),
        },
        ...sections,
      },
      cors,
      status,
    )
  })()

  const response = await Promise.race([work, totalTimeout])
  if (timeoutId) clearTimeout(timeoutId)
  return response
})