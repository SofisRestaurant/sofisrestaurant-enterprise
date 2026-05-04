// PATH: supabase/functions/_shared/supabase.ts
// =============================================================================
// Supabase Edge Clients — Production Hardened (2026)
// - Strongly typed with Database
// - No session persistence / refresh in Edge runtime
// - Safe bearer token extraction
// =============================================================================
//
// MIGRATION NOTE (2026)
//   createServiceClient() previously read SUPABASE_SERVICE_ROLE_KEY directly.
//   It now delegates to supabaseAdmin() — the single authoritative source for
//   privileged DB access. SUPABASE_SERVICE_ROLE_KEY is no longer read anywhere
//   in this file.
//
//   All call sites that import createServiceClient() continue to work without
//   changes — the function signature and return type are identical.
// =============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';
import { supabaseAdmin } from './supabaseAdmin.ts';

export type DbClient = SupabaseClient<Database>;
export type SvcClient = DbClient;
export type AnonClient = DbClient;

const BASE_CLIENT_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    headers: {
      'X-Application-Name': 'sofis-edge',
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

// MIGRATED: env() no longer reads SUPABASE_SERVICE_ROLE_KEY.
// Only the two keys legitimately needed by the anon/public client
// factories are resolved here.
function env() {
  return {
    SUPABASE_URL:      mustEnv('SUPABASE_URL'),
    SUPABASE_ANON_KEY: mustEnv('SUPABASE_ANON_KEY'),
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
  const raw = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!raw) return null;
  const m = raw.trim().match(/^bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  return token ? token : null;
}

// ✅ Silence deno-lint/no-unused-vars without changing behavior/contracts
export const _readBearerToken = readBearerToken;

// ─────────────────────────────────────────────────────────────
// Clients (STRICTLY typed)
// ─────────────────────────────────────────────────────────────

/**
 * Service role client:
 * - Bypasses RLS
 * - MUST NOT carry user Authorization header
 *
 * MIGRATED: no longer reads SUPABASE_SERVICE_ROLE_KEY directly.
 * Delegates to supabaseAdmin() — the single authoritative privileged client.
 * Signature preserved for backward compatibility with all existing callers.
 */
export function createServiceClient(): SvcClient {
  return supabaseAdmin() as SvcClient;
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
      headers: mergeHeaders({ 'X-Edge-Role': 'anon-key' }),
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
        { 'X-Edge-Role': 'anon-jwt' },
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
  return createAnonClient(jwt ?? '');
}