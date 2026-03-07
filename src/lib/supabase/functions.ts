// src/lib/supabase/functions.ts
// =============================================================================
// Edge Function invoke helper — attaches Authorization correctly
//
// 2026 hardening:
// - Normalizes common "double-wrapped" payload shape:
//     invokeFn(fn, { body: { action, payload } })  -> sends { action, payload }
// - Leaves non-JSON bodies untouched (FormData / Blob / ArrayBuffer / Stream)
// - Adds a request id header for traceability
// - Never logs tokens or sensitive data
// =============================================================================

import { supabase } from './supabaseClient'
import { requireAccessToken } from './session'

type InvokeBody =
  | string
  | Record<string, unknown>
  | File
  | Blob
  | ArrayBuffer
  | FormData
  | ReadableStream<Uint8Array>

type InvokeOk<T> = { data: T; error: null }
type InvokeFail = { data: null; error: Error }

type UnknownRecord = Record<string, unknown>

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function makeRequestId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`
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
  if (!isRecord(body)) return body
  if (!('body' in body)) return body

  const inner = (body as UnknownRecord).body
  if (isRecord(inner)) return inner
  return body
}

function toInvokeBody(body: unknown): InvokeBody | undefined {
  if (body == null) return undefined

  // Pass-through binary / streaming / multipart bodies
  if (typeof body === 'string') return body
  if (body instanceof ArrayBuffer) return body
  if (body instanceof Blob) return body
  if (body instanceof File) return body
  if (body instanceof FormData) return body
  if (body instanceof ReadableStream) return body as ReadableStream<Uint8Array>

  // JSON object
  if (typeof body === 'object') return body as Record<string, unknown>

  // numbers/booleans/etc → send as JSON string
  return JSON.stringify(body)
}

export async function invokeFn<T>(
  fnName: string,
  body?: unknown,
): Promise<InvokeOk<T> | InvokeFail> {
  try {
    const token = await requireAccessToken()

    // Only normalize JSON-ish objects. Do not touch FormData/Blob/etc.
    const normalized =
      body instanceof ArrayBuffer ||
      body instanceof Blob ||
      body instanceof File ||
      body instanceof FormData ||
      body instanceof ReadableStream ||
      typeof body === 'string'
        ? body
        : normalizeJsonBody(body)

    const res = await supabase.functions.invoke(fnName, {
      body: toInvokeBody(normalized),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'x-request-id': makeRequestId(),
      },
    })

    if (res.error) return { data: null, error: res.error }
    return { data: res.data as T, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error('Invoke failed') }
  }
}