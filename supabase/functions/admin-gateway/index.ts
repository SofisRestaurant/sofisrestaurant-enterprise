// supabase/functions/admin-gateway/index.ts
// =============================================================================
// ADMIN GATEWAY ROUTER — ENTERPRISE MODE (PRODUCTION GRADE, 2026)
// Stack: Supabase Edge (Deno) + Postgres (service role client)
// Goals:
// - Server-authoritative admin data access (no direct PostgREST from browser)
// - Strong request validation + consistent envelopes
// - Strict auth (JWT) + admin enforcement
// - CORS done right (2xx preflight, vary origin)
// - Safe paging + sane defaults
// - Structured errors + requestId correlation
// =============================================================================

import { service } from "./lib/service.ts";

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
  page?: number;      // default 0
  pageSize?: number;  // default 200, max 500
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
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const prefix = "Bearer ";
  if (!h.startsWith(prefix)) return null;
  const token = h.slice(prefix.length).trim();
  return token.length ? token : null;
}

async function requireAdmin(req: Request, ctx: RequestContext): Promise<void> {
  const token = getBearerToken(req);
  if (!token) throw Object.assign(new Error("Missing authorization header"), { code: "AUTH_MISSING" });

  // Validate token (signature/expiry) + fetch user
  const { data, error } = await service.auth.getUser(token);
  if (error || !data?.user) {
    throw Object.assign(new Error("Invalid or expired session"), { code: "AUTH_INVALID" });
  }

  const u = data.user;
  const meta = (u.app_metadata ?? {}) as Record<string, unknown>;
  const role = typeof meta.role === "string" ? meta.role : null;

  ctx.user.id = u.id;
  ctx.user.email = u.email ?? null;
  ctx.user.role = role;

  // Primary: app_metadata.role === "admin"
  if (role === "admin") return;

  // Secondary: DB-authoritative check (optional, but recommended)
  // If you don't have is_admin(uid uuid) RPC, remove this block.
  try {
    const { data: isAdmin, error: rpcErr } = await service.rpc("is_admin", { uid: u.id });
    if (!rpcErr && isAdmin === true) return;
  } catch {
    // ignore
  }

  throw Object.assign(new Error("Forbidden: admin access required"), { code: "AUTH_FORBIDDEN" });
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

    return { action: "menu:full", payload: { page: page as number | undefined, pageSize: pageSize as number | undefined } };
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

// IMPORTANT: "layout" is meant to power AdminLayout top cards and global badges.
// We intentionally make it resilient: it returns partials + zeros if a view is missing,
// instead of hard failing the entire admin UI.
type AdminLayoutSnapshot = {
  today_revenue_cents: number;
  today_orders: number;
  pending_orders: number;
  unread_notifications: number;
  fraud_events_7d: number;
  abandoned_carts: number;
  pending_carts: number;
  generated_at: string;

  // Optional extra signals (nice to have for UI)
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
  const { data, error } = await service
    .from("admin_executive_snapshot")
    .select("*")
    .maybeSingle();

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
  // tzOffsetMinutes: e.g. -420 for MST/Phoenix (no DST)
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const local = new Date(utc + tzOffsetMinutes * 60_000);
  local.setHours(0, 0, 0, 0);
  // convert "local midnight" back to UTC ISO for storage comparisons in Postgres
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

  if (error) {
    throw Object.assign(
      new Error(`Failed to load menu admin view: ${error.message}`),
      { code: "DB_MENU_FULL" },
    );
  }

  return (data ?? []) as unknown[];
}
async function getLayoutSnapshot(): Promise<AdminLayoutSnapshot> {
  // Phoenix is typically UTC-7 year-round.
  // If you prefer UTC day buckets, set tzOffsetMinutes = 0.
  const tzOffsetMinutes = -420;

  const sinceISO = startOfLocalDayISO(tzOffsetMinutes);

  // These are resilient: any query can fail without killing layout entirely.
  const safe = async <T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      console.warn(JSON.stringify({
        level: "warn",
        event: "layout_partial_failure",
        name,
        message: e instanceof Error ? e.message : String(e),
      }));
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
      // NOTE: adjust these column names if your orders table differs.
      // amount_total is integer cents in your schema listing.
      const { data, error } = await service
        .from("orders")
        .select("amount_total,created_at")
        .gte("created_at", sinceISO);

      if (error) throw error;
      const rows = (data ?? []) as Array<{ amount_total: number | null }>;
      const today_orders = rows.length;
      const today_revenue_cents = rows.reduce((acc, r) => acc + (Number(r.amount_total) || 0), 0);
      return { today_orders, today_revenue_cents };
    },
    { today_orders: 0, today_revenue_cents: 0 },
  );

  const pending_orders = await safe<number>(
    "pending_orders",
    async () => {
      // If you have a canonical pending set, update this filter.
      const { count, error } = await service
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "new", "processing"]);
      if (error) throw error;
      return Number(count ?? 0);
    },
    0,
  );

  // If you later add admin_notifications view/table, plug it here.
  const unread_notifications = 0;

  // Pending carts: if you have a table/view, wire it here; otherwise 0.
  const pending_carts = 0;

  // Abandoned carts: use risk snapshot (sessions) as a proxy for now.
  const abandoned_carts = Number(risk?.abandoned_sessions_24h ?? 0);

  const generated_at = new Date().toISOString();

  return {
    today_revenue_cents: today.today_revenue_cents,
    today_orders: today.today_orders,
    pending_orders,
    unread_notifications,
    fraud_events_7d: Number(fraud?.fraud_events_7d ?? 0),
    abandoned_carts,
    pending_carts,
    generated_at,

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

  const _exhaustive: never = req;
  return assertNever(_exhaustive);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve((req: Request) => handleRequest(req));

async function handleRequest(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  // ✅ Preflight must be 2xx
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  const ctx: RequestContext = {
    requestId: crypto.randomUUID(),
    timestamp: Date.now(),
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
    origin,
    user: { id: "unknown" },
  };

  // Strict: only POST
  if (req.method !== "POST") {
    const meta: Meta = { requestedBy: ctx.user.id, requestId: ctx.requestId, ts: ctx.timestamp };
    return fail("METHOD_NOT_ALLOWED", "Method not allowed", meta, cors, 405);
  }

  // Parse JSON
  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    const meta: Meta = { requestedBy: ctx.user.id, requestId: ctx.requestId, ts: ctx.timestamp };
    return fail("BAD_JSON", "Invalid JSON", meta, cors, 400);
  }

  // Validate request shape
  const parsed = parseGatewayRequest(bodyUnknown);
  if (!parsed) {
  const meta: Meta = { requestedBy: ctx.user.id, requestId: ctx.requestId, ts: ctx.timestamp };
  return fail(
    "BAD_REQUEST",
    "Invalid request shape",
    meta,
    cors,
    400,
    {
      expected: ["metrics", "layout", "orders:list", "menu:full"],
      example: { action: "menu:full", payload: { page: 0, pageSize: 50 } },
    },
  );
}

  // Auth + admin gate
  try {
    await requireAdmin(req, ctx);
  } catch (e) {
    const code = isRecord(e) && typeof e.code === "string" ? e.code : "AUTH_ERROR";
    const msg = e instanceof Error ? e.message : "Authentication error";
    const meta: Meta = { requestedBy: ctx.user.id, requestId: ctx.requestId, ts: ctx.timestamp };

    const status =
      code === "AUTH_MISSING" ? 401
      : code === "AUTH_INVALID" ? 401
      : code === "AUTH_FORBIDDEN" ? 403
      : 401;

    return fail(code, msg, meta, cors, status);
  }

  const meta: Meta = { requestedBy: ctx.user.id, requestId: ctx.requestId, ts: ctx.timestamp };

  // Dispatch + respond
  try {
    const { action, result } = await dispatch(parsed);

    // structured log (safe)
    console.info(JSON.stringify({
      level: "info",
      event: "request_ok",
      action,
      requestId: ctx.requestId,
      userId: ctx.user.id,
    }));

    return ok(result, meta, cors, 200);
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

    return fail(code, msg, meta, cors, 500);
  }
}