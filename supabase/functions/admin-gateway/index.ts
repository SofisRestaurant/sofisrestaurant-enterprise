// =============================================================================
// PATH: supabase/functions/admin-gateway/index.ts
// =============================================================================
// admin-gateway — Production Hardened (2026)
// - CORS allowlist enforcement (Origin strict if present; permissive if missing)
// - Auth required (admin-only)
// - Strict body size enforcement by bytes
// - Structured logs + requestId + standard headers
// - Typed request parsing (no any)
// =============================================================================

import { service } from "./lib/service.ts";
import { authenticateAdmin } from "../_shared/auth.ts";

import {
  listCampaigns,
  toggleCampaign,
  runCampaignRotation,
  createCampaign,
  updateCampaign,
  pinFeatured,
  type TogglePayload as ToggleCampaignPayload,
  type CreatePayload as CreateCampaignPayload,
  type UpdatePayload as UpdateCampaignPayload,
  type PinFeaturedPayload,
} from "./actions/campaigns.ts";

import { listPromos, togglePromo, type TogglePromoPayload } from "./actions/promos.ts";

const CONFIG = {
  MAX_BODY_BYTES: 15_000,
} as const;

/* -------------------------------------------------------------------------- */
/* CORS (2026 create-checkout style)                                           */
/* - If Origin present -> must allowlist, set ACAO                             */
/* - If Origin missing/empty -> allow request, but do NOT set ACAO             */
/* -------------------------------------------------------------------------- */

const ALLOWED_ORIGINS = new Set<string>([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
]);

function corsHeadersFor(req: Request): Record<string, string> | null {
  const originRaw = req.headers.get("origin");
  const origin = (originRaw ?? "").trim();

  // No Origin => allow, but do not set ACAO
  if (!origin) {
    return { Vary: "Origin" };
  }

  // Origin present => must be allowlisted
  if (!ALLOWED_ORIGINS.has(origin)) return null;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-request-id, x-idempotency-key, x-application-name",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/* -------------------------------------------------------------------------- */
/* STANDARD HEADERS                                                           */
/* -------------------------------------------------------------------------- */

function withStandardHeaders(headersInit: HeadersInit, requestId: string): Headers {
  const h = new Headers(headersInit);
  if (!h.has("Vary")) h.set("Vary", "Origin");
  h.set("Content-Type", "application/json; charset=utf-8");
  h.set("Cache-Control", "no-store");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Request-Id", requestId);
  return h;
}

/* -------------------------------------------------------------------------- */
/* RESPONSE ENVELOPES                                                         */
/* -------------------------------------------------------------------------- */

type Meta = { requestedBy: string; requestId: string; ts: number };

type Ok<T> = {
  data: T;
  meta: Meta;
};

type Err = {
  error: { code: string; message: string; details?: unknown };
  meta: Meta;
};

function json(body: unknown, headers: HeadersInit, requestId: string, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withStandardHeaders(headers, requestId),
  });
}

function ok<T>(data: T, meta: Meta, headers: HeadersInit, requestId: string, status = 200): Response {
  return json({ data, meta } satisfies Ok<T>, headers, requestId, status);
}

function fail(
  code: string,
  message: string,
  meta: Meta,
  headers: HeadersInit,
  requestId: string,
  status: number,
  details?: unknown,
): Response {
  return json({ error: { code, message, details }, meta } satisfies Err, headers, requestId, status);
}

/* -------------------------------------------------------------------------- */
/* UTILS                                                                      */
/* -------------------------------------------------------------------------- */

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeStr(v: unknown, max = 4000): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function safeBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function safeNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function toInt(v: unknown, fallback: number): number {
  const n = safeNum(v);
  return n === null ? fallback : Math.trunc(n);
}

function assertNever(x: never): never {
  throw new Error(`Unhandled action: ${String(x)}`);
}

function log(level: "info" | "warn" | "error", event: string, meta: Record<string, unknown>) {
  console.log(JSON.stringify({ level, event, service: "admin-gateway", ...meta, ts: new Date().toISOString() }));
}

/* -------------------------------------------------------------------------- */
/* ACTION TYPES                                                               */
/* -------------------------------------------------------------------------- */

type AdminAction =
  | "metrics"
  | "layout"
  | "orders:list"
  | "menu:full"
  | "campaigns:list"
  | "campaigns:create"
  | "campaigns:update"
  | "campaigns:pin-featured"
  | "campaigns:toggle"
  | "campaigns:run-rotation"
  | "promos:list"
  | "promos:toggle";

/* -------------------------------------------------------------------------- */
/* REQUEST TYPES                                                              */
/* -------------------------------------------------------------------------- */

type GatewayRequest =
  | { action: "metrics" }
  | { action: "layout" }
  | { action: "orders:list"; payload?: { page?: number } }
  | { action: "menu:full"; payload?: { page?: number; pageSize?: number } }
  | { action: "campaigns:list" }
  | { action: "campaigns:run-rotation" }
  | { action: "campaigns:toggle"; payload: ToggleCampaignPayload }
  | { action: "campaigns:create"; payload: CreateCampaignPayload }
  | { action: "campaigns:update"; payload: UpdateCampaignPayload }
  | { action: "campaigns:pin-featured"; payload: PinFeaturedPayload }
  | { action: "promos:list" }
  | { action: "promos:toggle"; payload: TogglePromoPayload };

/* -------------------------------------------------------------------------- */
/* REQUEST PARSER                                                             */
/* -------------------------------------------------------------------------- */

function parseTogglePayload(v: unknown): { id: string; active: boolean } | null {
  if (!isRecord(v)) return null;
  const id = safeStr(v.id, 128);
  const active = safeBool(v.active);
  if (!id || active === null) return null;
  return { id, active };
}

function parsePinFeaturedPayload(v: unknown): PinFeaturedPayload | null {
  if (!isRecord(v)) return null;
  const id = safeStr(v.id, 128);
  const placement = safeStr(v.placement, 120);
  if (!id || !placement) return null;
  return { id, placement };
}

function parseCreateCampaignPayload(v: unknown): CreateCampaignPayload | null {
  if (!isRecord(v)) return null;

  const campaign_name = safeStr(v.campaign_name, 200);
  const placement = safeStr(v.placement, 120);

  const menu_item_id = safeStr(v.menu_item_id, 128);
  const badge = safeStr(v.badge, 64);
  const hero_title = safeStr(v.hero_title, 180);
  const hero_subtitle = safeStr(v.hero_subtitle, 400);
  const cta_label = safeStr(v.cta_label, 120);
  const deep_link = safeStr(v.deep_link, 600);

  const starts_at = safeStr(v.starts_at, 80);
  const ends_at = safeStr(v.ends_at, 80);

  const active = safeBool(v.active);
  const is_featured = safeBool(v.is_featured);
  const eligible_for_rotation = safeBool(v.eligible_for_rotation);

  const priorityRaw = safeNum(v.priority);
  const weightRaw = safeNum(v.weight);

  if (!campaign_name || !placement) return null;
  if (active === null || is_featured === null || eligible_for_rotation === null) return null;
  if (priorityRaw === null || weightRaw === null) return null;

  return {
    campaign_name,
    placement,
    menu_item_id: menu_item_id ?? null,
    badge: badge ?? null,
    hero_title: hero_title ?? null,
    hero_subtitle: hero_subtitle ?? null,
    cta_label: cta_label ?? null,
    deep_link: deep_link ?? null,
    starts_at: starts_at ?? null,
    ends_at: ends_at ?? null,
    active,
    is_featured,
    eligible_for_rotation,
    priority: Math.trunc(priorityRaw),
    weight: Math.trunc(weightRaw),
  };
}

function parseUpdateCampaignPayload(v: unknown): UpdateCampaignPayload | null {
  if (!isRecord(v)) return null;
  const id = safeStr(v.id, 128);
  if (!id) return null;

  const base = parseCreateCampaignPayload(v);
  if (!base) return null;

  return { ...base, id };
}

function parseGatewayRequest(v: unknown): GatewayRequest | null {
  if (!isRecord(v)) return null;

  const action = v.action;
  if (typeof action !== "string") return null;

  if (action === "metrics") return { action };
  if (action === "layout") return { action };

  if (action === "campaigns:list") return { action };
  if (action === "campaigns:run-rotation") return { action };
  if (action === "promos:list") return { action };

  if (action === "campaigns:pin-featured") {
    const payload = parsePinFeaturedPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === "campaigns:create") {
    const payload = parseCreateCampaignPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === "campaigns:update") {
    const payload = parseUpdateCampaignPayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === "campaigns:toggle") {
    const payload = parseTogglePayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === "promos:toggle") {
    const payload = parseTogglePayload(v.payload);
    if (!payload) return null;
    return { action, payload };
  }

  if (action === "orders:list") {
    const payload = isRecord(v.payload) ? v.payload : {};
    return { action, payload: { page: toInt(payload.page, 0) } };
  }

  if (action === "menu:full") {
    const payload = isRecord(v.payload) ? v.payload : {};
    return {
      action,
      payload: {
        page: toInt(payload.page, 0),
        pageSize: toInt(payload.pageSize, 200),
      },
    };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* DISPATCH                                                                   */
/* -------------------------------------------------------------------------- */

async function dispatch(req: GatewayRequest): Promise<{ action: AdminAction; result: unknown }> {
  switch (req.action) {
    case "metrics":
      return {
        action: "metrics",
        result: await service.from("admin_executive_snapshot").select("*").maybeSingle(),
      };

    case "layout":
      return {
        action: "layout",
        result: await service.from("admin_layout_snapshot").select("*").maybeSingle(),
      };

    case "orders:list": {
      const page = Math.max(0, req.payload?.page ?? 0);
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
      const page = Math.max(0, req.payload?.page ?? 0);
      const pageSize = Math.min(500, Math.max(1, req.payload?.pageSize ?? 200));

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

    case "campaigns:list":
      return { action: "campaigns:list", result: await listCampaigns() };

    case "campaigns:create":
      return { action: "campaigns:create", result: await createCampaign(req.payload) };

    case "campaigns:update":
      return { action: "campaigns:update", result: await updateCampaign(req.payload) };

    case "campaigns:pin-featured":
      return { action: "campaigns:pin-featured", result: await pinFeatured(req.payload) };

    case "campaigns:toggle":
      return { action: "campaigns:toggle", result: await toggleCampaign(req.payload) };

    case "campaigns:run-rotation":
      return { action: "campaigns:run-rotation", result: await runCampaignRotation() };

    case "promos:list":
      return { action: "promos:list", result: await listPromos() };

    case "promos:toggle":
      return { action: "promos:toggle", result: await togglePromo(req.payload) };
  }

  return assertNever(req);
}

/* -------------------------------------------------------------------------- */
/* MAIN SERVER                                                                */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  const ts = Date.now();
  const start = Date.now();

  const cors = corsHeadersFor(req);
  if (!cors) {
    return new Response("Origin not allowed", { status: 403, headers: { Vary: "Origin" } });
  }

  const metaPre: Meta = { requestedBy: "unknown", requestId, ts };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: withStandardHeaders(cors, requestId) });
  }

  if (req.method !== "POST") {
    return fail("METHOD_NOT_ALLOWED", "Method not allowed", metaPre, cors, requestId, 405);
  }

  // Read body safely and enforce byte limit based on actual bytes
  let rawText = "";
  try {
    rawText = await req.text();
  } catch {
    return fail("BAD_BODY", "Unable to read request body", metaPre, cors, requestId, 400);
  }

  const byteLen = new TextEncoder().encode(rawText).length;
  if (byteLen > CONFIG.MAX_BODY_BYTES) {
    return fail(
      "PAYLOAD_TOO_LARGE",
      "Payload too large",
      metaPre,
      cors,
      requestId,
      413,
      { len: byteLen, max: CONFIG.MAX_BODY_BYTES },
    );
  }

  let body: unknown;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    return fail("BAD_JSON", "Invalid JSON", metaPre, cors, requestId, 400);
  }

  const parsed = parseGatewayRequest(body);
  if (!parsed) {
    return fail("BAD_REQUEST", "Invalid request", metaPre, cors, requestId, 400);
  }

  // Admin auth required
  const auth = await authenticateAdmin(req);
  if (!auth.ok) {
    const status =
      auth.reason === "not_admin"
        ? 403
        : auth.reason === "missing_bearer" || auth.reason === "empty_token"
          ? 401
          : 401;

    const code =
      status === 403
        ? "AUTH_FORBIDDEN"
        : auth.reason === "missing_bearer" || auth.reason === "empty_token"
          ? "AUTH_MISSING"
          : "AUTH_INVALID";

    return fail(code, auth.message, metaPre, cors, requestId, status, { reason: auth.reason });
  }

  const meta: Meta = { requestedBy: auth.userId, requestId, ts };

  try {
    const { action, result } = await dispatch(parsed);

    log("info", "request_ok", {
      requestId,
      userId: auth.userId,
      action,
      duration_ms: Date.now() - start,
    });

    return ok(result, meta, cors, requestId, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const code =
      isRecord(e) && typeof e.code === "string" && e.code.trim()
        ? e.code.trim()
        : "INTERNAL";

    log("error", "request_failed", {
      requestId,
      userId: auth.userId,
      action: parsed.action,
      code,
      message: msg,
      duration_ms: Date.now() - start,
    });

    return fail(code, msg, meta, cors, requestId, 500);
  }
});