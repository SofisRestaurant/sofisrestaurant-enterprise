// supabase/functions/_shared/auth.ts
// =============================================================================
// Shared Auth — Production Hardened (2026)
// - Extracts Bearer token safely
// - Validates JWT via Supabase Auth (anon client)
// - Provides admin gate using service role client
// - Normalizes failure reasons for logs / responses
// =============================================================================

import { createAnonClient, createServiceClient } from './supabase.ts'

export type AuthFailReason =
  | 'missing_bearer'
  | 'empty_token'
  | 'invalid_token'
  | 'auth_error'

export type AuthResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; reason: AuthFailReason; message: string }

export type AdminAuthFailReason = AuthFailReason | 'not_admin' | 'admin_check_failed'

export type AdminAuthResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; reason: AdminAuthFailReason; message: string }

function readAuthHeader(req: Request): string {
  // Headers are case-insensitive; some runtimes normalize to lowercase only.
  return req.headers.get('authorization') ?? req.headers.get('Authorization') ?? ''
}

export function getBearerToken(req: Request): string | null {
  const raw = readAuthHeader(req)
  if (!raw) return null

  const prefix = 'Bearer '
  if (!raw.startsWith(prefix)) return null

  const token = raw.slice(prefix.length).trim()
  return token.length ? token : null
}

export async function authenticate(req: Request): Promise<AuthResult> {
  const raw = readAuthHeader(req)
  if (!raw) {
    return { ok: false, reason: 'missing_bearer', message: 'Missing Authorization header' }
  }

  const token = getBearerToken(req)
  if (!token) {
    // header exists, but not a valid Bearer token format
    return { ok: false, reason: 'missing_bearer', message: 'Missing Authorization Bearer token' }
  }

  if (!token.trim()) {
    return { ok: false, reason: 'empty_token', message: 'Empty Bearer token' }
  }

  try {
    const anon = createAnonClient(token)
    const { data, error } = await anon.auth.getUser()

    if (error || !data?.user?.id) {
      return { ok: false, reason: 'invalid_token', message: 'Invalid or expired token' }
    }

    return { ok: true, userId: data.user.id, token }
  } catch {
    return { ok: false, reason: 'auth_error', message: 'Authentication failed' }
  }
}

export async function authenticateAdmin(req: Request): Promise<AdminAuthResult> {
  const base = await authenticate(req)
  if (!base.ok) return base

  try {
    const svc = createServiceClient()
    const { data: isAdmin, error } = await svc.rpc('is_admin', { uid: base.userId })

    if (error) {
      return { ok: false, reason: 'admin_check_failed', message: 'Admin check failed' }
    }
    if (isAdmin !== true) {
      return { ok: false, reason: 'not_admin', message: 'Insufficient permissions' }
    }

    return { ok: true, userId: base.userId, token: base.token }
  } catch {
    return { ok: false, reason: 'admin_check_failed', message: 'Admin check failed' }
  }
}