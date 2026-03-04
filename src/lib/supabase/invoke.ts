// =============================================================================
// src/lib/supabase/invoke.ts
// SUPABASE EDGE INVOKE — Enterprise (2026) • Deterministic Auth + Retry
// =============================================================================
//
// Guarantees:
// - Always attaches freshest access token (if available)
// - On 401/403, attempts a single refreshSession() + retries once
// - Single-flight refresh (prevents storm when many requests hit at once)
// - Typed errors, safe JSON parsing, no token logging
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient'

type JsonRecord = Record<string, unknown>

export type InvokeError = {
  status: number
  message: string
  details?: unknown
}

type InvokeInit = {
  method?: 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  signal?: AbortSignal
  // optional hard disable auth header (rare)
  skipAuth?: boolean
}

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function errMsgFromPayload(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.trim()) return payload
  if (payload instanceof Error) return payload.message
  if (isRecord(payload)) {
    const e = payload.error
    const m = payload.message
    if (typeof e === 'string' && e.trim()) return e
    if (typeof m === 'string' && m.trim()) return m
    // supabase edge often returns { error: { message } }
    const eo = payload.error
    if (isRecord(eo) && typeof eo.message === 'string' && eo.message.trim()) return eo.message
  }
  return fallback
}

async function safeJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token ?? null
  return token && token.trim().length > 0 ? token : null
}

// ─────────────────────────────────────────────────────────────
// Single-flight refresh (prevents request storms)
// ─────────────────────────────────────────────────────────────

let refreshPromise: Promise<boolean> | null = null

async function refreshSessionSingleFlight(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const { data, error } = await supabase.auth.refreshSession()
        if (error) return false
        return Boolean(data?.session?.access_token)
      } catch {
        return false
      } finally {
        refreshPromise = null
      }
    })()
  }
  return refreshPromise
}

function makeRequestId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }
}

async function doFetch(
  url: string,
  method: string,
  body: unknown,
  init: InvokeInit | undefined,
  token: string | null,
): Promise<Response> {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const appName = import.meta.env.VITE_APP_NAME ?? 'sofis-restaurant-v2'

  const hasBody = body !== undefined && body !== null && method !== 'GET'

  const headers: Record<string, string> = {
    Accept: 'application/json',
    apikey: anonKey,
    'x-application-name': appName,
    'x-request-id': init?.headers?.['x-request-id'] ?? makeRequestId(),
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers ?? {}),
  }

  if (!init?.skipAuth && token) {
    headers.Authorization = `Bearer ${token}`
  }

  return fetch(url, {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
    signal: init?.signal,
  })
}

export async function invokeEdge<
  TResponse = unknown,
  TBody extends JsonRecord = JsonRecord
>(
  functionName: string,
  body?: TBody,
  init?: InvokeInit,
): Promise<TResponse> {
  const method = init?.method ?? 'POST'

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!baseUrl || !anonKey) {
    const err: InvokeError = {
      status: 0,
      message: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY',
      details: { baseUrl: Boolean(baseUrl), anonKey: Boolean(anonKey) },
    }
    throw err
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/functions/v1/${functionName}`

  // 1) First attempt with current token
  let token = await getAccessToken()
  let res = await doFetch(url, method, body, init, token)
  let payload = await safeJson(res)

  // 2) If auth error, try refreshSession() once and retry
  if ((res.status === 401 || res.status === 403) && !init?.skipAuth) {
    const refreshed = await refreshSessionSingleFlight()
    if (refreshed) {
      token = await getAccessToken()
      res = await doFetch(url, method, body, init, token)
      payload = await safeJson(res)
    }
  }

  if (!res.ok) {
    const err: InvokeError = {
      status: res.status,
      message: errMsgFromPayload(payload, 'Request failed'),
      details: payload,
    }
    throw err
  }

  return payload as TResponse
}