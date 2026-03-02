// supabase/functions/admin-gateway/index.ts
// =============================================================================
// ADMIN GATEWAY ROUTER — ENTERPRISE MODE (PRODUCTION GRADE, 2026)
// =============================================================================

import { service } from "./lib/service.ts";
import { authenticateAdmin } from "../_shared/auth.ts";

// ─────────────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const o = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://sofislegacy.com";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-application-name",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENVELOPES
// ─────────────────────────────────────────────────────────────────────────────

type Meta = { requestedBy: string; requestId: string; ts: number };

type Ok<T> = { data: T; meta: Meta };
type Err = { error: { code: string; message: string; details?: unknown }; meta: Meta };

function json(body: unknown, headers: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function ok<T>(data: T, meta: Meta, headers: Record<string, string>, status = 200): Response {
  return json({ data, meta } satisfies Ok<T>, headers, status);
}

function fail(
  code: string,
  message: string,
  meta: Meta,
  headers: Record<string, string>,
  status: number,
  details?: unknown,
): Response {
  return json({ error: { code, message, details }, meta } satisfies Err, headers, status);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function n(v: unknown, min: number, max: number): number {
  const x = Number(v);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${String(x)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (FRONTEND CONTRACT)
// ─────────────────────────────────────────────────────────────────────────────

type AdminAction = "metrics" | "layout" | "orders:list" | "menu:full";

type MenuFullPayload = {
  page?: number;
  pageSize?: number;
};

type OrdersListPayload = { page?: number };

export type GatewayRequest =
  | { action: "metrics" }
  | { action: "layout" }
  | { action: "orders:list"; payload?: OrdersListPayload }
  | { action: "menu:full"; payload?: MenuFullPayload };

type RequestContext = {
  requestId: string;
  timestamp: number;
  ip: string | null;
  userAgent: string | null;
  origin: string | null;
  user: {
    id: string;
    email?: string | null;
    role?: string | null;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTH (shared) — single source of truth
// ─────────────────────────────────────────────────────────────────────────────

type AuthCode = "AUTH_MISSING" | "AUTH_INVALID" | "AUTH_FORBIDDEN";

async function requireAdmin(req: Request, ctx: RequestContext): Promise<void> {
  const auth = await authenticateAdmin(req);

  if (!auth.ok) {
    const code: AuthCode =
      auth.reason === "missing_bearer" || auth.reason === "empty_token"
        ? "AUTH_MISSING"
        : auth.reason === "not_admin"
          ? "AUTH_FORBIDDEN"
          : "AUTH_INVALID";

    throw Object.assign(new Error(auth.message), { code });
  }

  ctx.user.id = auth.userId;
}

// ─────────────────────────────────────────────────────────────────────────────
// REQUEST VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

function parseGatewayRequest(v: unknown): GatewayRequest | null {
  if (!isRecord(v)) return null;

  const action = v.action;

  if (action === "metrics") return { action: "metrics" };
  if (action === "layout") return { action: "layout" };

  if (action === "orders:list") {
    const payload = v.payload;
    if (payload === undefined) return { action: "orders:list", payload: {} };
    if (!isRecord(payload)) return null;

    const page = payload.page;
    if (page !== undefined && (typeof page !== "number" || !Number.isFinite(page))) return null;

    return { action: "orders:list", payload: { page: page as number | undefined } };
  }

  if (action === "menu:full") {
    const payload = v.payload;
    if (payload === undefined) return { action: "menu:full", payload: {} };
    if (!isRecord(payload)) return null;

    const page = payload.page;
    const pageSize = payload.pageSize;

    if (page !== undefined && (typeof page !== "number" || !Number.isFinite(page))) return null;
    if (pageSize !== undefined && (typeof pageSize !== "number" || !Number.isFinite(pageSize))) return null;

    return {
      action: "menu:full",
      payload: { page: page as number | undefined, pageSize: pageSize as number | undefined },
    };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA SHAPES
// ─────────────────────────────────────────────────────────────────────────────

type ExecutiveSnapshot = {
  net_revenue_30d_cents: number;
  total_gross_profit_cents: number;
  generated_at: string;
};

type FraudSnapshot = {
  fraud_events_7d: number;
  mismatch_events_7d: number;
  avg_delta_cents_7d: number;
  last_event_at: string | null;
};

type RiskSnapshot = {
  rate_limit_rows_24h: number;
  rate_limit_attempts_24h: number;
  high_attempt_users_24h: number;
  abandoned_sessions_24h: number;
  recovered_sessions_24h: number;
  abandoned_value_cents_24h: number;
};

type AdminLayoutSnapshot = {
  today_revenue_cents: number;
  today_orders: number;
  pending_orders: number;
  unread_notifications: number;
  fraud_events_7d: number;
  abandoned_carts: number;
  pending_carts: number;
  generated_at: string;

  net_revenue_30d_cents?: number;
  total_gross_profit_cents?: number;
  mismatch_events_7d?: number;
  abandoned_value_cents_24h?: number;
  recovered_sessions_24h?: number;
  rate_limit_attempts_24h?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

async function getExecutiveSnapshot(): Promise<ExecutiveSnapshot | null> {
  const { data, error } = await service.from("admin_executive_snapshot").select("*").maybeSingle();
  if (error) throw Object.assign(new Error(`Failed to load metrics: ${error.message}`), { code: "DB_METRICS" });
  return (data ?? null) as ExecutiveSnapshot | null;
}

async function listOrders(payload: OrdersListPayload): Promise<unknown[]> {
  const page = n(payload.page ?? 0, 0, 10_000);
  const from = page * 25;
  const to = from + 24;

  const { data, error } = await service
    .from("orders")
    .select("*")
    .range(from, to)
    .order("created_at", { ascending: false });

  if (error) throw Object.assign(new Error(`Failed to list orders: ${error.message}`), { code: "DB_ORDERS" });
  return (data ?? []) as unknown[];
}

function startOfLocalDayISO(tzOffsetMinutes: number): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const local = new Date(utc + tzOffsetMinutes * 60_000);
  local.setHours(0, 0, 0, 0);
  const backToUtc = new Date(local.getTime() - tzOffsetMinutes * 60_000);
  return backToUtc.toISOString();
}

async function getMenuAdminFull(payload: MenuFullPayload = {}): Promise<unknown[]> {
  const page = n(payload.page ?? 0, 0, 100_000);
  const pageSize = n(payload.pageSize ?? 200, 1, 500);

  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await service
    .from("menu_items_admin_full")
    .select("*")
    .order("sort_order", { ascending: true })
    .range(from, to);

  if (error) throw Object.assign(new Error(`Failed to load menu admin view: ${error.message}`), { code: "DB_MENU_FULL" });
  return (data ?? []) as unknown[];
}

async function getLayoutSnapshot(): Promise<AdminLayoutSnapshot> {
  const tzOffsetMinutes = -420; // Phoenix (UTC-7)
  const sinceISO = startOfLocalDayISO(tzOffsetMinutes);

  const safe = async <T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "layout_partial_failure",
          name,
          message: e instanceof Error ? e.message : String(e),
        }),
      );
      return fallback;
    }
  };

  const executive = await safe<ExecutiveSnapshot | null>(
    "executive",
    async () => {
      const { data, error } = await service.from("admin_executive_snapshot").select("*").maybeSingle();
      if (error) throw error;
      return (data ?? null) as ExecutiveSnapshot | null;
    },
    null,
  );

  const fraud = await safe<FraudSnapshot | null>(
    "fraud",
    async () => {
      const { data, error } = await service.from("admin_fraud_snapshot").select("*").maybeSingle();
      if (error) throw error;
      return (data ?? null) as FraudSnapshot | null;
    },
    null,
  );

  const risk = await safe<RiskSnapshot | null>(
    "risk",
    async () => {
      const { data, error } = await service.from("admin_risk_snapshot").select("*").maybeSingle();
      if (error) throw error;
      return (data ?? null) as RiskSnapshot | null;
    },
    null,
  );

  const today = await safe<{ today_orders: number; today_revenue_cents: number }>(
    "today_orders",
    async () => {
      const { data, error } = await service.from("orders").select("amount_total,created_at").gte("created_at", sinceISO);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ amount_total: number | null }>;
      return {
        today_orders: rows.length,
        today_revenue_cents: rows.reduce((acc, r) => acc + (Number(r.amount_total) || 0), 0),
      };
    },
    { today_orders: 0, today_revenue_cents: 0 },
  );

  const pending_orders = await safe<number>(
    "pending_orders",
    async () => {
      const { count, error } = await service
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "new", "processing"]);
      if (error) throw error;
      return Number(count ?? 0);
    },
    0,
  );

  const unread_notifications = 0;
  const pending_carts = 0;
  const abandoned_carts = Number(risk?.abandoned_sessions_24h ?? 0);

  return {
    today_revenue_cents: today.today_revenue_cents,
    today_orders: today.today_orders,
    pending_orders,
    unread_notifications,
    fraud_events_7d: Number(fraud?.fraud_events_7d ?? 0),
    abandoned_carts,
    pending_carts,
    generated_at: new Date().toISOString(),

    net_revenue_30d_cents: executive?.net_revenue_30d_cents,
    total_gross_profit_cents: executive?.total_gross_profit_cents,
    mismatch_events_7d: fraud?.mismatch_events_7d,
    abandoned_value_cents_24h: risk?.abandoned_value_cents_24h,
    recovered_sessions_24h: risk?.recovered_sessions_24h,
    rate_limit_attempts_24h: risk?.rate_limit_attempts_24h,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTER (EXHAUSTIVE)
// ─────────────────────────────────────────────────────────────────────────────

async function dispatch(req: GatewayRequest): Promise<{ action: AdminAction; result: unknown }> {
  switch (req.action) {
    case "metrics":
      return { action: "metrics", result: await getExecutiveSnapshot() };
    case "layout":
      return { action: "layout", result: await getLayoutSnapshot() };
    case "orders:list":
      return { action: "orders:list", result: await listOrders(req.payload ?? {}) };
    case "menu:full":
      return { action: "menu:full", result: await getMenuAdminFull(req.payload ?? {}) };
  }
  return assertNever(req);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve((req: Request) => handleRequest(req));

async function handleRequest(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const ctx: RequestContext = {
    requestId: crypto.randomUUID(),
    timestamp: Date.now(),
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
    origin,
    user: { id: "unknown" },
  };

  const meta: Meta = { requestedBy: ctx.user.id, requestId: ctx.requestId, ts: ctx.timestamp };

  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Method not allowed", meta, cors, 405);

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return fail("BAD_JSON", "Invalid JSON", meta, cors, 400);
  }

  const parsed = parseGatewayRequest(bodyUnknown);
  if (!parsed) {
    return fail(
      "BAD_REQUEST",
      "Invalid request shape",
      meta,
      cors,
      400,
      { expected: ["metrics", "layout", "orders:list", "menu:full"] },
    );
  }

  // Auth + admin gate
  try {
    await requireAdmin(req, ctx);
  } catch (e) {
    const code = isRecord(e) && typeof e.code === "string" ? e.code : "AUTH_INVALID";
    const msg = e instanceof Error ? e.message : "Authentication error";
    const meta2: Meta = { requestedBy: ctx.user.id, requestId: ctx.requestId, ts: ctx.timestamp };

    const status =
      code === "AUTH_MISSING" ? 401 :
      code === "AUTH_FORBIDDEN" ? 403 :
      401;

    return fail(code, msg, meta2, cors, status);
  }

  const metaAuthed: Meta = { requestedBy: ctx.user.id, requestId: ctx.requestId, ts: ctx.timestamp };

  try {
    const { action, result } = await dispatch(parsed);

    console.info(JSON.stringify({
      level: "info",
      event: "request_ok",
      action,
      requestId: ctx.requestId,
      userId: ctx.user.id,
    }));

    return ok(result, metaAuthed, cors, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const code = isRecord(e) && typeof e.code === "string" ? e.code : "INTERNAL";

    console.error(JSON.stringify({
      level: "error",
      event: "request_fail",
      code,
      message: msg,
      requestId: ctx.requestId,
      userId: ctx.user.id,
    }));

    return fail(code, msg, metaAuthed, cors, 500);
  }
}