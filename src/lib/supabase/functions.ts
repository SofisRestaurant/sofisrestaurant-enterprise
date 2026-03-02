// src/lib/supabase/functions.ts
// =============================================================================
// Edge Function invoke helper — attaches Authorization correctly
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

function toInvokeBody(body: unknown): InvokeBody | undefined {
  if (body == null) return undefined
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

    const res = await supabase.functions.invoke(fnName, {
      body: toInvokeBody(body),
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })

    if (res.error) return { data: null, error: res.error }
    return { data: res.data as T, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error('Invoke failed') }
  }
}