// src/security/auth/jwtSessionId.ts

type JwtPayload = Record<string, unknown>;

function base64UrlToJson(base64url: string): string {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return atob(padded);
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const json = base64UrlToJson(parts[1] ?? "");
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getSupabaseSessionIdFromJwt(accessToken: string): string | null {
  const payload = decodeJwtPayload(accessToken);
  const sid = payload?.["session_id"];
  if (typeof sid !== "string") return null;
  return UUID_RE.test(sid) ? sid : null;
}