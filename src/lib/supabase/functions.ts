// src/lib/supabase/functions.ts
// =============================================================================
// Edge Function invoke helper — attaches Authorization correctly
//
// 2026 hardening:
// - Normalizes common "double-wrapped" payload shape:
//     invokeFn(fn, { body: { action, payload } })  -> sends { action, payload }
// - Leaves non-JSON bodies untouched (FormData / Blob / ArrayBuffer / Stream)
// - Adds a request id header for traceability
// - Adds an optional device fingerprint header for client-side invocations
// - Never logs tokens or sensitive data
// - Avoids unsafe any assignments from the Supabase Functions client response
// =============================================================================

import { supabase } from './supabaseClient';
import { requireAccessToken } from './session';

type InvokeBody =
  | string
  | Record<string, unknown>
  | File
  | Blob
  | ArrayBuffer
  | FormData
  | ReadableStream<Uint8Array>;

type InvokeOk<T> = { data: T; error: null };
type InvokeFail = { data: null; error: Error };

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function makeRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function getDeviceFingerprint(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const nav = window.navigator;
    const screenInfo = window.screen;

    const raw = [
      nav.userAgent ?? '',
      nav.language ?? '',
      String(screenInfo?.width ?? ''),
      String(screenInfo?.height ?? ''),
      String(new Date().getTimezoneOffset()),
      window.location.hostname ?? '',
    ].join('|');

    const fingerprint = raw.trim();
    return fingerprint ? fingerprint.slice(0, 256) : null;
  } catch {
    return 'unknown-device';
  }
}

/**
 * If a caller passes the common "SDK-style wrapper" shape:
 *   { body: { action, payload } }
 * unwrap it so the Edge function always receives { action, payload }.
 *
 * This prevents intermittent 400s caused by mismatched client helpers.
 */
function normalizeJsonBody(body: unknown): unknown {
  if (!isRecord(body)) return body;
  if (!('body' in body)) return body;

  const inner = body.body;
  if (isRecord(inner)) return inner;
  return body;
}

function toInvokeBody(body: unknown): InvokeBody | undefined {
  if (body == null) return undefined;

  if (typeof body === 'string') return body;
  if (body instanceof ArrayBuffer) return body;
  if (body instanceof Blob) return body;
  if (body instanceof File) return body;
  if (body instanceof FormData) return body;
  if (body instanceof ReadableStream) return body as ReadableStream<Uint8Array>;

  if (typeof body === 'object') return body as Record<string, unknown>;

  return JSON.stringify(body);
}

function normalizeInvokeError(error: unknown): Error | null {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  if (isRecord(error)) {
    const message =
      typeof error.message === 'string'
        ? error.message
        : typeof error.error === 'string'
        ? error.error
        : null;

    if (message) {
      return new Error(message);
    }

    try {
      return new Error(JSON.stringify(error));
    } catch {
      return new Error('Function invoke failed');
    }
  }

  if (
    typeof error === 'number' ||
    typeof error === 'boolean' ||
    typeof error === 'bigint' ||
    typeof error === 'symbol'
  ) {
    return new Error(String(error));
  }

  return new Error('Function invoke failed');
}

export async function invokeFn<T>(
  fnName: string,
  body?: unknown,
): Promise<InvokeOk<T> | InvokeFail> {
  try {
    const token = await requireAccessToken();
    const deviceFingerprint = getDeviceFingerprint();

    const normalized =
      body instanceof ArrayBuffer ||
      body instanceof Blob ||
      body instanceof File ||
      body instanceof FormData ||
      body instanceof ReadableStream ||
      typeof body === 'string'
        ? body
        : normalizeJsonBody(body);

    const res = await supabase.functions.invoke(fnName, {
      body: toInvokeBody(normalized),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-request-id': makeRequestId(),
        ...(deviceFingerprint ? { 'x-device-fingerprint': deviceFingerprint } : {}),
      },
    });

    const invokeError = normalizeInvokeError(res.error);
    if (invokeError) {
      return { data: null, error: invokeError };
    }

    const data = res.data as unknown as T;
    return { data, error: null };
  } catch (e: unknown) {
    return {
      data: null,
      error: e instanceof Error ? e : new Error('Invoke failed'),
    };
  }
}