// PATH: src/lib/supabase/supabasePublicClient.ts
// =============================================================================
// FRONTEND CLIENT — Browser-Safe Supabase Client (2026)
// =============================================================================
//
// PURPOSE
//   Canonical frontend Supabase client. Uses only the publishable anon key.
//   All RLS policies are assumed to be enforced at the database layer.
//
// USAGE
//   import { supabasePublic } from '@/lib/supabase/supabasePublicClient';
//   const { data } = await supabasePublic.from('menu_items').select('*');
//
// SECURITY CONTRACT
//   ✅ Only VITE_SUPABASE_ANON_KEY (publishable) — never a secret key
//   ✅ RLS is the only access boundary — no server-side privilege elevation
//   ✅ Safe to ship in browser bundles
//   ✅ Auth state is user-session scoped (not service role)
//
// WHAT THIS FILE MUST NEVER CONTAIN
//   ❌ VITE_SUPABASE_SERVICE_ROLE_KEY
//   ❌ SUPABASE_SECRET_KEY
//   ❌ Any key that bypasses RLS
//   ❌ Any admin or privileged operation
//
// NOTE ON EXISTING supabaseClient.ts
//   The existing src/lib/supabase/supabaseClient.ts is preserved unchanged.
//   This file is the hardened replacement. New code should import from here.
//   supabaseClient.ts will be aliased to this file in a later migration phase.
// =============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// ---------------------------------------------------------------------------
// Env validation — runs at module load so a misconfigured build fails loudly
// ---------------------------------------------------------------------------

function resolvePublishableKey(): string {
  // Vite exposes env vars via import.meta.env. The variable MUST be prefixed
  // with VITE_ to be included in the client bundle.
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

  if (!key) {
    throw new Error(
      '[supabasePublicClient] VITE_SUPABASE_ANON_KEY is not set. ' +
        'Add it to your .env file. Never use a service role key here.',
    );
  }

  // Guard: catch accidental secret key usage at boot time.
  // Service role JWTs contain "role":"service_role" in their payload.
  // We can cheaply detect this without a full JWT parse.
  if (isSecretKey(key)) {
    throw new Error(
      '[supabasePublicClient] Detected a service_role key in VITE_SUPABASE_ANON_KEY. ' +
        'This key is SECRET and must never be exposed to the browser. ' +
        'Use the anon/publishable key instead.',
    );
  }

  return key;
}

function resolveUrl(): string {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!url) {
    throw new Error(
      '[supabasePublicClient] VITE_SUPABASE_URL is not set. Add it to your .env file.',
    );
  }
  return url;
}

/**
 * Heuristic check: Supabase service_role JWTs encode `"role":"service_role"`
 * in their base64 payload. This lets us catch mis-configured keys at startup
 * without a full JWKS verification round-trip.
 *
 * This check is intentionally cheap (no crypto). The real security boundary
 * is RLS — this is a developer experience safeguard only.
 */
function isSecretKey(key: string): boolean {
  try {
    const parts = key.split('.');
    if (parts.length !== 3) return false;
    // JWT payload is the middle segment, base64url encoded
    const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return payload.includes('"service_role"');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Singleton client
// ---------------------------------------------------------------------------

const SUPABASE_URL = resolveUrl();
const SUPABASE_ANON_KEY = resolvePublishableKey();

/**
 * Browser-safe Supabase client.
 *
 * - Session persistence: enabled (localStorage — appropriate for browser)
 * - Auto token refresh: enabled
 * - RLS is enforced — this client has NO elevated privileges
 */
export const supabasePublic: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'sofis-auth-token',
    },
    global: {
      headers: {
        'X-Application-Name': 'sofis-web',
      },
    },
  },
);

// ---------------------------------------------------------------------------
// Named re-export so callers can also import the type if needed
//
//   import { supabasePublic } from '@/lib/supabase/supabasePublicClient';
// ---------------------------------------------------------------------------
export type { Database };