// =============================================================================
// src/features/admin/api/adminGateway.client.ts
// =============================================================================
// Admin Gateway Client — SINGLE SOURCE OF TRUTH (Frontend)
//
// Why this exists
// - The admin-gateway Edge function has a strict request contract:
//     { action: string, payload?: object }
// - Multiple invoke paths historically caused accidental "double-wrap" bodies,
//   leading to recurring 400 Bad Request failures.
// - This client makes invalid request shapes impossible at compile time and
//   extremely difficult at runtime.
//
// Guarantees
// - Always sends canonical request shape: { action, payload? } (NEVER double-wrapped)
// - Compile-time valid action + payload only (via AdminGatewayActionMap types)
// - Always expects gateway envelope: { data, meta } OR { error, meta }
// - Standardized, actionable errors including requestId when available
// - Never uses supabase.functions.invoke for admin-gateway (forbidden)
// - Never logs tokens/session ids/emails/phones/addresses
// - Optional safe debug logs: action + request ids only
//
// Usage rule (non-negotiable)
// - Do NOT call `supabase.functions.invoke("admin-gateway", ...)` anywhere.
// - Do NOT call generic `invokeFn("admin-gateway", ...)` anywhere.
// - All admin features/services must use `callAdminGateway()` from this file.
// =============================================================================

import { invokeEdge, type InvokeError } from "@/lib/supabase/invoke";

import type {
  AdminAction,
  GatewayMeta,
  GatewayError,
  GatewayOk,
  GatewayErr,
  GatewayResponse,
  GatewayPayload,
  GatewayResult,
} from "./adminGateway.types";

import { isGatewayErr, isGatewayResponse } from "./adminGateway.types";

const ADMIN_GATEWAY_FN = "admin-gateway" as const;

type UnknownRecord = Record<string, unknown>;
function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function hasNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function safeString(v: unknown): string | null {
  return hasNonEmptyString(v) ? v : null;
}

function safeNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function safeMeta(v: unknown): GatewayMeta | null {
  if (!isRecord(v)) return null;
  const requestedBy = safeString(v.requestedBy);
  const requestId = safeString(v.requestId);
  const ts = safeNumber(v.ts);
  if (!requestedBy || !requestId || ts === null) return null;
  return { requestedBy, requestId, ts };
}

function safeGatewayError(v: unknown): GatewayError | null {
  if (!isRecord(v)) return null;
  const code = safeString(v.code);
  const message = safeString(v.message);
  if (!code || !message) return null;
  const details = "details" in v ? (v as UnknownRecord).details : undefined;
  return { code, message, details };
}

function parseGatewayEnvelope<T>(v: unknown): GatewayResponse<T> | null {
  if (!isGatewayResponse(v)) return null;

  const meta = safeMeta((v as UnknownRecord).meta);
  if (!meta) return null;

  if (isRecord(v) && "data" in v) {
    return { data: (v as UnknownRecord).data as T, meta } satisfies GatewayOk<T>;
  }

  if (isRecord(v) && "error" in v) {
    const err = safeGatewayError((v as UnknownRecord).error);
    if (!err) return null;
    return { error: err, meta } satisfies GatewayErr;
  }

  return null;
}

export type AdminGatewayClientOptions = Readonly<{
  signal?: AbortSignal;

  /**
   * Optional caller-provided request id. Will be sent as `x-request-id`.
   * Server meta.requestId is server-generated but correlates to logs.
   */
  requestId?: string;

  /**
   * Extra headers (safe headers only).
   * Authorization is managed by invokeEdge; any Authorization header here is rejected.
   */
  headers?: Readonly<Record<string, string>>;

  /**
   * Safe debug logs: action + request ids only.
   * Never logs payloads or tokens.
   */
  debug?: boolean;
}>;

function makeRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

/**
 * Headers are a common place where people accidentally leak auth or break CORS.
 * We enforce an allowlist and reject Authorization explicitly.
 */
const SAFE_HEADER_ALLOWLIST = new Set<string>([
  "x-request-id",
  "x-idempotency-key",
  "x-client-info",
  "x-application-name",
]);

function sanitizeExtraHeaders(
  extra: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!extra) return out;

  for (const [kRaw, v] of Object.entries(extra)) {
    const k = kRaw.trim().toLowerCase();
    if (!k) continue;

    if (k === "authorization") {
      throw new AdminGatewayClientError({
        action: "metrics", // placeholder; overwritten by caller when thrown via normalize
        clientRequestId: "unknown",
        status: 0,
        code: "UNSAFE_HEADER",
        message: "Do not provide Authorization header manually for admin-gateway",
        meta: null,
        details: { header: kRaw },
      });
    }

    if (!SAFE_HEADER_ALLOWLIST.has(k)) continue;
    out[kRaw] = String(v);
  }

  return out;
}

// Split actions by payload requirement at the TYPE level.
// This eliminates ambiguous "payloadOrOpts" heuristics.
type ActionsWithNoPayload = {
  [K in AdminAction]: GatewayPayload<K> extends undefined ? K : never
}[AdminAction];

type ActionsWithPayload = Exclude<AdminAction, ActionsWithNoPayload>;

// Runtime set is used only to guard against unsafe casts or JS callers.
const ACTIONS_WITH_NO_PAYLOAD: ReadonlySet<AdminAction> = new Set<AdminAction>([
  "metrics",
  "layout",
  "campaigns:list",
  "campaigns:run-rotation",
  "promos:list",
  "orders:list", // note: payload optional
  "menu:full",   // note: payload optional
]);

export class AdminGatewayClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly action: AdminAction;
  public readonly meta: GatewayMeta | null;
  public readonly details?: unknown;
  public readonly clientRequestId: string;

  constructor(args: {
    message: string;
    status: number;
    code: string;
    action: AdminAction;
    meta: GatewayMeta | null;
    details?: unknown;
    clientRequestId: string;
  }) {
    super(args.message);
    this.name = "AdminGatewayClientError";
    this.status = args.status;
    this.code = args.code;
    this.action = args.action;
    this.meta = args.meta;
    this.details = args.details;
    this.clientRequestId = args.clientRequestId;
  }
}

/**
 * Human-friendly error string for UI surfaces.
 * Includes requestId when available.
 */
export function formatAdminGatewayError(e: unknown): string {
  if (e instanceof AdminGatewayClientError) {
    const rid = e.meta?.requestId ?? e.clientRequestId;
    return `${e.code}: ${e.message}${rid ? ` (requestId: ${rid})` : ""}`;
  }
  if (e instanceof Error) return e.message;
  return "Unknown error";
}

function extractGatewayMetaFromUnknown(v: unknown): GatewayMeta | null {
  if (!isRecord(v)) return null;
  if (!("meta" in v)) return null;
  return safeMeta((v as UnknownRecord).meta);
}

function extractGatewayErrFromUnknown(v: unknown): GatewayError | null {
  if (!isRecord(v)) return null;
  if (!("error" in v)) return null;
  return safeGatewayError((v as UnknownRecord).error);
}

function normalizeInvokeError(
  action: AdminAction,
  clientRequestId: string,
  err: InvokeError,
): AdminGatewayClientError {
  const details = err.details;

  const meta = extractGatewayMetaFromUnknown(details);
  const gwErr = extractGatewayErrFromUnknown(details);

  const code =
    (gwErr?.code && gwErr.code.trim().length > 0 ? gwErr.code : null) ??
    (err.status === 401
      ? "AUTH_INVALID"
      : err.status === 403
        ? "AUTH_FORBIDDEN"
        : err.status === 400
          ? "BAD_REQUEST"
          : "EDGE_INVOKE_FAILED");

  const message =
    (gwErr?.message && gwErr.message.trim().length > 0 ? gwErr.message : null) ??
    (err.message && err.message.trim().length > 0 ? err.message : null) ??
    "Request failed";

  return new AdminGatewayClientError({
    action,
    clientRequestId,
    status: err.status,
    code,
    message,
    meta,
    details,
  });
}

function normalizeUnknownError(
  action: AdminAction,
  clientRequestId: string,
  err: unknown,
): AdminGatewayClientError {
  const meta = extractGatewayMetaFromUnknown(err);
  const gwErr = extractGatewayErrFromUnknown(err);

  const code = (gwErr?.code && gwErr.code.trim().length > 0 ? gwErr.code : null) ?? "INTERNAL_CLIENT";
  const message =
    (gwErr?.message && gwErr.message.trim().length > 0 ? gwErr.message : null) ??
    (err instanceof Error ? err.message : "Unknown error");

  return new AdminGatewayClientError({
    action,
    clientRequestId,
    status: 0,
    code,
    message,
    meta,
    details: err,
  });
}

function debugLog(
  enabled: boolean | undefined,
  payload: Readonly<Record<string, unknown>>,
): void {
  if (!enabled) return;
  // Safe debug only. Never include Authorization, tokens, payload body, or PII.
  // eslint-disable-next-line no-console
  console.info(JSON.stringify(payload));
}

function assertCanonicalPayload(action: AdminAction, payload: unknown): void {
  // Fail-closed at the client, so we never ship weird shapes to the server.
  if (payload === undefined) return;
  if (!isRecord(payload)) {
    throw new AdminGatewayClientError({
      action,
      clientRequestId: "unknown",
      status: 0,
      code: "BAD_CLIENT_PAYLOAD",
      message: "Gateway payload must be an object",
      meta: null,
      details: { type: typeof payload },
    });
  }
}

/**
 * Typed admin-gateway call.
 *
 * Overloads:
 * - Actions with payload: callAdminGateway(action, payload, opts?)
 * - Actions without payload: callAdminGateway(action, opts?)
 */
export async function callAdminGateway<A extends ActionsWithNoPayload>(
  action: A,
  opts?: AdminGatewayClientOptions,
): Promise<GatewayResult<A>>;
export async function callAdminGateway<A extends ActionsWithPayload>(
  action: A,
  payload: GatewayPayload<A>,
  opts?: AdminGatewayClientOptions,
): Promise<GatewayResult<A>>;
export async function callAdminGateway<A extends AdminAction>(
  action: A,
  arg1?: GatewayPayload<A> | AdminGatewayClientOptions,
  arg2?: AdminGatewayClientOptions,
): Promise<GatewayResult<A>> {
  const clientRequestId = (() => {
    const fromOpts =
      (ACTIONS_WITH_NO_PAYLOAD.has(action) && isRecord(arg1) && "requestId" in arg1)
        ? (arg1 as AdminGatewayClientOptions).requestId
        : arg2?.requestId;

    return (fromOpts?.trim() || makeRequestId());
  })();

  // Determine opts/payload based on overload contract.
  // For payloadless actions, second argument is opts.
  const opts: AdminGatewayClientOptions | undefined =
    ACTIONS_WITH_NO_PAYLOAD.has(action) ? (arg1 as AdminGatewayClientOptions | undefined) : arg2;

  const payload: GatewayPayload<A> | undefined =
    ACTIONS_WITH_NO_PAYLOAD.has(action) ? undefined : (arg1 as GatewayPayload<A> | undefined);

  const extraHeaders = sanitizeExtraHeaders(opts?.headers);
  const headers: Record<string, string> = {
    "x-request-id": clientRequestId,
    ...extraHeaders,
  };

  // Canonical request body (NEVER double-wrap).
  if (payload !== undefined) assertCanonicalPayload(action, payload);

  const body: unknown = payload === undefined ? { action } : { action, payload };

  debugLog(opts?.debug, {
    level: "info",
    event: "admin_gateway_call",
    action,
    clientRequestId,
  });

  let raw: unknown;

  try {
    raw = await invokeEdge<unknown>(
      ADMIN_GATEWAY_FN,
      body as UnknownRecord,
      {
        method: "POST",
        signal: opts?.signal,
        headers,
      },
    );
  } catch (e) {
    if (isRecord(e) && typeof (e as UnknownRecord).status === "number" && typeof (e as UnknownRecord).message === "string") {
      throw normalizeInvokeError(action, clientRequestId, e as InvokeError);
    }
    throw normalizeUnknownError(action, clientRequestId, e);
  }

  const env = parseGatewayEnvelope<GatewayResult<A>>(raw);

  if (!env) {
    // Contract mismatch between client/server or unexpected proxy response.
    throw new AdminGatewayClientError({
      action,
      clientRequestId,
      status: 0,
      code: "BAD_GATEWAY_SHAPE",
      message: "Invalid admin-gateway response shape",
      meta: extractGatewayMetaFromUnknown(raw),
      details: raw,
    });
  }

  if (isGatewayErr(env)) {
    debugLog(opts?.debug, {
      level: "warn",
      event: "admin_gateway_error",
      action,
      clientRequestId,
      serverRequestId: env.meta.requestId,
      code: env.error.code,
    });

    // NOTE: server can respond with HTTP 200 + error envelope. Preserve that.
    throw new AdminGatewayClientError({
      action,
      clientRequestId,
      status: 200,
      code: env.error.code,
      message: env.error.message,
      meta: env.meta,
      details: env.error.details,
    });
  }

  debugLog(opts?.debug, {
    level: "info",
    event: "admin_gateway_ok",
    action,
    clientRequestId,
    serverRequestId: env.meta.requestId,
  });

  return env.data as GatewayResult<A>;
}