// src/lib/supabase/invoke.ts
// =============================================================================
// Edge Function invoke helper (production hardened)
// - Always sends apikey + Bearer access token
// - Refreshes token if near expiry
// - Retries once automatically on 401 (stale/invalid JWT race)
// - Throws typed error with requestId + status + code
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export type InvokeOptions = {
  signal?: AbortSignal
  headers?: Record<string, string>
}

export class InvokeFnError extends Error {
  readonly fnName: string
  readonly status: number
  readonly code: string
  readonly requestId: string
  readonly bodyPreview: string

  constructor(args: {
    fnName: string
    status: number
    code: string
    message: string
    requestId: string
    bodyPreview: string
  }) {
    super(args.message)
    this.name = 'InvokeFnError'
    this.fnName = args.fnName
    this.status = args.status
    this.code = args.code
    this.requestId = args.requestId
    this.bodyPreview = args.bodyPreview
  }
}

function requireEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('[invokeFn] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  }
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

function secondsUntilExpiry(jwt?: string | null): number | null {
  if (!jwt) return null
  const parts = jwt.split('.')
  if (parts.length !== 3) return null

  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    const exp = typeof payload?.exp === 'number' ? payload.exp : null
    if (!exp) return null
    return exp - Math.floor(Date.now() / 1000)
  } catch {
    return null
  }
}

async function getValidAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error(`[invokeFn] getSession failed: ${error.message}`)

  let token = data.session?.access_token ?? null
  if (!token) throw new Error('[invokeFn] No access token (user not authenticated)')

  // If token expires soon, refresh proactively
  const ttl = secondsUntilExpiry(token)
  if (ttl !== null && ttl < 60) {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr) throw new Error(`[invokeFn] refreshSession failed: ${refreshErr.message}`)
    token = refreshed.session?.access_token ?? null
    if (!token) throw new Error('[invokeFn] No access token after refresh')
  }

  return token
}

async function doFetch<T>(
  fnName: string,
  body: Record<string, unknown> | null,
  token: string,
  opts: InvokeOptions,
): Promise<T> {
  const url = `${SUPABASE_URL}/functions/v1/${fnName}`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`, // use lowercase to avoid edge/runtime header quirks
      'content-type': 'application/json',
      accept: 'application/json',
      'x-application-name': 'sofis-restaurant-v2',
      ...(opts.headers ?? {}),
    },
    body: JSON.stringify(body ?? {}),
    signal: opts.signal,
  })

  if (!res.ok) {
    const requestId = getRequestId(res)
    const { json, text } = await readBodySafe(res)

    const code =
      json?.code ??
      json?.error?.code ??
      `HTTP_${res.status}`

    const msg =
      json?.message ??
      json?.error?.message ??
      (typeof json?.error === 'string' ? json.error : null) ??
      (text?.trim() ? text.trim() : res.statusText)

    throw new InvokeFnError({
      fnName,
      status: res.status,
      code: String(code),
      message: `[invokeFn] ${fnName} failed (${res.status}) ${String(code)}: ${msg}${requestId ? ` (req ${requestId})` : ''}`,
      requestId,
      bodyPreview: (text ?? '').slice(0, 2000),
    })
  }

  return (await res.json()) as T
}

export async function invokeFn<T>(
  fnName: string,
  body: Record<string, unknown> | null,
  opts: InvokeOptions = {},
): Promise<T> {
  requireEnv()

  // 1) get token (refresh if needed)
  let token = await getValidAccessToken()

  try {
    return await doFetch<T>(fnName, body, token, opts)
  } catch (e) {
    // 2) if we got a 401, refresh once and retry (handles stale JWT race)
    if (e instanceof InvokeFnError && e.status === 401) {
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
      if (!refreshErr && refreshed.session?.access_token) {
        token = refreshed.session.access_token
        return await doFetch<T>(fnName, body, token, opts)
      }
    }
    throw e
  }
}