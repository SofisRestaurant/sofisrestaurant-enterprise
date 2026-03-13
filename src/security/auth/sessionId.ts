// src/security/auth/sessionId.ts
// =============================================================================
// Session ID utilities (Supabase)
// - Supabase access token (JWT) includes `session_id` claim (UUID)
// - Some parts of app already pass a sessionId string (UUID) directly
//
// Provide BOTH:
//  1) requireSessionId(sessionId: string) -> validate UUID
//  2) requireSessionIdFromAccessToken(token: string) -> extract + validate
// =============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JwtPayload = Record<string, unknown>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function base64UrlToString(base64Url: string): string {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return atob(padded);
}

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;

    const payloadPart = parts[1];
    const json = base64UrlToString(payloadPart);
    const parsed = JSON.parse(json) as unknown;

    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isUuid(v: string): boolean {
  return UUID_RE.test(String(v ?? '').trim());
}

/**
 * Validate a sessionId string that is expected to already be a UUID.
 * Use this everywhere your app passes sessionId around.
 */
export function requireSessionId(sessionId: string): string {
  const s = String(sessionId ?? '').trim();
  if (!isUuid(s)) throw new Error('Invalid sessionId (expected UUID)');
  return s;
}

/**
 * Extract + validate Supabase session_id claim from an access token (JWT).
 * Use this at the boundary where you only have access_token, not sessionId yet.
 */
export function getSupabaseSessionIdFromAccessToken(accessToken: string): string | null {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return null;

  const sid = payload['session_id'];
  if (typeof sid !== 'string') return null;

  const s = sid.trim();
  return isUuid(s) ? s : null;
}

export function requireSessionIdFromAccessToken(accessToken: string): string {
  const sid = getSupabaseSessionIdFromAccessToken(accessToken);
  if (!sid) throw new Error('Missing/invalid session_id claim in access token');
  return sid;
}
