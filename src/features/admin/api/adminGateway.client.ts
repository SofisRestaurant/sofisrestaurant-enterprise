import { invokeEdge } from '@/lib/supabase/invoke';

import type {
  AdminAction,
  GatewayErr,
  GatewayError,
  GatewayMeta,
  GatewayOk,
  GatewayPayload,
  GatewayResponse,
  GatewayResult,
} from './adminGateway.types';
import { isGatewayErr, isGatewayResponse } from './adminGateway.types';

const ADMIN_GATEWAY_FN = 'admin-gateway' as const;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeString(value: unknown): string | null {
  return hasNonEmptyString(value) ? value.trim() : null;
}

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeMeta(value: unknown): GatewayMeta | null {
  if (!isRecord(value)) {
    return null;
  }

  const requestedBy = safeString(value.requestedBy);
  const requestId = safeString(value.requestId);
  const ts = safeNumber(value.ts);

  if (requestedBy === null || requestId === null || ts === null) {
    return null;
  }

  return { requestedBy, requestId, ts };
}

function safeGatewayError(value: unknown): GatewayError | null {
  if (!isRecord(value)) {
    return null;
  }

  const code = safeString(value.code);
  const message = safeString(value.message);

  if (code === null || message === null) {
    return null;
  }

  return {
    code,
    message,
    details: 'details' in value ? value.details : undefined,
  };
}

function isInvokeLikeError(
  value: unknown,
): value is Readonly<{ status: number; message: string; details?: unknown }> {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.status === 'number' && typeof value.message === 'string';
}

function parseGatewayEnvelope<T>(value: unknown): GatewayResponse<T> | null {
  if (!isGatewayResponse(value) || !isRecord(value)) {
    return null;
  }

  const meta = safeMeta(value.meta);
  if (meta === null) {
    return null;
  }

  if ('data' in value) {
    return {
      data: value.data as T,
      meta,
    } satisfies GatewayOk<T>;
  }

  if ('error' in value) {
    const error = safeGatewayError(value.error);
    if (error === null) {
      return null;
    }

    return {
      error,
      meta,
    } satisfies GatewayErr;
  }

  return null;
}

export type AdminGatewayClientOptions = Readonly<{
  signal?: AbortSignal;
  requestId?: string;
  headers?: Readonly<Record<string, string>>;
  debug?: boolean;
}>;

function makeRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

const SAFE_HEADER_ALLOWLIST = new Set<string>([
  'x-request-id',
  'x-idempotency-key',
  'x-client-info',
  'x-application-name',
]);

function sanitizeExtraHeaders(
  extra: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (extra === undefined) {
    return headers;
  }

  for (const [rawKey, rawValue] of Object.entries(extra)) {
    const normalizedKey = rawKey.trim().toLowerCase();

    if (normalizedKey.length === 0) {
      continue;
    }

    if (normalizedKey === 'authorization') {
      throw new AdminGatewayClientError({
        action: 'metrics',
        clientRequestId: 'unknown',
        status: 0,
        code: 'UNSAFE_HEADER',
        message: 'Do not provide Authorization header manually for admin-gateway.',
        meta: null,
        details: { header: rawKey },
      });
    }

    if (!SAFE_HEADER_ALLOWLIST.has(normalizedKey)) {
      continue;
    }

    headers[rawKey] = rawValue;
  }

  return headers;
}

type ActionsWithNoPayload = {
  [K in AdminAction]: GatewayPayload<K> extends undefined ? K : never;
}[AdminAction];

type ActionsWithPayload = Exclude<AdminAction, ActionsWithNoPayload>;

const ACTIONS_WITH_NO_PAYLOAD: ReadonlySet<AdminAction> = new Set<AdminAction>([
  'metrics',
  'layout',
  'campaigns:list',
  'campaigns:run-rotation',
  'promos:list',
]);

export class AdminGatewayClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly action: AdminAction;
  public readonly meta: GatewayMeta | null;
  public readonly details?: unknown;
  public readonly clientRequestId: string;

  public constructor(args: {
    message: string;
    status: number;
    code: string;
    action: AdminAction;
    meta: GatewayMeta | null;
    details?: unknown;
    clientRequestId: string;
  }) {
    super(args.message);
    this.name = 'AdminGatewayClientError';
    this.status = args.status;
    this.code = args.code;
    this.action = args.action;
    this.meta = args.meta;
    this.details = args.details;
    this.clientRequestId = args.clientRequestId;
  }
}

export function formatAdminGatewayError(error: unknown): string {
  if (error instanceof AdminGatewayClientError) {
    const requestId = error.meta?.requestId ?? error.clientRequestId;
    return `${error.code}: ${error.message}${requestId ? ` (requestId: ${requestId})` : ''}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Admin request failed.';
}

function extractGatewayMetaFromUnknown(value: unknown): GatewayMeta | null {
  if (!isRecord(value)) {
    return null;
  }

  return safeMeta(value.meta);
}

function extractGatewayErrFromUnknown(value: unknown): GatewayError | null {
  if (!isRecord(value)) {
    return null;
  }

  return safeGatewayError(value.error);
}

function normalizeInvokeError(
  action: AdminAction,
  clientRequestId: string,
  error: Readonly<{ status: number; message: string; details?: unknown }>,
): AdminGatewayClientError {
  const gatewayError = extractGatewayErrFromUnknown(error.details);
  const meta = extractGatewayMetaFromUnknown(error.details);

  const code =
    gatewayError?.code ??
    (error.status === 401
      ? 'AUTH_INVALID'
      : error.status === 403
        ? 'AUTH_FORBIDDEN'
        : error.status === 400
          ? 'BAD_REQUEST'
          : 'EDGE_INVOKE_FAILED');

  const message =
    gatewayError?.message ??
    (error.message.trim().length > 0 ? error.message : 'Request failed');

  return new AdminGatewayClientError({
    action,
    clientRequestId,
    status: error.status,
    code,
    message,
    meta,
    details: error.details,
  });
}

function normalizeUnknownError(
  action: AdminAction,
  clientRequestId: string,
  error: unknown,
): AdminGatewayClientError {
  const gatewayError = extractGatewayErrFromUnknown(error);
  const meta = extractGatewayMetaFromUnknown(error);

  return new AdminGatewayClientError({
    action,
    clientRequestId,
    status: 0,
    code: gatewayError?.code ?? 'INTERNAL_CLIENT',
    message: gatewayError?.message ?? (error instanceof Error ? error.message : 'Unknown error'),
    meta,
    details: error,
  });
}

function debugLog(enabled: boolean | undefined, payload: Readonly<Record<string, unknown>>): void {
  if (!enabled) {
    return;
  }

  console.info(JSON.stringify(payload));
}

function assertCanonicalPayload(action: AdminAction, payload: unknown): void {
  if (payload === undefined) {
    return;
  }

  if (!isRecord(payload)) {
    throw new AdminGatewayClientError({
      action,
      clientRequestId: 'unknown',
      status: 0,
      code: 'BAD_CLIENT_PAYLOAD',
      message: 'Gateway payload must be an object.',
      meta: null,
      details: { type: typeof payload },
    });
  }
}

function isOptionsArg(value: unknown): value is AdminGatewayClientOptions {
  if (!isRecord(value)) {
    return false;
  }

  return 'signal' in value || 'requestId' in value || 'headers' in value || 'debug' in value;
}

type ResolvedGatewayArgs<A extends AdminAction> = Readonly<{
  payload: GatewayPayload<A> | undefined;
  options: AdminGatewayClientOptions | undefined;
}>;

function resolveGatewayArgs<A extends AdminAction>(
  action: A,
  arg1?: GatewayPayload<A> | AdminGatewayClientOptions,
  arg2?: AdminGatewayClientOptions,
): ResolvedGatewayArgs<A> {
  if (ACTIONS_WITH_NO_PAYLOAD.has(action)) {
    return {
      payload: undefined,
      options: isOptionsArg(arg1) ? arg1 : undefined,
    };
  }

  return {
    payload: arg1 as GatewayPayload<A> | undefined,
    options: arg2,
  };
}

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
  const { payload, options } = resolveGatewayArgs(action, arg1, arg2);

  const clientRequestId =
    typeof options?.requestId === 'string' && options.requestId.trim().length > 0
      ? options.requestId.trim()
      : makeRequestId();

  const headers: Record<string, string> = {
    'x-request-id': clientRequestId,
    ...sanitizeExtraHeaders(options?.headers),
  };

  if (payload !== undefined) {
    assertCanonicalPayload(action, payload);
  }

  const body: Record<string, unknown> =
    payload === undefined ? { action } : { action, payload };

  debugLog(options?.debug, {
    level: 'info',
    event: 'admin_gateway_call',
    action,
    clientRequestId,
  });

  let raw: unknown;

  try {
    raw = await invokeEdge<unknown>(ADMIN_GATEWAY_FN, body, {
      method: 'POST',
      signal: options?.signal,
      headers,
    });
  } catch (error) {
    if (isInvokeLikeError(error)) {
      throw normalizeInvokeError(action, clientRequestId, error);
    }

    throw normalizeUnknownError(action, clientRequestId, error);
  }

  const envelope = parseGatewayEnvelope<GatewayResult<A>>(raw);

  if (envelope === null) {
    throw new AdminGatewayClientError({
      action,
      clientRequestId,
      status: 0,
      code: 'BAD_GATEWAY_SHAPE',
      message: 'Invalid admin-gateway response shape.',
      meta: extractGatewayMetaFromUnknown(raw),
      details: raw,
    });
  }

  if (isGatewayErr(envelope)) {
    debugLog(options?.debug, {
      level: 'warn',
      event: 'admin_gateway_error',
      action,
      clientRequestId,
      serverRequestId: envelope.meta.requestId,
      code: envelope.error.code,
    });

    throw new AdminGatewayClientError({
      action,
      clientRequestId,
      status: 200,
      code: envelope.error.code,
      message: envelope.error.message,
      meta: envelope.meta,
      details: envelope.error.details,
    });
  }

  debugLog(options?.debug, {
    level: 'info',
    event: 'admin_gateway_ok',
    action,
    clientRequestId,
    serverRequestId: envelope.meta.requestId,
  });

  return envelope.data;
}