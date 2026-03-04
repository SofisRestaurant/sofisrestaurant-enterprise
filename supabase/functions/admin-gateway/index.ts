// supabase/functions/admin-gateway/index.ts
import { service } from "./lib/service.ts";
import { authenticateAdmin } from "../_shared/auth.ts";

const CONFIG = {
  MAX_BODY_BYTES: 15_000, // admin payloads should stay small
} as const;

// ─────────────────────────────────────────────────────────────
// CORS (FAIL-CLOSED)
// ─────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
]);

function corsHeaders(origin: string | null): Record<string, string> | null {
  const o = (origin ?? "").trim()
  if (!o || !ALLOWED_ORIGINS.has(o)) return null

  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-application-name, x-request-id, x-idempotency-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }
}

// ─────────────────────────────────────────────────────────────
// ENVELOPES
// ─────────────────────────────────────────────────────────────
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
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function n(v: unknown, min: number, max: number): number {
  const x = Number(v);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${String(x)}`);
}

// ─────────────────────────────────────────────────────────────
// TYPES (FRONTEND CONTRACT)
// ─────────────────────────────────────────────────────────────
type AdminAction = "metrics" | "layout" | "orders:list" | "menu:full";

type MenuFullPayload = { page?: number; pageSize?: number };
type OrdersListPayload = { page?: number };
type CodedError = { code: string };

function hasCode(e: unknown): e is CodedError {
  return isRecord(e) && typeof e.code === "string" && e.code.trim().length > 0;
}

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
  user: { id: string; email?: string | null; role?: string | null };
};

// ─────────────────────────────────────────────────────────────
// AUTH (shared)
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// REQUEST VALIDATION
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// ROUTER (EXHAUSTIVE)
// ─────────────────────────────────────────────────────────────
async function dispatch(req: GatewayRequest): Promise<{ action: AdminAction; result: unknown }> {
  switch (req.action) {
    case "metrics":
      return { action: "metrics", result: await service.from("admin_executive_snapshot").select("*").maybeSingle() };
    case "layout":
      return { action: "layout", result: await service.from("admin_layout_snapshot").select("*").maybeSingle() };
    case "orders:list": {
      const page = n(req.payload?.page ?? 0, 0, 10_000);
      const from = page * 25;
      const to = from + 24;
      const { data, error } = await service
        .from("orders")
        .select("*")
        .range(from, to)
        .order("created_at", { ascending: false });
      if (error) throw Object.assign(new Error(error.message), { code: "DB_ORDERS" });
      return { action: "orders:list", result: data ?? [] };
    }
    case "menu:full": {
      const page = n(req.payload?.page ?? 0, 0, 100_000);
      const pageSize = n(req.payload?.pageSize ?? 200, 1, 500);
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await service
        .from("menu_items_admin_full")
        .select("*")
        .order("sort_order", { ascending: true })
        .range(from, to);

      if (error) throw Object.assign(new Error(error.message), { code: "DB_MENU_FULL" });
      return { action: "menu:full", result: data ?? [] };
    }
  }

  return assertNever(req);
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  // ✅ Fail-closed origin
  if (!cors) return new Response("Origin not allowed", { status: 403 });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const ctx: RequestContext = {
    requestId: crypto.randomUUID(),
    timestamp: Date.now(),
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
    origin,
    user: { id: "unknown" },
  };

  // meta BEFORE auth is allowed, but will say unknown
  const metaPre: Meta = { requestedBy: "unknown", requestId: ctx.requestId, ts: ctx.timestamp };

  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "Method not allowed", metaPre, cors, 405);

  // ✅ Body size guard (best-effort)
  const len = req.headers.get("content-length");
  if (len && Number(len) > CONFIG.MAX_BODY_BYTES) {
    return fail("PAYLOAD_TOO_LARGE", "Payload too large", metaPre, cors, 413);
  }

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return fail("BAD_JSON", "Invalid JSON", metaPre, cors, 400);
  }

  const parsed = parseGatewayRequest(bodyUnknown);
  if (!parsed) {
    return fail("BAD_REQUEST", "Invalid request shape", metaPre, cors, 400);
  }

// ✅ Auth first, then meta
try {
  await requireAdmin(req, ctx);
} catch (e) {
  const code = hasCode(e) ? e.code : "AUTH_INVALID";
  const msg = e instanceof Error ? e.message : "Authentication error";
  const status = code === "AUTH_MISSING" ? 401 : code === "AUTH_FORBIDDEN" ? 403 : 401;
  return fail(code, msg, metaPre, cors, status);
}

const meta: Meta = { requestedBy: ctx.user.id, requestId: ctx.requestId, ts: ctx.timestamp };

try {
  const { action, result } = await dispatch(parsed);

  console.info(JSON.stringify({
    level: "info",
    event: "admin_gateway_ok",
    action,
    requestId: ctx.requestId,
    userId: ctx.user.id,
  }));

  return ok(result, meta, cors, 200);
} catch (e) {
  const msg = e instanceof Error ? e.message : "Unknown error";
  const code = hasCode(e) ? e.code : "INTERNAL";

  console.error(JSON.stringify({
    level: "error",
    event: "admin_gateway_fail",
    code,
    message: msg,
    requestId: ctx.requestId,
    userId: ctx.user.id,
  }));

  return fail(code, msg, meta, cors, 500);
}
});