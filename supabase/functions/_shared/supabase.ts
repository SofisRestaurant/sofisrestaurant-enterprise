// supabase/functions/_shared/supabase.ts
// =============================================================================
// Shared Supabase clients for Edge Functions (Deno)
// - Uses import-map alias "@supabase/supabase-js" from each function's deno.json
// - Typed with Database
// - Exports:
//    • createServiceClient()  (service role)
//    • createAnonKeyClient()  (anon key, NO JWT) ✅ needed for signInWithPassword
//    • createAnonClient(jwt)  (anon key + Authorization header)
// =============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_ANON_KEY) throw new Error("Missing SUPABASE_ANON_KEY");

export type SvcClient = SupabaseClient<Database>;
export type AnonClient = SupabaseClient<Database>;

const BASE_CLIENT_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { "X-Application-Name": "edge" } },
} as const;

/**
 * Service role client:
 * - Full DB access (bypasses RLS)
 * - Use ONLY server-side
 */
export function createServiceClient(): SvcClient {
  return createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
    ...BASE_CLIENT_OPTIONS,
    global: {
      headers: { ...BASE_CLIENT_OPTIONS.global.headers, "X-Edge-Role": "service" },
    },
  });
}

/**
 * Anon-key client (NO JWT):
 * - Use for auth flows BEFORE you have a JWT (signInWithPassword, signUp, etc.)
 * - RLS applies for DB reads/writes (generally avoid DB writes with this)
 */
export function createAnonKeyClient(): AnonClient {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    ...BASE_CLIENT_OPTIONS,
    global: {
      headers: { ...BASE_CLIENT_OPTIONS.global.headers, "X-Edge-Role": "anon-key" },
    },
  });
}

/**
 * Anon client bound to a user's JWT:
 * - Enforces RLS and identifies caller
 * - Use for "who is calling me?" checks (auth.getUser)
 */
export function createAnonClient(userJwt: string): AnonClient {
  const jwt = userJwt.trim();
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    ...BASE_CLIENT_OPTIONS,
    global: {
      headers: {
        ...BASE_CLIENT_OPTIONS.global.headers,
        Authorization: `Bearer ${jwt}`,
        "X-Edge-Role": "anon-jwt",
      },
    },
  });
}