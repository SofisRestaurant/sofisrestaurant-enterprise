// supabase/functions/_shared/supabase.ts
// =============================================================================
// Supabase Edge Clients — Production Hardened (2026)
// - Strongly typed with Database
// - No session persistence / refresh in Edge runtime
// - Safe bearer token extraction
// =============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";

export type DbClient = SupabaseClient<Database>;
export type SvcClient = DbClient;
export type AnonClient = DbClient;

const BASE_CLIENT_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    headers: {
      "X-Application-Name": "sofis-edge",
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────
// Env (fail-fast on use, not on import)
// ─────────────────────────────────────────────────────────────

function mustEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v || !v.trim()) throw new Error(`Missing ${name}`);
  return v.trim();
}

function env() {
  return {
    SUPABASE_URL: mustEnv("SUPABASE_URL"),
    SUPABASE_ANON_KEY: mustEnv("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

function mergeHeaders(...sets: Array<Record<string, string> | undefined>) {
  const out: Record<string, string> = { ...(BASE_CLIENT_OPTIONS.global?.headers ?? {}) };
  for (const s of sets) {
    if (!s) continue;
    for (const [k, v] of Object.entries(s)) out[k] = v;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Auth token helper
// ─────────────────────────────────────────────────────────────

export function readBearerToken(req: Request): string | null {
  const raw = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!raw) return null;
  const m = raw.trim().match(/^bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  return token ? token : null;
}

// ─────────────────────────────────────────────────────────────
// Clients (STRICTLY typed)
// ─────────────────────────────────────────────────────────────

/**
 * Service role client:
 * - Bypasses RLS
 * - MUST NOT carry user Authorization header
 */
export function createServiceClient(): SvcClient {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    ...BASE_CLIENT_OPTIONS,
    global: {
      headers: mergeHeaders({ "X-Edge-Role": "service" }),
    },
  });
}

/**
 * Anon-key client (no JWT)
 * - For public unauth flows only
 */
export function createAnonKeyClient(): AnonClient {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = env();

  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    ...BASE_CLIENT_OPTIONS,
    global: {
      headers: mergeHeaders({ "X-Edge-Role": "anon-key" }),
    },
  });
}

/**
 * Anon client bound to a user JWT:
 * - RLS applies
 * - Used for auth.getUser(jwt) + user-scoped reads when you want RLS
 */
export function createAnonClient(userJwt: string): AnonClient {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = env();
  const jwt = userJwt.trim();

  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    ...BASE_CLIENT_OPTIONS,
    global: {
      headers: mergeHeaders(
        { "X-Edge-Role": "anon-jwt" },
        jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
      ),
    },
  });
}

/**
 * Request-bound auth client (RLS):
 * - Safe default for "who is the user?"
 */
export function createAuthClient(req: Request): AnonClient {
  const jwt = readBearerToken(req);
  return createAnonClient(jwt ?? "");
}