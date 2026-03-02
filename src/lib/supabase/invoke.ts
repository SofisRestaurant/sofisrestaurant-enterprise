// src/lib/supabase/invoke.ts
// =============================================================================
// Edge Function invoke helper (hard-auth, production)
// - Always sends apikey + Bearer access_token
// - Supports custom headers (e.g., x-idempotency-key)
// - Uses AbortController timeout by default (can override/disable)
// - Throws with parsed error + requestId for debugging
// - Never logs secrets (no token/apikey in logs)
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export type InvokeOptions = {
  signal?: AbortSignal
  headers?: Record<string, string>
  /**
   * Default timeout for the request. Set to 0/undefined to disable.
   * (If you pass your own signal, this still works by chaining signals.)
   */
  timeoutMs?: number
}

function invariantEnv(): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('[invokeFn] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  }
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error(`[invokeFn] getSession failed: ${error.message}`)

  let token = data.session?.access_token ?? null

  if (!token) {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr) throw new Error(`[invokeFn] refreshSession failed: ${refreshErr.message}`)
    token = refreshed.session?.access_token ?? null
  }

  if (!token) throw new Error('[invokeFn] No access token (user not authenticated)')
  return token
}

function getRequestId(res: Response): string {
  return (
    res.headers.get('sb-request-id') ??
    res.headers.get('x-sb-request-id') ??
    res.headers.get('x-request-id') ??
    ''
  )
}

async function readBodySafe(res: Response): Promise<{ json: any | null; text: string }> {
  const text = await res.text()
  if (!text) return { json: null, text: '' }

  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('application/json')) return { json: null, text }

  try {
    return { json: JSON.parse(text), text }
  } catch {
    return { json: null, text }
  }
}

function mergeSignals(primary?: AbortSignal, secondary?: AbortSignal): AbortSignal | undefined {
  if (!primary) return secondary
  if (!secondary) return primary

  const controller = new AbortController()

  const onAbort = () => {
    if (!controller.signal.aborted) controller.abort()
  }

  if (primary.aborted || secondary.aborted) {
    controller.abort()
    return controller.signal
  }

  primary.addEventListener('abort', onAbort, { once: true })
  secondary.addEventListener('abort', onAbort, { once: true })

  return controller.signal
}

function makeTimeoutSignal(timeoutMs?: number): AbortSignal | undefined {
  if (!timeoutMs || timeoutMs <= 0) return undefined
  const controller = new AbortController()
  const id = window.setTimeout(() => controller.abort(), timeoutMs)
  controller.signal.addEventListener(
    'abort',
    () => {
      window.clearTimeout(id)
    },
    { once: true },
  )
  return controller.signal
}

/**
 * invokeFn
 * - body is JSON-encoded
 * - attaches auth headers
 * - throws on non-2xx with best-effort error parsing
 */
export async function invokeFn<T>(
  fnName: string,
  body: Record<string, unknown> | null = null,
  opts: InvokeOptions = {},
): Promise<T> {
  invariantEnv()

  const token = await getAccessToken()
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`

  // Default timeout (override per call)
  const timeoutSignal = makeTimeoutSignal(opts.timeoutMs ?? 30_000)
  const signal = mergeSignals(opts.signal, timeoutSignal)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-application-name': 'sofis-restaurant-v2',
      ...(opts.headers ?? {}),
    },
    body: JSON.stringify(body ?? {}),
    signal,
  })

  if (!res.ok) {
    const requestId = getRequestId(res)
    const { json, text } = await readBodySafe(res)

    // Your edge functions often return: { error: "..." } (string)
    // Or: { error: { code, message } }
    const code =
      json?.error?.code ??
      json?.code ??
      (typeof json?.error === 'string' ? `HTTP_${res.status}` : undefined) ??
      `HTTP_${res.status}`

    const msg =
      json?.error?.message ??
      json?.message ??
      (typeof json?.error === 'string' ? json.error : undefined) ??
      (text?.trim() ? text.trim() : res.statusText)

    // Safe debug (no secrets)
    console.error(`[invokeFn] ${fnName} failed`, {
      status: res.status,
      code,
      msg,
      requestId,
      bodyPreview: text?.slice(0, 2000),
    })

    throw new Error(
      `[invokeFn] ${fnName} failed (${res.status}) ${code}: ${msg}${requestId ? ` (req ${requestId})` : ''}`,
    )
  }

  // Some functions might return empty body; handle safely
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('application/json')) {
    const text = await res.text()
    throw new Error(`[invokeFn] ${fnName} returned non-JSON: ${text.slice(0, 200)}`)
  }

  return (await res.json()) as T
}