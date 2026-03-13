// =============================================================================
// src/lib/supabase/invoke.ts
// SUPABASE EDGE INVOKE — Enterprise (2026) • Deterministic Auth + Retry
// =============================================================================
//
// Guarantees:
// - Always attaches freshest access token (if available)
// - On 401/403, attempts a single refreshSession() + retries once
// - Single-flight refresh (prevents storm when many requests hit once)
// - Typed errors, safe JSON parsing, no token logging
//
// Hardened:
// - Accepts both body shapes:
//     invokeEdge(fn, { action, payload })                ✅ preferred
//     invokeEdge(fn, { body: { action, payload } })     ✅ tolerated
//   This prevents "Invalid request" 400s when callers accidentally double-wrap.
// - Also accepts primitive / string / unknown bodies for legacy callers
//   like auth-risk-evaluation and auth-session-validation.
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';

type JsonRecord = Record<string, unknown>;

export type InvokeError = Readonly<{
  status: number;
  message: string;
  details?: unknown;
}>;

export class InvokeEdgeError extends Error implements InvokeError {
  public readonly status: number;
  public readonly details?: unknown;
  public readonly functionName: string;
  public readonly requestId: string;

  public constructor(args: {
    functionName: string;
    requestId: string;
    status: number;
    message: string;
    details?: unknown;
  }) {
    super(args.message);
    this.name = 'InvokeEdgeError';
    this.functionName = args.functionName;
    this.requestId = args.requestId;
    this.status = args.status;
    this.details = args.details;
  }
}

export type InvokeInit = Readonly<{
  method?: 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  skipAuth?: boolean;
}>;

type ImportMetaEnvLike = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function errMsgFromPayload(payload: unknown, fallback: string): string {
  if (isNonEmptyString(payload)) {
    return payload.trim();
  }

  if (payload instanceof Error && payload.message.trim().length > 0) {
    return payload.message;
  }

  if (isRecord(payload)) {
    const errorValue = payload.error;
    const messageValue = payload.message;

    if (isNonEmptyString(errorValue)) {
      return errorValue.trim();
    }

    if (isNonEmptyString(messageValue)) {
      return messageValue.trim();
    }

    if (isRecord(errorValue) && isNonEmptyString(errorValue.message)) {
      return errorValue.message.trim();
    }
  }

  return fallback;
}

async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');

  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getImportMetaEnv(): ImportMetaEnvLike {
  const meta = import.meta as ImportMeta & {
    readonly env?: unknown;
  };

  return isRecord(meta.env) ? meta.env : {};
}

function getEnvString(name: string): string | null {
  const value = getImportMetaEnv()[name];
  return isNonEmptyString(value) ? value.trim() : null;
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? null;

  return isNonEmptyString(token) ? token.trim() : null;
}

// ─────────────────────────────────────────────────────────────
// Single-flight refresh (prevents request storms)
// ─────────────────────────────────────────────────────────────

let refreshPromise: Promise<boolean> | null = null;

async function refreshSessionSingleFlight(): Promise<boolean> {
  if (refreshPromise !== null) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();

      if (error) {
        return false;
      }

      return isNonEmptyString(data.session?.access_token);
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function makeRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

// ─────────────────────────────────────────────────────────────
// Body normalizer (prevents 400 "invalid request")
// ─────────────────────────────────────────────────────────────

function normalizeBody(body: unknown): unknown {
  if (!isRecord(body)) {
    return body;
  }

  if (!('body' in body)) {
    return body;
  }

  const inner = body.body;
  return isRecord(inner) ? inner : body;
}

function createMissingEnvError(
  functionName: string,
  requestId: string,
  baseUrl: string | null,
  anonKey: string | null,
): InvokeEdgeError {
  return new InvokeEdgeError({
    functionName,
    requestId,
    status: 0,
    message: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY',
    details: {
      hasBaseUrl: baseUrl !== null,
      hasAnonKey: anonKey !== null,
    },
  });
}

function readRequestId(init: InvokeInit | undefined): string {
  const fromHeader = init?.headers?.['x-request-id'];
  return isNonEmptyString(fromHeader) ? fromHeader.trim() : makeRequestId();
}

function buildHeaders(args: {
  anonKey: string;
  appName: string;
  requestId: string;
  init: InvokeInit | undefined;
  token: string | null;
  hasBody: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    apikey: args.anonKey,
    'x-application-name': args.appName,
    'x-request-id': args.requestId,
    ...(args.hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(args.init?.headers ?? {}),
  };

  if (!args.init?.skipAuth && args.token !== null) {
    headers.Authorization = `Bearer ${args.token}`;
  }

  return headers;
}

async function doFetch(args: {
  url: string;
  method: NonNullable<InvokeInit['method']>;
  body: unknown;
  init: InvokeInit | undefined;
  token: string | null;
  anonKey: string;
  appName: string;
  requestId: string;
}): Promise<Response> {
  const normalizedBody = normalizeBody(args.body);
  const hasBody =
    normalizedBody !== undefined && normalizedBody !== null && args.method !== 'GET';

  const headers = buildHeaders({
    anonKey: args.anonKey,
    appName: args.appName,
    requestId: args.requestId,
    init: args.init,
    token: args.token,
    hasBody,
  });

  return fetch(args.url, {
    method: args.method,
    headers,
    body: hasBody ? JSON.stringify(normalizedBody) : undefined,
    signal: args.init?.signal,
  });
}

function createInvokeResponseError(args: {
  functionName: string;
  requestId: string;
  status: number;
  payload: unknown;
}): InvokeEdgeError {
  return new InvokeEdgeError({
    functionName: args.functionName,
    requestId: args.requestId,
    status: args.status,
    message: errMsgFromPayload(args.payload, 'Request failed'),
    details: args.payload,
  });
}

export async function invokeEdge<TResponse = unknown, TBody = unknown>(
  functionName: string,
  body?: TBody,
  init?: InvokeInit,
): Promise<TResponse> {
  const method = init?.method ?? 'POST';
  const requestId = readRequestId(init);

  const baseUrl = getEnvString('VITE_SUPABASE_URL');
  const anonKey = getEnvString('VITE_SUPABASE_ANON_KEY');

  if (baseUrl === null || anonKey === null) {
    throw createMissingEnvError(functionName, requestId, baseUrl, anonKey);
  }

  const appName = getEnvString('VITE_APP_NAME') ?? 'sofis-restaurant-v2';
  const url = `${baseUrl.replace(/\/+$/, '')}/functions/v1/${functionName}`;

  let token = await getAccessToken();
  let response = await doFetch({
    url,
    method,
    body,
    init,
    token,
    anonKey,
    appName,
    requestId,
  });
  let payload = await safeJson(response);

  if ((response.status === 401 || response.status === 403) && !init?.skipAuth) {
    const refreshed = await refreshSessionSingleFlight();

    if (refreshed) {
      token = await getAccessToken();
      response = await doFetch({
        url,
        method,
        body,
        init,
        token,
        anonKey,
        appName,
        requestId,
      });
      payload = await safeJson(response);
    }
  }

  if (!response.ok) {
    throw createInvokeResponseError({
      functionName,
      requestId,
      status: response.status,
      payload,
    });
  }

  return payload as TResponse;
}