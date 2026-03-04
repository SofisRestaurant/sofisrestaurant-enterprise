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
// - Fully typed view rows
// - No `any`, no unsafe casts
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../_shared/supabase.ts";
import type { Database } from "../_shared/database.types.ts";
import { authenticateAdmin } from "../_shared/auth.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Env (fail-fast)
// ─────────────────────────────────────────────────────────────────────────────
function mustEnv(key: string): string {
  const v = Deno.env.get(key);
  if (!v || !v.trim()) throw new Error(`Missing required env var: ${key}`);
  return v.trim();
}

// Ensure these exist (helps early fail in deploy)
mustEnv("SUPABASE_URL");
mustEnv("SUPABASE_SERVICE_ROLE_KEY");
mustEnv("SUPABASE_ANON_KEY");

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  MAX_BODY_BYTES: 10_000, // POST-only (best-effort)
  QUERY_TIMEOUT_MS: 8_000,
  TOTAL_TIMEOUT_MS: 20_000,
} as const;

const ALLOWED_ORIGINS = [
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
  "http://localhost:3000",
  "http://localhost:5173",
] as const;

const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-application-name, x-request-id, x-idempotency-key";
// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type TypedClient = SupabaseClient<Database>;

type QueryResult<T> = {
  data: T | null;
  error: string | null;
  duration_ms: number;
};

// Views (typed)
type RevenueRow = Database["public"]["Views"]["admin_revenue_summary"]["Row"];
type ItemConsumptionRow = Database["public"]["Views"]["admin_item_consumption"]["Row"];
type HeatmapRow = Database["public"]["Views"]["admin_hourly_heatmap"]["Row"];
type LoyaltySummaryRow = Database["public"]["Views"]["admin_loyalty_summary"]["Row"];
type LoyaltyLiabilityRow = Database["public"]["Views"]["admin_loyalty_liability"]["Row"];
type RiskSnapshotRow = Database["public"]["Views"]["admin_risk_snapshot"]["Row"];
type FraudSnapshotRow = Database["public"]["Views"]["admin_fraud_snapshot"]["Row"];
type ExecutiveSnapshotRow = Database["public"]["Views"]["admin_executive_snapshot"]["Row"];

// ─────────────────────────────────────────────────────────────────────────────
// CORS (fail-closed)
// ─────────────────────────────────────────────────────────────────────────────
function isAllowedOrigin(origin: string): origin is (typeof ALLOWED_ORIGINS)[number] {
  return (ALLOWED_ORIGINS as readonly string[]).includes(origin);
}

function getCors(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin") ?? "";
  if (!origin || !isAllowedOrigin(origin)) return null;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": ALLOWED_METHODS,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Logging (structured)
// ─────────────────────────────────────────────────────────────────────────────
function log(level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>) {
  const entry = JSON.stringify({
    level,
    event,
    service: "admin-metrics",
    timestamp: new Date().toISOString(),
    ...(data ?? {}),
  });

  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

function errMsg(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────────────────────
function jsonResponse(body: unknown, cors: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function jsonError(cors: Record<string, string>, message: string, status: number, extra?: unknown): Response {
  log(status >= 500 ? "error" : "warn", "request_error", { status, message, extra });
  return jsonResponse({ error: message }, cors, status);
}

// ─────────────────────────────────────────────────────────────────────────────
// safeQuery (timeout + no-throw + clears timers)
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
      log("warn", "query_timeout", { name, duration_ms });
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
        const msg = errMsg(error);
        log("warn", "query_error", { name, error: msg, duration_ms });
        return { data: null, error: msg, duration_ms };
      }

      log("info", "query_ok", { name, duration_ms });
      return { data, error: null, duration_ms };
    } catch (e) {
      const duration_ms = Date.now() - start;
      const msg = errMsg(e);
      log("error", "query_exception", { name, error: msg, duration_ms });
      return { data: null, error: msg, duration_ms };
    }
  })();

  return Promise.race([work, timeoutRace]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries (typed, stable)
// ─────────────────────────────────────────────────────────────────────────────
function queryRevenue(svc: TypedClient) {
  return safeQuery<RevenueRow[]>(
    "revenue",
    (s) =>
      s
        .from("admin_revenue_summary")
        .select("day, gross_revenue_cents, net_revenue_cents, paid_orders_count, refunded_cents, refunds_count")
        .order("day", { ascending: true })
        .limit(30),
    svc,
  );
}

function queryTopItems(svc: TypedClient) {
  return safeQuery<ItemConsumptionRow[]>(
    "topItems",
    (s) =>
      s
        .from("admin_item_consumption")
        .select("item_name, qty_sold, revenue_impact_cents, orders_with_item")
        .order("revenue_impact_cents", { ascending: false })
        .limit(10),
    svc,
  );
}

function queryHeatmap(svc: TypedClient) {
  return safeQuery<HeatmapRow[]>(
    "heatmap",
    (s) =>
      s
        .from("admin_hourly_heatmap")
        .select("hour_of_day, orders_count, revenue_cents")
        .order("hour_of_day", { ascending: true }),
    svc,
  );
}

function queryLoyalty(svc: TypedClient) {
  return safeQuery<LoyaltySummaryRow>(
    "loyalty",
    (s) =>
      s
        .from("admin_loyalty_summary")
        .select("points_earned_30d, points_redeemed_30d, active_users_30d")
        .maybeSingle(),
    svc,
  );
}

function queryLiability(svc: TypedClient) {
  return safeQuery<LoyaltyLiabilityRow>(
    "liability",
    (s) =>
      s
        .from("admin_loyalty_liability")
        .select("points_outstanding, accounts_count")
        .maybeSingle(),
    svc,
  );
}

function queryRisk(svc: TypedClient) {
  return safeQuery<RiskSnapshotRow>(
    "risk",
    (s) =>
      s
        .from("admin_risk_snapshot")
        .select("disputes, failed_payments, refunds, cancelled_orders")
        .maybeSingle(),
    svc,
  );
}

function queryFraud(svc: TypedClient) {
  return safeQuery<FraudSnapshotRow>(
    "fraud",
    (s) => s.from("admin_fraud_snapshot").select("total_events_30d, total_events_24h").maybeSingle(),
    svc,
  );
}

function queryExecutive(svc: TypedClient) {
  return safeQuery<ExecutiveSnapshotRow>(
    "executive",
    (s) =>
      s
        .from("admin_executive_snapshot")
        .select("revenue_total_cents_30d, revenue_subtotal_cents_30d, tax_total_cents_30d, avg_order_value_cents, orders_count_30d")
        .maybeSingle(),
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
  if (!cors) return new Response("Origin not allowed", { status: 403 });

  log("info", "request_received", { requestId, method: req.method });

  // Preflight must be 2xx + same CORS headers
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonError(cors, "Method not allowed", 405);
  }

  // POST body size guard (best-effort)
  if (req.method === "POST") {
    const len = Number(req.headers.get("content-length") ?? "0");
    if (len && Number.isFinite(len) && len > CONFIG.MAX_BODY_BYTES) {
      return jsonError(cors, "Payload too large", 413, { len, max: CONFIG.MAX_BODY_BYTES });
    }
  }

  // Auth (shared)
  const auth = await authenticateAdmin(req);
  if (!auth.ok) {
    // Correct 401/403 mapping
    const status =
      auth.reason === "not_admin"
        ? 403
        : auth.reason === "missing_bearer" || auth.reason === "empty_token"
          ? 401
          : 401;

    log("warn", "auth_failed", { requestId, reason: auth.reason, status });
    return jsonError(cors, auth.message, status);
  }

  const userId = auth.userId;

  // Service client for admin reads (bypasses RLS)
  const svc = createServiceClient() as TypedClient;

  // Total timeout (hard cap)
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const totalTimeout = new Promise<Response>((resolve) => {
    timeoutId = setTimeout(() => {
      log("error", "function_timeout", { requestId, userId });
      resolve(jsonResponse({ error: "Request timed out" }, cors, 504));
    }, CONFIG.TOTAL_TIMEOUT_MS);
  });

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
    ]);

    const sections = { revenue, topItems, loyalty, liability, risk, fraud, heatmap, executive };
    const errorCount = Object.values(sections).filter((s) => s.error !== null).length;
    const duration_ms = Date.now() - startTime;

    log("info", "request_complete", {
      requestId,
      userId,
      duration_ms,
      errorCount,
    });

    // 207 is acceptable; if you prefer compatibility, set to 200 always.
    const status = errorCount === 8 ? 500 : errorCount > 0 ? 207 : 200;

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
  if (timeoutId) clearTimeout(timeoutId);
  return response;
});