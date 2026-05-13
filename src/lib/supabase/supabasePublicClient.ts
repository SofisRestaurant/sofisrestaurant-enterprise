// PATH: src/lib/supabase/supabasePublicClient.ts
// =============================================================================
// FRONTEND CLIENT — Browser-Safe Supabase Client (2026)
// =============================================================================
//
// PURPOSE
//   Canonical frontend Supabase client. Uses only a browser-safe publishable key.
//   All RLS policies are assumed to be enforced at the database layer.
//
// USAGE
//   import { supabasePublic } from '@/lib/supabase/supabasePublicClient';
//   const { data } = await supabasePublic.from('menu_items').select('*');
//
// SECURITY CONTRACT
//   ✅ Uses VITE_SUPABASE_PUBLISHABLE_KEY first — current public key name
//   ✅ Temporarily supports VITE_SUPABASE_ANON_KEY as legacy fallback
//   ✅ Never uses service role, secret, or admin keys
//   ✅ Safe to ship in browser bundles
//   ✅ Auth state is user-session scoped
//
// KEY RESOLUTION ORDER
//   1. VITE_SUPABASE_PUBLISHABLE_KEY
//   2. VITE_SUPABASE_ANON_KEY legacy fallback
//
// WHAT THIS FILE MUST NEVER CONTAIN
//   ❌ VITE_SUPABASE_SERVICE_ROLE_KEY
//   ❌ VITE_SUPABASE_SECRET_KEY
//   ❌ SUPABASE_SECRET_KEY
//   ❌ SUPABASE_SECRET_KEYS
//   ❌ Any key that bypasses RLS
//   ❌ Any admin or privileged operation
// =============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// ---------------------------------------------------------------------------
// Env validation — runs at module load so a misconfigured build fails loudly
// ---------------------------------------------------------------------------

function readEnv(name: string): string | null {
  const value = import.meta.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function resolvePublishableKey(): string {
  const publishableKey = readEnv('VITE_SUPABASE_PUBLISHABLE_KEY');

  if (publishableKey) {
    assertBrowserSafeKey(publishableKey, 'VITE_SUPABASE_PUBLISHABLE_KEY');
    return publishableKey;
  }

  const legacyAnonKey = readEnv('VITE_SUPABASE_ANON_KEY');

  if (legacyAnonKey) {
    console.warn(
      '[supabasePublicClient] Using legacy VITE_SUPABASE_ANON_KEY fallback. ' +
        'Add VITE_SUPABASE_PUBLISHABLE_KEY when ready.',
    );

    assertBrowserSafeKey(legacyAnonKey, 'VITE_SUPABASE_ANON_KEY');
    return legacyAnonKey;
  }

  throw new Error(
    '[supabasePublicClient] Missing Supabase browser key. ' +
      'Set VITE_SUPABASE_PUBLISHABLE_KEY. Temporary fallback: VITE_SUPABASE_ANON_KEY.',
  );
}

function resolveUrl(): string {
  const url = readEnv('VITE_SUPABASE_URL');

  if (!url) {
    throw new Error(
      '[supabasePublicClient] VITE_SUPABASE_URL is not set. Add it to your .env file.',
    );
  }

  return url;
}

function assertBrowserSafeKey(key: string, envName: string): void {
  if (isSecretKey(key)) {
    throw new Error(
      `[supabasePublicClient] Detected a service_role/secret key in ${envName}. ` +
        'This key is SECRET and must never be exposed to the browser. ' +
        'Use a publishable key instead.',
    );
  }
}

/**
 * Heuristic check:
 * - Legacy service_role JWTs encode `"role":"service_role"` in their payload.
 * - New secret keys can use secret-style prefixes.
 *
 * This is a developer-experience safeguard only. RLS remains the real boundary.
 */
function isSecretKey(key: string): boolean {
  const normalized = key.trim();

  if (normalized.startsWith('sb_secret_') || normalized.includes('service_role')) {
    return true;
  }

  try {
    const parts = normalized.split('.');
    if (parts.length !== 3) return false;

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
const SUPABASE_PUBLISHABLE_KEY = resolvePublishableKey();

/**
 * Browser-safe Supabase client.
 *
 * - Session persistence: enabled
 * - Auto token refresh: enabled
 * - RLS is enforced
 * - This client has NO elevated privileges
 */
export const supabasePublic: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
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

export type { Database };