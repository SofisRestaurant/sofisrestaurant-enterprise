import { DEFAULT_ALLOWED_ORIGINS, optEnv } from "./env.ts";

export function getAllowedOrigins(): Set<string> {
  const configured = (optEnv("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return new Set<string>([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

export function corsHeadersFor(
  origin: string | null,
): Record<string, string> | null {
  if (!origin) {
    return null;
  }

  if (!getAllowedOrigins().has(origin)) {
    return null;
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, apikey, x-client-info, content-type, x-request-id, x-application-name, x-device-fingerprint, x-idempotency-key",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
